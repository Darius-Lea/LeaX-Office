import {db,audit} from './store.ts';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {fetchPage,verifyFinding,SOURCE} from './research.ts';
export async function tick(fetcher:typeof fetch=fetch){
 db.prepare("INSERT OR REPLACE INTO settings VALUES('heartbeat',?)").run(String(Date.now()));
 db.exec('BEGIN IMMEDIATE');
 let t:any;
 try{
 // A crashed final attempt must not remain Running forever.
 db.prepare("UPDATE tasks SET status='Blocked',error='Worker interrupted: retry limit reached',lease=0 WHERE status='Running' AND lease<? AND attempts>=3").run(Date.now());
 t=db.prepare("SELECT * FROM tasks WHERE (status='Queued' OR (status='Running' AND lease<?)) AND attempts<3 ORDER BY created LIMIT 1").get(Date.now());
 if(t)db.prepare("UPDATE tasks SET status='Running',lease=?,attempts=attempts+1 WHERE id=?").run(Date.now()+60000,t.id);
 db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
 if(!t)return false;
 try{
 if(t.agent==='Alpha'){
 let saved:any={source:SOURCE.id,page:1,collected:0};
 if(t.checkpoint){const previous=JSON.parse(t.checkpoint);if(previous.source===SOURCE.id)saved=previous;}
 const page=await fetchPage(t.goal,saved.page,fetcher);
 db.exec('BEGIN IMMEDIATE');
 try{
 for(const finding of page.findings){
 db.prepare('INSERT OR IGNORE INTO opportunities(id,task,title,url,evidence) VALUES(?,?,?,?,?)').run(randomUUID(),t.id,finding.title,finding.url,JSON.stringify(finding.evidence));
 db.prepare('INSERT OR IGNORE INTO task_findings(task,opportunity) SELECT ?,id FROM opportunities WHERE url=?').run(t.id,finding.url);
 }
 const more=page.hasNext&&saved.page<3;
 const checkpoint={source:SOURCE.id,page:saved.page+1,collected:saved.collected+page.findings.length,truncated:page.hasNext&&!more};
 db.prepare("UPDATE tasks SET agent=?,status='Queued',checkpoint=?,attempts=0,lease=0,error=NULL WHERE id=?").run(more?'Alpha':'Bravo',JSON.stringify(checkpoint),t.id);
 audit(t.id,`Alpha saved source page ${saved.page} (${page.findings.length} historical award records)${more?'':'; handed evidence to Bravo'}`);
 db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
 }else if(t.agent==='Bravo'){
 const checkpoint=JSON.parse(t.checkpoint||'{}');
 if(checkpoint.source!==SOURCE.id)throw Error('Legacy evidence requires a new research task');
 const rows=db.prepare('SELECT o.* FROM opportunities o JOIN task_findings f ON f.opportunity=o.id WHERE f.task=?').all(t.id) as any[];
 db.exec('BEGIN IMMEDIATE');
 try{
 for(const row of rows){if(!verifyFinding(JSON.parse(row.evidence),row.url))throw Error('Invalid evidence provenance');db.prepare('UPDATE opportunities SET reviewed=1 WHERE id=?').run(row.id);}
 db.prepare("UPDATE tasks SET status='Completed',lease=0,error=NULL WHERE id=?").run(t.id);
 audit(t.id,`Bravo reviewed provenance of ${rows.length} historical award records. Not open bids or verified business qualifications.${checkpoint.truncated?' Search capped at 3 pages.':''}`);
 db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
 }else{throw Error('No research tool is implemented for employee '+t.agent);}
 }catch(e){db.prepare("UPDATE tasks SET status='Blocked',lease=0,error=? WHERE id=?").run('Research unavailable: '+String(e),t.id);audit(t.id,'Research blocked; saved evidence and page checkpoint preserved');}
 return true;
}
if(process.argv[1] && /(?:^|[\\/])worker\.ts$/.test(process.argv[1]) && import.meta.url===pathToFileURL(process.argv[1]).href){let stopping=false;process.on('SIGTERM',()=>{stopping=true;});process.on('SIGINT',()=>{stopping=true;});while(!stopping){if((db.prepare("SELECT value FROM settings WHERE key='clock'").get() as any)?.value!=='out')await tick();await new Promise(r=>setTimeout(r,2000));}db.close();}
