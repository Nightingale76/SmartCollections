/**
 * Content Router - IIFE 格式
 * 统一处理多平台内容提取的路由
 */
(function() {
  'use strict';

  console.log('[router] loading...');

  const PLATFORMS = {
    XIAOHONGSHU: 'xiaohongshu',
    DOUYIN: 'douyin'
  };

  function getCurrentPlatform() {
    const hostname = window.location.hostname;
    if (hostname.includes('xiaohongshu.com')) return PLATFORMS.XIAOHONGSHU;
    if (hostname.includes('douyin.com')) return PLATFORMS.DOUYIN;
    return null;
  }

  const XHSExtractor = (function() {
    return {
      extract: function() {
        const results = [];
        const links = Array.from(document.querySelectorAll('a[href]'))
          .filter(link => isVisible(link))
          .filter(link => {
            const href = link.href;
            return href.includes('/explore/') || href.includes('/note/');
          });

        links.forEach((link, index) => {
          const item = convertLinkToItem(link, index);
          if (item) results.push(item);
        });

        const bridgeItems = window.XHS_PAGE_BRIDGE ? window.XHS_PAGE_BRIDGE.getItems() : [];
        bridgeItems.forEach(item => {
          const converted = convertBridgeItemToStandard(item);
          if (converted) results.push(converted);
        });

        return dedupe(results);
      }
    };

    function convertLinkToItem(link, index) {
      const href = link.href;
      const id = href.match(/\/(explore|note)\/([^/?#]+)/)?.[2] || `dom-${index}`;
      const card = link.closest('[data-note-id], .note-card, section, article') || link;
      const text = cleanText(card?.textContent || '');
      const img = card?.querySelector('img');
      const isVideo = card?.querySelector('video') || /video|播放/.test(text);

      const textForTags = (text + ' ' + document.title).slice(0, 200);
      const tags = window.MEMORA_AI_TAGS && window.MEMORA_AI_TAGS.generateTags
        ? window.MEMORA_AI_TAGS.generateTags(textForTags)
        : ['其他'];

      return {
        id: `xhs-${id}`,
        platform: 'xiaohongshu',
        title: pickBestTitle(getCardTextCandidates(card)) || text.slice(0, 80) || document.title,
        url: href,
        author: null,
        text: text.slice(0, 500),
        cover: img?.currentSrc || img?.src || null,
        type: isVideo ? 'video' : 'note',
        stats: { likes: null, comments: null, collects: null },
        tags,
        collectedAt: new Date().toISOString()
      };
    }

    function convertBridgeItemToStandard(item) {
      if (!item?.note_id) return null;
      
      const textForTags = (item.title || '') + ' ' + (item.author || '');
      const tags = window.MEMORA_AI_TAGS && window.MEMORA_AI_TAGS.generateTags
        ? window.MEMORA_AI_TAGS.generateTags(textForTags)
        : ['其他'];

      return {
        id: `xhs-${item.note_id}`,
        platform: 'xiaohongshu',
        title: item.title || '小红书笔记',
        url: item.url || `https://www.xiaohongshu.com/explore/${item.note_id}`,
        author: item.author || null,
        text: item.title || '',
        cover: item.cover || null,
        type: item.note_type === 'video' ? 'video' : 'note',
        stats: {
          likes: item.liked_count || null,
          comments: null,
          collects: null
        },
        tags,
        collectedAt: new Date().toISOString()
      };
    }
  })();

  function extractDouyinContent() {
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
        const text = cleanText(card?.textContent || '');
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

        results.push(createDouyinItem({
          id: id,
          title,
          url: href,
          text,
          img,
          video
        }));
      }
    });

    if (results.length === 0) {
      const mediaCards = Array.from(document.querySelectorAll('video, img'))
        .filter(el => isVisible(el))
        .map(el => getDouyinCardContainer(el));

      mediaCards.forEach((card, index) => {
        if (!card) return;

        const text = cleanText(card.textContent || '');
        const link = card.querySelector('a[href]');
        const img = card.querySelector('img');
        const video = card.querySelector('video');

        const title =
          pickBestTitle(getCardTextCandidates(card)) ||
          text.slice(0, 80) ||
          document.title ||
          '抖音内容';

        results.push(createDouyinItem({
          id: `media-${index}-${title.slice(0, 8)}`,
          title,
          url: link?.href || window.location.href,
          text,
          img,
          video
        }));
      });
    }

    return dedupe(results);
  }

  function createDouyinItem({ id, title, url, text, img, video }) {
    const AI_TAGS = window.MEMORA_AI_TAGS;
    const textForTags = (title + ' ' + url).slice(0, 200);
    const tags = AI_TAGS && AI_TAGS.generateTags
      ? AI_TAGS.generateTags(textForTags)
      : ['其他'];

    return {
      id: `douyin-${id}`,
      platform: 'douyin',
      title,
      url,
      author: null,
      text: text.slice(0, 500),
      cover: img?.currentSrc || img?.src || video?.poster || null,
      type: 'video',
      stats: {
        likes: null,
        comments: null,
        collects: null
      },
      tags,
      collectedAt: new Date().toISOString()
    };
  }

  function getDouyinCardContainer(el) {
    let current = el;
    let best = el;
    let bestScore = -999;

    for (let depth = 0; current && depth < 8; depth++) {
      const rect = current.getBoundingClientRect();
      const text = cleanText(current.textContent);
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

  function cleanText(text) {
    return String(text || '')
      .replace(/\s+/g, ' ')
      .replace(/^(赞|评论|收藏|分享)\s*\d*$/g, '')
      .trim();
  }

  function pickBestTitle(candidates) {
    const blocked = /^(赞|评论|收藏|分享|关注|粉丝|获赞|更多|展开|收起|\d+|[0-9.]+万)$/;

    return candidates
      .map(cleanText)
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

      const text = cleanText(el.textContent);
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

        const text = cleanText(el.textContent);
        if (text && text.length <= 160) {
          candidates.push(text);
        }
      });

      current = current.parentElement;
      depth++;
    }

    return candidates;
  }

  function dedupe(collections) {
    const seen = new Set();
    return collections.filter(item => {
      const key = item.id || item.url;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function extractCurrentPlatformContent() {
    const platform = getCurrentPlatform();

    if (platform === PLATFORMS.XIAOHONGSHU) {
      return XHSExtractor.extract();
    }

    if (platform === PLATFORMS.DOUYIN) {
      return extractDouyinContent();
    }

    return [];
  }

  window.XHS_ROUTER = {
    getCurrentPlatform,
    extractCurrentPlatformContent
  };

  console.log('[router] loaded');
})();
