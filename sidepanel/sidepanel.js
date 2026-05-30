import { STORAGE_KEYS, DEFAULT_SETTINGS, PET_MODES } from '../shared/constants.js';
import { escapeHtml, generateTags, exportToMarkdown, saveToStorage, loadFromStorage } from '../shared/utils.js';

let collections = [];
let settings = { ...DEFAULT_SETTINGS };
let currentView = 'all';
let searchTerm = '';
let selectedTag = '';
let sortOrder = 'newest';

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
  updateStats();
}

function initEventListeners() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => switchView(item.dataset.view));
  });

  document.getElementById('searchInput').addEventListener('input', (e) => {
    searchTerm = e.target.value;
    renderCollections();
  });

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
}

function updateUI() {
  const moodText = {
    [PET_MODES.QUIET]: '安静待机',
    [PET_MODES.COMPANION]: '心情愉悦',
    [PET_MODES.ACTIVE]: '活力满满'
  };
  document.getElementById('petMood').textContent = moodText[settings.petMode] || '心情愉悦';
  document.getElementById('allBadge').textContent = collections.length;
}

function switchView(view) {
  currentView = view;
  
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.view === view);
  });

  const emptyState = document.getElementById('emptyState');
  const collectionGrid = document.getElementById('collectionGrid');
  const statsView = document.getElementById('statsView');

  if (view === 'stats') {
    emptyState.style.display = 'none';
    collectionGrid.style.display = 'none';
    statsView.style.display = 'block';
    updateStats();
  } else {
    emptyState.style.display = 'none';
    collectionGrid.style.display = 'grid';
    statsView.style.display = 'none';
    renderCollections();
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

  switch (sortOrder) {
    case 'newest':
      filtered.sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0));
      break;
    case 'oldest':
      filtered.sort((a, b) => new Date(a.savedAt || 0) - new Date(b.savedAt || 0));
      break;
    case 'title':
      filtered.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      break;
  }

  return filtered;
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
        ${item.stats && Object.keys(item.stats).length > 0 ? `
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
  await saveToStorage(STORAGE_KEYS.COLLECTIONS, collections);
  renderCollections();
  updateTagFilter();
  updateStats();
  updateUI();
}

function exportAll() {
  if (collections.length === 0) {
    alert('没有可导出的内容');
    return;
  }

  const markdown = exportToMarkdown(collections);
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `xhs-knowledge-base-${new Date().toISOString().split('T')[0]}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

async function clearAll() {
  if (!confirm('确定要清空所有收藏吗？此操作不可恢复。')) return;
  
  collections = [];
  await saveToStorage(STORAGE_KEYS.COLLECTIONS, []);
  renderCollections();
  updateTagFilter();
  updateStats();
  updateUI();
}

setInterval(async () => {
  const newCollections = await loadFromStorage(STORAGE_KEYS.COLLECTIONS, []);
  if (JSON.stringify(newCollections) !== JSON.stringify(collections)) {
    collections = newCollections;
    renderCollections();
    updateTagFilter();
    updateStats();
    updateUI();
  }
}, 2000);
