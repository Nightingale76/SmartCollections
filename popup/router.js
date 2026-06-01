(function() {
  'use strict';

  const SETTINGS_KEY = 'xhs_settings';

  function normalizeMode(mode) {
    return String(mode || 'simple').toLowerCase() === 'full' ? 'full' : 'simple';
  }

  chrome.storage.local.get([SETTINGS_KEY]).then((res) => {
    const mode = normalizeMode(res?.[SETTINGS_KEY]?.uiMode);
    if (mode === 'simple') {
      window.location.replace('../simple-popup/popup.html');
    } else {
      window.location.replace('popup.html');
    }
  }).catch(() => {
    window.location.replace('../simple-popup/popup.html');
  });
})();
