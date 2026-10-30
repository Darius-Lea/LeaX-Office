import {randomBytes,createHash,scryptSync} from 'node:crypto';
import {db} from './store.ts';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
db.exec(`CREATE TABLE IF NOT EXISTS shared_password_resets(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES shared_users(id),expires INTEGER NOT NULL,used INTEGER NOT NULL DEFAULT 0);`);
export function issuePasswordReset(userId:string,now=Date.now()){
 if(typeof userId!=='string'||!db.prepare('SELECT id FROM shared_users WHERE id=?').get(userId))throw Error('Choose a registered account');const token=randomBytes(32).toString('hex');db.prepare('DELETE FROM shared_password_resets WHERE user_id=? OR expires<=?').run(userId,now);db.prepare('INSERT INTO shared_password_resets VALUES(?,?,?,0)').run(hash(token),userId,now+3600000);return {token,expires:now+3600000,notice:'One-use password reset link. Send it privately after verifying the account owner. It expires in one hour and does not restore suspended access.'};
}
export function resetPassword(body:any,now=Date.now()){
 if(typeof body?.token!=='string'||!/^[a-f0-9]{64}$/.test(body.token)||typeof body.password!=='string'||body.password.length<14||body.password.length>256)throw Error('Use the reset link and a new password of 14–256 characters');
 db.exec('BEGIN IMMEDIATE');try{const row=db.prepare('SELECT user_id FROM shared_password_resets WHERE hash=? AND expires>? AND used=0').get(hash(body.token),now) as any;if(!row)throw Error('Reset link expired or already used. Request a new link from the platform owner.');const salt=randomBytes(32).toString('hex');db.prepare('UPDATE shared_users SET salt=?,password_hash=? WHERE id=?').run(salt,scryptSync(body.password,salt,64).toString('hex'),row.user_id);db.prepare('UPDATE shared_password_resets SET used=1 WHERE hash=?').run(hash(body.token));db.prepare('DELETE FROM shared_sessions WHERE user_id=?').run(row.user_id);db.exec('COMMIT');return {ok:true};}catch(error){db.exec('ROLLBACK');throw error;}
}
