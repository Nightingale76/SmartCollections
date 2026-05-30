import { PLATFORMS, PLATFORM_DOMAINS } from '../shared/constants.js';
import { extractDouyinContent, isDouyinPage, isDouyinFavoritePage } from '../platforms/douyin.js';

export function getCurrentPlatform() {
  const hostname = window.location.hostname;
  return PLATFORM_DOMAINS[hostname] || null;
}

export function isSupportedPlatform() {
  return getCurrentPlatform() !== null;
}

export function extractCurrentPlatformContent() {
  const platform = getCurrentPlatform();
  
  switch (platform) {
    case PLATFORMS.XIAOHONGSHU:
      return XHSExtractor.extract();
    case PLATFORMS.DOUYIN:
      return DouyinExtractor.extract();
    default:
      return [];
  }
}

export function getPlatformSuggestion() {
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

export function isFavoritePage() {
  const platform = getCurrentPlatform();
  
  switch (platform) {
    case PLATFORMS.XIAOHONGSHU:
      return window.location.href.includes('/favorites') || 
             window.location.href.includes('/collection');
    case PLATFORMS.DOUYIN:
      return isDouyinFavoritePage();
    default:
      return false;
  }
}

const XHSExtractor = {
  extract() {
    const collections = [];
    
    const collectionCards = document.querySelectorAll('[data-note-id], .note-card, .feeds-item, .flow-item, .note-item');
    
    collectionCards.forEach(card => {
      const item = this.extractCardInfo(card);
      if (item && item.id && item.url) {
        const exists = collections.some(c => c.id === item.id);
        if (!exists) {
          collections.push(item);
        }
      }
    });
    
    if (collections.length === 0) {
      const alternativeCards = document.querySelectorAll('a[href*="/note/"]');
      alternativeCards.forEach(card => {
        const item = this.extractCardInfo(card);
        if (item && item.id && item.url) {
          const exists = collections.some(c => c.id === item.id);
          if (!exists) {
            collections.push(item);
          }
        }
      });
    }
    
    return collections;
  },

  extractCardInfo(card) {
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
        item.id = href.split('?')[0];
      }
      item.url = href;
    } else if (noteId) {
      item.id = noteId;
      item.url = `https://www.xiaohongshu.com/note/${noteId}`;
    }
    
    if (!item.id) return null;
    
    const titleElements = card.querySelectorAll('h3, .title, .note-title, .content-title, .desc, .note-desc, [class*="title"], [class*="desc"]');
    for (const el of titleElements) {
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
    for (const el of authorElements) {
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
    statsElements.forEach(el => {
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

const DouyinExtractor = {
  extract() {
    return extractDouyinContent();
  }
};

window.addEventListener('PET_EXTRACT_REQUEST', async (event) => {
  const { platform } = event.detail || {};
  
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
    
    window.postMessage({
      type: 'FROM_BACKGROUND',
      action: 'EXTRACT_COMPLETE',
      count: items.length,
      items: items
    }, '*');
  } catch (error) {
    window.postMessage({
      type: 'FROM_BACKGROUND',
      action: 'EXTRACT_ERROR',
      message: '提取失败: ' + error.message
    }, '*');
  }
});
