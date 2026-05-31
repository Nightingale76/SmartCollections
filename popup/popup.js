(function() {
  'use strict';

  let collections = [];
  let settings = {};
  let searchTerm = '';
  let selectedTag = '';
  let isGeneratingAITags = false;

  const STORAGE_KEYS = window.XHS_CONSTANTS ? window.XHS_CONSTANTS.STORAGE_KEYS : {
    COLLECTIONS: 'xhs_collections',
    SETTINGS: 'xhs_settings'
  };
  const DEFAULT_SETTINGS = { petMode: 'companion' };
  const PET_STATES = { IDLE: 'idle', THINKING: 'thinking', HAPPY: 'happy' };
  const PET_MODES = { QUIET: 'quiet', COMPANION: 'companion', ACTIVE: 'active' };

  const FOLDERS_KEY = 'memora_folders';
  const PRESET_FOLDERS = ['美妆', '穿搭', '数码', '游戏', '旅游', '学习', '美食', '摄影', '家居', '健身', '音乐', '影视', '汽车', '母婴', '理财', '宠物', '手作'];

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

  async function loadFoldersFromStorage() {
    try {
      const res = await chrome.storage.local.get([FOLDERS_KEY]);
      const stored = res[FOLDERS_KEY];
      return Array.isArray(stored) ? stored.filter(Boolean).map(normalizeFolderName).filter(Boolean) : [];
    } catch (e) {
      return [];
    }
  }

  async function saveFoldersToStorage(folders) {
    try {
      await chrome.storage.local.set({ [FOLDERS_KEY]: folders });
    } catch (e) {}
  }

  async function getFolderCandidatesFromUserData() {
    const stored = await loadFoldersFromStorage();
    const base = stored.length > 0 ? stored : PRESET_FOLDERS.slice();
    const suggested = suggestFoldersFromCollections(collections, { limit: 12 });
    return [...new Set([...base, ...suggested])]
      .map(normalizeFolderName)
      .filter(Boolean)
      .filter(f => f !== '其他');
  }

  async function loadAiConfig() {
    try {
      const manager = window.MEMORA_AI_CONFIG_MANAGER;
      if (manager && manager.load) {
        await manager.load();
      }
      updateAiConfigInputs();
    } catch (e) {
      console.warn('loadAiConfig failed', e);
    }
  }

  function getCurrentAiConfig() {
    const manager = window.MEMORA_AI_CONFIG_MANAGER;
    return manager && manager.normalizeConfig
      ? manager.normalizeConfig(window.SMART_COLLECTIONS_AI_CONFIG)
      : (window.SMART_COLLECTIONS_AI_CONFIG || {});
  }

  function updateAiConfigInputs() {
    const cfg = getCurrentAiConfig();
    const keyInput = document.getElementById('popupAiApiKeyInput');
    const modelInput = document.getElementById('popupAiModelInput');
    if (keyInput) keyInput.value = cfg.apiKey || '';
    if (modelInput) modelInput.value = cfg.model || 'qwen-plus';
  }

  async function saveAiConfigFromPopup() {
    const keyInput = document.getElementById('popupAiApiKeyInput');
    const modelInput = document.getElementById('popupAiModelInput');
    const apiKey = String(keyInput?.value || '').trim();
    const model = String(modelInput?.value || '').trim() || 'qwen-plus';
    const manager = window.MEMORA_AI_CONFIG_MANAGER;
    if (manager && manager.save) {
      await manager.save({ apiKey, model });
    } else {
      window.SMART_COLLECTIONS_AI_CONFIG = { ...(window.SMART_COLLECTIONS_AI_CONFIG || {}), apiKey, model };
    }
    updateAiConfigInputs();
    showToast(apiKey ? 'AI 配置已保存' : '已切换为本地分类模式');
    return true;
  }

  async function ensureAiConfigReady() {
    await loadAiConfig();
    return true;
  }

  document.addEventListener('DOMContentLoaded', async () => {
    await loadSettings();
    await loadAiConfig();
    await loadCollections();
    initEventListeners();
    updateUI();
  });

  // auto-trigger smarter tag generation when existing tags look uniformly uninformative (e.g., all '游戏')
  async function maybeAutoRegenerateTags() {
    // Auto-regeneration removed: historical fallback for all-'游戏' caused repeated mislabeling.
    return;
  }

  // run auto-check after initial load
  (async () => { await maybeAutoRegenerateTags(); })();

  async function loadSettings() {
    try {
      const result = await chrome.storage.local.get([STORAGE_KEYS.SETTINGS]);
      settings = result[STORAGE_KEYS.SETTINGS] || { ...DEFAULT_SETTINGS };
    } catch (e) {
      settings = { ...DEFAULT_SETTINGS };
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
      
      renderCollections();
      updateTagFilter();
    } catch (e) {
      collections = [];
    }
  }

  function initEventListeners() {
    document.getElementById('extractBtn').addEventListener('click', extractCollections);
    document.getElementById('generateTagsBtn').addEventListener('click', generateAllTags);
    document.getElementById('exportBtn').addEventListener('click', exportMarkdown);
    document.getElementById('openPanelBtn').addEventListener('click', openSidePanel);
    document.getElementById('clearCollectionsBtn').addEventListener('click', clearCollectionsForTesting);

    const saveAiConfigBtn = document.getElementById('popupSaveAiConfigBtn');
    if (saveAiConfigBtn) {
      saveAiConfigBtn.addEventListener('click', saveAiConfigFromPopup);
    }

    ['popupAiApiKeyInput', 'popupAiModelInput'].forEach(id => {
      const input = document.getElementById(id);
      if (input) {
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') saveAiConfigFromPopup();
        });
      }
    });

    document.getElementById('searchInput').addEventListener('input', (e) => {
      searchTerm = e.target.value;
      renderCollections();
    });

    document.getElementById('tagFilter').addEventListener('change', (e) => {
      selectedTag = e.target.value;
      renderCollections();
    });
  }

  function updateUI() {
    const modeText = {
      [PET_MODES.QUIET]: '安静模式',
      [PET_MODES.COMPANION]: '陪伴模式',
      [PET_MODES.ACTIVE]: '活跃模式'
    };
    document.querySelector('.mode-text').textContent = modeText[settings.petMode] || '陪伴模式';
  }

  async function extractCollections() {
    if (!(await ensureAiConfigReady())) {
      return;
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    const supportedSites = ['xiaohongshu.com', 'douyin.com'];
    if (!supportedSites.some(site => tab.url.includes(site))) {
      showToast('请在小红书或抖音页面使用');
      return;
    }

    try {
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'extractCollections' });

      if (response && response.success && response.data.length > 0) {
        let addedCount = 0;
        const AI_TAGS = window.MEMORA_AI_TAGS;
        const initialCandidates = await getFolderCandidatesFromUserData();
        const folderSet = new Set(initialCandidates);

        for (const item of response.data) {
          const existingIndex = collections.findIndex(c => c.id === item.id);

          if (existingIndex === -1) {
            if (AI_TAGS && AI_TAGS.generateTags) {
              const textForTags = [
                item.title,
                item.author,
                item.url
              ].filter(Boolean).join(' ');
              item.tags = AI_TAGS.generateTags(textForTags);
            } else if (!item.tags || item.tags.length === 0) {
              item.tags = ['其他'];
            }
            // determine folder using AI classification if available, otherwise local rules
            if (AI_TAGS && AI_TAGS.generateClassification) {
              try {
                const folderRes = await AI_TAGS.generateClassification(item, { includeImage: false, mode: 'folder', folderCandidates: [...folderSet] });
                item.folder = folderRes.folder || (AI_TAGS.getLocalFolderForItem ? AI_TAGS.getLocalFolderForItem(item, [...folderSet]) : '其他');
              } catch (e) {
                item.folder = (AI_TAGS.getLocalFolderForItem ? AI_TAGS.getLocalFolderForItem(item, [...folderSet]) : '其他');
              }
            } else {
              item.folder = (AI_TAGS.getLocalFolderForItem ? AI_TAGS.getLocalFolderForItem(item, [...folderSet]) : '其他');
            }
            const normalizedFolder = normalizeFolderName(item.folder);
            if (normalizedFolder && normalizedFolder !== '其他' && !folderSet.has(normalizedFolder)) {
              folderSet.add(normalizedFolder);
            }
            item.savedAt = new Date().toISOString();
            collections.push(item);
            addedCount++;
          }
        }

        const storedFolders = await loadFoldersFromStorage();
        const mergedFolders = [...new Set([...(storedFolders.length > 0 ? storedFolders : PRESET_FOLDERS), ...folderSet])]
          .map(normalizeFolderName)
          .filter(Boolean)
          .filter(f => f !== '其他');
        if (mergedFolders.length > 0) {
          await saveFoldersToStorage(mergedFolders);
        }

        try {
          await chrome.storage.local.set({ [STORAGE_KEYS.COLLECTIONS]: collections });
        } catch (e) {}
        renderCollections();
        updateTagFilter();
        showToast(`提取成功 +${addedCount} 条`);

        chrome.runtime.sendMessage({
          action: 'update_pet_state',
          state: PET_STATES.HAPPY,
          message: '收藏提取成功！'
        });
      } else {
        showToast('未找到收藏内容');
      }
    } catch (error) {
      console.error('提取失败:', error);
      showToast('提取失败，请刷新页面重试');
    }
  }

  async function generateAllTags() {
    if (isGeneratingAITags) {
      showToast('正在生成中，请稍候...');
      return;
    }

    if (!(await ensureAiConfigReady())) {
      return;
    }

    isGeneratingAITags = true;
    const AI_TAGS = window.MEMORA_AI_TAGS;
    if (!AI_TAGS) {
      showToast('AI 标签模块未加载');
      isGeneratingAITags = false;
      return;
    }

    let updatedCount = 0;
    let processedCount = 0;
    const btn = document.getElementById('generateTagsBtn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<span class="action-icon">⏳</span><span class="action-text">生成中...</span>';
    btn.disabled = true;

    for (const item of collections) {
      processedCount++;
      // use generateClassification (AI full classifier) for better results; fallback handled inside
      try {
        const res = await AI_TAGS.generateClassification(item, { includeImage: false, mode: 'tags' });
        const newTags = res && res.tags ? res.tags : (AI_TAGS.getLocalTagsForItem ? AI_TAGS.getLocalTagsForItem(item) : (item.tags || ['其他']));

        if (JSON.stringify(newTags) !== JSON.stringify(item.tags)) {
          item.tags = newTags;
          updatedCount++;
          try {
            await chrome.storage.local.set({ [STORAGE_KEYS.COLLECTIONS]: collections });
          } catch (e) {}
          renderCollections();
          updateTagFilter();
        }
      } catch (e) {
        console.warn('generateAllTags item failed, fallback to local:', e);
      }
    }

    isGeneratingAITags = false;
    btn.innerHTML = originalText;
    btn.disabled = false;
    showToast(`更新了 ${updatedCount} 条标签`);

    chrome.runtime.sendMessage({
      action: 'update_pet_state',
      state: PET_STATES.HAPPY,
      message: '标签生成完成！'
    });
  }

  function exportMarkdown() {
    if (collections.length === 0) {
      showToast('没有可导出的内容');
      return;
    }

    const filtered = filterCollections();
    
    let markdown = '# Memora 知识库\n\n';
    markdown += `> 共 ${filtered.length} 条收藏 | 导出时间: ${new Date().toLocaleString('zh-CN')}\n\n`;

    filtered.forEach((item, index) => {
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

    showToast('导出成功');

    chrome.runtime.sendMessage({
      action: 'update_pet_state',
      state: PET_STATES.HAPPY,
      message: 'Markdown 导出成功！'
    });
  }

  async function openSidePanel() {
    try {
      await chrome.sidePanel.open({ windowId: (await chrome.windows.getCurrent()).id });
    } catch (error) {
      console.error('打开侧边栏失败:', error);
      showToast('打开知识库失败');
    }
  }

  function filterCollections() {
    let filtered = collections;

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

    return filtered;
  }

  function renderCollections() {
    const list = document.getElementById('collectionList');
    const filtered = filterCollections();

    if (filtered.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📭</div>
          <p>${collections.length === 0 ? '暂无收藏内容' : '未找到匹配结果'}</p>
          <small>${collections.length === 0 ? '点击「提取收藏」开始' : '尝试其他搜索条件'}</small>
        </div>
      `;
      document.getElementById('itemCount').textContent = `共 ${collections.length} 条收藏`;
      return;
    }

    list.innerHTML = filtered.map(item => `
      <div class="collection-item" data-id="${item.id}">
        ${item.cover ? `<img src="${item.cover}" class="cover" alt="封面">` : ''}
        <div class="info">
          <div class="title">${escapeHtml(item.title) || '无标题'}</div>
          ${item.author ? `<div class="author">${escapeHtml(item.author)}</div>` : ''}
          ${item.stats && Object.keys(item.stats).length > 0 ? `
            <div class="stats">
              ${item.stats.likes ? `<span>👍 ${item.stats.likes}</span>` : ''}
              ${item.stats.comments ? `<span>💬 ${item.stats.comments}</span>` : ''}
            </div>
          ` : ''}
          ${item.tags && item.tags.length > 0 ? `
            <div class="tags">
              ${item.tags.slice(0, 3).map(tag => `<span class="tag">#${tag}</span>`).join('')}
            </div>
          ` : ''}
        </div>
        <button class="remove-btn" data-id="${item.id}">×</button>
      </div>
    `).join('');

    document.querySelectorAll('.remove-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeCollection(btn.dataset.id);
      });
    });

    document.getElementById('itemCount').textContent = `共 ${collections.length} 条收藏`;
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

  async function removeCollection(id) {
    collections = collections.filter(item => item.id !== id);
    try {
      await chrome.storage.local.set({ [STORAGE_KEYS.COLLECTIONS]: collections });
    } catch (e) {}
    renderCollections();
    updateTagFilter();
    showToast('已删除');
  }

  async function clearCollectionsForTesting() {
    if (collections.length === 0) {
      showToast('当前没有收藏内容');
      return;
    }

    if (!confirm('确定清空当前 popup 收藏缓存吗？此操作仅清空本地列表，方便重新抓取测试。')) {
      return;
    }

    collections = [];
    try {
      await chrome.storage.local.set({ [STORAGE_KEYS.COLLECTIONS]: [] });
    } catch (e) {}
    renderCollections();
    updateTagFilter();
    showToast('已清空收藏缓存');
  }

  function escapeHtml(text) {
    if (!text) return '';
    return String(text).replace(/[&<>"']/g, char => {
      const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
      return entities[char] || char;
    });
  }

  function showToast(message) {
    const existingToast = document.querySelector('.toast');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }
})();
