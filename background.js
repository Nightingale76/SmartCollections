const AI_CONFIG_KEY = 'memora_ai_config';

async function readAiConfig() {
  const res = await chrome.storage.local.get(AI_CONFIG_KEY);
  const stored = res[AI_CONFIG_KEY];
  if (stored && typeof stored === 'object') return stored;
  return { apiKey: '', baseUrl: '', model: '' };
}

async function writeAiConfig(nextConfig) {
  const base = await readAiConfig();
  const merged = { ...base, ...(nextConfig && typeof nextConfig === 'object' ? nextConfig : {}) };
  await chrome.storage.local.set({ [AI_CONFIG_KEY]: merged });
  return merged;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const type = message?.type;
  if (type === 'aiConfig.get') {
    (async () => {
      try {
        const config = await readAiConfig();
        sendResponse({ ok: true, config });
      } catch (error) {
        sendResponse({ ok: false, error: String(error?.message || error) });
      }
    })();
    return true;
  }

  if (type === 'aiConfig.set') {
    (async () => {
      try {
        const config = await writeAiConfig(message?.config);
        sendResponse({ ok: true, config });
      } catch (error) {
        sendResponse({ ok: false, error: String(error?.message || error) });
      }
    })();
    return true;
  }

  return undefined;
});
