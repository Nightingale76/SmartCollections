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

  if (request.action === 'update_pet_state') {
    sendResponse({ success: true });
  }

  return true;
});

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

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ windowId: tab.windowId });
});
