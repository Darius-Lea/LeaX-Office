import {db,audit} from './store.ts';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
// Fixed public source: no user-provided URL fetching or external actions.
const source='https://www.usaspending.gov/';
export async function tick(fetcher:typeof fetch=fetch){
 db.prepare("INSERT OR REPLACE INTO settings VALUES('heartbeat',?)").run(String(Date.now()));
 db.exec('BEGIN IMMEDIATE');
 let t:any;
 try{t=db.prepare("SELECT * FROM tasks WHERE (status='Queued' OR (status='Running' AND lease<?)) AND attempts<3 ORDER BY created LIMIT 1").get(Date.now());
 if(t)db.prepare("UPDATE tasks SET status='Running',lease=?,attempts=attempts+1 WHERE id=?").run(Date.now()+60000,t.id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
 if(!t)return false;
 try{
 if(t.agent==='Alpha'){
 const response=await fetcher(source,{signal:AbortSignal.timeout(20000),redirect:'error'});
 if(!response.ok)throw Error('Public source returned HTTP '+response.status);
 const html=await response.text();if(!html.toLowerCase().includes('usaspending'))throw Error('Unexpected source content');
 // This verifies source availability only. It deliberately does not invent leads.
 db.prepare("UPDATE tasks SET agent='Bravo',status='Queued',checkpoint=?,attempts=0,lease=0,error=NULL WHERE id=?").run(JSON.stringify({source,checkedAt:Date.now(),finding:'Public federal spending research portal is reachable. No matching company or opportunity has been extracted.'}),t.id);
 audit(t.id,'Alpha checked the public source and handed evidence to Bravo');
 }else{
 const evidence=JSON.parse(t.checkpoint);if(evidence.source!==source)throw Error('Unrecognized evidence source');
 db.prepare("UPDATE tasks SET status='Blocked',lease=0,error=? WHERE id=?").run('Bravo verified source provenance. Opportunity search/extraction connector is not implemented; no verified leads available.',t.id);audit(t.id,'Bravo reviewed evidence: source available, no qualified opportunities');
 }
 }catch(e){db.prepare("UPDATE tasks SET status='Blocked',lease=0,error=? WHERE id=?").run('Research unavailable: '+String(e),t.id);audit(t.id,'Research blocked; evidence preserved');}
 return true;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){let stopping=false;process.on('SIGTERM',()=>{stopping=true;});process.on('SIGINT',()=>{stopping=true;});while(!stopping){await tick();await new Promise(r=>setTimeout(r,2000));}db.close();}
