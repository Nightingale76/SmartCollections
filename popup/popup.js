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

  document.addEventListener('DOMContentLoaded', async () => {
    await loadSettings();
    await loadCollections();
    initEventListeners();
    updateUI();
  });

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
            item.savedAt = new Date().toISOString();
            collections.push(item);
            addedCount++;
          }
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
      const newTags = await AI_TAGS.generateClassificationTags(item, { includeImage: false });
      
      if (JSON.stringify(newTags) !== JSON.stringify(item.tags)) {
        item.tags = newTags;
        updatedCount++;
        
        try {
          await chrome.storage.local.set({ [STORAGE_KEYS.COLLECTIONS]: collections });
        } catch (e) {}
        
        renderCollections();
        updateTagFilter();
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
