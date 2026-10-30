const $ = selector => document.querySelector(selector);
const address = $('#address'), status = $('#status'), title = $('#page-title');
$('#address-form').addEventListener('submit', event => { event.preventDefault(); window.leaxBrowser.navigate(address.value).catch(error => { status.textContent = String(error.message || error); }); });
$('#back').addEventListener('click', () => window.leaxBrowser.history('back'));
$('#forward').addEventListener('click', () => window.leaxBrowser.history('forward'));
$('#reload').addEventListener('click', () => window.leaxBrowser.reload());
$('#devtools').addEventListener('click', () => window.leaxBrowser.devtools());
$('#clear-close').addEventListener('click', async () => {
  if (!window.confirm('Sweep LeaX AI Browser clean and close it? This clears saved website sign-ins, cookies, cached files and stored site data on this device. You will need to sign in again. Downloaded files you saved stay on your computer. Websites, your network and Windows may keep their own records.')) return;
  await window.leaxBrowser.clearAndClose();
});
window.leaxBrowser.onState(state => {
  $('#new-tab').hidden=!state.newTab;
  const tabbar=$('#tabs');tabbar.replaceChildren();
  for(const tab of state.tabs||[]){const group=document.createElement('span'),select=document.createElement('button'),close=document.createElement('button');select.textContent=tab.title;select.setAttribute('aria-pressed',String(tab.active));select.onclick=()=>window.leaxBrowser.selectTab(tab.id);close.textContent='×';close.setAttribute('aria-label','Close '+tab.title);close.onclick=()=>window.leaxBrowser.closeTab(tab.id);group.append(select,close);tabbar.append(group);}
  const add=document.createElement('button');add.textContent='+ New tab';add.onclick=()=>window.leaxBrowser.newTab();tabbar.append(add);
  if (state.url && document.activeElement !== address) address.value = state.url;
title.textContent = state.title || '';
  const aiAccess = $('#ai-access');
  const grant = state.aiAccess;
  if (grant && Number(grant.expiresAt) > Date.now()) {
    const minutes = Math.max(1, Math.ceil((Number(grant.expiresAt) - Date.now()) / 60000));
    aiAccess.textContent = state.aiActing ? 'AI acting · STOP' : 'AI access on · '+minutes+'m · STOP';
    aiAccess.title = 'Owner-approved access for '+grant.origin+'. Click to stop immediately.';
    aiAccess.disabled = false;
    aiAccess.classList.add('granted');
  } else {
    aiAccess.textContent = 'AI access: Off';
    aiAccess.title = 'No active browser permission. Review the request in LeaX Office.';
    aiAccess.disabled = true;
    aiAccess.classList.remove('granted');
  }
  document.body.classList.toggle('ai-active',state.aiActing===true);
  const extensionCount = (state.extensions || []).length;
  status.textContent = (state.status || '') + (extensionCount ? ' · ' + extensionCount + ' browser extension' + (extensionCount === 1 ? '' : 's') + ' active' : '');
  $('#security').classList.toggle('insecure', !state.secure);
  $('#security').title = state.secure ? 'HTTPS connection' : 'HTTP or no page loaded';
  $('#back').disabled = !state.canGoBack;
  $('#forward').disabled = !state.canGoForward;
});
address.addEventListener('focus', () => address.select());

$('#ai-access').onclick=()=>window.leaxBrowser.stopAI();
$('#extensions').onclick=()=>window.leaxBrowser.extensions();
const favorites=[['Proton Mail','https://mail.proton.me/'],['DuckDuckGo','https://duckduckgo.com/'],['Investigation • Bellingcat','https://www.bellingcat.com/'],['Investigation • ICANN Lookup','https://lookup.icann.org/'],['AI news • MIT','https://www.technologyreview.com/topic/artificial-intelligence/'],['Business news • Reuters','https://www.reuters.com/business/']];
for(const [label,url]of favorites){const button=document.createElement('button');button.textContent=label;button.onclick=()=>window.leaxBrowser.navigate(url);$('#favorites').append(button);}
