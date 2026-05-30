chrome.action.onClicked.addListener(async (tab) => {
  if (tab.url.includes('xiaohongshu.com')) {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  } else {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  }
});

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'update_pet_state') {
    sendResponse({ success: true });
  }
  return true;
});
