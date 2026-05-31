/**
 * Content Script - IIFE 格式（无 ES6 模块依赖）
 * 负责初始化宠物组件和消息监听
 */

(function() {
  'use strict';

  console.log('[content] content.js loading...');

  let hasSuggested = false;

  const PET_STATES = {
    IDLE: 'idle',
    THINKING: 'thinking',
    HAPPY: 'happy'
  };

  const PLATFORMS = {
    XIAOHONGSHU: 'xiaohongshu',
    DOUYIN: 'douyin'
  };

  const PLATFORM_DOMAINS = {
    'www.xiaohongshu.com': 'xiaohongshu',
    'xiaohongshu.com': 'xiaohongshu',
    'www.douyin.com': 'douyin',
    'douyin.com': 'douyin'
  };

  function getCurrentPlatform() {
    const hostname = window.location.hostname;
    console.log('[content] Current hostname:', hostname);
    return PLATFORM_DOMAINS[hostname] || null;
  }

  function isSupportedPlatform() {
    return getCurrentPlatform() !== null;
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

  function extractCurrentPlatformContent() {
    const platform = getCurrentPlatform();
    console.log('[content] extractCurrentPlatformContent for platform:', platform);

    if (!window.XHS_ROUTER) {
      console.error('[content] XHS_ROUTER not found!');
      return [];
    }

    return window.XHS_ROUTER.extractCurrentPlatformContent();
  }

  chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    console.log('[content] Received message:', request.action);

    if (request.action === 'extractCollections') {
      console.log('[content] Handling extractCollections request');
      try {
        const items = extractCurrentPlatformContent();
        console.log('[content] Extracted items count:', items ? items.length : 0);
        sendResponse({ success: true, data: items || [] });
      } catch (error) {
        console.error('[content] Extract error:', error);
        sendResponse({ success: false, error: error.message });
      }
      return true;
    }

    if (request.action === 'PET_EXTRACT_COMPLETE') {
      console.log('[content] Received PET_EXTRACT_COMPLETE:', request.count);
      const petInstance = window.XHS_FLOATTING_PET && window.XHS_FLOATTING_PET.getInstance();
      if (petInstance && request.count !== undefined) {
        petInstance.onExtractComplete(request.count);
      }
      sendResponse({ received: true });
      return true;
    }

    if (request.action === 'PET_EXTRACT_ERROR') {
      console.log('[content] Received PET_EXTRACT_ERROR:', request.message);
      const petInstance = window.XHS_FLOATTING_PET && window.XHS_FLOATTING_PET.getInstance();
      if (petInstance) {
        petInstance.onExtractError(request.message || '提取失败，请刷新后重试');
      }
      sendResponse({ received: true });
      return true;
    }

    return true;
  });

  function initContent() {
    console.log('[content] initContent() called');
    console.log('[content] Is supported platform:', isSupportedPlatform());

    if (!isSupportedPlatform()) {
      console.log('[content] Not a supported platform, skipping pet initialization');
      return;
    }

    if (!window.XHS_FLOATTING_PET) {
      console.error('[content] XHS_FLOATTING_PET not found! floating-pet.js may not have loaded.');
      return;
    }

    const petInstance = window.XHS_FLOATTING_PET.getInstance();
    console.log('[content] Pet instance:', petInstance ? 'exists' : 'not yet created');

    if (isFavoritePage()) {
      console.log('[content] Detected favorite page, will suggest after delay');
      setTimeout(function() {
        const pet = window.XHS_FLOATTING_PET.getInstance();
        if (!hasSuggested && pet) {
          pet.showMessage(getPlatformSuggestion());
          hasSuggested = true;
          console.log('[content] Suggested on favorite page');
        }
      }, 3000);
    }

    setTimeout(function() {
      console.log('[content] Checking for content to suggest');
      const items = extractCurrentPlatformContent();
      const pet = window.XHS_FLOATTING_PET.getInstance();
      console.log('[content] Extracted content count:', items ? items.length : 0);

      if (items && items.length > 0 && !hasSuggested && pet) {
        pet.showMessage(getPlatformSuggestion());
        hasSuggested = true;
        console.log('[content] Suggested after finding content');
      }
    }, 5000);
  }

  console.log('[content] content.js script loaded, document readyState:', document.readyState);

  if (document.readyState === 'loading') {
    console.log('[content] Waiting for DOMContentLoaded');
    document.addEventListener('DOMContentLoaded', initContent);
  } else {
    console.log('[content] Document already ready, initializing');
    initContent();
  }

})();
