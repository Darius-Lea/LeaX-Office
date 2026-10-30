const {app, BaseWindow, WebContentsView, dialog, ipcMain, session} = require('electron');
const fs = require('node:fs');
const crypto = require('node:crypto');
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
let pageView;
let browserSession;
let extensionManager;
let pageTitle = 'New tab';
let pageStatus = 'Sign-ins stay saved on this device';
const launchTarget = process.env.LEAX_BROWSER_TARGET || 'https://duckduckgo.com/';

function sendState() {
  if (!chromeView || chromeView.webContents.isDestroyed()) return;
  chromeView.webContents.send('leax:state', {
    url: pageView?.webContents.getURL() || '',
    title: pageTitle,
    status: pageStatus,
    canGoBack: !!pageView?.webContents.canGoBack(),
    canGoForward: !!pageView?.webContents.canGoForward(),
    secure: (pageView?.webContents.getURL() || '').startsWith('https://'),
    extensions: extensionManager ? extensionManager.list() : [],
  });
}

function isAllowedWebUrl(raw) {
  try {
    const u = new URL(raw);
    return ['https:', 'http:'].includes(u.protocol) && !!u.hostname && !u.username && !u.password;
  } catch { return false; }
}

function assertChromeSender(event) {
  if (!chromeView || event.sender !== chromeView.webContents || event.senderFrame !== event.sender.mainFrame) {
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
  pageView = new WebContentsView({webPreferences: {
    session: browserSession,
    contextIsolation: true, nodeIntegration: false, sandbox: true,
    webSecurity: true, allowRunningInsecureContent: false,
    devTools: true
  }});
  mainWindow.contentView.addChildView(pageView);
  mainWindow.contentView.addChildView(chromeView);
  const layout = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const [width, height] = mainWindow.getContentSize();
    chromeView.setBounds({x:0, y:0, width, height:70});
    pageView.setBounds({x:0, y:70, width, height:Math.max(100,height-70)});
  };
  mainWindow.on('resize', layout);
  layout();

  chromeView.webContents.setWindowOpenHandler(() => ({action:'deny'}));
  chromeView.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file:')) event.preventDefault();
  });
  chromeView.webContents.loadFile(path.join(__dirname, 'chrome.html'));

  pageView.webContents.setWindowOpenHandler(({url}) => {
    if (isAllowedWebUrl(url)) pageView.webContents.loadURL(url).catch(() => {});
    return {action:'deny'};
  });
  pageView.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedWebUrl(url)) {
      event.preventDefault();
      pageStatus = 'Blocked a non-web address';
      sendState();
    }
  });
  pageView.webContents.on('will-redirect', (event, url) => {
    if (!isAllowedWebUrl(url)) {
      event.preventDefault();
      pageStatus = 'Blocked a non-web redirect';
      sendState();
    }
  });
  pageView.webContents.on('did-start-loading', () => { pageStatus = 'Loading…'; sendState(); });
  pageView.webContents.on('did-stop-loading', () => { pageStatus = 'Sign-ins stay saved on this device'; sendState(); });
  pageView.webContents.on('did-navigate', (_event, url) => { pageStatus = 'Sign-ins stay saved on this device'; sendState(); });
  pageView.webContents.on('did-navigate-in-page', (_event, url) => { sendState(); });
  pageView.webContents.on('page-title-updated', (_event, title) => { pageTitle = String(title || 'Web page').slice(0,200); sendState(); });
  pageView.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i'))) {
      event.preventDefault();
      pageView.webContents.toggleDevTools();
    }
  });

  ipcMain.handle('leax:navigate', (event, value) => {
    assertChromeSender(event);
    const target = normalizedAddress(value);
    pageStatus = 'Loading…'; sendState();
    return pageView.webContents.loadURL(target).then(() => true);
  });
  ipcMain.handle('leax:history', (event, direction) => {
    assertChromeSender(event);
    if (direction === 'back' && pageView.webContents.canGoBack()) pageView.webContents.goBack();
    else if (direction === 'forward' && pageView.webContents.canGoForward()) pageView.webContents.goForward();
    sendState(); return true;
  });
  ipcMain.handle('leax:reload', event => {
    assertChromeSender(event); pageView.webContents.reload(); return true;
  });
  ipcMain.handle('leax:devtools', event => {
    assertChromeSender(event); pageView.webContents.toggleDevTools(); return true;
  });
  ipcMain.handle('leax:extensions', async event => { assertChromeSender(event); await extensionManager.manage(); sendState(); return true; });
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
  await extensionManager.loadSaved();
  pageView.webContents.loadURL(normalizedAddress(launchTarget)).catch(error => {
    pageStatus = 'Page failed to load · check the address or connection';
    pageTitle = 'Unable to open page';
    sendState();
  });
  mainWindow.on('closed', () => {
    for (const view of [chromeView, pageView]) {
      try { if (view && !view.webContents.isDestroyed()) view.webContents.close(); } catch {}
    }
    app.quit();
  });
  sendState();
}).catch(error => {
  dialog.showErrorBox('LeaX AI Browser', 'The browser could not start. ' + String(error.message || error));
  app.quit();
});

