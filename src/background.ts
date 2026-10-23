import {db,clock,setting} from './store.ts';
import {pulse,runConnectedResearch} from './office.ts';
import {restoreSavedConnections} from './connections.ts';
import {maintainBackups} from './backups.ts';
restoreSavedConnections();
// Launching this entry is explicit authorization for background execution.
// An explicit saved clock-out is still respected.
if(!setting('clock'))clock(true);
let stopping=false;
process.on('SIGTERM',()=>{stopping=true;});
process.on('SIGINT',()=>{stopping=true;});
while(!stopping){
 try{runConnectedResearch();await pulse();await maintainBackups();}catch(error){console.error('Background office failure:',String(error));}
 if(!stopping)await new Promise(resolve=>setTimeout(resolve,1000));
}
db.close();
