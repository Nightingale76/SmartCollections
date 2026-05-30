chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractCollections') {
    const collections = extractCollectionsFromPage();
    sendResponse({ success: true, data: collections });
  }
});

function extractCollectionsFromPage() {
  const collections = [];
  const collectionMode = getCollectionMode();

  if (!collectionMode.isCollectionPage) {
    return collections;
  }

  const collectionCards = getVisibleNoteCards(collectionMode);

  collectionCards.forEach(card => {
    const item = extractCardInfo(card);
    if (item && item.id && item.url) {
      collections.push(item);
    }
  });

  return dedupeCollections(collections);
}

function getCollectionMode() {
  const url = window.location.href;
  const explicitFavoritesPage = /\/favorites\b|\/collection\b|\/collect\b/i.test(url);
  const activeCollectionTab = findActiveCollectionTab();

  return {
    activeCollectionTab,
    isCollectionPage: explicitFavoritesPage || Boolean(activeCollectionTab)
  };
}

function findActiveCollectionTab() {
  const candidates = document.querySelectorAll('[role="tab"], button, a');

  for (const el of candidates) {
    const text = normalizeText(el.textContent);
    if (!isCollectionTabText(text)) continue;
    if (!isInProfileTabGroup(el)) continue;
    if (isActiveTabLike(el)) {
      return el;
    }
  }

  return null;
}

function isCollectionTabText(text) {
  return /^(收藏|收藏夹|我收藏|已收藏)(\d+|[0-9.万wW]+)?$/.test(text);
}

function isInProfileTabGroup(el) {
  let current = el.parentElement;
  let depth = 0;

  while (current && depth < 5) {
    const text = normalizeText(current.textContent);
    const hasNotesTab = /笔记|作品|发布/.test(text);
    const hasCollectionTab = /收藏|收藏夹/.test(text);
    const hasLikedTab = /赞过|点赞|喜欢/.test(text);

    if (hasCollectionTab && (hasNotesTab || hasLikedTab)) {
      return true;
    }

    current = current.parentElement;
    depth++;
  }

  return el.getAttribute('role') === 'tab';
}

function isActiveTabLike(el) {
  if (el.getAttribute('aria-selected') === 'true') return true;
  if (el.getAttribute('aria-current')) return true;

  const className = String(el.className || '').toLowerCase();
  if (/(active|selected|current|checked)/.test(className)) return true;

  const parentClass = String(el.parentElement?.className || '').toLowerCase();
  return /(active|selected|current|checked)/.test(parentClass);
}

function getVisibleNoteCards(collectionMode) {
  const noteLinks = Array.from(document.querySelectorAll('a[href*="/explore/"], a[href*="/note/"]'))
    .filter(link => isVisible(link))
    .filter(link => isLikelyCollectionLink(link, collectionMode));

  const cards = noteLinks.map(link => getCardFromLink(link));
  return [...new Set(cards)].filter(Boolean);
}

function isLikelyCollectionLink(link, collectionMode) {
  const href = link.href || '';
  if (!/xiaohongshu\.com/.test(href) || !/\/(explore|note)\//.test(href)) {
    return false;
  }

  if (/xsec_source=[^&#]*(collect|favorite|fav)/i.test(href)) {
    return true;
  }

  const tab = collectionMode.activeCollectionTab;
  if (!tab) {
    return true;
  }

  const tabRect = tab.getBoundingClientRect();
  const linkRect = link.getBoundingClientRect();
  return linkRect.bottom > tabRect.bottom - 8;
}

function getCardFromLink(link) {
  return link.closest('[data-note-id], .note-card, .feeds-item, .flow-item, .note-item, section, article') || link;
}

function dedupeCollections(collections) {
  const seen = new Set();
  return collections.filter(item => {
    const key = item.id || item.url;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeText(text) {
  return String(text || '').replace(/\s+/g, '').trim();
}

function isVisible(el) {
  const rect = el.getBoundingClientRect();
  const style = window.getComputedStyle(el);
  return rect.width > 0 &&
    rect.height > 0 &&
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    Number(style.opacity) !== 0;
}

function extractCardInfo(card) {
  const item = {
    id: null,
    title: null,
    url: null,
    author: null,
    cover: null,
    excerpt: null,
    stats: {
      likes: null,
      comments: null,
      collection: null
    },
    extractedAt: new Date().toISOString()
  };
  
  const noteId = card.getAttribute('data-note-id') ||
                 card.getAttribute('data-id') ||
                 card.getAttribute('id');

  const linkElement = card.matches?.('a[href*="/explore/"], a[href*="/note/"]')
    ? card
    : card.querySelector('a[href*="/explore/"], a[href*="/note/"]') ||
      card.closest('a[href*="/explore/"], a[href*="/note/"]');
  
  if (linkElement) {
    const href = linkElement.href;
    const match = href.match(/\/(?:explore|note)\/([^/?#]+)/);
    if (match) {
      item.id = match[1];
    } else {
      item.id = href.split('?')[0];
    }
    item.url = href;
  }
  
  if (!item.id) {
    return null;
  }
  
  const titleElements = card.querySelectorAll('h3, .title, .note-title, .content-title, .desc, .note-desc, [class*="title"], [class*="desc"]');
  for (const el of titleElements) {
    const text = el.textContent.trim();
    if (text && text.length > 0 && text.length < 200) {
      item.title = text;
      break;
    }
  }
  
  if (!item.title) {
    const titleAttr = card.getAttribute('title');
    if (titleAttr && titleAttr.length > 0 && titleAttr.length < 200) {
      item.title = titleAttr;
    }
  }

  const visibleText = card.textContent.replace(/\s+/g, ' ').trim();
  if (visibleText) {
    item.excerpt = visibleText.slice(0, 500);
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
        item.stats.collection = num;
      }
    }
  });
  
  return item;
}
