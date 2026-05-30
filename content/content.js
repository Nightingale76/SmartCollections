import { STORAGE_KEYS, PET_STATES, PLATFORMS } from '../shared/constants.js';
import { getCurrentPlatform, extractCurrentPlatformContent, isSupportedPlatform } from './router.js';

let petInstance = null;
let hasSuggested = false;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractCollections') {
    const items = extractCurrentPlatformContent();
    sendResponse({ success: true, data: items });
    return true;
  }

  if (request.action === 'PET_EXTRACT_COMPLETE') {
    if (petInstance && request.count !== undefined) {
      petInstance.onExtractComplete(request.count);
    }
    sendResponse({ received: true });
    return true;
  }

  return true;
});

window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'FROM_BACKGROUND') {
    if (petInstance) {
      petInstance.handleBackgroundMessage(event.data);
    }
  }
});

function init() {
  if (!isSupportedPlatform()) return;

  import('./floating-pet.js').then(({ FloatingPet }) => {
    petInstance = new FloatingPet();
  }).catch(error => {
    console.error('Failed to load floating pet:', error);
  });

  if (isFavoritePage()) {
    setTimeout(() => {
      if (!hasSuggested && petInstance) {
        petInstance.showMessage(getPlatformSuggestion());
        hasSuggested = true;
      }
    }, 3000);
  }

  setTimeout(() => {
    const items = extractCurrentPlatformContent();
    if (items.length > 0 && !hasSuggested && petInstance) {
      petInstance.showMessage(getPlatformSuggestion());
      hasSuggested = true;
    }
  }, 5000);
}

function isFavoritePage() {
  const platform = getCurrentPlatform();
  
  switch (platform) {
    case PLATFORMS.XIAOHONGSHU:
      return window.location.href.includes('/favorites') || 
             window.location.href.includes('/collection');
    case PLATFORMS.DOUYIN:
      return window.location.href.includes('/favorite') || 
             window.location.href.includes('/collection') ||
             window.location.href.includes('/self');
    default:
      return false;
  }
}

function getPlatformSuggestion() {
  const platform = getCurrentPlatform();
  
  switch (platform) {
    case PLATFORMS.XIAOHONGSHU:
      return '要不要整理当前收藏页？✨';
    case PLATFORMS.DOUYIN:
      return '要不要整理当前已加载的视频？🎬';
    default:
      return '发现了有趣的内容，要收藏吗？';
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
