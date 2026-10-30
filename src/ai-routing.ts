import {db} from './store.ts';
import {isOllamaCloudModel} from './local-engines.ts';
export function availableAIWorker(now=Date.now()):any{
 if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ai_workers'").get()||!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='sync_devices'").get())return null;
 const worker=db.prepare('SELECT w.device_id,w.model,w.checked,w.last_inference,d.name FROM ai_workers w JOIN sync_devices d ON d.id=w.device_id WHERE d.revoked=0 AND w.verified=1 AND w.checked>? ORDER BY w.checked DESC LIMIT 1').get(now-300000) as any;return worker&&!isOllamaCloudModel(worker.model)?worker:null;
}
