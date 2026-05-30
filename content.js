const BRIDGE_SOURCE = 'xhs-smart-collection';
const bridgeItems = new Map();
let bridgeReady = false;

if (location.hostname.includes('xiaohongshu.com')) {
  injectPageBridge();
  window.addEventListener('message', handleBridgeMessage, false);
}

function injectPageBridge() {
  if (document.documentElement?.dataset?.xhsSmartCollectionBridge === 'true') {
    return;
  }

  const mount = () => {
    if (document.documentElement?.dataset?.xhsSmartCollectionBridge === 'true') {
      return;
    }

    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('page-bridge.js');
    script.async = false;
    script.dataset.xhsSmartCollectionBridge = 'true';
    script.addEventListener('load', () => script.remove());
    (document.head || document.documentElement).appendChild(script);
    document.documentElement.dataset.xhsSmartCollectionBridge = 'true';
  };

  if (document.documentElement) {
    mount();
  } else {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  }
}

function handleBridgeMessage(event) {
  if (event.source !== window || event.data?.source !== BRIDGE_SOURCE) {
    return;
  }

  const { type, payload = {} } = event.data;

  if (type === 'BRIDGE_READY') {
    bridgeReady = true;
    return;
  }

  if (type === 'INITIAL_SNAPSHOT' || type === 'COLLECT_PAGE') {
    mergeBridgeItems(payload.items || []);
  }
}

function mergeBridgeItems(items) {
  items.forEach(rawItem => {
    const mapped = mapBridgeItem(rawItem);
    if (!mapped?.id) return;
    bridgeItems.set(mapped.id, mapped);
  });
}

function mapBridgeItem(rawItem) {
  if (!rawItem?.note_id) {
    return null;
  }

  const likes = parseCompactCount(rawItem.liked_count);

  return {
    id: rawItem.note_id,
    title: rawItem.title || null,
    url: rawItem.url || `https://www.xiaohongshu.com/explore/${rawItem.note_id}`,
    author: rawItem.author || null,
    cover: rawItem.cover || null,
    excerpt: rawItem.title || null,
    mediaType: rawItem.note_type === 'video' ? 'video' : 'note',
    stats: {
      likes: Number.isFinite(likes) ? likes : null,
      comments: null,
      collection: null
    },
    source: rawItem.source || 'bridge',
    platform: '小红书',
    extractedAt: rawItem.captured_at || new Date().toISOString()
  };
}

function requestBridgeSnapshot() {
  window.dispatchEvent(new CustomEvent('xhs-smart-collection:scan-now'));
}

async function waitForBridgeItems(timeoutMs = 2500) {
  requestBridgeSnapshot();

  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (bridgeItems.size > 0) {
      await delay(200);
      return;
    }
    await delay(150);
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractCollections') {
    extractCollectionsFromPage().then(collections => {
      sendResponse({
        success: true,
        data: collections,
        debug: getExtractionDebug(collections)
      });
    });
    return true;
  }

  if (request.action === 'openCollectionCard') {
    const opened = openCollectionCard(request.domIndex, request.url);
    sendResponse({ success: opened });
  }

  if (request.action === 'openCollectionUrl') {
    const url = String(request.url || '');
    if (!url) {
      sendResponse({ success: false });
      return;
    }

    // Try to locate a link or card that matches the url or note id and dispatch click
    try {
      const noteIdMatch = url.match(/\/(?:explore|note|discovery\/item)\/([^/?#]+)/);
      const noteId = noteIdMatch ? noteIdMatch[1] : null;

      // Find exact link first
      let target = Array.from(document.querySelectorAll('a[href]')).find(a => a.href === url || a.href === url + '/' );

      if (!target && noteId) {
        // try links that contain note id
        target = Array.from(document.querySelectorAll('a[href]')).find(a => (a.href || '').includes(noteId));
      }

      if (target) {
        // get the card element for the link and click the card to avoid direct anchor navigation
        const card = getCardFromLink(target) || target;
        let clickable = card;
        try {
          const candidates = Array.from(card.querySelectorAll('button, [role="button"], [role="link"], a'));
          const nonAnchor = candidates.find(el => el.tagName !== 'A');
          if (nonAnchor) clickable = nonAnchor;
        } catch (e) {
          clickable = card;
        }

        dispatchMouseClickAt(clickable);
        sendResponse({ success: true });
        return;
      }

      // Fallback: try to find a card element with matching data-note-id
      if (noteId) {
        const card = document.querySelector(`[data-note-id="${noteId}"], [data-id="${noteId}"]`);
        if (card) {
          const clickable = card.querySelector('a, button, [role="link"], [role="button"]') || card;
          dispatchMouseClickAt(clickable);
          sendResponse({ success: true });
          return;
        }
      }
    } catch (err) {
      console.warn('openCollectionUrl error', err);
    }

    sendResponse({ success: false });
    return;
  }

  
});

async function extractCollectionsFromPage() {
  if (location.hostname.includes('douyin.com')) {
    return extractDouyinCollections();
  }

  return extractXhsCollections();
}

async function extractXhsCollections() {
  const collections = [];
  bridgeItems.clear();

  if (!isCollectionLikePage()) {
    return collections;
  }

  await delay(300);

  await waitForBridgeItems();

  const collectionMode = getCollectionMode();
  if (!collectionMode.isCollectionPage) {
    return collections;
  }

  const collectionCards = getVisibleNoteCards(collectionMode);

  collectionCards.forEach(card => {
    const item = extractCardInfo(card);
    if (item && item.id) {
      collections.push(item);
    }
  });

  bridgeItems.forEach(item => collections.push({ ...item }));

  return dedupeCollections(collections);
}

async function extractDouyinCollectionsLegacy() {
  await delay(1000);

  const results = [];

  const links = Array.from(document.querySelectorAll('a[href]'))
    .filter(link => isVisible(link));

  links.forEach((link, index) => {
    const href = link.href || '';

    if (
      href.includes('/video/') ||
      href.includes('/note/') ||
      href.includes('modal_id=')
    ) {
      const card = getDouyinCardContainer(link);
      const text = cleanCardText(card?.textContent || '');
      const img = card?.querySelector('img');
      const video = card?.querySelector('video');

      const id =
        href.match(/\/video\/([^/?#]+)/)?.[1] ||
        href.match(/\/note\/([^/?#]+)/)?.[1] ||
        href.match(/modal_id=([^&#]+)/)?.[1] ||
        `dom-${index}`;

      const title =
        pickBestTitle(getCardTextCandidates(card)) ||
        text.slice(0, 80) ||
        document.title ||
        '抖音内容';

      results.push({
        id: `douyin-${id}`,
        title,
        url: href,
        author: null,
        cover: img?.currentSrc || img?.src || video?.poster || null,
        excerpt: text.slice(0, 500),
        mediaType: 'video',
        platform: '抖音',
        stats: {
          likes: null,
          comments: null,
          collection: null
        },
        extractedAt: new Date().toISOString()
      });
    }
  });

  if (results.length === 0) {
    const mediaCards = Array.from(document.querySelectorAll('video, img'))
      .filter(el => isVisible(el))
      .map(el => getDouyinCardContainer(el));

    mediaCards.forEach((card, index) => {
      if (!card) return;

      const text = cleanCardText(card.textContent || '');
      const link = card.querySelector('a[href]');
      const img = card.querySelector('img');
      const video = card.querySelector('video');

      const title =
        pickBestTitle(getCardTextCandidates(card)) ||
        text.slice(0, 80) ||
        document.title ||
        '抖音内容';

      results.push({
        id: `douyin-media-${index}-${title.slice(0, 8)}`,
        title,
        url: link?.href || window.location.href,
        author: null,
        cover: img?.currentSrc || img?.src || video?.poster || null,
        excerpt: text.slice(0, 500),
        mediaType: 'video',
        platform: '抖音',
        stats: {
          likes: null,
          comments: null,
          collection: null
        },
        extractedAt: new Date().toISOString()
      });
    });
  }

  return dedupeCollections(results);
}

function parseCompactCount(value) {
  const text = String(value || '').replace(/,/g, '').trim();
  if (!text) return null;

  const match = text.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;

  const number = Number(match[1]);
  if (!Number.isFinite(number)) return null;

  if (/万|w/i.test(text)) {
    return Math.round(number * 10000);
  }

  return Math.round(number);
}

async function extractDouyinCollections() {
  await delay(1000);

  const results = [];
  const seenCards = new Set();
  const collectionPage = isDouyinCollectionPage();

  const links = Array.from(document.querySelectorAll('a[href]'))
    .filter(link => isVisible(link))
    .filter(link => isDouyinCollectionVideoLink(link.href || link.getAttribute('href'), collectionPage));

  links.forEach((link, index) => {
    const card = getDouyinCardContainer(link);
    if (!card || seenCards.has(card)) return;
    seenCards.add(card);

    const item = extractDouyinCardInfo(card, link.href || '', index);
    if (item) results.push(item);
  });

  return dedupeCollections(results);
}

function extractDouyinCardInfo(card, preferredHref, index) {
  const resolvedUrl = resolveDouyinVideoUrl(card, preferredHref);
  if (!resolvedUrl) {
    return null;
  }

  const id = getDouyinVideoIdFromUrl(resolvedUrl) || `dom-${index}`;
  const text = cleanDouyinCardText(card?.textContent || '');
  const img = card?.querySelector('img');
  const video = card?.querySelector('video');
  const title = pickDouyinTitle(card, text) || '抖音视频';

  const safeTitle = isDouyinNoiseText(title) ? `Douyin video ${id}` : title;

  return {
    id: `douyin-${id}`,
    title: safeTitle,
    url: resolvedUrl,
    author: null,
    cover: img?.currentSrc || img?.src || img?.getAttribute('data-src') || video?.poster || null,
    excerpt: text.slice(0, 500),
    mediaType: 'video',
    platform: '抖音',
    stats: {
      likes: null,
      comments: null,
      collection: null
    },
    extractedAt: new Date().toISOString()
  };
}

function resolveDouyinVideoUrl(card, preferredHref) {
  const hrefs = [
    preferredHref,
    ...Array.from(card?.querySelectorAll?.('a[href]') || []).map(link => link.href || link.getAttribute('href'))
  ].filter(Boolean);

  for (const href of hrefs) {
    const id = getDouyinVideoIdFromUrl(href);
    if (!id) continue;
    return normalizeDouyinVideoUrl(href, id);
  }

  return '';
}

function normalizeDouyinVideoUrl(href, id) {
  try {
    const parsed = new URL(href, window.location.origin);
    parsed.pathname = `/video/${id}`;
    parsed.hash = '';
    return parsed.href;
  } catch (error) {
    return `https://www.douyin.com/video/${encodeURIComponent(id)}`;
  }
}

function getDouyinVideoIdFromUrl(url) {
  const value = String(url || '');
  return value.match(/\/video\/([^/?#]+)/)?.[1] ||
    value.match(/\/note\/([^/?#]+)/)?.[1] ||
    value.match(/[?&#]modal_id=([^&#]+)/)?.[1] ||
    '';
}

function isDouyinCollectionVideoLink(url) {
  const value = String(url || '');
  if (!getDouyinVideoIdFromUrl(value)) {
    return false;
  }

  return arguments[1] ||
    /[?&#](modeFrom=userCollection|from_collection=|collection|favorite|fav)/i.test(value) ||
    /\/user\/self\?modal_id=/i.test(value);
}

function isDouyinCollectionPage() {
  const value = `${window.location.href} ${document.title} ${document.body?.innerText?.slice(0, 1200) || ''}`;
  return /modeFrom=userCollection|收藏|我的收藏|喜欢|userCollection|favorite|collection/i.test(value);
}

function cleanDouyinCardText(text) {
  return cleanCardText(text)
    .replace(/算法推荐专项举报\s*sfjubao@bytedance\.com/ig, '')
    .replace(/sfjubao@bytedance\.com/ig, '')
    .replace(/算法推荐专项举报/ig, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickDouyinTitle(card, fallbackText) {
  const attrs = ['aria-label', 'title', 'alt'];
  const candidates = [];
  const primaryLink = Array.from(card?.querySelectorAll?.('a[href]') || [])
    .find(link => getDouyinVideoIdFromUrl(link.href || link.getAttribute('href')));
  const primaryImage = card?.querySelector?.('img[alt], img[title]');

  [primaryLink, primaryImage].filter(Boolean).forEach(el => {
    attrs.forEach(attr => {
      const value = el.getAttribute?.(attr);
      if (value) candidates.push(value);
    });
  });

  const nodes = [
    ...Array.from(card?.querySelectorAll?.('h1, h2, h3, p, [class*="title"], [class*="desc"], [class*="content"]') || [])
  ].filter(Boolean);

  nodes.forEach(el => {
    attrs.forEach(attr => {
      const value = el.getAttribute?.(attr);
      if (value) candidates.push(value);
    });

    const text = cleanDouyinCardText(el.textContent || '');
    if (text && text.length <= 160) candidates.push(text);
  });

  if (fallbackText) candidates.push(fallbackText);

  return candidates
    .map(cleanDouyinCardText)
    .map(text => text.replace(/^#\S+\s*/, '').trim())
    .filter(text => text.length >= 2 && text.length <= 80)
    .filter(text => !isDouyinNoiseText(text) && !isDouyinUiNoiseText(text))
    .sort((a, b) => scoreDouyinTitle(b) - scoreDouyinTitle(a))[0] || '';
}

function isDouyinNoiseText(text) {
  return /算法推荐专项举报|sfjubao|bytedance|举报|反馈|登录|关注|粉丝|获赞|私信|搜索|扫一扫/.test(text) ||
    /^[\d\s.,万wW]+$/.test(text);
}

function isDouyinUiNoiseText(text) {
  return /算法推荐专项举报|抖音视频|sfjubao|bytedance|举报|反馈|登录|关注|粉丝|获赞|私信|搜索|扫一扫|评论|分享|收藏|合集|推荐/.test(text);
}

function scoreDouyinTitle(text) {
  let score = 0;
  if (/[\u4e00-\u9fa5]/.test(text)) score += 4;
  if (text.length >= 6 && text.length <= 48) score += 3;
  if (/[#@]/.test(text)) score += 1;
  if (/算法|举报|bytedance|sfjubao/.test(text)) score -= 10;
  return score;
}

function getDouyinCardContainer(el) {
  let current = el;
  let best = el;
  let bestScore = -999;

  for (let depth = 0; current && depth < 8; depth++) {
    const rect = current.getBoundingClientRect();
    const text = cleanCardText(current.textContent);
    const mediaCount = current.querySelectorAll?.('img, video').length || 0;
    const linkCount = current.querySelectorAll?.('a[href]').length || 0;

    let score = 0;

    if (rect.width >= 120) score += 2;
    if (rect.height >= 80) score += 2;
    if (rect.width <= 680) score += 2;
    if (rect.height <= 900) score += 2;
    if (text.length >= 2 && text.length <= 400) score += 4;
    if (mediaCount >= 1 && mediaCount <= 4) score += 3;
    if (linkCount >= 1 && linkCount <= 5) score += 2;

    if (rect.width > window.innerWidth * 0.95) score -= 8;
    if (rect.height > window.innerHeight * 0.95) score -= 8;

    score -= depth * 0.3;

    if (score > bestScore) {
      bestScore = score;
      best = current;
    }

    current = current.parentElement;
  }

  return best;
}

function isCollectionLikePage() {
  const url = window.location.href;
  if (/\/favorites\b|\/collection\b|\/collect\b/i.test(url)) {
    return true;
  }

  if (isXhsProfilePage()) {
    return isXhsProfileFavoriteTab();
  }

  if (findActiveCollectionTab()) {
    return true;
  }

  if (hasCollectionSourceLinks()) {
    return true;
  }

  return false;
}

function getCollectionMode() {
  const url = window.location.href;
  const explicitFavoritesPage = /\/favorites\b|\/collection\b|\/collect\b/i.test(url);
  const profileFavoritePage = isXhsProfileFavoriteTab();
  const activeCollectionTab = findActiveCollectionTab();
  const collectionSourceLinks = hasCollectionSourceLinks();

  return {
    activeCollectionTab,
    profileFavoritePage,
    sourceLinksOnly: !activeCollectionTab &&
      !explicitFavoritesPage &&
      !profileFavoritePage &&
      Boolean(collectionSourceLinks),
    isCollectionPage: explicitFavoritesPage ||
      profileFavoritePage ||
      Boolean(activeCollectionTab) ||
      Boolean(collectionSourceLinks)
  };
}

function isXhsProfilePage() {
  return /\/user\/profile\//i.test(window.location.pathname);
}

function isXhsProfileFavoriteTab() {
  if (!isXhsProfilePage()) {
    return false;
  }

  const params = new URLSearchParams(window.location.search);
  return params.get('tab') === 'fav';
}

function hasCollectionSourceLinks() {
  return Boolean(document.querySelector(
    'a[href*="/explore/"][href*="collect"], ' +
    'a[href*="/note/"][href*="collect"], ' +
    'a[href*="/explore/"][href*="favorite"], ' +
    'a[href*="/note/"][href*="favorite"]'
  ));
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

  if (collectionMode.profileFavoritePage) {
    return [...new Set(noteLinks.map(link => getCardFromLink(link)))].filter(Boolean);
  }

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
  const candidates = [];

  for (let depth = 0; current && depth < 8; depth++) {
    const rect = current.getBoundingClientRect();
    const text = cleanCardText(current.textContent);

    if (rect.width >= 100 && rect.height >= 120 && rect.width <= window.innerWidth + 40) {
      candidates.push({ el: current, score: scoreVisualCardCandidate(current, text, depth) });
    }

    current = current.parentElement;
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.el || img.closest('section, article, div');
}

function scoreVisualCardCandidate(el, text, depth) {
  const rect = el.getBoundingClientRect();
  const className = String(el.className || '').toLowerCase();
  const imageCount = el.querySelectorAll?.('img').length || 0;
  let score = 0;

  if (text.length >= 2) score += 8;
  if (text.length >= 6 && text.length <= 160) score += 4;
  if (/card|note|feed|item|cover|mask|footer|content/.test(className)) score += 3;
  if (rect.width >= 120 && rect.width <= 360) score += 2;
  if (rect.height >= 160 && rect.height <= 520) score += 2;
  if (imageCount === 1) score += 3;
  if (imageCount > 2) score -= 10;
  if (rect.width > 420) score -= 6;
  if (rect.height > 700) score -= 6;
  score -= depth * 0.5;

  return score;
}

function isLikelyCollectionLink(link, collectionMode) {
  const href = link.href || link.getAttribute?.('href') || '';
  const hasNotePath = /xiaohongshu\.com/.test(href) &&
    /\/(explore|note|discovery\/item)\//.test(href);
  const hasCollectionSource = /xsec_source=[^&#]*(collect|favorite|fav)/i.test(href);

  if (!hasNotePath) {
    return false;
  }

  if (hasCollectionSource) {
    return true;
  }

  if (collectionMode.profileFavoritePage) {
    return false;
  }

  if (collectionMode.sourceLinksOnly) {
    return hasCollectionSource;
  }

  if (collectionMode.isCollectionPage && !collectionMode.activeCollectionTab) {
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

function isBelowCollectionTab(el, collectionMode) {
  const tab = collectionMode.activeCollectionTab;
  if (!tab) {
    return !collectionMode.profileFavoritePage;
  }

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

function dispatchMouseClickAt(el) {
  if (!el) return;

  try {
    if (el.scrollIntoView) {
      el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' });
    }
  } catch (e) {}

  const rect = el.getBoundingClientRect();
  const cx = Math.max(1, Math.round(rect.left + rect.width / 2));
  const cy = Math.max(1, Math.round(rect.top + rect.height / 2));

  const target = document.elementFromPoint(cx, cy) || el;

  const makeInit = (type) => ({
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: cx,
    clientY: cy,
    screenX: (window.screenX || 0) + cx,
    screenY: (window.screenY || 0) + cy
  });

  try {
    if (window.PointerEvent) {
      target.dispatchEvent(new PointerEvent('pointerdown', makeInit('pointerdown')));
    }
    target.dispatchEvent(new MouseEvent('mousedown', makeInit('mousedown')));
    target.dispatchEvent(new MouseEvent('mouseup', makeInit('mouseup')));
    target.dispatchEvent(new MouseEvent('click', makeInit('click')));
    if (window.PointerEvent) {
      target.dispatchEvent(new PointerEvent('pointerup', makeInit('pointerup')));
    }
  } catch (err) {
    try { target.click(); } catch (e) {}
  }
}

function normalizeText(text) {
  return String(text || '').replace(/\s+/g, '').trim();
}

function isVisible(el) {
  if (!el) return false;

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

function cleanCardText(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/^(赞|评论|收藏|分享)\s*\d*$/g, '')
    .trim();
}

function pickBestTitle(candidates) {
  const blocked = /^(赞|评论|收藏|分享|关注|粉丝|获赞|更多|展开|收起|\d+|[0-9.]+万)$/;

  return candidates
    .map(cleanCardText)
    .filter(text => text.length >= 2 && text.length <= 120)
    .filter(text => !blocked.test(text))
    .sort((a, b) => {
      const aScore = scoreTitleCandidate(a);
      const bScore = scoreTitleCandidate(b);
      return bScore - aScore;
    })[0] || '';
}

function scoreTitleCandidate(text) {
  let score = 0;
  if (/[\u4e00-\u9fa5]/.test(text)) score += 4;
  if (text.length >= 6 && text.length <= 40) score += 3;
  if (/[，。！？、,.!?]/.test(text)) score += 1;
  if (/赞|评论|收藏|分享|关注/.test(text)) score -= 4;
  if (/^\d+(\.\d+)?万?$/.test(text)) score -= 8;
  return score;
}

function getCardTextCandidates(card) {
  if (!card) return [];

  const candidates = [];
  const attrs = ['aria-label', 'title', 'alt'];

  attrs.forEach(attr => {
    const value = card.getAttribute?.(attr);
    if (value) candidates.push(value);
  });

  card.querySelectorAll?.('h1, h2, h3, h4, [title], [aria-label], img[alt], span, div, p').forEach(el => {
    attrs.forEach(attr => {
      const value = el.getAttribute?.(attr);
      if (value) candidates.push(value);
    });

    const text = cleanCardText(el.textContent);
    if (text && text.length <= 160) {
      candidates.push(text);
    }
  });

  let current = card.parentElement;
  let depth = 0;
  while (current && depth < 3) {
    current.querySelectorAll?.('h1, h2, h3, h4, [title], [aria-label], img[alt], span, div, p').forEach(el => {
      attrs.forEach(attr => {
        const value = el.getAttribute?.(attr);
        if (value) candidates.push(value);
      });

      const text = cleanCardText(el.textContent);
      if (text && text.length <= 160) {
        candidates.push(text);
      }
    });

    current = current.parentElement;
    depth++;
  }

  return candidates;
}

function getExtractionDebug(collections) {
  const collectionTab = location.hostname.includes('xiaohongshu.com') ? findCollectionTab() : null;
  const activeCollectionTab = location.hostname.includes('xiaohongshu.com') ? findActiveCollectionTab() : null;
  const visibleExploreLinks = Array.from(document.querySelectorAll('a[href*="/explore/"], a[href*="/note/"], a[href*="/video/"]')).filter(link => isVisible(link));
  const visibleDataCards = Array.from(document.querySelectorAll('[data-note-id], [data-id]')).filter(card => isVisible(card));
  const visibleImages = Array.from(document.querySelectorAll('img')).filter(img => isVisible(img));

  return {
    url: window.location.href,
    found: collections.length,
    bridgeReady,
    bridgeItems: bridgeItems.size,
    collectionTabText: collectionTab ? normalizeText(collectionTab.textContent).slice(0, 40) : '',
    activeCollectionTabText: activeCollectionTab ? normalizeText(activeCollectionTab.textContent).slice(0, 40) : '',
    visibleExploreLinks: visibleExploreLinks.length,
    visibleDataCards: visibleDataCards.length,
    visibleImages: visibleImages.length,
    visibleVideos: document.querySelectorAll('video').length,
    sampleLinks: visibleExploreLinks.slice(0, 3).map(link => link.href)
  };
}

function findCollectionCardByUrl(url) {
  const noteId = getXhsNoteIdFromUrl(url);
  if (!noteId) {
    return null;
  }

  const exactLink = Array.from(document.querySelectorAll('a[href]'))
    .find(link => isVisible(link) && getXhsNoteIdFromUrl(link.href || link.getAttribute('href')) === noteId);

  if (exactLink) {
    return exactLink;
  }

  return document.querySelector(`[data-note-id="${CSS.escape(noteId)}"], [data-id="${CSS.escape(noteId)}"]`);
}

function getXhsNoteIdFromUrl(url) {
  const match = String(url || '').match(/\/(?:explore|note|discovery\/item)\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function clickCollectionCard(card) {
  if (!card) {
    return false;
  }

  const collectionMode = getCollectionMode();
  if (!isBelowCollectionTab(card, collectionMode)) {
    return false;
  }

  let clickable = card;
  try {
    const candidates = Array.from(card.querySelectorAll('button, [role="button"], [role="link"], a'));
    const nonAnchor = candidates.find(el => el.tagName !== 'A');
    if (nonAnchor) clickable = nonAnchor;
  } catch (e) {
    clickable = card;
  }

  dispatchMouseClickAt(clickable);

  return true;
}

function openCollectionCard(domIndex, url) {
  if (url) {
    return clickCollectionCard(findCollectionCardByUrl(url));
  }

  if (typeof domIndex !== 'number') {
    return false;
  }

  const collectionMode = getCollectionMode();
  const cards = getVisibleNoteCards(collectionMode);
  return clickCollectionCard(cards[domIndex]);
}

function extractCardInfo(card) {
  const item = {
    id: null,
    title: null,
    url: null,
    author: null,
    cover: null,
    excerpt: null,
    mediaType: null,
    stats: {
      likes: null,
      comments: null,
      collection: null
    },
    platform: '小红书',
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
    const match = href.match(/\/(?:explore|note|discovery\/item)\/([^/?#]+)/);
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

  const visibleText = cleanCardText(card.textContent);
  if (visibleText) {
    item.excerpt = visibleText.slice(0, 500);
  }

  item.mediaType = detectMediaType(card, visibleText);

  const titleElements = card.querySelectorAll('h1, h2, h3, h4, .title, .note-title, .content-title, .desc, .note-desc, [class*="title"], [class*="desc"]');
  for (const el of titleElements) {
    const text = cleanCardText(el.textContent || el.getAttribute('title') || el.getAttribute('aria-label'));
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

  if (!item.title) {
    item.title = pickBestTitle(getCardTextCandidates(card));
  }

  if (!item.title && item.excerpt) {
    item.title = item.excerpt.slice(0, 60);
  }

  item.author = pickXhsAuthor(card);

  const imgElement = card.matches?.('img') ? card : card.querySelector('img');
  if (imgElement) {
    let src = imgElement.currentSrc ||
      imgElement.src ||
      imgElement.getAttribute('data-src') ||
      imgElement.getAttribute('data-lazy-src') ||
      imgElement.getAttribute('src');
    if (src) {
      src = src.replace(/\/w\d+\/h\d+/, '/w600/h600');
      item.cover = src;
    }
  }

  const statsElements = card.querySelectorAll('span, .like, .comment, .collect, [class*="like"], [class*="comment"], [class*="collect"], [class*="count"]');
  statsElements.forEach(el => {
    const text = el.textContent.trim();
    const num = parseCompactCount(text);
    if (num && num > 0) {
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

function pickXhsAuthor(card) {
  const candidates = [];
  const selectors = [
    '.user-name',
    '.nickname',
    '.author',
    '[class*="user-name"]',
    '[class*="nickname"]',
    '[class*="author"]',
    'a[href*="/user/profile/"]'
  ];

  card.querySelectorAll(selectors.join(',')).forEach(el => {
    ['title', 'aria-label'].forEach(attr => {
      const value = cleanXhsAuthorText(el.getAttribute(attr));
      if (isLikelyXhsAuthor(value)) candidates.push(value);
    });

    const directText = Array.from(el.childNodes || [])
      .filter(node => node.nodeType === Node.TEXT_NODE)
      .map(node => node.textContent)
      .join(' ');
    const directValue = cleanXhsAuthorText(directText);
    if (isLikelyXhsAuthor(directValue)) candidates.push(directValue);

    const fullValue = cleanXhsAuthorText(el.textContent);
    if (isLikelyXhsAuthor(fullValue)) candidates.push(fullValue);
  });

  return candidates
    .sort((a, b) => a.length - b.length)[0] || null;
}

function cleanXhsAuthorText(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .replace(/[👍♥❤]\s*[\d,.万wW]+/g, '')
    .trim();
}

function isLikelyXhsAuthor(text) {
  if (!text) return false;
  if (text.length > 24) return false;
  if (/[\d,.万wW]\s*$/.test(text)) return false;
  if (/赞|点赞|评论|收藏|分享|关注|粉丝|获赞|like|comment|collect/i.test(text)) return false;
  return true;
}

function detectMediaType(card, text) {
  const className = String(card.className || '').toLowerCase();
  const aria = String(card.getAttribute?.('aria-label') || '').toLowerCase();
  const combined = `${className} ${aria} ${text || ''}`.toLowerCase();

  if (card.querySelector?.('video') || /video|play|播放|视频/.test(combined)) {
    return 'video';
  }

  return 'note';
}
