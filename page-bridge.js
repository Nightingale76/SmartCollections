(function bootstrapSmartCollectionBridge() {
  if (window.__XHS_SMART_COLLECTION_BRIDGE__) {
    return;
  }

  window.__XHS_SMART_COLLECTION_BRIDGE__ = true;

  const BRIDGE_SOURCE = 'xhs-smart-collection';
  const COLLECT_PATHS = [
    '/api/sns/web/v2/note/collect/page',
    '/api/sns/web/v1/note/collect/page'
  ];

  let initialSnapshotSent = false;
  let pollAttempts = 0;
  const maxPollAttempts = 60;

  function emit(type, payload) {
    window.postMessage(
      {
        source: BRIDGE_SOURCE,
        type,
        payload: payload || {}
      },
      '*'
    );
  }

  function isPlainObject(value) {
    return Object.prototype.toString.call(value) === '[object Object]';
  }

  function unwrapReactive(value, depth = 0) {
    if (depth > 8 || value == null) {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map(item => unwrapReactive(item, depth + 1));
    }

    if (typeof value !== 'object') {
      return value;
    }

    if (Object.prototype.hasOwnProperty.call(value, '_rawValue')) {
      return unwrapReactive(value._rawValue, depth + 1);
    }

    if (Object.prototype.hasOwnProperty.call(value, '__v_raw')) {
      return unwrapReactive(value.__v_raw, depth + 1);
    }

    if (
      Object.prototype.hasOwnProperty.call(value, 'value') &&
      Object.keys(value).length <= 4
    ) {
      return unwrapReactive(value.value, depth + 1);
    }

    return value;
  }

  function pickFirst(values) {
    for (const candidate of values) {
      if (candidate == null) continue;
      if (typeof candidate === 'string' && candidate.trim() === '') continue;
      return candidate;
    }
    return null;
  }

  function resolveCover(noteCard) {
    const cover = noteCard?.cover ? unwrapReactive(noteCard.cover) : null;
    const infoList = cover?.info_list || cover?.infoList;

    if (Array.isArray(infoList)) {
      for (const item of infoList) {
        const normalized = unwrapReactive(item);
        const itemUrl = pickFirst([normalized?.url, normalized?.urlDefault]);
        if (itemUrl) return itemUrl;
      }
    }

    return pickFirst([cover?.url, cover?.default, cover?.src]);
  }

  function toStringOrNull(value) {
    return value == null ? null : String(value);
  }

  function normalizeFavoriteItem(rawItem, source) {
    const item = unwrapReactive(rawItem) || {};
    const noteCard = unwrapReactive(item.noteCard) || item;
    const user = unwrapReactive(noteCard.user) || unwrapReactive(item.user) || {};
    const interactInfo =
      unwrapReactive(noteCard.interactInfo) ||
      unwrapReactive(noteCard.interact_info) ||
      unwrapReactive(item.interactInfo) ||
      unwrapReactive(item.interact_info) ||
      {};

    const noteId = pickFirst([
      item.id,
      item.noteId,
      item.note_id,
      noteCard.noteId,
      noteCard.note_id
    ]);

    if (!noteId) {
      return null;
    }

    const xsecToken = pickFirst([
      item.xsecToken,
      item.xsec_token,
      noteCard.xsecToken,
      noteCard.xsec_token
    ]);

    const title = pickFirst([
      noteCard.displayTitle,
      noteCard.display_title,
      item.displayTitle,
      item.display_title,
      item.title
    ]);

    const author = pickFirst([
      user.nickName,
      user.nick_name,
      user.nickname,
      user.name
    ]);

    const likedCount = pickFirst([
      interactInfo.likedCount,
      interactInfo.liked_count
    ]);

    const baseUrl = `https://www.xiaohongshu.com/explore/${encodeURIComponent(String(noteId))}`;
    const url = xsecToken
      ? `${baseUrl}?xsec_token=${String(xsecToken)}&xsec_source=pc_collect`
      : `${baseUrl}?xsec_source=pc_collect`;

    return {
      note_id: String(noteId),
      xsec_token: toStringOrNull(xsecToken),
      url,
      title: toStringOrNull(title),
      author: toStringOrNull(author),
      cover: toStringOrNull(resolveCover(noteCard)),
      liked_count: toStringOrNull(likedCount),
      note_type: toStringOrNull(pickFirst([noteCard.type, item.type])),
      source,
      captured_at: new Date().toISOString()
    };
  }

  function extractFavoriteItems(rawCollection) {
    const collection = unwrapReactive(rawCollection);

    if (Array.isArray(collection)) {
      return collection;
    }

    if (!collection || !isPlainObject(collection)) {
      return [];
    }

    if (Array.isArray(collection.items)) return collection.items;
    if (Array.isArray(collection.noteList)) return collection.noteList;
    if (Array.isArray(collection.list)) return collection.list;
    return [];
  }

  function readInitialSnapshot() {
    const state = unwrapReactive(window.__INITIAL_STATE__);
    if (!state?.user) {
      return null;
    }

    const userState = unwrapReactive(state.user) || {};
    const notesCollection = unwrapReactive(userState.notes);
    const queriesCollection = unwrapReactive(userState.noteQueries);

    if (!notesCollection) {
      return null;
    }

    const favoriteList = Array.isArray(notesCollection)
      ? notesCollection[1]
      : notesCollection[1];
    const favoriteQuery = Array.isArray(queriesCollection)
      ? queriesCollection[1]
      : queriesCollection?.[1];

    const normalizedItems = extractFavoriteItems(favoriteList)
      .map(item => normalizeFavoriteItem(item, 'ssr'))
      .filter(Boolean);

    return {
      items: normalizedItems,
      page: favoriteQuery ? {
        cursor: toStringOrNull(pickFirst([unwrapReactive(favoriteQuery).cursor])),
        has_more: Boolean(pickFirst([
          unwrapReactive(favoriteQuery).hasMore,
          unwrapReactive(favoriteQuery).has_more
        ]))
      } : null
    };
  }

  function tryEmitInitialSnapshot(force) {
    const snapshot = readInitialSnapshot();
    if (!snapshot) {
      return false;
    }

    if (!force && initialSnapshotSent && snapshot.items.length === 0) {
      return false;
    }

    if (snapshot.items.length > 0 || snapshot.page?.cursor || snapshot.page?.has_more) {
      emit('INITIAL_SNAPSHOT', snapshot);
      initialSnapshotSent = true;
      return true;
    }

    return false;
  }

  function startInitialStatePolling() {
    const timer = window.setInterval(() => {
      pollAttempts += 1;
      if (tryEmitInitialSnapshot(false) || pollAttempts >= maxPollAttempts) {
        window.clearInterval(timer);
      }
    }, 500);
  }

  function isCollectUrl(url) {
    return COLLECT_PATHS.some(path => String(url || '').includes(path));
  }

  function parseCollectPayload(responseText) {
    try {
      return JSON.parse(responseText);
    } catch (error) {
      emit('XHR_PARSE_ERROR', { message: String(error) });
      return null;
    }
  }

  function installXmlHttpRequestHook() {
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function patchedOpen(method, url) {
      this.__xhsSmartCollectionMeta = {
        method: method ? String(method) : 'GET',
        url: url ? String(url) : ''
      };
      return originalOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function patchedSend() {
      const meta = this.__xhsSmartCollectionMeta;

      if (meta?.url && isCollectUrl(meta.url)) {
        this.addEventListener('load', function onCollectPageLoaded() {
          const responseUrl = this.responseURL || meta.url || '';
          if (!isCollectUrl(responseUrl)) {
            return;
          }

          const payload = parseCollectPayload(this.responseText);
          if (!payload) {
            return;
          }

          const data = unwrapReactive(payload.data) || {};
          const notes = Array.isArray(data.notes)
            ? data.notes
            : Array.isArray(data.note_list)
              ? data.note_list
              : [];

          emit('COLLECT_PAGE', {
            status: this.status,
            url: responseUrl,
            page: {
              cursor: toStringOrNull(pickFirst([data.cursor])),
              has_more: Boolean(pickFirst([data.has_more, data.hasMore]))
            },
            items: notes
              .map(item => normalizeFavoriteItem(item, 'xhr'))
              .filter(Boolean)
          });
        }, { once: true });
      }

      return originalSend.apply(this, arguments);
    };
  }

  window.addEventListener('xhs-smart-collection:scan-now', () => {
    tryEmitInitialSnapshot(true);
  });

  installXmlHttpRequestHook();
  startInitialStatePolling();
  emit('BRIDGE_READY', { collect_paths: COLLECT_PATHS });
})();
