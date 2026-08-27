window.UKVI_CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbxsY-uSRWOF6LoB7gurnEov6U-JqPo2dDUc_IHkBnNLZRCLDKsfT3sGz7IqN_nIQh-2Zg/exec',
  BUILD: '20260827-jsonp-data'
};

// GitHub Pages and Apps Script are on different origins. Apps Script's
// ContentService supports JSONP, so requests to the configured API are
// transported through a script tag rather than browser fetch/CORS.
(function installAppsScriptJsonpTransport(){
  const apiUrl = (window.UKVI_CONFIG.API_URL || '').trim();
  if (!apiUrl || typeof window.fetch !== 'function') return;

  const nativeFetch = window.fetch.bind(window);

  window.fetch = function(input, init){
    const requestUrl = typeof input === 'string' ? input : (input && input.url) || '';
    if (!requestUrl.startsWith(apiUrl)) return nativeFetch(input, init);

    return new Promise((resolve, reject) => {
      const callbackName = '__ukviJsonp_' + Date.now() + '_' + Math.random().toString(36).slice(2);
      const script = document.createElement('script');
      const signal = init && init.signal;
      let finished = false;

      const cleanup = () => {
        if (finished) return;
        finished = true;
        if (signal) signal.removeEventListener('abort', onAbort);
        if (script.parentNode) script.parentNode.removeChild(script);
        try { delete window[callbackName]; } catch (_) { window[callbackName] = undefined; }
      };

      const fail = message => {
        cleanup();
        reject(new TypeError(message));
      };

      const onAbort = () => {
        cleanup();
        const error = new Error('The operation was aborted.');
        error.name = 'AbortError';
        reject(error);
      };

      if (signal) {
        if (signal.aborted) return onAbort();
        signal.addEventListener('abort', onAbort, { once: true });
      }

      window[callbackName] = data => {
        cleanup();
        resolve({
          ok: true,
          status: 200,
          json: async () => data,
          text: async () => JSON.stringify(data)
        });
      };

      script.async = true;
      script.onerror = () => fail('Apps Script data request failed.');
      script.src = requestUrl + (requestUrl.includes('?') ? '&' : '?') + 'callback=' + encodeURIComponent(callbackName);
      document.head.appendChild(script);
    });
  };
})();
