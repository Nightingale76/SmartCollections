chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'openSidePanel') {
    chrome.sidePanel.open({ windowId: sender.tab?.windowId }).then(() => {
      sendResponse({ success: true });
    }).catch((error) => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }

  if (request.action === 'saveExtractedItems') {
    handleSaveExtractedItems(request, sender).then(result => {
      sendResponse(result);
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }

  if (request.action === 'set_ui_mode') {
    handleSetUIMode(request, sender).then(result => {
      sendResponse(result);
    }).catch(error => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }

  if (request.action === 'update_pet_state') {
    sendResponse({ success: true });
  }

  return true;
});

const SETTINGS_KEY = 'xhs_settings';
const DEFAULT_UI_MODE_MIGRATION_KEY = 'memora_default_popup_mode_applied';
const DEFAULT_UI_MODE = 'simple';

function normalizeUIMode(mode) {
  return String(mode || '').toLowerCase() === 'full' ? 'full' : 'simple';
}

async function getStoredUIMode() {
  try {
    const res = await chrome.storage.local.get([SETTINGS_KEY]);
    return normalizeUIMode(res?.[SETTINGS_KEY]?.uiMode || DEFAULT_UI_MODE);
  } catch (e) {
    return DEFAULT_UI_MODE;
  }
}

async function syncActionBehavior(mode) {
  const nextMode = normalizeUIMode(mode || await getStoredUIMode());
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: nextMode === 'full' });
  } catch (e) {}
}

async function applyDefaultUIModeOnce() {
  try {
    const res = await chrome.storage.local.get([SETTINGS_KEY, DEFAULT_UI_MODE_MIGRATION_KEY]);
    if (res[DEFAULT_UI_MODE_MIGRATION_KEY]) {
      await syncActionBehavior();
      return;
    }

    const base = res[SETTINGS_KEY] && typeof res[SETTINGS_KEY] === 'object' ? res[SETTINGS_KEY] : {};
    await chrome.storage.local.set({
      [SETTINGS_KEY]: { ...base, uiMode: DEFAULT_UI_MODE },
      [DEFAULT_UI_MODE_MIGRATION_KEY]: true
    });
    await syncActionBehavior(DEFAULT_UI_MODE);
  } catch (e) {
    await syncActionBehavior(DEFAULT_UI_MODE);
  }
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

async function updateSettingsUIMode(mode) {
  const nextMode = normalizeUIMode(mode);
  const res = await chrome.storage.local.get([SETTINGS_KEY]);
  const base = res[SETTINGS_KEY] && typeof res[SETTINGS_KEY] === 'object' ? res[SETTINGS_KEY] : {};
  await chrome.storage.local.set({ [SETTINGS_KEY]: { ...base, uiMode: nextMode } });
  await syncActionBehavior(nextMode);
  return nextMode;
}

async function applyUIModeToTab(tab, mode) {
  if (!tab || !tab.id) return;

  try {
    if (mode === 'simple') {
      await chrome.sidePanel.setOptions({ tabId: tab.id, enabled: false });
    } else {
      await chrome.sidePanel.setOptions({ tabId: tab.id, enabled: true, path: 'sidepanel/sidepanel.html' });
    }
  } catch (e) {}

  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'set_ui_mode', mode });
  } catch (e) {}
}

async function handleSetUIMode(request, sender) {
  const mode = normalizeUIMode(request.mode);
  const nextMode = await updateSettingsUIMode(mode);
  const activeTab = sender && sender.tab ? sender.tab : await getActiveTab();
  await applyUIModeToTab(activeTab, nextMode);

  if (nextMode === 'full' && activeTab && activeTab.windowId) {
    try { await chrome.sidePanel.open({ windowId: activeTab.windowId }); } catch (e) {}
  }

  return { success: true, mode: nextMode };
}

async function handleSaveExtractedItems(request, sender) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab || !tab.id) {
      return { success: false, error: '无法获取当前标签页' };
    }

    const response = await chrome.tabs.sendMessage(tab.id, { action: 'extractCollections' });

    if (!response) {
      chrome.tabs.sendMessage(tab.id, { action: 'PET_EXTRACT_ERROR', message: '未收到页面响应，请刷新后重试' }).catch(() => {});
      return { success: false, error: '未收到页面响应' };
    }

    if (!response.success) {
      chrome.tabs.sendMessage(tab.id, { action: 'PET_EXTRACT_ERROR', message: response.error || '提取失败，请刷新后重试' }).catch(() => {});
      return { success: false, error: response.error || '提取失败' };
    }

    if (!response.data || response.data.length === 0) {
      chrome.tabs.sendMessage(tab.id, { action: 'PET_EXTRACT_COMPLETE', count: 0 }).catch(() => {});
      return { success: true, count: 0 };
    }

    const newItems = response.data;
    
    const result = await chrome.storage.local.get('xhs_collections');
    const existingCollections = result.xhs_collections || [];
    
    const existingIds = new Set(existingCollections.map(item => item.id));
    const uniqueNewItems = newItems.filter(item => !existingIds.has(item.id));
    
    const itemsWithTimestamp = uniqueNewItems.map(item => ({
      ...item,
      collectedAt: new Date().toISOString()
    }));
    
    const allCollections = [...existingCollections, ...itemsWithTimestamp];
    
    await chrome.storage.local.set({ xhs_collections: allCollections });

    chrome.tabs.sendMessage(tab.id, {
      action: 'PET_EXTRACT_COMPLETE',
      count: uniqueNewItems.length,
      extractedCount: newItems.length
    }).catch(() => {});

    return { success: true, count: uniqueNewItems.length };
  } catch (error) {
    console.error('Save extracted items error:', error);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id) {
        chrome.tabs.sendMessage(tab.id, { action: 'PET_EXTRACT_ERROR', message: error.message || '提取失败，请刷新后重试' }).catch(() => {});
      }
    } catch (e) {}
    return { success: false, error: error.message };
  }
}

applyDefaultUIModeOnce();

chrome.runtime.onInstalled.addListener(() => {
  applyDefaultUIModeOnce();
});

chrome.runtime.onStartup.addListener(() => {
  applyDefaultUIModeOnce();
});
