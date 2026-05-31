(function() {
  'use strict';

  let collections = [];
  let settings = {};
  let petSettings = {};
  let currentView = 'all';
  let searchTerm = '';
  let selectedTag = '';
  let selectedFolder = '';
  let sortOrder = 'newest';

  const STORAGE_KEYS = window.XHS_CONSTANTS ? window.XHS_CONSTANTS.STORAGE_KEYS : {
    COLLECTIONS: 'xhs_collections',
    SETTINGS: 'xhs_settings',
    PET_SETTINGS: 'xhs_pet_settings'
  };
  const FOLDERS_KEY = 'memora_folders';
  const PRESET_FOLDERS = ['美妆', '穿搭', '数码', '游戏', '旅游', '学习', '美食', '摄影', '家居', '健身', '音乐', '影视', '汽车', '母婴', '理财', '宠物', '手作'];
  let FOLDERS = [];
  const DEFAULT_SETTINGS = { petMode: 'companion', uiMode: 'full' };
  const DEFAULT_PET_SETTINGS = { petName: '小助手', petPosition: null };

  document.addEventListener('DOMContentLoaded', async () => {
    await loadSettings();
    await loadFoldersFromStorage();
    await loadPetSettings();
    await loadAiConfig();
    await loadCollections();
    initEventListeners();
    updateUI();
  });

  async function loadFoldersFromStorage() {
    try {
      const res = await chrome.storage.local.get(FOLDERS_KEY);
      const stored = res[FOLDERS_KEY];
      if (Array.isArray(stored) && stored.length > 0) {
        FOLDERS = stored.filter(Boolean).map(f => String(f).trim()).filter(Boolean);
      } else {
        FOLDERS = PRESET_FOLDERS.slice();
      }
    } catch (err) {
      FOLDERS = PRESET_FOLDERS.slice();
    }
  }

  async function saveFoldersToStorage() {
    try {
      await chrome.storage.local.set({ [FOLDERS_KEY]: FOLDERS });
    } catch (err) {
      console.warn('saveFoldersToStorage failed', err);
    }
  }

  function normalizeFolderName(name) {
    return String(name || '').replace(/^#/, '').trim();
  }

  function suggestFoldersFromCollections(items, options = {}) {
    const { limit = 12 } = options;
    const list = Array.isArray(items) ? items : [];
    if (list.length === 0) return [];

    const minCount = list.length >= 30 ? 2 : 1;
    const counts = new Map();

    for (const item of list) {
      const folder = normalizeFolderName(item?.folder);
      if (folder && folder !== '其他' && folder.length >= 2 && folder.length <= 10) {
        counts.set(folder, (counts.get(folder) || 0) + 1);
      }

      const tags = Array.isArray(item?.tags) ? item.tags : [];
      for (const raw of tags) {
        const tag = normalizeFolderName(raw);
        if (!tag || tag === '其他') continue;
        if (tag.length < 2 || tag.length > 10) continue;
        counts.set(tag, (counts.get(tag) || 0) + 1);
      }
    }

    return [...counts.entries()]
      .filter(([, count]) => count >= minCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([tag]) => tag);
  }

  async function maybeAutoExpandFolders() {
    if (!Array.isArray(collections) || collections.length === 0) return;

    const suggested = suggestFoldersFromCollections(collections, { limit: 12 });
    const current = (Array.isArray(FOLDERS) ? FOLDERS : [])
      .map(normalizeFolderName)
      .filter(Boolean)
      .filter(f => f !== '其他');

    const merged = [...new Set([...current, ...suggested])];
    const changed = merged.length !== current.length || merged.some((v, i) => v !== current[i]);

    if (changed) {
      FOLDERS = merged;
      await saveFoldersToStorage();
    }
  }

  async function loadSettings() {
    try {
      const result = await chrome.storage.local.get([STORAGE_KEYS.SETTINGS]);
      settings = { ...DEFAULT_SETTINGS, ...(result[STORAGE_KEYS.SETTINGS] || {}) };
    } catch (e) {
      settings = { ...DEFAULT_SETTINGS };
    }
  }

  async function loadPetSettings() {
    try {
      const result = await chrome.storage.local.get([STORAGE_KEYS.PET_SETTINGS]);
      petSettings = result[STORAGE_KEYS.PET_SETTINGS] || { ...DEFAULT_PET_SETTINGS };
    } catch (e) {
      petSettings = { ...DEFAULT_PET_SETTINGS };
    }
  }

  // AI config storage key
  const AI_CONFIG_STORAGE_KEY = 'memora_ai_config';

  async function loadAiConfig() {
    try {
      const res = await chrome.storage.local.get([AI_CONFIG_STORAGE_KEY]);
      const cfg = res[AI_CONFIG_STORAGE_KEY];
      if (cfg && typeof cfg === 'object') {
        window.SMART_COLLECTIONS_AI_CONFIG = cfg;
      }
      // populate input
      const input = document.getElementById('aiApiKeyInput');
      if (input && window.SMART_COLLECTIONS_AI_CONFIG && window.SMART_COLLECTIONS_AI_CONFIG.apiKey) {
        input.value = window.SMART_COLLECTIONS_AI_CONFIG.apiKey;
      }
    } catch (e) {
      console.warn('loadAiConfig failed', e);
    }
  }

  async function saveAiConfig(apiKey) {
    try {
      const base = (window.SMART_COLLECTIONS_AI_CONFIG && window.SMART_COLLECTIONS_AI_CONFIG.baseUrl) || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
      const model = (window.SMART_COLLECTIONS_AI_CONFIG && window.SMART_COLLECTIONS_AI_CONFIG.model) || 'qwen-plus';
      const cfg = { apiKey: String(apiKey || '').trim(), model, baseUrl: base };
      await chrome.storage.local.set({ [AI_CONFIG_STORAGE_KEY]: cfg });
      window.SMART_COLLECTIONS_AI_CONFIG = cfg;
      const modelName = document.getElementById('modelName');
      if (modelName) modelName.textContent = cfg.model || 'qwen-plus';
      showToast('AI Key 已保存');
    } catch (e) {
      console.error('saveAiConfig failed', e);
      showToast('保存失败');
    }
  }

  async function clearAiConfig() {
    try {
      await chrome.storage.local.remove([AI_CONFIG_STORAGE_KEY]);
      // reset to default qwen-config.js
      const defaultCfg = window.SMART_COLLECTIONS_AI_CONFIG || { apiKey: '', model: 'qwen-plus', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1' };
      window.SMART_COLLECTIONS_AI_CONFIG = defaultCfg;
      const input = document.getElementById('aiApiKeyInput');
      if (input) input.value = '';
      showToast('AI Key 已清除');
    } catch (e) {
      console.error('clearAiConfig failed', e);
      showToast('清除失败');
    }
  }

  async function saveSettings() {
    try {
      await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings });
    } catch (e) {
      console.error('Failed to save settings:', e);
    }
  }

  async function savePetSettings() {
    try {
      await chrome.storage.local.set({ [STORAGE_KEYS.PET_SETTINGS]: petSettings });
    } catch (e) {
      console.error('Failed to save pet settings:', e);
    }
  }

  async function loadCollections() {
    try {
      const result = await chrome.storage.local.get([STORAGE_KEYS.COLLECTIONS]);
      collections = result[STORAGE_KEYS.COLLECTIONS] || [];
      
      const AI_TAGS = window.MEMORA_AI_TAGS;
      let needsUpdate = false;
      
      collections.forEach(item => {
        if (!item.tags || item.tags.length === 0) {
          if (AI_TAGS && AI_TAGS.generateTags) {
            const textForTags = [
              item.title,
              item.author,
              item.url
            ].filter(Boolean).join(' ');
            item.tags = AI_TAGS.generateTags(textForTags);
          } else {
            item.tags = ['其他'];
          }
          needsUpdate = true;
        }
      });
      
      if (needsUpdate) {
        try {
          await chrome.storage.local.set({ [STORAGE_KEYS.COLLECTIONS]: collections });
        } catch (e) {}
      }

      await maybeAutoExpandFolders();
      await normalizeCollectionFolders();
      
      renderCollections();
      updateTagFilter();
      updateStats();
      renderFolders();
    } catch (e) {
      collections = [];
    }
  }

  function initEventListeners() {
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', () => switchView(item.dataset.view));
    });

    const toggleFoldersBtn = document.getElementById('toggleFoldersBtn');
    const sidebarFolderList = document.getElementById('sidebarFolderList');
    if (toggleFoldersBtn && sidebarFolderList) {
      toggleFoldersBtn.addEventListener('click', () => {
        const expanded = toggleFoldersBtn.getAttribute('aria-expanded') === 'true';
        toggleFoldersBtn.setAttribute('aria-expanded', String(!expanded));
        sidebarFolderList.style.display = expanded ? 'none' : 'block';
      });
    }

    document.getElementById('searchInput').addEventListener('input', (e) => {
      searchTerm = e.target.value;
      renderCollections();
    });

    const addInput = document.getElementById('addFolderInput');
    const addBtn = document.getElementById('addFolderBtn');
    if (addBtn && addInput) {
      addBtn.addEventListener('click', async () => {
        const v = addInput.value.trim();
        if (v) {
          await addFolder(v);
          addInput.value = '';
        }
      });
      addInput.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
          const v = addInput.value.trim();
          if (v) {
            await addFolder(v);
            addInput.value = '';
          }
        }
      });
    }

    document.getElementById('tagFilter').addEventListener('change', (e) => {
      selectedTag = e.target.value;
      renderCollections();
    });

    document.getElementById('sortOrder').addEventListener('change', (e) => {
      sortOrder = e.target.value;
      renderCollections();
    });

    document.getElementById('exportAllBtn').addEventListener('click', exportAll);
    document.getElementById('clearAllBtn').addEventListener('click', clearAll);

    // 设置页面事件
    const simpleModeToggle = document.getElementById('simpleModeToggle');
    if (simpleModeToggle) {
      simpleModeToggle.addEventListener('change', async (e) => {
        const enabled = Boolean(e.target && e.target.checked);
        settings.uiMode = enabled ? 'simple' : 'full';
        await saveSettings();
        try {
          await chrome.runtime.sendMessage({ action: 'set_ui_mode', mode: settings.uiMode });
        } catch (err) {}
        updateSettingsUI();
        if (enabled) {
          showToast('已切换到简洁模式');
          try { chrome.action.openPopup(); } catch (e) {}
        }
      });
    }

    const petNameInput = document.getElementById('petNameInput');
    if (petNameInput) {
      petNameInput.addEventListener('input', async (e) => {
        const newName = e.target.value || '小助手';
        petSettings.petName = newName;
        await savePetSettings();
        await sendMessageToContent({ action: 'update_pet_name', petName: newName });
      });
    }

    const resetPositionBtn = document.getElementById('resetPositionBtn');
    if (resetPositionBtn) {
      resetPositionBtn.addEventListener('click', async () => {
        petSettings.petPosition = null;
        await savePetSettings();
        await sendMessageToContent({ action: 'reset_pet_position' });
        showToast('宠物位置已重置');
      });
    }

    document.querySelectorAll('.settings-section .mode-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const mode = btn.dataset.mode;
        settings.petMode = mode;
        await saveSettings();
        updateSettingsUI();
      });
    });

    // AI key save/clear handlers
    const saveBtn = document.getElementById('saveAiKeyBtn');
    const clearBtn = document.getElementById('clearAiKeyBtn');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const v = document.getElementById('aiApiKeyInput')?.value || '';
        if (!v) { showToast('API Key 不能为空'); return; }
        await saveAiConfig(v);
      });
    }
    if (clearBtn) {
      clearBtn.addEventListener('click', async () => {
        if (!confirm('确认清除已保存的 AI Key 吗？')) return;
        await clearAiConfig();
      });
    }
  }

  function getFolderFromItem(item) {
    if (item.folder && String(item.folder).trim()) {
      const v = String(item.folder).trim();
      if (v !== '其他') return v;
    }
  
    const tags = Array.isArray(item.tags)
      ? item.tags.map(tag => String(tag).trim()).filter(Boolean)
      : [];

    for (const folder of Array.isArray(FOLDERS) ? FOLDERS : []) {
      const f = String(folder || '').trim();
      if (!f || f === '其他') continue;
      if (tags.includes(f)) return f;
    }
  
    const folderPriority = [
      '美妆',
      '穿搭',
      '数码',
      '游戏',
      '旅游',
      '旅行',
      '学习',
      '美食',
      '摄影',
      '家居',
      '健身',
      '音乐',
      '影视',
      '汽车',
      '母婴',
      '理财',
      '宠物',
      '手作'
    ];
  
    for (const folder of folderPriority) {
      if (tags.includes(folder)) {
        return folder === '旅行' ? '旅游' : folder;
      }
    }
  
    return '其他';
  }
  
  async function normalizeCollectionFolders() {
    let changed = false;
  
    collections.forEach(item => {
      const folder = getFolderFromItem(item);
      if (item.folder !== folder) {
        item.folder = folder;
        changed = true;
      }
    });
  
    if (changed) {
      try {
        await chrome.storage.local.set({ [STORAGE_KEYS.COLLECTIONS]: collections });
      } catch (e) {
        console.warn('normalizeCollectionFolders failed', e);
      }
    }
  }
  
  function getFolderCounts() {
    return collections.reduce((counts, item) => {
      const key = getFolderFromItem(item);
      counts.set(key, (counts.get(key) || 0) + 1);
      return counts;
    }, new Map());
  }

  
 function renderFolders() {
    const container = document.getElementById('sidebarFolderList');
    if (!container) return;
  
    const counts = getFolderCounts();

    const folderSet = new Set((Array.isArray(FOLDERS) ? FOLDERS : []).map(f => String(f || '').trim()).filter(Boolean));
  
    const visibleFolders = FOLDERS
      .map(folder => ({
        folder,
        label: folder,
        count: counts.get(folder) || 0
      }))
      .filter(item => item.count > 0);

    const extraFolders = [...counts.entries()]
      .filter(([folder, count]) => count > 0 && folder !== '其他' && !folderSet.has(folder))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([folder, count]) => ({ folder, label: folder, count }));

    if (extraFolders.length > 0) {
      visibleFolders.push(...extraFolders);
    }
  
    const otherCount = counts.get('其他') || 0;
    if (otherCount > 0) {
      visibleFolders.push({
        folder: '其他',
        label: '其他',
        count: otherCount
      });
    }
  
    if (visibleFolders.length === 0) {
      container.innerHTML = `
        <div class="folder-empty">
          暂无分类内容
        </div>
      `;
    } else {
      container.innerHTML = visibleFolders.map((item, index) => `
        <div class="folder-entry">
          <button 
            class="folder-chip ${selectedFolder === item.folder ? 'active' : ''}" 
            data-folder="${escapeHtml(item.folder)}"
            style="--chip-index:${index};"
          >
            <span class="folder-chip-name">${escapeHtml(item.label)}</span>
            <span class="folder-chip-count">${item.count}</span>
          </button>
        </div>
      `).join('');
    }
  
    container.querySelectorAll('.folder-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const clickedFolder = btn.dataset.folder || '';
    
        // 再点一次当前分类 = 取消筛选，回到全部内容
        selectedFolder = selectedFolder === clickedFolder ? '' : clickedFolder;
    
        renderFolders();
        renderCollections();
      });
    });
  
    const folderBadge = document.getElementById('folderBadge');
    if (folderBadge) {
      folderBadge.textContent = String(visibleFolders.length || 0);
    }
  } 
  

  async function addFolder(name) {
    const n = String(name || '').trim();
    if (!n) return;
    if (!FOLDERS.includes(n)) FOLDERS.push(n);
    await saveFoldersToStorage();
    renderFolders();
  }

  function updateUI() {
    document.getElementById('allBadge').textContent = collections.length;
    updateSettingsUI();
  }

  function updateSettingsUI() {
    const simpleModeToggle = document.getElementById('simpleModeToggle');
    if (simpleModeToggle) {
      simpleModeToggle.checked = settings.uiMode === 'simple';
    }

    const petNameInput = document.getElementById('petNameInput');
    if (petNameInput && petSettings.petName) {
      petNameInput.value = petSettings.petName === '小助手' ? '' : petSettings.petName;
    }

    const modeNameEl = document.getElementById('modelName');
    if (modeNameEl && window.SMART_COLLECTIONS_AI_CONFIG) {
      modeNameEl.textContent = window.SMART_COLLECTIONS_AI_CONFIG.model || 'qwen-plus';
    }

    document.querySelectorAll('.settings-section .mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === settings.petMode);
    });
  }

  async function sendMessageToContent(message) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id) {
        await chrome.tabs.sendMessage(tab.id, message);
      }
    } catch (e) {
      console.log('No content script available:', e);
    }
  }

  function switchView(view) {
    currentView = view;
  
    if (view === 'all') {
      selectedFolder = '';
      selectedTag = '';
  
      const tagFilter = document.getElementById('tagFilter');
      if (tagFilter) {
        tagFilter.value = '';
      }
  
      renderFolders();
    }
    
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.view === view);
    });

    const emptyState = document.getElementById('emptyState');
    const collectionGrid = document.getElementById('collectionGrid');
    const statsView = document.getElementById('statsView');
    const settingsView = document.getElementById('settingsView');
    const contentHeader = document.querySelector('.content-header');

    if (view === 'stats') {
      contentHeader.style.display = 'flex';
      emptyState.style.display = 'none';
      collectionGrid.style.display = 'none';
      statsView.style.display = 'block';
      settingsView.style.display = 'none';
      updateStats();
    } else if (view === 'settings') {
      contentHeader.style.display = 'none';
      emptyState.style.display = 'none';
      collectionGrid.style.display = 'none';
      statsView.style.display = 'none';
      settingsView.style.display = 'block';
      updateSettingsUI();
    } else {
      contentHeader.style.display = 'flex';
      emptyState.style.display = 'none';
      collectionGrid.style.display = 'grid';
      statsView.style.display = 'none';
      settingsView.style.display = 'none';
      renderCollections();
    }
    // expand/collapse folder panel when viewing byTag
    const toggleFoldersBtn = document.getElementById('toggleFoldersBtn');
    const sidebarFolderList = document.getElementById('sidebarFolderList');
    if (toggleFoldersBtn && sidebarFolderList) {
      const expand = view === 'byTag';
      toggleFoldersBtn.setAttribute('aria-expanded', String(expand));
      sidebarFolderList.style.display = expand ? 'block' : 'none';
    }
  }

  function filterAndSortCollections() {
    let filtered = [...collections];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(item =>
        (item.title && item.title.toLowerCase().includes(term)) ||
        (item.author && item.author.toLowerCase().includes(term))
      );
    }

    if (selectedTag) {
      filtered = filtered.filter(item =>
        item.tags && item.tags.includes(selectedTag)
      );
    }

    if (selectedFolder) {
      filtered = filtered.filter(item => getFolderFromItem(item) === selectedFolder);
    }

    switch (sortOrder) {
      case 'newest':
        filtered.sort((a, b) => new Date(b.savedAt || b.collectedAt || 0) - new Date(a.savedAt || a.collectedAt || 0));
        break;
      case 'oldest':
        filtered.sort((a, b) => new Date(a.savedAt || a.collectedAt || 0) - new Date(b.savedAt || b.collectedAt || 0));
        break;
      case 'title':
        filtered.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
        break;
    }

    return filtered;
  }

  function escapeHtml(text) {
    if (!text) return '';
    return String(text).replace(/[&<>"']/g, char => {
      const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
      return entities[char] || char;
    });
  }

  function renderCollections() {
    const grid = document.getElementById('collectionGrid');
    const emptyState = document.getElementById('emptyState');
    const filtered = filterAndSortCollections();

    if (filtered.length === 0) {
      emptyState.style.display = 'flex';
      grid.style.display = 'none';
      return;
    }

    emptyState.style.display = 'none';
    grid.style.display = 'grid';

    grid.innerHTML = filtered.map(item => `
      <div class="collection-card" data-id="${item.id}">
        ${item.cover ? `<img src="${item.cover}" class="card-image" alt="封面">` : '<div class="card-image" style="display:flex;align-items:center;justify-content:center;font-size:48px;">📄</div>'}
        <div class="card-content">
          <h3 class="card-title">${escapeHtml(item.title) || '无标题'}</h3>
          ${item.author ? `<p class="card-author">👤 ${escapeHtml(item.author)}</p>` : ''}
          ${item.platform !== 'douyin' && item.stats && (item.stats.likes || item.stats.comments) ? `
            <div class="card-stats">
              ${item.stats.likes ? `<span>👍 ${item.stats.likes}</span>` : ''}
              ${item.stats.comments ? `<span>💬 ${item.stats.comments}</span>` : ''}
            </div>
          ` : ''}
          ${item.tags && item.tags.length > 0 ? `
            <div class="card-tags">
              ${item.tags.map(tag => `<span class="tag">#${tag}</span>`).join('')}
            </div>
          ` : ''}
          <div class="card-actions">
            <button class="card-btn visit-btn" data-url="${escapeHtml(item.url || '')}">
              <span>🔗</span> 访问
            </button>
            <button class="card-btn copy-btn" data-id="${item.id}">
              <span>📋</span> 复制
            </button>
            <button class="card-btn danger delete-btn" data-id="${item.id}">
              <span>🗑️</span> 删除
            </button>
          </div>
        </div>
      </div>
    `).join('');

    document.querySelectorAll('.visit-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const url = btn.dataset.url;
        if (url) window.open(url, '_blank');
      });
    });

    document.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        copySingleCollection(id);
      });
    });

    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await removeCollection(btn.dataset.id);
      });
    });
  }

  function updateTagFilter() {
    const tagFilter = document.getElementById('tagFilter');
    const allTags = [...new Set(collections.flatMap(item => item.tags || []))];

    while (tagFilter.options.length > 1) {
      tagFilter.remove(1);
    }

    allTags.forEach(tag => {
      const option = document.createElement('option');
      option.value = tag;
      option.textContent = tag;
      tagFilter.appendChild(option);
    });
  }

  function updateStats() {
    document.getElementById('totalCount').textContent = collections.length;
    
    const allTags = [...new Set(collections.flatMap(item => item.tags || []))];
    document.getElementById('totalTags').textContent = allTags.length;
    
    const allAuthors = [...new Set(collections.map(item => item.author).filter(Boolean))];
    document.getElementById('totalAuthors').textContent = allAuthors.length;

    const tagCounts = {};
    collections.forEach(item => {
      (item.tags || []).forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });

    const maxCount = Math.max(...Object.values(tagCounts), 1);
    const tagCloud = document.getElementById('tagCloud');
    tagCloud.innerHTML = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => {
        const size = count >= maxCount * 0.6 ? 3 : count >= maxCount * 0.3 ? 2 : 1;
        return `<span class="cloud-tag size-${size}" data-tag="${tag}">${tag} (${count})</span>`;
      }).join('');

    document.querySelectorAll('.cloud-tag').forEach(el => {
      el.addEventListener('click', () => {
        selectedTag = el.dataset.tag;
        document.getElementById('tagFilter').value = selectedTag;
        switchView('all');
      });
    });
  }

  async function removeCollection(id) {
    collections = collections.filter(item => item.id !== id);
    try {
      await chrome.storage.local.set({ [STORAGE_KEYS.COLLECTIONS]: collections });
    } catch (e) {}
    await normalizeCollectionFolders();
    renderCollections();
    updateTagFilter();
    updateStats();
    renderFolders();
  }

  function copySingleCollection(id) {
    const item = collections.find(c => c.id === id);
    if (!item) {
      alert('未找到该收藏');
      return;
    }

    let markdown = `# ${item.title || '无标题'}\n\n`;
    if (item.author) markdown += `- **作者**: ${item.author}\n`;
    if (item.url) markdown += `- **链接**: ${item.url}\n`;
    if (item.tags && item.tags.length > 0) {
      markdown += `- **标签**: ${item.tags.map(t => `#${t}`).join(' ')}\n`;
    }

    navigator.clipboard.writeText(markdown).then(() => {
      showToast('已复制到剪贴板');
    }).catch(() => {
      alert('复制失败，请手动复制');
    });
  }

  function exportAll() {
    if (collections.length === 0) {
      alert('没有可导出的内容');
      return;
    }

    let markdown = '# Memora 知识库\n\n';
    markdown += `> 共 ${collections.length} 条收藏 | 导出时间: ${new Date().toLocaleString('zh-CN')}\n\n`;

    collections.forEach((item, index) => {
      markdown += `## ${index + 1}. ${item.title || '无标题'}\n\n`;
      if (item.author) markdown += `- **作者**: ${item.author}\n`;
      if (item.url) markdown += `- **链接**: [查看原文](${item.url})\n`;
      if (item.cover) markdown += `- **封面**: ![](${item.cover})\n`;
      if (item.stats) {
        markdown += `- **互动**: 👍 ${item.stats.likes || 0} | 💬 ${item.stats.comments || 0} | 📌 ${item.stats.collects || 0}\n`;
      }
      if (item.tags && item.tags.length > 0) {
        markdown += `- **标签**: ${item.tags.map(t => `#${t}`).join(' ')}\n`;
      }
      markdown += '\n---\n\n';
    });

    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `memora-collection-${new Date().toISOString().split('T')[0]}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function clearAll() {
    if (!confirm('确定要清空所有收藏吗？此操作不可恢复。')) return;
    
    collections = [];
    try {
      await chrome.storage.local.set({ [STORAGE_KEYS.COLLECTIONS]: [] });
    } catch (e) {}
    renderCollections();
    updateTagFilter();
    updateStats();
    updateUI();
  }

  function showToast(message) {
    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#333;color:#fff;padding:12px 24px;border-radius:8px;z-index:9999;animation:fadeIn 0.3s;';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.style.animation = 'fadeOut 0.3s';
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }

  setInterval(async () => {
    try {
      const result = await chrome.storage.local.get([STORAGE_KEYS.COLLECTIONS]);
      const newCollections = result[STORAGE_KEYS.COLLECTIONS] || [];
      if (JSON.stringify(newCollections) !== JSON.stringify(collections)) {
        collections = newCollections;
        renderCollections();
        updateTagFilter();
        updateStats();
        renderFolders();
        updateUI();
      }
    } catch (e) {}
  }, 2000);
})();
