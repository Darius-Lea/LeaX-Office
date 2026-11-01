/* Connect the supplied lobby's account forms to LeaX Office APIs while keeping
   its provider directory honest until each provider has a real adapter. */
(() => {
  if (new URLSearchParams(location.search).has('preview')) return;

  const state = window.__HQ;
  if (state?.HQ?.conns instanceof Set) {
    state.HQ.conns.clear();
    document.querySelectorAll('#connGrid .conn').forEach(tile => {
      tile.classList.remove('on');
      const status = tile.querySelector('.st');
      if (status) status.textContent = 'NOT CONNECTED';
    });
    const count = document.querySelector('#connCount b');
    if (count) count.textContent = '0/' + document.querySelectorAll('#connGrid .conn').length;
  }

  document.addEventListener('click', event => {
    const tile = event.target.closest?.('#connGrid .conn');
    if (!tile) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const provider = (typeof CONNS === 'undefined' ? [] : CONNS).find(item => item[0] === tile.dataset.id);
    const name = provider?.[1] || 'This provider';
    if (typeof toast === 'function') {
      toast(name + ' is not connected yet. Its provider integration is not available in LeaX Office.', 'info');
    }
  }, true);

  const twilio = (typeof GUARDS === 'undefined' ? [] : GUARDS).find(item => item.id === 'twilio');
  if (twilio) {
    twilio.on = false;
    twilio.lab = ['NOT CONNECTED', 'NOT CONNECTED'];
    const tile = document.querySelector('.guard[data-id="twilio"]');
    if (tile) {
      tile.classList.remove('on');
      tile.querySelector('.gb').textContent = 'NOT CONNECTED';
      tile.querySelector('.gh').setAttribute('aria-pressed', 'false');
    }
    document.addEventListener('click', event => {
      if (!event.target.closest?.('.guard[data-id="twilio"]')) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (typeof toast === 'function') toast('Twilio is not connected. LeaX Office has no SMS provider authorization.', 'info');
    }, true);
  }

  const authBack = document.querySelector('#authBack');
  const continueButton = document.querySelector('#btnContinue');
  const routeContinue = () => {
    if (!authBack || authBack.hidden || !continueButton) return;
    const isFounder = document.querySelector('#authBackText')?.textContent.startsWith('Founder session is active.');
    const destination = isFounder ? '/headquarters' : '/offices';
    continueButton.onclick = () => { location.href = destination; };
  };
  if (authBack) {
    new MutationObserver(routeContinue).observe(authBack, { attributes: true, attributeFilter: ['hidden'] });
    routeContinue();
  }
})();
