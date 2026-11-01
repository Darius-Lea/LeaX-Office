/* Preserve the prototype's fetch shim, but route same-origin LeaX API calls
   through the real browser fetch so account forms can use the app backend. */
(() => {
  if (new URLSearchParams(location.search).has('preview')) return;

  const nativeFetch = window.fetch.bind(window);
  let activeFetch = nativeFetch;
  Object.defineProperty(window, 'fetch', {
    configurable: false,
    enumerable: true,
    get: () => activeFetch,
    set: next => {
      if (typeof next !== 'function') return;
      activeFetch = (input, init) => {
        const target = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
        const url = new URL(target, location.href);
        if (url.origin === location.origin && url.pathname.startsWith('/api/')) return nativeFetch(input, init);
        return next(input, init);
      };
    },
  });
})();
