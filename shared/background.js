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

    if (!response || !response.success || !response.data || response.data.length === 0) {
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
      count: uniqueNewItems.length
    }).catch(() => {});

    return { success: true, count: uniqueNewItems.length };
  } catch (error) {
    console.error('Save extracted items error:', error);
    return { success: false, error: error.message };
  }
}

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ windowId: tab.windowId });
});
