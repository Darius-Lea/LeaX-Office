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
  if (state.url && document.activeElement !== address) address.value = state.url;
  title.textContent = state.title || '';
  const extensionCount = (state.extensions || []).length;
  status.textContent = (state.status || '') + (extensionCount ? ' · ' + extensionCount + ' browser extension' + (extensionCount === 1 ? '' : 's') + ' active' : '');
  $('#security').classList.toggle('insecure', !state.secure);
  $('#security').title = state.secure ? 'HTTPS connection' : 'HTTP or no page loaded';
  $('#back').disabled = !state.canGoBack;
  $('#forward').disabled = !state.canGoForward;
});
address.addEventListener('focus', () => address.select());
