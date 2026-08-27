window.UKVI_CONFIG = {
  API_URL: '__ukvi_bundled_data__',
  BUILD: '20260827-bundled-data-v2'
};

(function installBundledDataTransport(){
  const sentinel = window.UKVI_CONFIG.API_URL;
  const nativeFetch = window.fetch.bind(window);

  const dataReady = new Promise((resolve, reject) => {
    if (window.UKVI_DATA && window.UKVI_DATA.datasets) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'data/ukvi-data.js?v=' + encodeURIComponent(window.UKVI_CONFIG.BUILD);
    script.async = true;
    script.onload = () => {
      if (window.UKVI_DATA && window.UKVI_DATA.datasets) resolve();
      else reject(new Error('UKVI data bundle loaded without datasets.'));
    };
    script.onerror = () => reject(new Error('UKVI data bundle could not be loaded from GitHub Pages.'));
    document.head.appendChild(script);
  });

  window.fetch = async function(input, init){
    const requestUrl = typeof input === 'string' ? input : (input && input.url) || '';
    if (!requestUrl.startsWith(sentinel)) return nativeFetch(input, init);

    let payload;
    try {
      await dataReady;
      payload = window.UKVI_DATA;
    } catch (error) {
      payload = {
        status: 'error',
        message: error && error.message ? error.message : String(error)
      };
    }

    return {
      ok: true,
      status: 200,
      json: async () => payload,
      text: async () => JSON.stringify(payload)
    };
  };
})();
