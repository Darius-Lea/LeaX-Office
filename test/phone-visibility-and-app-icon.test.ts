import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const style=readFileSync(join(root,'public/style.css'),'utf8');
const server=readFileSync(join(root,'src/server.ts'),'utf8');
const index=readFileSync(join(root,'public/index.html'),'utf8');
const offices=readFileSync(join(root,'public/offices.html'),'utf8');
const guest=readFileSync(join(root,'public/guest.html'),'utf8');
test('phone is always visible: floating button on every screen size',()=>{
 // The owner could not find the phone: on desktop it was one small dock
 // button among many, on mobile it only appeared below 650px. The floating
 // button is now always on screen, bottom-left, above the dock.
 assert.ok(style.includes('#phone-float{position:fixed;left:12px;bottom:96px;z-index:1400;display:block'),'phone float is always visible');
 // The floats get out of the way while a window (computer, setup) is open.
 assert.ok(style.includes('body:has(dialog[open]) #phone-float,body:has(dialog[open]) #invite-float{display:none}'),'floats hide while a dialog is open');
 // The dock button still hides on mobile, where the float serves instead.
 assert.ok(style.includes("@media(max-width:650px){#phone-open{display:none}}"),'dock phone button hides on mobile');
});
test('LeaX Office has a home-screen icon: manifest, icons and server routes',()=>{
 // The manifest names the app and lists its icons, including a maskable one.
 const manifest=JSON.parse(readFileSync(join(root,'public/manifest.webmanifest'),'utf8'));
 assert.equal(manifest.name,'LeaX Office');
 assert.equal(manifest.short_name,'LeaX');
 assert.equal(manifest.display,'standalone');
 assert.equal(manifest.start_url,'/');
 assert.ok(manifest.icons.some((i:any)=>i.sizes==='192x192'&&i.src==='/icons/icon-192.png'),'192px icon listed');
 assert.ok(manifest.icons.some((i:any)=>i.sizes==='512x512'&&i.purpose==='maskable'),'maskable 512px icon listed');
 // The icon files exist: PNGs for the manifest and iOS, SVG for the favicon.
 for(const file of ['public/icons/icon-192.png','public/icons/icon-512.png','public/icons/apple-touch-icon.png','public/icons/leax-icon.svg'])assert.ok(existsSync(join(root,file)),file+' exists');
 // The server allowlists the manifest and icon paths (it serves no file that
 // is not listed) with the right content types.
 for(const path of ['/manifest.webmanifest','/icons/icon-192.png','/icons/icon-512.png','/icons/apple-touch-icon.png','/icons/leax-icon.svg'])assert.ok(server.includes("'"+path+"'"),'server serves '+path);
 assert.ok(server.includes("file.endsWith('webmanifest')?'application/manifest+json'"),'manifest content type');
 assert.ok(server.includes("file.endsWith('png')?'image/png'"),'png content type');
 assert.ok(server.includes("file.endsWith('svg')?'image/svg+xml'"),'svg content type');
 // The office, shared-offices and guest pages link the manifest and icons,
 // so the phone browser offers the LeaX icon when adding to the home screen.
 for(const [name,page] of [['index',index],['offices',offices],['guest',guest]] as const){
  assert.ok(page.includes('<link rel="manifest" href="/manifest.webmanifest">'),name+' links the manifest');
  assert.ok(page.includes('<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">'),name+' links the iOS icon');
  assert.ok(page.includes('<link rel="icon" type="image/svg+xml" href="/icons/leax-icon.svg">'),name+' links the favicon');
 }
});
