import {randomUUID} from 'node:crypto';
import {db,setting,audit} from './store.ts';
import {queueAgent,retryAgent,agentRuns} from './ai.ts';
import {toolEvents} from './agent-tools.ts';

// A reply slot never contains a scripted employee answer. Its content and state
// are read from the real durable inference run, including interrupted runs.
db.exec(`CREATE TABLE IF NOT EXISTS agent_chat_messages(
 id TEXT PRIMARY KEY,agent TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('ceo','agent')),
 body TEXT NOT NULL DEFAULT '',run_id TEXT,reply_to TEXT,context_task TEXT,context_deal TEXT,
 status TEXT NOT NULL,created INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS agent_chat_thread ON agent_chat_messages(agent,created);
 CREATE INDEX IF NOT EXISTS agent_chat_run ON agent_chat_messages(run_id);`);

function employee(agent:unknown){
 if(typeof agent!=='string'||agent.length>100)throw Error('Choose an employee to talk to');
 const row=db.prepare('SELECT id,name,role,capability FROM employees WHERE id=?').get(agent) as any;
 if(!row)throw Error('Choose an existing employee to talk to');return row;
}
function context(input:any){
 if(input===undefined)return {taskId:null,dealId:null};
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['taskId','dealId'].includes(key)))throw Error('Choose saved work to discuss');
 for(const key of ['taskId','dealId'])if(input[key]!==undefined&&(typeof input[key]!=='string'||!input[key]||input[key].length>100))throw Error('Choose saved work to discuss');
 if(input.taskId&&!db.prepare('SELECT id FROM tasks WHERE id=?').get(input.taskId))throw Error('The selected research assignment was not found');
 if(input.dealId&&!db.prepare('SELECT id FROM deal_cases WHERE id=?').get(input.dealId))throw Error('The selected opportunity was not found');
 return {taskId:input.taskId||null,dealId:input.dealId||null};
}
export function conversationState(agent:string){
 const selected=employee(agent);agentRuns();
 const rows=db.prepare(`SELECT m.*,r.status AS run_status,r.output,r.error,r.model,r.attempts,r.updated
  FROM agent_chat_messages m LEFT JOIN ai_runs r ON r.id=m.run_id
  WHERE m.agent=? ORDER BY m.rowid DESC LIMIT 60`).all(agent) as any[];
 const clock=setting('clock')||'out',modelConfigured=!!setting('ollama_model');
 const messages=rows.reverse().map(row=>({
  id:row.id,role:row.role,text:row.role==='ceo'?row.body:row.run_status==='Completed'?row.output||'':'',
  status:row.run_status||row.status,runId:row.run_id,replyTo:row.reply_to,
  createdAt:row.created,updatedAt:row.updated||row.created,error:row.error||null,model:row.model||null,
  attempts:row.attempts||0,context:{taskId:row.context_task,dealId:row.context_deal},
  toolEvents:row.role==='agent'&&row.run_id?toolEvents(row.run_id):[],
 }));
 const pending=messages.filter(message=>message.role==='agent'&&['Setup required','Queued','Running'].includes(message.status));
 const notice=!modelConfigured?(pending.length?'Your message is saved. Set up Local AI to receive an employee reply.':'Set up Local AI to receive employee replies. You can save a question while setup is pending.'):clock!=='in'&&pending.some(message=>message.status!=='Running')?'Your message is saved. The office is clocked out; the reply will start after clock-in.':pending.some(message=>message.status==='Running')?'The local model is composing a reply. Tool receipts appear with the saved answer.':pending.length?'Your message is in the local AI queue. One model request runs at a time.':'Replies use your saved business records and connected research tools. External messages still require your action.';
 return {employee:selected,modelConfigured,clock,messages,notice};
}
export function sendAgentMessage(input:{agent:string;text:string;context?:{taskId?:string;dealId?:string}}){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['agent','text','context'].includes(key)))throw Error('Enter a message for an employee');
 const selected=employee(input.agent);
 if(typeof input.text!=='string'||!input.text.trim()||input.text.length>3000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(input.text))throw Error('Enter a message of 1–3000 characters');
 const scope=context(input.context);
 const pending=db.prepare(`SELECT count(*) AS n FROM agent_chat_messages m LEFT JOIN ai_runs r ON r.id=m.run_id WHERE m.agent=? AND m.role='agent' AND (m.status='Setup required' AND m.run_id IS NULL OR r.status IN ('Queued','Running'))`).get(selected.id) as any;
 if(pending.n>=4)throw Error('This employee already has four saved messages waiting. Let the current replies finish before adding another.');
 const userId=randomUUID(),messageId=randomUUID(),now=Date.now();let runId:string|null=null;
 db.exec('SAVEPOINT hq_conversation_send');
 try{
  if(setting('ollama_model'))runId=queueAgent(selected.id,input.text.trim(),scope.taskId||undefined);
  const status=runId?'Queued':'Setup required';
  const insert=db.prepare('INSERT INTO agent_chat_messages(id,agent,role,body,run_id,reply_to,context_task,context_deal,status,created) VALUES(?,?,?,?,?,?,?,?,?,?)');
  insert.run(userId,selected.id,'ceo',input.text.trim(),runId,null,scope.taskId,scope.dealId,status,now);
  insert.run(messageId,selected.id,'agent','',runId,userId,scope.taskId,scope.dealId,status,now);
  audit('conversation:'+messageId,'CEO message saved for '+selected.name+(runId?'; real model reply queued':'; waiting for local model setup'));
  db.exec('RELEASE hq_conversation_send');
 }catch(error){db.exec('ROLLBACK TO hq_conversation_send; RELEASE hq_conversation_send');throw error;}
 return {messageId,runId,status:runId?'Queued':'Setup required',conversation:conversationState(selected.id)};
}
export function resumeAgentConversations(){
 const waiting=Number((db.prepare("SELECT count(*) AS n FROM agent_chat_messages WHERE role='agent' AND run_id IS NULL AND status='Setup required'").get() as any).n);
 if(setting('clock')!=='in'||!setting('ollama_model'))return {queued:0,waiting};
 const rows=db.prepare("SELECT * FROM agent_chat_messages WHERE role='agent' AND run_id IS NULL AND status='Setup required' ORDER BY rowid LIMIT 8").all() as any[];let queued=0;
 for(const reply of rows){
  const question=db.prepare("SELECT * FROM agent_chat_messages WHERE id=? AND role='ceo'").get(reply.reply_to) as any;if(!question)continue;
  db.exec('SAVEPOINT hq_conversation_resume');
  try{
   const current=db.prepare('SELECT run_id,status FROM agent_chat_messages WHERE id=?').get(reply.id) as any;
   if(!current||current.run_id||current.status!=='Setup required'){db.exec('RELEASE hq_conversation_resume');continue;}
   const run=queueAgent(reply.agent,question.body,reply.context_task||undefined);
   db.prepare("UPDATE agent_chat_messages SET run_id=?,status='Queued' WHERE id IN (?,?) AND run_id IS NULL").run(run,reply.id,question.id);
   db.exec('RELEASE hq_conversation_resume');queued++;
  }catch(error){db.exec('ROLLBACK TO hq_conversation_resume; RELEASE hq_conversation_resume');throw error;}
 }
 return {queued,waiting:waiting-queued};
}
export function retryAgentMessage(input:{messageId:string}){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>key!=='messageId')||typeof input.messageId!=='string')throw Error('Choose the blocked employee reply');
 const row=db.prepare("SELECT * FROM agent_chat_messages WHERE id=? AND role='agent'").get(input.messageId) as any;
 if(!row?.run_id)throw Error('This reply has no blocked model run to retry');
 retryAgent(row.run_id);return {messageId:row.id,runId:row.run_id,status:'Queued',conversation:conversationState(row.agent)};
}
