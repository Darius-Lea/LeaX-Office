import { DatabaseSync } from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {randomUUID, scryptSync, timingSafeEqual, randomBytes} from 'node:crypto';
import {join} from 'node:path';
export const directory=process.env.HQ_DATA_DIR || join(process.cwd(),'data');
mkdirSync(directory,{recursive:true,mode:0o700});
export const db=new DatabaseSync(join(directory,'headquarters.sqlite'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS founder(id INTEGER PRIMARY KEY CHECK(id=1), salt TEXT, hash TEXT);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, expires INTEGER);
CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY, goal TEXT NOT NULL, agent TEXT NOT NULL DEFAULT 'Alpha', status TEXT NOT NULL DEFAULT 'Queued', checkpoint TEXT, attempts INTEGER DEFAULT 0, lease INTEGER DEFAULT 0, error TEXT, created INTEGER);
CREATE TABLE IF NOT EXISTS opportunities(id TEXT PRIMARY KEY, task TEXT REFERENCES tasks(id), title TEXT, url TEXT UNIQUE, evidence TEXT, reviewed INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, task TEXT, event TEXT, time INTEGER);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT);`);
db.prepare("INSERT OR IGNORE INTO settings VALUES ('standing_goal',?)").run('Find legitimate, profitable commercial IT and technology installation contracts, subcontracting partnerships, regional service agreements, and national deployment opportunities throughout the United States and internationally where our company can qualify and deliver. Manage research, outreach, follow-ups, proposals, scheduling, and business administration within authorized permissions.');
export function audit(task:string,event:string){db.prepare('INSERT INTO audit(task,event,time) VALUES (?,?,?)').run(task,event,Date.now());}
export function enqueue(goal:string){const id=randomUUID();db.prepare('INSERT INTO tasks(id,goal,created) VALUES (?,?,?)').run(id,goal,Date.now());audit(id,'Assignment queued');return id;}
export function setup(password:string){if(password.length<14)throw Error('Use at least 14 characters');const salt=randomBytes(16).toString('hex');db.prepare('INSERT INTO founder VALUES(1,?,?)').run(salt,scryptSync(password,salt,64).toString('hex'));}
export function login(password:string){const f=db.prepare('SELECT * FROM founder').get() as any;if(!f || !timingSafeEqual(Buffer.from(f.hash,'hex'),scryptSync(password,f.salt,64)))return null;const token=randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions VALUES(?,?)').run(token,Date.now()+28800000);return token;}
export function authenticated(token:string){return !!db.prepare('SELECT token FROM sessions WHERE token=? AND expires>?').get(token,Date.now());}
export function snapshot(){return {tasks:db.prepare('SELECT * FROM tasks ORDER BY created DESC').all(),opportunities:db.prepare('SELECT * FROM opportunities').all(),audit:db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT 100').all(),goal:db.prepare("SELECT value FROM settings WHERE key='standing_goal'").get(),worker:db.prepare("SELECT value FROM settings WHERE key='heartbeat'").get()};}
