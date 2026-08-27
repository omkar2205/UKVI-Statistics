window.UKVI_CONFIG = {
  API_URL: '__ukvi_bundled_data__',
  BUILD: '20260827-bundled-data'
};

(function installBundledDataTransport(){
  const sentinel = window.UKVI_CONFIG.API_URL;
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async function(input, init){
    const requestUrl = typeof input === 'string' ? input : (input && input.url) || '';
    if (!requestUrl.startsWith(sentinel)) return nativeFetch(input, init);

    const data = window.UKVI_DATA;
    const payload = data && data.datasets
      ? data
      : { status: 'error', message: 'Bundled GitHub data did not load.' };

    return {
      ok: true,
      status: 200,
      json: async () => payload,
      text: async () => JSON.stringify(payload)
    };
  };
})();
