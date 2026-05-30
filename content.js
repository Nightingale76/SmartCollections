chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractCollections') {
    extractCollectionsFromPage().then(collections => {
      sendResponse({ success: true, data: collections, debug: getExtractionDebug(collections) });
    });
    return true;
  }

  if (request.action === 'openCollectionCard') {
    const opened = openCollectionCard(request.domIndex);
    sendResponse({ success: opened });
  }
});

async function extractCollectionsFromPage() {
  const collections = [];
  const collectionTab = findCollectionTab();

  if (!isCollectionLikePage() && !collectionTab) {
    return collections;
  }

  if (collectionTab && !isActiveTabLike(collectionTab)) {
    collectionTab.click();
    await waitForCollectionCards();
  } else {
    await delay(300);
  }

  const collectionMode = getCollectionMode();
  const collectionCards = getVisibleNoteCards(collectionMode);

  collectionCards.forEach(card => {
    const item = extractCardInfo(card);
    if (item && item.id) {
      collections.push(item);
    }
  });

  return dedupeCollections(collections);
}

function isCollectionLikePage() {
  return /\/favorites\b|\/collection\b|\/collect\b/i.test(window.location.href);
}

function getCollectionMode() {
  const url = window.location.href;
  const explicitFavoritesPage = /\/favorites\b|\/collection\b|\/collect\b/i.test(url);
  const activeCollectionTab = findActiveCollectionTab();
  const hasCollectionSourceLinks = document.querySelector('a[href*="/explore/"][href*="collect"], a[href*="/note/"][href*="collect"], a[href*="/explore/"][href*="favorite"], a[href*="/note/"][href*="favorite"]');

  return {
    activeCollectionTab,
    sourceLinksOnly: !activeCollectionTab && !explicitFavoritesPage && Boolean(hasCollectionSourceLinks),
    isCollectionPage: explicitFavoritesPage || Boolean(activeCollectionTab) || Boolean(hasCollectionSourceLinks)
  };
}

function findCollectionTab() {
  const candidates = document.querySelectorAll('[role="tab"], button, a, div, span');

  for (const el of candidates) {
    const text = normalizeText(el.textContent);
    if (!isCollectionTabText(text)) continue;
    if (text.length > 12) continue;
    if (!isInProfileTabGroup(el)) continue;
    const target = getClickableTarget(el);
    if (target || isActiveTabLike(el)) {
      return target || el;
    }
  }

  return null;
}

function findActiveCollectionTab() {
  const candidates = document.querySelectorAll('[role="tab"], button, a, div, span');

  for (const el of candidates) {
    const text = normalizeText(el.textContent);
    if (!isCollectionTabText(text)) continue;
    if (text.length > 12) continue;
    if (!isInProfileTabGroup(el)) continue;
    if (isActiveTabLike(el)) {
      return el;
    }
  }

  return null;
}

function isClickableLike(el) {
  if (['A', 'BUTTON'].includes(el.tagName)) return true;
  if (el.getAttribute('role') === 'tab' || el.getAttribute('role') === 'button') return true;

  const style = window.getComputedStyle(el);
  if (style.cursor === 'pointer') return true;

  const className = String(el.className || '').toLowerCase();
  return /(tab|nav|item|link|btn|button)/.test(className);
}

function getClickableTarget(el) {
  let current = el;
  let depth = 0;

  while (current && depth < 4) {
    if (isClickableLike(current)) {
      return current;
    }

    current = current.parentElement;
    depth++;
  }

  return null;
}

function isCollectionTabText(text) {
  return text.length <= 12 && /收藏/.test(text);
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
  if (/(active|selected|current|checked)/.test(parentClass)) return true;

  const child = el.querySelector('[class*="active"], [class*="selected"], [class*="current"], [class*="checked"]');
  return Boolean(child);
}

function getVisibleNoteCards(collectionMode) {
  const noteLinks = Array.from(document.querySelectorAll('a[href*="/explore/"], a[href*="/note/"]'))
    .filter(link => isVisible(link))
    .filter(link => isLikelyCollectionLink(link, collectionMode));

  const dataCards = Array.from(document.querySelectorAll('[data-note-id], [data-id]'))
    .filter(card => isVisible(card))
    .filter(card => isBelowCollectionTab(card, collectionMode));

  const visualCards = getVisibleVisualCards(collectionMode);

  const cards = [
    ...noteLinks.map(link => getCardFromLink(link)),
    ...dataCards,
    ...visualCards
  ];

  return [...new Set(cards)].filter(Boolean);
}

function getVisibleVisualCards(collectionMode) {
  const imageCards = Array.from(document.querySelectorAll('img'))
    .filter(img => isVisible(img))
    .filter(img => isLikelyContentImage(img))
    .map(img => getVisualCardFromImage(img))
    .filter(Boolean)
    .filter(card => isVisible(card))
    .filter(card => isBelowCollectionTab(card, collectionMode));

  return [...new Set(imageCards)];
}

function isLikelyContentImage(img) {
  const rect = img.getBoundingClientRect();
  const src = img.currentSrc || img.src || '';
  return rect.width >= 80 &&
    rect.height >= 80 &&
    !/avatar|icon|logo|emoji|sprite/i.test(src);
}

function getVisualCardFromImage(img) {
  let current = img;
  let best = null;

  for (let depth = 0; current && depth < 6; depth++) {
    const rect = current.getBoundingClientRect();
    const text = normalizeText(current.textContent);

    if (rect.width >= 100 && rect.height >= 120 && rect.width <= window.innerWidth + 40) {
      best = current;
      if (text.length > 0 || current.querySelector('img')) {
        break;
      }
    }

    current = current.parentElement;
  }

  return best || img.closest('section, article, div');
}

function isLikelyCollectionLink(link, collectionMode) {
  const href = link.href || '';
  if (!/xiaohongshu\.com/.test(href) || !/\/(explore|note)\//.test(href)) {
    return false;
  }

  if (/xsec_source=[^&#]*(collect|favorite|fav)/i.test(href)) {
    return true;
  }

  if (collectionMode.sourceLinksOnly) {
    return false;
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

function isBelowCollectionTab(el, collectionMode) {
  const tab = collectionMode.activeCollectionTab;
  if (!tab) return true;

  const tabRect = tab.getBoundingClientRect();
  const rect = el.getBoundingClientRect();
  return rect.bottom > tabRect.bottom - 8;
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

async function waitForCollectionCards() {
  await delay(1000);

  const startedAt = Date.now();

  while (Date.now() - startedAt < 3000) {
    const links = Array.from(document.querySelectorAll('a[href*="/explore/"], a[href*="/note/"]'))
      .filter(link => isVisible(link));

    if (links.length > 0) {
      await delay(300);
      return;
    }

    await delay(150);
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getExtractionDebug(collections) {
  const collectionTab = findCollectionTab();
  const activeCollectionTab = findActiveCollectionTab();
  const visibleExploreLinks = Array.from(document.querySelectorAll('a[href*="/explore/"], a[href*="/note/"]')).filter(link => isVisible(link));
  const visibleDataCards = Array.from(document.querySelectorAll('[data-note-id], [data-id]')).filter(card => isVisible(card));
  const visibleImages = Array.from(document.querySelectorAll('img')).filter(img => isVisible(img) && isLikelyContentImage(img));

  return {
    url: window.location.href,
    found: collections.length,
    collectionTabText: collectionTab ? normalizeText(collectionTab.textContent).slice(0, 40) : '',
    activeCollectionTabText: activeCollectionTab ? normalizeText(activeCollectionTab.textContent).slice(0, 40) : '',
    visibleExploreLinks: visibleExploreLinks.length,
    visibleDataCards: visibleDataCards.length,
    visibleImages: visibleImages.length,
    sampleLinks: visibleExploreLinks.slice(0, 3).map(link => link.href)
  };
}

function openCollectionCard(domIndex) {
  if (typeof domIndex !== 'number') {
    return false;
  }

  const collectionMode = getCollectionMode();
  const cards = getVisibleNoteCards(collectionMode);
  const card = cards[domIndex];

  if (!card) {
    return false;
  }

  const clickable = card.querySelector('a, button, [role="link"], [role="button"]') || card;
  ['pointerdown', 'mousedown', 'mouseup', 'click'].forEach(type => {
    clickable.dispatchEvent(new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      view: window
    }));
  });

  return true;
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
  
  const collectionMode = getCollectionMode();
  const domIndex = getVisibleNoteCards(collectionMode).indexOf(card);
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
  } else if (noteId && /^[a-zA-Z0-9]+$/.test(noteId)) {
    item.id = noteId;
    item.url = `https://www.xiaohongshu.com/explore/${noteId}`;
  }
  
  if (!item.id) {
    item.id = `dom-${domIndex >= 0 ? domIndex : Date.now()}`;
  }

  item.domIndex = domIndex;
  
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
