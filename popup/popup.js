import { STORAGE_KEYS, DEFAULT_SETTINGS, PET_STATES, PET_MODES } from '../shared/constants.js';
import { escapeHtml, generateTags, exportToMarkdown, saveToStorage, loadFromStorage } from '../shared/utils.js';

let collections = [];
let settings = { ...DEFAULT_SETTINGS };
let searchTerm = '';
let selectedTag = '';

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await loadCollections();
  initEventListeners();
  updateUI();
});

async function loadSettings() {
  settings = await loadFromStorage(STORAGE_KEYS.SETTINGS, DEFAULT_SETTINGS);
}

async function loadCollections() {
  collections = await loadFromStorage(STORAGE_KEYS.COLLECTIONS, []);
  renderCollections();
  updateTagFilter();
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

  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => switchMode(btn.dataset.mode));
  });
}

function updateUI() {
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === settings.petMode);
  });

  const modeText = {
    [PET_MODES.QUIET]: '安静模式',
    [PET_MODES.COMPANION]: '陪伴模式',
    [PET_MODES.ACTIVE]: '活跃模式'
  };
  document.querySelector('.mode-text').textContent = modeText[settings.petMode] || '陪伴模式';
}

async function switchMode(mode) {
  settings.petMode = mode;
  await saveToStorage(STORAGE_KEYS.SETTINGS, settings);
  updateUI();

  chrome.runtime.sendMessage({
    action: 'update_pet_state',
    petMode: mode
  });
}

async function extractCollections() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab.url.includes('xiaohongshu.com')) {
    showToast('请在小红书页面使用');
    return;
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'extractCollections' });

    if (response && response.success && response.data.length > 0) {
      let addedCount = 0;

      for (const item of response.data) {
        const existingIndex = collections.findIndex(c => c.id === item.id);

        if (existingIndex === -1) {
          item.tags = generateTags(item.title || '');
          item.savedAt = new Date().toISOString();
          collections.push(item);
          addedCount++;
        }
      }

      await saveToStorage(STORAGE_KEYS.COLLECTIONS, collections);
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
  let updatedCount = 0;

  for (const item of collections) {
    const newTags = generateTags(item.title || '');
    if (JSON.stringify(newTags) !== JSON.stringify(item.tags)) {
      item.tags = newTags;
      updatedCount++;
    }
  }

  await saveToStorage(STORAGE_KEYS.COLLECTIONS, collections);
  renderCollections();
  updateTagFilter();
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
  const markdown = exportToMarkdown(filtered);

  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `xhs-knowledge-base-${new Date().toISOString().split('T')[0]}.md`;
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
  await saveToStorage(STORAGE_KEYS.COLLECTIONS, collections);
  renderCollections();
  updateTagFilter();
  showToast('已删除');
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

window.removeCollection = removeCollection;
