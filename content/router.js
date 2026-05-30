/**
 * Router - IIFE 格式（无 ES6 模块依赖）
 * 负责平台检测和内容提取路由
 */

(function() {
  'use strict';

  console.log('[router] router.js loading...');

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
    console.log('[router] Current hostname:', hostname);
    return PLATFORM_DOMAINS[hostname] || null;
  }

  function isSupportedPlatform() {
    return getCurrentPlatform() !== null;
  }

  function extractCurrentPlatformContent() {
    const platform = getCurrentPlatform();
    console.log('[router] Extracting content for platform:', platform);

    switch (platform) {
      case PLATFORMS.XIAOHONGSHU:
        console.log('[router] Using XHS extractor');
        return XHSExtractor.extract();
      case PLATFORMS.DOUYIN:
        console.log('[router] Using Douyin extractor');
        if (window.XHS_DOUYIN_EXTRACTOR) {
          return window.XHS_DOUYIN_EXTRACTOR.extractDouyinContent();
        } else {
          console.error('[router] XHS_DOUYIN_EXTRACTOR not found!');
          return [];
        }
      default:
        console.log('[router] Unknown platform, returning empty');
        return [];
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

  function isFavoritePage() {
    const platform = getCurrentPlatform();

    switch (platform) {
      case PLATFORMS.XIAOHONGSHU:
        return window.location.href.includes('/favorites') ||
               window.location.href.includes('/collection');
      case PLATFORMS.DOUYIN:
        if (window.XHS_DOUYIN_EXTRACTOR) {
          return window.XHS_DOUYIN_EXTRACTOR.isDouyinFavoritePage();
        }
        return false;
      default:
        return false;
    }
  }

  const XHSExtractor = {
    extract: function() {
      console.log('[router] XHSExtractor.extract() called');

      const collections = [];

      const collectionCards = document.querySelectorAll('[data-note-id], .note-card, .feeds-item, .flow-item, .note-item');
      console.log('[router] Found potential cards:', collectionCards.length);

      collectionCards.forEach(function(card) {
        const item = this.extractCardInfo(card);
        if (item && item.id && item.url) {
          const exists = collections.some(function(c) { return c.id === item.id; });
          if (!exists) {
            collections.push(item);
          }
        }
      }.bind(this));

      if (collections.length === 0) {
        const alternativeCards = document.querySelectorAll('a[href*="/note/"]');
        console.log('[router] Trying alternative selector, found:', alternativeCards.length);

        alternativeCards.forEach(function(card) {
          const item = this.extractCardInfo(card);
          if (item && item.id && item.url) {
            const exists = collections.some(function(c) { return c.id === item.id; });
            if (!exists) {
              collections.push(item);
            }
          }
        }.bind(this));
      }

      console.log('[router] Total extracted items:', collections.length);
      return collections;
    },

    extractCardInfo: function(card) {
      const item = {
        platform: PLATFORMS.XIAOHONGSHU,
        id: null,
        url: null,
        type: 'note',
        title: null,
        author: null,
        text: null,
        cover: null,
        stats: {
          likes: null,
          comments: null,
          collects: null
        },
        collectedAt: new Date().toISOString()
      };

      const noteId = card.getAttribute('data-note-id') || card.getAttribute('data-id') || card.getAttribute('id');

      const linkElement = card.querySelector('a[href*="/note/"]') || card.closest('a[href*="/note/"]') || card.querySelector('a');

      if (linkElement) {
        const href = linkElement.href;
        const match = href.match(/\/note\/([a-zA-Z0-9]+)/);
        if (match) {
          item.id = match[1];
        } else {
          item.id = href;
        }
        item.url = href;
      } else if (noteId) {
        item.id = noteId;
        item.url = 'https://www.xiaohongshu.com/note/' + noteId;
      }

      if (!item.id) return null;

      const titleElements = card.querySelectorAll('h3, .title, .note-title, .content-title, .desc, .note-desc, [class*="title"], [class*="desc"]');
      for (let i = 0; i < titleElements.length; i++) {
        const el = titleElements[i];
        const text = el.textContent.trim();
        if (text && text.length > 0 && text.length < 200) {
          item.title = text;
          item.text = text;
          break;
        }
      }

      if (!item.title) {
        const titleAttr = card.getAttribute('title');
        if (titleAttr && titleAttr.length > 0 && titleAttr.length < 200) {
          item.title = titleAttr;
          item.text = titleAttr;
        }
      }

      const authorElements = card.querySelectorAll('.user-name, .author, .nickname, [class*="user"], [class*="author"]');
      for (let i = 0; i < authorElements.length; i++) {
        const el = authorElements[i];
        const text = el.textContent.trim();
        if (text && text.length > 0 && text.length < 50) {
          item.author = text;
          break;
        }
      }

      const imgElement = card.querySelector('img[src*="http"]');
      if (imgElement) {
        let src = imgElement.src || imgElement.getAttribute('data-src') || imgElement.getAttribute('data-lazy-src');
        if (src) {
          src = src.replace(/\/w\d+\/h\d+/, '/w600/h600');
          item.cover = src;
        }
      }

      const statsElements = card.querySelectorAll('span, .like, .comment, .collect, [class*="like"], [class*="comment"], [class*="collect"], [class*="count"]');
      statsElements.forEach(function(el) {
        const text = el.textContent.trim();
        const num = parseInt(text.replace(/[^0-9]/g, ''));
        if (!isNaN(num) && num > 0) {
          const classList = el.className.toLowerCase();
          if (classList.includes('like') || classList.includes('thumb') || classList.includes('heart')) {
            item.stats.likes = num;
          } else if (classList.includes('comment') || classList.includes('msg')) {
            item.stats.comments = num;
          } else if (classList.includes('collect') || classList.includes('save') || classList.includes('bookmark')) {
            item.stats.collects = num;
          }
        }
      });

      return item;
    }
  };

  window.addEventListener('PET_EXTRACT_REQUEST', function(event) {
    const platform = (event.detail && event.detail.platform) || null;

    console.log('[router] Received PET_EXTRACT_REQUEST, platform:', platform);

    if (!platform) {
      window.postMessage({
        type: 'FROM_BACKGROUND',
        action: 'EXTRACT_ERROR',
        message: '无法识别当前平台'
      }, '*');
      return;
    }

    try {
      const items = extractCurrentPlatformContent();
      console.log('[router] Extracted items count:', items.length);

      window.postMessage({
        type: 'FROM_BACKGROUND',
        action: 'EXTRACT_COMPLETE',
        count: items.length,
        items: items
      }, '*');
    } catch (error) {
      console.error('[router] Extract error:', error);
      window.postMessage({
        type: 'FROM_BACKGROUND',
        action: 'EXTRACT_ERROR',
        message: '提取失败: ' + error.message
      }, '*');
    }
  });

  window.XHS_ROUTER = {
    getCurrentPlatform: getCurrentPlatform,
    isSupportedPlatform: isSupportedPlatform,
    extractCurrentPlatformContent: extractCurrentPlatformContent,
    getPlatformSuggestion: getPlatformSuggestion,
    isFavoritePage: isFavoritePage
  };

  console.log('[router] XHS_ROUTER exposed to window');

})();
