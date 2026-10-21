import { DatabaseSync } from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {randomUUID, scryptSync, timingSafeEqual, randomBytes} from 'node:crypto';
import {join} from 'node:path';
import {SOURCE} from './research.ts';
export const directory=process.env.HQ_DATA_DIR || join(process.cwd(),'data');
mkdirSync(directory,{recursive:true,mode:0o700});
export const db=new DatabaseSync(join(directory,'headquarters.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS founder(id INTEGER PRIMARY KEY CHECK(id=1), salt TEXT, hash TEXT);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, expires INTEGER);
CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY, goal TEXT NOT NULL, agent TEXT NOT NULL DEFAULT 'Alpha', status TEXT NOT NULL DEFAULT 'Queued', checkpoint TEXT, attempts INTEGER DEFAULT 0, lease INTEGER DEFAULT 0, error TEXT, created INTEGER);
CREATE TABLE IF NOT EXISTS opportunities(id TEXT PRIMARY KEY, task TEXT REFERENCES tasks(id), title TEXT, url TEXT UNIQUE, evidence TEXT, reviewed INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS review_notes(opportunity TEXT PRIMARY KEY REFERENCES opportunities(id),note TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS task_findings(task TEXT REFERENCES tasks(id), opportunity TEXT REFERENCES opportunities(id), PRIMARY KEY(task,opportunity));
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, task TEXT, event TEXT, time INTEGER);
CREATE TABLE IF NOT EXISTS employees(id TEXT PRIMARY KEY,name TEXT NOT NULL,role TEXT NOT NULL,capability TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT);`);
db.prepare("INSERT OR IGNORE INTO settings VALUES ('standing_goal',?)").run('Find legitimate, profitable commercial IT and technology installation contracts, subcontracting partnerships, regional service agreements, and national deployment opportunities throughout the United States and internationally where our company can qualify and deliver. Manage research, outreach, follow-ups, proposals, scheduling, and business administration within authorized permissions.');
export function audit(task:string,event:string){db.prepare('INSERT INTO audit(task,event,time) VALUES (?,?,?)').run(task,event,Date.now());}
export function enqueue(goal:string){const id=randomUUID();db.prepare('INSERT INTO tasks(id,goal,created) VALUES (?,?,?)').run(id,goal,Date.now());audit(id,'Assignment queued');return id;}
export function setup(password:string){if(password.length<14)throw Error('Use at least 14 characters');const salt=randomBytes(16).toString('hex');db.prepare('INSERT INTO founder VALUES(1,?,?)').run(salt,scryptSync(password,salt,64).toString('hex'));}
export function login(password:string){const f=db.prepare('SELECT * FROM founder').get() as any;if(!f || !timingSafeEqual(Buffer.from(f.hash,'hex'),scryptSync(password,f.salt,64)))return null;const token=randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions VALUES(?,?)').run(token,Date.now()+28800000);return token;}
export function authenticated(token:string){return !!db.prepare('SELECT token FROM sessions WHERE token=? AND expires>?').get(token,Date.now());}
export function snapshot(){return {company:JSON.parse(setting('company')),employees:db.prepare('SELECT * FROM employees').all(),clock:setting('clock')||'out',sources:[SOURCE],tasks:db.prepare('SELECT * FROM tasks ORDER BY created DESC').all(),opportunities:db.prepare('SELECT o.*,n.note FROM opportunities o LEFT JOIN review_notes n ON n.opportunity=o.id').all(),audit:db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 100').all(),goal:db.prepare("SELECT value FROM settings WHERE key='standing_goal'").get(),worker:db.prepare("SELECT value FROM settings WHERE key='heartbeat'").get()};}

export function setting(key:string){return (db.prepare('SELECT value FROM settings WHERE key=?').get(key) as any)?.value;}
export function setSetting(key:string,value:string){db.prepare('INSERT OR REPLACE INTO settings VALUES(?,?)').run(key,value);}
for(const [id,name,role,capability] of [
 ['Alpha','Alpha','Research analyst','research'],['Bravo','Bravo','Evidence reviewer','review'],
 ['Einstein','Einstein','Executive coordinator','planned'],['Delta','Delta','Outreach specialist','planned'],
 ['Juliet','Juliet','CRM administrator','planned'],['Hotel','Morgan','Operations readiness coordinator','planned'],
 ['Johnson','Johnson','Office operations manager','manager']]){
 db.prepare('INSERT OR IGNORE INTO employees VALUES(?,?,?,?)').run(id,name,role,capability);
}
if(!setting('company'))setSetting('company',JSON.stringify({name:'American Power Global',legalName:'LeaX LLC'}));
export function clock(inOffice:boolean){
 setSetting('clock',inOffice?'in':'out');audit('office',inOffice?'Founder clocked office in':'Founder clocked office out; active page may finish');
 if(inOffice&&!setting('last_research'))setSetting('last_research',String(Date.now()));
 if(inOffice&&!db.prepare("SELECT id FROM tasks WHERE status IN ('Queued','Running') LIMIT 1").get()){enqueue(setting('standing_goal'));setSetting('last_research',String(Date.now()));}
}
export function editTask(id:string,goal:string){
 if(!goal.trim()||goal.length>4000)throw Error('Enter a goal of 1–4000 characters');
 const result=db.prepare("UPDATE tasks SET goal=?,agent='Alpha',checkpoint=NULL,attempts=0,error=NULL,status='Queued' WHERE id=? AND status IN ('Queued','Blocked','Paused')").run(goal.trim(),id);
 if(!result.changes)throw Error('Only queued, blocked or paused assignments can be edited');
 audit(id,'Founder changed objective to: '+goal.trim()+'; previous linked evidence retained');
}

// Stable internal id preserves history; update only the original display defaults.
db.prepare("UPDATE employees SET name='Morgan' WHERE id='Hotel' AND name='Hotel'").run();
db.prepare("UPDATE employees SET role='Operations readiness coordinator' WHERE id='Hotel' AND role='Dispatch coordinator'").run();
