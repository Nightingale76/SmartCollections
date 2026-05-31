(function() {
  'use strict';

  const AI_CONFIG_STORAGE_KEY = 'memora_ai_config';
  const DEFAULT_AI_CONFIG = {
    apiKey: '',
    model: 'qwen-plus',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1'
  };

  const runtimeConfig = window.SMART_COLLECTIONS_AI_CONFIG || {};
  Object.assign(runtimeConfig, DEFAULT_AI_CONFIG, runtimeConfig);
  window.SMART_COLLECTIONS_AI_CONFIG = runtimeConfig;

  function normalizeConfig(config) {
    const cfg = config && typeof config === 'object' ? config : {};
    return {
      apiKey: String(cfg.apiKey || '').trim(),
      model: String(cfg.model || DEFAULT_AI_CONFIG.model).trim() || DEFAULT_AI_CONFIG.model,
      baseUrl: String(cfg.baseUrl || DEFAULT_AI_CONFIG.baseUrl).trim() || DEFAULT_AI_CONFIG.baseUrl
    };
  }

  async function load() {
    try {
      const result = await chrome.storage.local.get([AI_CONFIG_STORAGE_KEY]);
      const stored = normalizeConfig(result[AI_CONFIG_STORAGE_KEY]);
      Object.assign(runtimeConfig, stored);
      return runtimeConfig;
    } catch (error) {
      console.warn('[qwen-config] load failed:', error);
      Object.assign(runtimeConfig, normalizeConfig(runtimeConfig));
      return runtimeConfig;
    }
  }

  async function save(config) {
    const nextConfig = normalizeConfig({
      ...runtimeConfig,
      ...(config || {})
    });
    await chrome.storage.local.set({ [AI_CONFIG_STORAGE_KEY]: nextConfig });
    Object.assign(runtimeConfig, nextConfig);
    return runtimeConfig;
  }

  async function clear() {
    await chrome.storage.local.remove([AI_CONFIG_STORAGE_KEY]);
    Object.assign(runtimeConfig, DEFAULT_AI_CONFIG);
    return runtimeConfig;
  }

  function hasCredentials(config) {
    const cfg = normalizeConfig(config || runtimeConfig);
    return Boolean(cfg.apiKey && cfg.model);
  }

  window.MEMORA_AI_CONFIG_MANAGER = {
    STORAGE_KEY: AI_CONFIG_STORAGE_KEY,
    DEFAULTS: DEFAULT_AI_CONFIG,
    normalizeConfig,
    load,
    save,
    clear,
    hasCredentials
  };

  load();
})();
