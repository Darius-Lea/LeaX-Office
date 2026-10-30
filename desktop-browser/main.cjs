const {app, BaseWindow, WebContentsView, dialog, ipcMain, session} = require('electron');
const fs = require('node:fs');
const crypto = require('node:crypto');
const http = require('node:http');
const path = require('node:path');
const {createExtensionManager} = require('./extensions.cjs');

app.setName('LeaX AI Browser');
const profileRoot = process.env.LEAX_BROWSER_PROFILE_DIR;
if (!profileRoot || !path.isAbsolute(profileRoot) || path.basename(profileRoot).toLowerCase() !== 'browser-profile' || path.basename(path.dirname(profileRoot)).toLowerCase() !== 'aiheadquarters') {
  app.quit();
  throw new Error('LeaX private browser profile directory is missing.');
}
fs.mkdirSync(profileRoot, {recursive:true});
app.setPath('userData', profileRoot);
app.setAppUserModelId('com.leax.officialbrowser');

function normalizedAddress(raw) {
  const text = String(raw ?? '').trim();
  if (!text || text.length > 2048) throw new Error('Enter a web address or search phrase.');
  let candidate = text;
  if (!/^[a-z][a-z\d+.-]*:/i.test(candidate)) {
    candidate = !/\s/.test(candidate) && /\.[a-z]{2,}(\/|$)/i.test(candidate)
      ? 'https://' + candidate
      : 'https://duckduckgo.com/?q=' + encodeURIComponent(candidate);
  }
  let url;
  try { url = new URL(candidate); } catch { throw new Error('That address could not be opened.'); }
  if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
    throw new Error('LeaX AI Browser opens web pages over HTTP or HTTPS only.');
  }
  return url.href;
}

let mainWindow;
let chromeView;
let accessHeld=false;
let accessLobbyView;
let accessTimer;
let robotView;
let robotExpanded=false;
let robotPosition=null;
function layoutRobot(){if(!robotView||!mainWindow||mainWindow.isDestroyed())return;const [w,h]=mainWindow.getContentSize(),width=robotExpanded?370:160,height=robotExpanded?560:70;const pos=robotPosition||{x:w-width-20,y:h-height-20};const x=Math.max(0,Math.min(w-width,pos.x)),y=Math.max(136,Math.min(h-height,pos.y));robotView.setBounds({x,y,width,height});robotPosition={x,y};}

let pageView;
const tabs = new Map();
let nextTabId = 1;
let activeTabId = null;
function layoutViews() {
 if (!mainWindow || mainWindow.isDestroyed()) return;
 if(accessLobbyView){const [w,h]=mainWindow.getContentSize();accessLobbyView.setBounds({x:0,y:0,width:w,height:h});accessLobbyView.setVisible(accessHeld);}

 layoutRobot();
 const [width,height]=mainWindow.getContentSize();
 chromeView.setBounds({x:0,y:0,width,height:pageView ? 136 : height});
 for (const [id,view] of tabs) {view.setVisible(!accessHeld&&id===activeTabId);view.setBounds({x:0,y:136,width,height:Math.max(100,height-136)});}
}
function selectTab(id) {
 if (!tabs.has(id)) throw Error('This tab is closed');
 if (activeTabId!==id) {activeGrant=null;aiActing=false;}
 activeTabId=id;pageView=tabs.get(id);pageTitle=pageView.webContents.getTitle()||'New tab';layoutViews();sendState();
}
function createTab(target) {
 if(tabs.size>=32) throw Error('Close a tab before opening another (32 tab limit)');
 const view=new WebContentsView({webPreferences:{session:browserSession,contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,devTools:true}});
 const id=String(nextTabId++);tabs.set(id,view);mainWindow.contentView.addChildView(view);mainWindow.contentView.removeChildView(chromeView);mainWindow.contentView.addChildView(chromeView);if(robotView){mainWindow.contentView.removeChildView(robotView);mainWindow.contentView.addChildView(robotView);}if(accessLobbyView){mainWindow.contentView.removeChildView(accessLobbyView);mainWindow.contentView.addChildView(accessLobbyView);}
 view.webContents.on('before-input-event',(event,input)=>{if(input.type==='keyDown'&&(input.key==='F12'||input.control&&input.shift&&input.key.toLowerCase()==='i')){event.preventDefault();view.webContents.toggleDevTools();}});
 view.webContents.setWindowOpenHandler(({url})=>{if(isAllowedWebUrl(url))createTab(url);return {action:'deny'};});
 for(const event of ['will-navigate','will-redirect'])view.webContents.on(event,(e,url)=>{if(!isAllowedWebUrl(url))e.preventDefault();});
 for(const event of ['did-start-loading','did-stop-loading','did-navigate','did-navigate-in-page','page-title-updated'])view.webContents.on(event,()=>{if(pageView===view)pageTitle=view.webContents.getTitle()||'New tab';sendState();});
 selectTab(id);
 if(target)view.webContents.loadURL(normalizedAddress(target)).catch(()=>{pageStatus='Page failed to load. Check the connection or address.';sendState();});
 return id;
}
function closeTab(id) {
 const view=tabs.get(id);if(!view)return;tabs.delete(id);mainWindow.contentView.removeChildView(view);view.webContents.close();
 if(activeTabId===id){activeGrant=null;aiActing=false;const last=[...tabs.keys()].pop();if(last)selectTab(last);else{activeTabId=null;pageView=null;pageTitle='New tab';layoutViews();}}sendState();
}
let browserSession;
let extensionManager;
let pageTitle = 'New tab';
let pageStatus = 'Sign-ins stay saved on this device';
let bridgeServer;
let activeGrant = null;
let aiActing = false;
const launchTarget = process.env.LEAX_BROWSER_TARGET || '';

function sendState() {
  if (!chromeView || chromeView.webContents.isDestroyed()) return;
  chromeView.webContents.send('leax:state', {
    url: pageView?.webContents.getURL() || '',
    tabs:[...tabs].map(([id,view])=>({id,title:view.webContents.getTitle()||'New tab',active:id===activeTabId})),
    newTab:!pageView,
    title: pageTitle,
    status: pageStatus,
    canGoBack: !!pageView?.webContents.canGoBack(),
    canGoForward: !!pageView?.webContents.canGoForward(),
    secure: (pageView?.webContents.getURL() || '').startsWith('https://'),
    extensions: extensionManager ? extensionManager.list() : [],
    aiAccess: activeGrant && activeGrant.expiresAt>Date.now() ? {origin:activeGrant.origin,scopes:activeGrant.scopes,expiresAt:activeGrant.expiresAt,remainingSeconds:Math.ceil((activeGrant.expiresAt-Date.now())/1000),recordId:activeGrant.recordId} : null,
    aiActing,
    accessHeld,
  });
}

function sameOrigin(raw, expected) { try { const u = new URL(raw); return u.protocol === 'https:' && u.origin === expected && !u.username && !u.password; } catch { return false; } }
function bridgeAuthorized(req) {
  const supplied = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const expected = process.env.LEAX_BROWSER_BRIDGE_TOKEN || '';
  if (!/^[a-f0-9]{64}$/i.test(expected) || supplied.length !== expected.length) return false;
  try { return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected)); } catch { return false; }
}
function sensitiveLabel(value) { return /password|passphrase|secret|token|api.?key|auth|credit.?card|cvv|security.?code|one.?time.?code|2fa|mfa|payment|payout|bank|delete|remove account|close account|transfer|purchase|checkout|buy now|place order|submit order|submit bid|withdraw|refund|donate/i.test(String(value || '')); }
async function executeBrowserCommand(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid LeaX browser command');
  if (body.action === 'status') return {status:'Connected',url:pageView?.webContents.getURL() || '',title:pageTitle};
  if (body.action === 'stop') { activeGrant = null; aiActing = false; sendState(); return {status:'Stopped'}; }
  if (body.action === 'activate') {
    if (!pageView || pageView.webContents.isDestroyed()) throw new Error('Open LeaX AI Browser first');
    if (typeof body.recordId !== 'string' || typeof body.grantId !== 'string' || !sameOrigin(body.origin, body.origin)) throw new Error('Invalid browser permission request');
    const scopes = Array.isArray(body.scopes) ? [...new Set(body.scopes)] : [];
    if (!scopes.length || scopes.some(scope => !['read','navigate','scroll','fill','send','account'].includes(scope))) throw new Error('Invalid browser permission scope');
    const expiresAt = Number(body.expiresAt), now = Date.now();
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= now || expiresAt > now + 120 * 60000) throw new Error('Browser permission time limit is invalid');
    if (!sameOrigin(pageView.webContents.getURL(), body.origin)) throw new Error('In LeaX AI Browser, sign in and open the approved website before granting access');
    activeGrant = {recordId:body.recordId,grantId:body.grantId,origin:body.origin,scopes,expiresAt}; setTimeout(()=>{if(activeGrant?.grantId===body.grantId){activeGrant=null;aiActing=false;sendState();}},Math.min(expiresAt-now,2147483647)); sendState(); return {status:'Active',expiresAt};
  }
  const operation = body.action;
  const required = operation === 'read' || operation === 'record_contact' ? 'read' : operation === 'navigate' ? 'navigate' : operation === 'scroll' ? 'scroll' : operation === 'fill' ? 'fill' : operation === 'send' ? 'send' : operation === 'account' ? 'account' : null;
  if (!required || !activeGrant || body.grantId !== activeGrant.grantId || body.recordId !== activeGrant.recordId || Date.now() >= activeGrant.expiresAt) throw new Error('No active owner-approved browser permission for this task');
  if (!activeGrant.scopes.includes(required)) throw new Error('The owner did not grant permission for this browser action');
  if (!pageView || pageView.webContents.isDestroyed() || !sameOrigin(pageView.webContents.getURL(), activeGrant.origin)) throw new Error('The current page is outside the website approved for this task');
  aiActing = true; pageStatus = 'LeaX AI is acting in the approved task'; sendState();
  try {
    if (operation === 'read') {
      const result = await pageView.webContents.executeJavaScript(`(() => { const path=location.pathname.toLowerCase().split('/').filter(Boolean);if(path.some(segment=>/^(login|signin|sign-in|auth|oauth|password|security|api-keys?|tokens?|secrets?|vault)$/i.test(segment))||document.querySelector('input[type=password],[autocomplete*=current-password i],[autocomplete*=new-password i]'))return {status:'Blocked',message:'This page looks like sign-in or credential management; no page text was shared.'};
        const clone=document.body?.cloneNode(true);
        clone?.querySelectorAll('script,style,noscript,iframe,input,textarea,select,button,[contenteditable="true"],[type="password"],[type="hidden"]').forEach(e=>e.remove());
        const sensitive=/password|passcode|passphrase|secret|credential|access.?token|refresh.?token|api.?key|private.?key|recovery|backup.?code|seed.?phrase|verification.?code|one.?time.?code|otp|2fa|mfa|client.?secret|auth.?token|bearer|cookie/i;
        clone?.querySelectorAll('[hidden],[aria-hidden="true"],[inert]').forEach(e=>e.remove());
        clone?.querySelectorAll('*').forEach(e=>{const meta=[e.getAttribute('aria-label'),e.getAttribute('placeholder'),e.getAttribute('name'),e.id,e.className].join(' ');if(sensitive.test(meta))e.remove();});
        const raw=(clone?.innerText||'').replace(/\\r/g,'');
        const lines=raw.split('\\n'),safe=[];let skip=0;for(const line of lines){if(skip>0){skip--;continue;}if(sensitive.test(line)){safe.push('[Sensitive sign-in or account detail hidden]');if(!/[:=]/.test(line))skip=2;continue;}safe.push(line.replace(/\\b(?:AKIA|ASIA)[A-Z0-9]{16}\\b|\\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\\b|\\beyJ[A-Za-z0-9_-]{20,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\b|-----BEGIN [A-Z ]*PRIVATE KEY-----/g,'[credential hidden]'));}
        const redact=s=>String(s||'').replace(/(password|passcode|passphrase|secret|credential|access.?token|refresh.?token|api.?key|private.?key|recovery.?phrase|backup.?code|security.?code|one.?time.?code|bearer)\\s*[:=]\\s*[^\\s,;]+/gi,'$1 [hidden]');
        const text=redact(safe.join('\\n')).slice(0,14000);
        const safeUrl=raw=>{try{const u=new URL(raw);if(u.protocol!=='https:'||u.origin!==location.origin)return '';for(const key of [...u.searchParams.keys()])if(/password|pass|secret|token|api.?key|auth|code|session|credential|cookie|signature|nonce|state/i.test(key))u.searchParams.delete(key);u.hash='';return u.href}catch{return ''}};
        const links=[...document.querySelectorAll('a[href]')].map(a=>{const href=safeUrl(a.href);return href?{text:redact(a.innerText||a.getAttribute('aria-label')||'').trim().slice(0,160),href}:null}).filter(a=>a&&a.text).slice(0,80);
        const controls=[...document.querySelectorAll('button,input[type=submit],[role=button]')].map(e=>({text:redact(e.innerText||e.value||e.getAttribute('aria-label')||'').trim().slice(0,120),disabled:!!e.disabled})).filter(x=>x.text&&!sensitive.test(x.text)).slice(0,60);
        const fields=[...document.querySelectorAll('input:not([type=hidden]):not([type=password]):not([type=file]),textarea,select,[contenteditable=true]')].map(e=>({label:[e.getAttribute('aria-label'),e.getAttribute('placeholder'),e.name,e.id,e.labels?[...e.labels].map(l=>l.innerText).join(' '):''].filter(Boolean).join(' ').trim().slice(0,160),type:e.tagName==='INPUT'?e.type:e.tagName.toLowerCase()})).filter(x=>x.label&&!sensitive.test(x.label)).slice(0,50);
        return {title:redact(document.title),url:safeUrl(location.href),text,links,controls,fields};
      })()`, true);
      return {status:'Read',...result};
    }
    if (operation === 'record_contact') {
      if (!['email','phone'].includes(body.type) || typeof body.value !== 'string' || body.value.length > 254) throw new Error('Choose a visible email or phone listing');
      const script = [
        "(() => { const value = " + JSON.stringify(body.value) + "; const type = " + JSON.stringify(body.type) + "; const path=location.pathname.toLowerCase().split('/').filter(Boolean); if(path.some(segment=>/^(login|signin|sign-in|auth|oauth|password|security|api-keys?|tokens?|secrets?|vault)$/i.test(segment))||document.querySelector('input[type=password],[autocomplete*=current-password i],[autocomplete*=new-password i]')) throw new Error('Contact research is blocked on sign-in or credential pages'); const text = document.body?.innerText || '';",
        "const normalize = s => String(s || '').replace(/\\u00a0/g,' ').trim(); const visible = normalize(text); let found = false;",
        "if (type === 'email') found = visible.toLocaleLowerCase().includes(value.toLocaleLowerCase()); else { const digits = s => String(s || '').replace(/\\D/g,''); const needle = digits(value); found = needle.length >= 7 && [...visible.matchAll(/[+\\d().\\s-]{7,40}/g)].some(m => digits(m[0]) === needle); }",
        "const person = " + JSON.stringify(String(body.personName || '').slice(0,120)) + "; const title = " + JSON.stringify(String(body.jobTitle || '').slice(0,120)) + ";",
        "if (person && !visible.toLocaleLowerCase().includes(person.toLocaleLowerCase())) throw new Error('The contact name was not visible on this page'); if (title && !visible.toLocaleLowerCase().includes(title.toLocaleLowerCase())) throw new Error('The contact role was not visible on this page');",
        "if (!found) throw new Error('The contact value was not visible on this page'); const source = new URL(location.href); for (const key of [...source.searchParams.keys()]) if (/password|pass|secret|token|api.?key|auth|code|session|credential|cookie|signature|nonce|state/i.test(key)) source.searchParams.delete(key); source.hash=''; return {status:'Observed',sourceUrl:source.href,type,value}; })()"
      ].join(' ');
      const result = await pageView.webContents.executeJavaScript(script, true);
      if (!sameOrigin(result.sourceUrl, activeGrant.origin)) throw new Error('The source page changed outside the approved website');
      return result;
    }
    if (operation === 'scroll') {
      if (!['up','down','left','right'].includes(body.direction)) throw new Error('Choose scroll up, down, left or right');
      return await pageView.webContents.executeJavaScript(`(() => { const down=${JSON.stringify(body.direction)}==='down',up=${JSON.stringify(body.direction)}==='up',right=${JSON.stringify(body.direction)}==='right',left=${JSON.stringify(body.direction)}==='left';const amount=Math.max(240,Math.min(900,Math.floor((down||up?innerHeight:innerWidth)*.78)));window.scrollBy({top:down?amount:up?-amount:0,left:right?amount:left?-amount:0,behavior:'instant'});return {status:'Scrolled',direction:${JSON.stringify(body.direction)},pageHeight:document.documentElement.scrollHeight,pageWidth:document.documentElement.scrollWidth,scrollPosition:{x:Math.round(scrollX),y:Math.round(scrollY)}}; })()`, true);
    }
    if (operation === 'navigate') {
      const target = String(body.url || ''); if (!sameOrigin(target, activeGrant.origin)) throw new Error('Navigation is limited to the website approved for this task');
      await pageView.webContents.loadURL(target); return {status:'Navigated',url:pageView.webContents.getURL()};
    }
const label = String(body.label || '').trim().slice(0,200);
    if (!label) throw new Error('Choose a visible page label');
    const encodedLabel = JSON.stringify(label.toLocaleLowerCase());
    if (operation === 'fill') {
      const value = String(body.value || ''); if (value.length > 2000) throw new Error('Form value is too long');
      return await pageView.webContents.executeJavaScript(`(() => { const want=${encodedLabel}; const norm=s=>String(s||'').trim().toLocaleLowerCase(); const fields=[...document.querySelectorAll('input:not([type=hidden]):not([type=password]):not([type=file]),textarea,select,[contenteditable=true]')]; const meta=e=>[e.getAttribute('aria-label'),e.getAttribute('placeholder'),e.name,e.id,e.labels?[...e.labels].map(l=>l.innerText).join(' '):''].filter(Boolean).join(' '); const e=fields.find(x=>norm(meta(x))===want); if(!e) throw new Error('Could not find a visible field with that label'); if(/password|passphrase|secret|token|api.?key|auth|credit.?card|cvv|security.?code|one.?time.?code|2fa|mfa/i.test(meta(e))||location.pathname.toLowerCase().split('/').some(segment=>/^(login|signin|sign-in|auth|oauth|password)$/i.test(segment))||e.closest('form')?.querySelector('input[type=password],[autocomplete*=current-password i],[autocomplete*=new-password i]')) throw new Error('LeaX will not fill a sign-in, password, security or payment-secret form'); const v=${JSON.stringify(value)}; if(e.isContentEditable)e.textContent=v; else {const proto=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype; const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set; if(setter)setter.call(e,v);else e.value=v;} e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return {status:'Filled',field:meta(e),valueShared:false}; })()`, true);
    }
    return await pageView.webContents.executeJavaScript(`(() => { const want=${encodedLabel}; const norm=s=>String(s||'').trim().toLocaleLowerCase(); const buttons=[...document.querySelectorAll('button,input[type=submit],[role=button]')]; const e=buttons.find(x=>norm(x.innerText||x.value||x.getAttribute('aria-label')||x.title)===want); if(!e) throw new Error('Could not find a visible button with that exact label'); const label=(e.innerText||e.value||e.getAttribute('aria-label')||e.title||'').trim().slice(0,200); if(${JSON.stringify(operation)}==='send'&&!/send|reply|submit|post|publish|save draft/i.test(label)) throw new Error('The selected control is not a send or publish action'); if(${JSON.stringify(operation)}==='account'&&!/save|update|change|edit|enable|disable/i.test(label)) throw new Error('The selected control is not an account update'); if(/password|security|2fa|mfa|payment|payout|bank|delete|remove account|close account|transfer|purchase|checkout|buy now|place order|submit order|submit bid|withdraw|refund|donate/i.test(label)) throw new Error('This task cannot change credentials, security settings, payments, payout details, submit bids or orders, move money, or delete an account'); if(e.form && e.type==='submit')e.form.requestSubmit(e);else e.click(); return {status:'Action completed',label}; })()`, true);  } finally { aiActing = false; if(pageStatus==='LeaX AI is acting in the approved task')pageStatus='Signed-in session is available only within the owner-approved task'; sendState(); }
}
function startBridgeServer() {
  const token = process.env.LEAX_BROWSER_BRIDGE_TOKEN || ''; if (!/^[a-f0-9]{64}$/i.test(token)) return;
  bridgeServer = http.createServer(async (req,res) => {
    res.setHeader('Cache-Control','no-store'); res.setHeader('X-Content-Type-Options','nosniff');
    if (!req.socket.remoteAddress || !['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) { res.writeHead(403); return res.end(); }
    if (req.method !== 'POST' || req.url !== '/command' || !bridgeAuthorized(req)) { res.writeHead(401,{'Content-Type':'application/json'}); return res.end(JSON.stringify({error:'LeaX browser bridge authorization failed'})); }
    let raw=''; try { for await (const part of req) { raw+=part; if(raw.length>12000) { res.writeHead(413); return res.end(); } } const body=JSON.parse(raw||'{}'); const result=await executeBrowserCommand(body); res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify(result)); }
    catch(error) { res.writeHead(409,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:String(error.message||error).slice(0,500)})); }
  });
  bridgeServer.on('error', error => { pageStatus='AI bridge unavailable · '+String(error.message||error); sendState(); });
  bridgeServer.listen(4311,'127.0.0.1');
}
function isAllowedWebUrl(raw) {
  try {
    const u = new URL(raw);
    return ['https:', 'http:'].includes(u.protocol) && !!u.hostname && !u.username && !u.password;
  } catch { return false; }
}

function assertChromeSender(event) {
  if (!chromeView || ![chromeView.webContents,robotView?.webContents].includes(event.sender) || event.senderFrame !== event.sender.mainFrame) {
    throw new Error('This browser action did not come from the LeaX toolbar.');
  }
}

app.whenReady().then(async () => {
  browserSession = session.fromPartition('persist:leax-browser-profile');
  extensionManager = createExtensionManager({root:path.join(profileRoot,'leax-extensions'),browserSession,dialog,getWindow:()=>mainWindow,onChange:sendState});
  browserSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    if (!pageView || contents !== pageView.webContents || !mainWindow || mainWindow.isDestroyed()) return callback(false);
    const requestingOrigin = (() => { try { return new URL(details.requestingUrl).origin; } catch { return 'this site'; } })();
    dialog.showMessageBox(mainWindow, {
      type: 'question',
      title: 'Website permission',
      message: `${requestingOrigin} is asking to use ${permission}.`,
      detail: 'Allow it for this LeaX browser profile on this device?',
      buttons: ['Allow this time', 'Block'],
      defaultId: 1,
      cancelId: 1,
      noLink: true
    }).then(result => callback(result.response === 0)).catch(() => callback(false));
  });
  browserSession.on('will-download', (event, item) => {
    if (!mainWindow || mainWindow.isDestroyed()) return item.cancel();
    const safeName = path.basename(item.getFilename() || 'download');
    dialog.showSaveDialog(mainWindow, {
      title: 'Save download',
      defaultPath: path.join(app.getPath('downloads'), safeName),
      buttonLabel: 'Save file'
    }).then(result => {
      if (result.canceled || !result.filePath) item.cancel();
      else item.setSavePath(result.filePath);
    }).catch(() => item.cancel());
  });

  mainWindow = new BaseWindow({
    title: 'LeaX AI Browser', width: 1440, height: 940,
    minWidth: 820, minHeight: 560,
    backgroundColor: '#08131d', autoHideMenuBar: true
  });
  chromeView = new WebContentsView({webPreferences: {
    preload: path.join(__dirname, 'preload.cjs'),
    contextIsolation: true, nodeIntegration: false, sandbox: true,
    webSecurity: true, allowRunningInsecureContent: false
  }});
  mainWindow.contentView.addChildView(chromeView);
  mainWindow.on('resize',layoutViews);
  layoutViews();
  chromeView.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  chromeView.webContents.on('will-navigate',event=>event.preventDefault());
  await chromeView.webContents.loadFile(path.join(__dirname,'chrome.html'));
  robotView=new WebContentsView({webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
  mainWindow.contentView.addChildView(robotView);layoutRobot();
  robotView.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  robotView.webContents.on('will-navigate',event=>event.preventDefault());
  await robotView.webContents.loadFile(path.join(__dirname,'robot.html'));
  if(process.env.LEAX_BROWSER_BRIDGE_TOKEN){
    accessLobbyView=new WebContentsView({webPreferences:{session:browserSession,contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
    mainWindow.contentView.addChildView(accessLobbyView);accessLobbyView.webContents.setWindowOpenHandler(()=>({action:'deny'}));accessLobbyView.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith('http://127.0.0.1:4310/'))event.preventDefault();});
    accessHeld=true;layoutViews();await accessLobbyView.webContents.loadURL('http://127.0.0.1:4310/').catch(()=>{});
    const checkAccess=async()=>{if(!mainWindow||mainWindow.isDestroyed())return;try{const r=await fetch('http://127.0.0.1:4310/api/online/status',{redirect:'error',signal:AbortSignal.timeout(5000)});if(!r.ok)throw Error('Office access check unavailable');const value=await r.json();accessHeld=value.required===true&&value.allowed!==true;}catch{accessHeld=true;}if(accessHeld){activeGrant=null;aiActing=false;}layoutViews();robotView.setVisible(!accessHeld);chromeView.setVisible(!accessHeld);sendState();accessTimer=setTimeout(checkAccess,5000);};void checkAccess();
  }
  ipcMain.handle('leax:robot-size',(event,expanded)=>{assertChromeSender(event);robotExpanded=expanded===true;layoutRobot();return true;});
  ipcMain.handle('leax:robot-move',(event,x,y)=>{assertChromeSender(event);if(!Number.isFinite(x)||!Number.isFinite(y))return;robotPosition.x+=Math.max(-200,Math.min(200,x));robotPosition.y+=Math.max(-200,Math.min(200,y));layoutRobot();});
  ipcMain.handle('leax:assistant',async(event,body)=>{assertChromeSender(event);if(!body||!['ask','status','stop'].includes(body.action))throw Error('Invalid assistant action');const token=process.env.LEAX_BROWSER_BRIDGE_TOKEN||'';const response=await fetch('http://127.0.0.1:4310/api/browser-bridge/assistant',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action:body.action,id:String(body.id||'').slice(0,100),prompt:String(body.prompt||'').slice(0,4000)}),signal:AbortSignal.timeout(10000),redirect:'error'});const result=await response.json();if(!response.ok)throw Error(result.error||'Assistant unavailable');return result;});
  ipcMain.handle('leax:tab-new',(event)=>{assertChromeSender(event);activeGrant=null;aiActing=false;activeTabId=null;pageView=null;for(const view of tabs.values())view.setVisible(false);pageTitle='New tab';layoutViews();sendState();return true;});
  ipcMain.handle('leax:tab-select',(event,id)=>{assertChromeSender(event);selectTab(String(id));return true;});
  ipcMain.handle('leax:tab-close',(event,id)=>{assertChromeSender(event);closeTab(String(id));return true;});
  ipcMain.handle('leax:navigate', (event, value) => {
    assertChromeSender(event);
    if(accessHeld)throw Error('Reconnect your account in the setup lobby');
    const target = normalizedAddress(value);
    pageStatus = 'Loading…'; sendState();
    if(!pageView){createTab(target);return true;}
    return pageView.webContents.loadURL(target).then(() => true);
  });
  ipcMain.handle('leax:history', (event, direction) => {
    assertChromeSender(event);
    if (direction === 'back' && pageView?.webContents.canGoBack()) pageView.webContents.goBack();
    else if (direction === 'forward' && pageView?.webContents.canGoForward()) pageView.webContents.goForward();
    sendState(); return true;
  });
  ipcMain.handle('leax:reload', event => {
    assertChromeSender(event); pageView?.webContents.reload(); return true;
  });
  ipcMain.handle('leax:devtools', event => {
    assertChromeSender(event); pageView?.webContents.toggleDevTools(); return true;
  });
  ipcMain.handle('leax:ai-stop', async event => {
    assertChromeSender(event); activeGrant=null; aiActing=false; sendState();
    const token=process.env.LEAX_BROWSER_BRIDGE_TOKEN||'';
    try { await fetch('http://127.0.0.1:4310/api/browser-bridge/stop-native',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:'{}',signal:AbortSignal.timeout(5000),redirect:'error'}); } catch {}
    return true;
  });  ipcMain.handle('leax:extensions', async event => { assertChromeSender(event); await extensionManager.manage(); sendState(); return true; });
  ipcMain.handle('leax:clear-close', async event => {
    assertChromeSender(event);
    await browserSession.clearStorageData();
    await browserSession.clearCache();
    await browserSession.clearAuthCache();
    await browserSession.clearHostResolverCache();
    await browserSession.clearCodeCaches();
    app.quit();
    return true;
  });
  startBridgeServer();
  await extensionManager.loadSaved();
  if(launchTarget&&launchTarget!=='https://duckduckgo.com/#leax-new-tab')createTab(launchTarget);
  mainWindow.on('closed', () => {
    activeGrant = null;
    clearTimeout(accessTimer);
    try { bridgeServer?.close(); } catch {}
    for (const view of [chromeView, robotView, accessLobbyView, ...tabs.values()]) {
      try { if (view && !view.webContents.isDestroyed()) view.webContents.close(); } catch {}
    }
    app.quit();
  });
  sendState();
}).catch(error => {
  dialog.showErrorBox('LeaX AI Browser', 'The browser could not start. ' + String(error.message || error));
  app.quit();
});
