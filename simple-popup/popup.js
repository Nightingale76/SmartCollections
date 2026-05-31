let collections = [];
let searchTerm = '';
let selectedTag = '';
let selectedFolder = '';
let manageMode = false;

const THEME_STORAGE_KEY = 'memora_simple_theme';
const AVAILABLE_THEMES = ['douyin', 'redbook', 'bilibili'];
const XHS_LAST_COLLECTION_PAGES_KEY = 'memora_simple_last_collection_pages';
const COLLECTIONS_KEY = 'memora_simple_collections';

const AI_CONFIG = window.SMART_COLLECTIONS_AI_CONFIG || {};
const DEFAULT_TAG = '其他';
const DEFAULT_FOLDER = '其他';
const FOLDERS_KEY = 'memora_simple_folders';

// preset folders to include common categories for 小红书 / 抖音 (used as initial defaults)
const PRESET_FOLDERS = ['美妆', '穿搭', '数码', '游戏', '旅游', '学习', '美食', '摄影', '家居', '健身', '音乐', '影视', '汽车', '母婴', '理财', '宠物', '手作', '情感'];

// unified folders list (persisted). Initialize from storage or fall back to presets.
let FOLDERS = [];
// pending deletion (for undo)
let pendingDeletedFolder = null; // { folder, itemIds, timeoutId }
// inline editing state
let editingFolder = null;

async function loadFoldersFromStorage() {
  try {
    const res = await chrome.storage.local.get(FOLDERS_KEY);
    const stored = res[FOLDERS_KEY];
    if (Array.isArray(stored) && stored.length > 0) {
      FOLDERS = stored.filter(Boolean).map(f => String(f).trim()).filter(Boolean);
    } else {
      // use presets as initial choices
      FOLDERS = PRESET_FOLDERS.slice();
    }
  } catch (err) {
    console.warn('loadFoldersFromStorage failed', err);
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

const TAG_RULES = [
  { tags: ['美食', '菜谱', '餐厅', '做饭', '烹饪', '甜点', '下午茶'], keywords: ['吃', '美食', '菜谱', '餐厅', '做饭', '烹饪', '甜点', '下午茶', '早餐', '午餐', '晚餐', '探店', '打卡', '食谱', '教程'] },
  { tags: ['旅行', '攻略'], keywords: ['旅行', '旅游', '攻略', '打卡', '景点', '酒店', '民宿', '周末', '假期', '出游', '周边游', '自驾'] },
  { tags: ['穿搭', '时尚'], keywords: ['穿搭', '时尚', '衣服', '搭配', '女装', '男装', '鞋子', '包包', '配饰', '购物', '品牌'] },
  { tags: ['美妆', '护肤'], keywords: ['美妆', '护肤', '化妆品', '口红', '粉底', '面膜', '精华', '眼霜', '防晒', '水乳', '彩妆'] },
  { tags: ['家居', '装修'], keywords: ['家居', '装修', '装饰', '收纳', '家具', '软装', '改造', '设计', '北欧', 'ins风'] },
  { tags: ['数码', '科技'], keywords: ['数码', '手机', '电脑', '耳机', '相机', '测评', '开箱', '黑科技', 'APP', '软件'] },
  { tags: ['健身', '运动'], keywords: ['健身', '运动', '减肥', '瑜伽', '跑步', '减脂', '增肌', '训练', '健康', '饮食'] },
  { tags: ['读书', '学习'], keywords: ['读书', '书单', '学习', '考研', '备考', '笔记', '效率', '时间管理', '知识', '成长'] },
  { tags: ['摄影', '拍照'], keywords: ['摄影', '拍照', '相机', '滤镜', '教程', '技巧', '风景', '人像', 'vlog'] },
  { tags: ['职场', '求职'], keywords: ['职场', '求职', '面试', '简历', '工作', '晋升', '薪资', '经验', '技巧'] }
];

const EXTRA_TAG_RULES = [
  { tags: ['影视', '剪辑'], keywords: ['电影', '电视剧', '追剧', '综艺', '剪辑', '混剪', '片段', '预告', '影评', '剧评'] },
  { tags: ['音乐'], keywords: ['音乐', '唱歌', '歌曲', '歌单', '演唱会', '乐队', '钢琴', '吉他', '翻唱'] },
  { tags: ['宠物'], keywords: ['宠物', '猫', '狗', '猫咪', '狗狗', '铲屎', '喂养', '训犬'] },
  { tags: ['汽车'], keywords: ['汽车', '买车', '车主', '试驾', '新能源', '电车', '油车', '驾驶', '停车'] },
  { tags: ['母婴'], keywords: ['宝宝', '育儿', '母婴', '带娃', '怀孕', '孕期', '儿童', '早教'] },
  { tags: ['手作'], keywords: ['手作', '手工', 'diy', '编织', '黏土', '钩针', '教程', '改造'] },
  { tags: ['理财'], keywords: ['理财', '基金', '股票', '存钱', '省钱', '预算', '投资', '工资'] },
  { tags: ['情感'], keywords: ['情感', '恋爱', '分手', '婚姻', '情侣', '相亲', '关系'] },
  { tags: ['素材', '剪辑'], keywords: ['素材', '模板', '壁纸', '头像', '背景图', '转场', '调色', '滤镜'] },
  { tags: ['舞蹈', '运动'], keywords: ['舞蹈', '跳舞', '编舞', '燃脂操', '普拉提', '拉伸'] }
];

function generateTags(text) {
  const result = [];
  const lowerTitle = String(text || '').toLowerCase();
  
  for (const rule of [...TAG_RULES, ...EXTRA_TAG_RULES]) {
    for (const keyword of rule.keywords) {
      if (lowerTitle.includes(keyword.toLowerCase())) {
        result.push(...rule.tags);
        break;
      }
    }
  }
  
  return [...new Set(result)];
}

const FOLDER_RULES = [
  { folder: '美妆', keywords: ['美妆', '护肤', '化妆', '口红', '粉底', '面膜', '精华', '眼霜', '防晒', '彩妆'] },
  { folder: '穿搭', keywords: ['穿搭', '时尚', '衣服', '搭配', '女装', '男装', '鞋子', '包包', '配饰', '品牌'] },
  { folder: '数码', keywords: ['数码', '手机', '电脑', '耳机', '相机', '测评', '开箱', '科技', 'ai', 'app', '软件', '算法', '编程'] },
  { folder: '游戏', keywords: ['游戏', '手游', '主机', '电竞', '原神', '王者', 'steam', '攻略', '副本', '赛季'] },
  { folder: '旅游', keywords: ['旅行', '旅游', '攻略', '景点', '酒店', '民宿', '周末', '假期', '出游', '自驾', '打卡'] },
  { folder: '学习', keywords: ['学习', '读书', '书单', '考研', '备考', '考试', '高考', '英语', '笔记', '教程', '课程', '知识', '职场', '求职'] }
];

function normalizeFolder(folder, fallback = DEFAULT_FOLDER) {
  const value = String(folder || '').replace(/^#/, '').trim();
  if (!value) return fallback;

  const synonymMap = {
    护肤: '美妆',
    彩妆: '美妆',
    时尚: '穿搭',
    科技: '数码',
    软件: '数码',
    教程: '学习',
    教育: '学习',
    考试: '学习',
    旅行: '旅游',
    攻略: '旅游'
  };

  const normalized = synonymMap[value] || value;
  const combined = new Set(FOLDERS);
  return combined.has(normalized) ? normalized : fallback;
}

function getLocalFolderForItem(item) {
  const text = [
    item.title,
    item.author,
    item.excerpt,
    item.url,
    ...(Array.isArray(item.tags) ? item.tags : [])
  ].join(' ').toLowerCase();

  for (const rule of FOLDER_RULES) {
    if (rule.keywords.some(keyword => text.includes(keyword.toLowerCase()))) {
      return rule.folder;
    }
  }

  return DEFAULT_FOLDER;
}

function getLocalClassificationForItem(item) {
  return {
    folder: getLocalFolderForItem(item),
    tags: getLocalTagsForItem(item)
  };
}

function getAiEndpoint() {
  if (AI_CONFIG.endpoint) {
    return AI_CONFIG.endpoint;
  }

  const baseUrl = AI_CONFIG.baseUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
  return `${baseUrl.replace(/\/$/, '')}/chat/completions`;
}

function buildClassificationPrompt(item, mode = 'full') {
  // mode: 'full' (folder+tags), 'folder' (only folder), 'tags' (only tags)
  const base = [
    '你是一名面向小红书/抖音收藏内容的分类器。',
    '请根据给定信息判断内容的一级收藏夹（folder）和/或若干话题标签（tags）。',
    '如果内容同时涉及多个大分区，只选择一个最主要的 folder（非常重要），并把其他相关领域作为 tags 输出。',
    '不要生成标题或解释，只输出严格的 JSON 对象。',
    `只有完全无法判断 folder 时才使用 "${DEFAULT_FOLDER}"；只有完全无法判断 tags 时才输出 ["${DEFAULT_TAG}"]。`,
    '话题标签优先使用稳定分类词汇，同时允许根据小红书/抖音市场流行话题扩展标签（例如配色、OOTD、二次元、开箱等）。',
    '避免泛标签：生活、分享、小红书、收藏、笔记、推荐。',
    ''
  ];

  if (mode === 'folder') {
    base.push('仅输出 JSON: {"folder":"<一级分类>"}，folder 必须从这些选项中选择：美妆、穿搭、数码、游戏、旅游、学习、其他。');
  } else if (mode === 'tags') {
    base.push('仅输出 JSON: {"tags":["标签1","标签2"]}，输出 1 到 5 个中文话题标签，每个 2 到 6 个字。');
  } else {
    base.push('输出 JSON: {"folder":"学习","tags":["标签1","标签2","标签3"]}。folder 必须从这些选项中选择：美妆、穿搭、数码、游戏、旅游、学习、其他。');
    base.push('输出 2 到 5 个中文话题标签，每个标签 2 到 6 个字；如果信息很少，也至少输出 1 个最接近的话题。');
  }

  base.push(`标题：${item.title || '无'}`);
  base.push(`内容形态：${item.mediaType || '未知'}`);
  base.push(`作者：${item.author || '无'}`);
  base.push(`链接：${item.url || '无'}`);
  base.push(`可见文本：${item.excerpt || '无'}`);
  base.push(`是否有封面图：${item.cover ? '有' : '无'}`);

  return base.join('\n');
}

function parseJsonObject(text) {
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch (error) {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch (innerError) {
      return null;
    }
  }
}

function normalizeTags(tags) {
  return [...new Set(
    (Array.isArray(tags) ? tags : [])
      .map(tag => String(tag || '').replace(/^#/, '').trim())
      .filter(tag => tag.length > 0 && tag.length <= 20)
  )].slice(0, 5);
}

function ensureTags(tags) {
  const normalized = normalizeTags(tags);
  return normalized.length > 0 ? normalized : [DEFAULT_TAG];
}

function removeDefaultTagWhenSpecific(tags) {
  const normalized = ensureTags(tags);
  return normalized.length > 1
    ? normalized.filter(tag => tag !== DEFAULT_TAG)
    : normalized;
}

function getMessageText(message) {
  if (typeof message === 'string') {
    return message;
  }

  if (Array.isArray(message)) {
    return message
      .map(part => {
        if (typeof part === 'string') return part;
        return part?.text || part?.content || '';
      })
      .join('\n');
  }

  return message?.text || message?.content || '';
}

const AI_REQUEST_TIMEOUT_MS = 15000;

function getLocalTagsForItem(item) {
  return ensureTags(generateTags([
    item.title,
    item.author,
    item.excerpt,
    item.url
  ].join(' ')));
}

async function fetchWithTimeout(url, options, timeoutMs = AI_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function normalizeClassification(parsed, item) {
  const local = getLocalClassificationForItem(item);
  const folder = normalizeFolder(parsed?.folder, local.folder);
  const aiTags = removeDefaultTagWhenSpecific(parsed?.tags);
  const tags = aiTags.length > 0 && !aiTags.includes(DEFAULT_TAG) ? aiTags : local.tags;

  return {
    folder: folder || local.folder,
    tags
  };
}

async function generateClassification(item, options = {}) {
  // options: { includeImage, mode } where mode = 'full'|'folder'|'tags'
  const { includeImage = false, mode = 'full' } = options;
  const localClassification = getLocalClassificationForItem(item);

  if (!AI_CONFIG.apiKey) {
    // fallback to local classification depending on mode
    if (mode === 'folder') return { folder: localClassification.folder };
    if (mode === 'tags') return { tags: localClassification.tags };
    return localClassification;
  }

  const prompt = buildClassificationPrompt(item, mode === 'folder' ? 'folder' : mode === 'tags' ? 'tags' : 'full');
  const content = [{ type: 'text', text: prompt }];
  if (includeImage && item.cover) {
    content.push({ type: 'image_url', image_url: { url: item.cover } });
  }

  try {
    const response = await fetchWithTimeout(getAiEndpoint(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${AI_CONFIG.apiKey}`
      },
      body: JSON.stringify({
        model: AI_CONFIG.model || 'qwen-plus',
        messages: [ { role: 'user', content } ],
        temperature: 0.1,
        top_p: 0.8
      })
    });

    if (!response.ok) {
      throw new Error(`AI request failed: ${response.status}`);
    }

    const data = await response.json();
    const message = data?.choices?.[0]?.message?.content;
    const parsed = parseJsonObject(getMessageText(message));

    if (mode === 'folder') {
      const folder = normalizeFolder(parsed?.folder, localClassification.folder);
      return { folder };
    }

    if (mode === 'tags') {
      const tags = ensureTags(parsed?.tags || localClassification.tags);
      return { tags };
    }

    // full
    return normalizeClassification(parsed, item);
  } catch (error) {
    console.warn('AI classification failed, fallback to local classification:', error);
    if (mode === 'folder') return { folder: localClassification.folder };
    if (mode === 'tags') return { tags: localClassification.tags };
    return localClassification;
  }
}

function setClassificationStatus(message) {
  const statusEl = document.getElementById('classificationStatus');
  if (!statusEl) return;

  if (message) {
    statusEl.textContent = message;
    statusEl.hidden = false;
  } else {
    statusEl.textContent = '';
    statusEl.hidden = true;
  }
}

async function applyClassificationTags(items, options = {}) {
  const { includeImage = false, onItemDone, mode = 'full' } = options;

  for (let index = 0; index < items.length; index += 1) {
    setClassificationStatus(`正在生成分类 ${index + 1}/${items.length}…`);
    const classification = await generateClassification(items[index], { includeImage, mode: mode === 'folder-only' ? 'folder' : mode === 'tags-only' ? 'tags' : 'full' });

    if (mode === 'folder-only' || mode === 'full') {
      if (classification.folder) items[index].folder = normalizeFolder(classification.folder);
    }

    if (mode === 'tags-only' || mode === 'full') {
      if (classification.tags) items[index].tags = ensureTags(classification.tags);
    }

    if (typeof onItemDone === 'function') {
      await onItemDone(items[index], index, items.length);
    }
  }

  setClassificationStatus('');
}

function showToast(message, opts = {}) {
  const { actionLabel, actionCallback, duration = (actionLabel ? 8000 : 2000) } = opts;
  const existingToast = document.querySelector('.toast');
  if (existingToast) existingToast.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<span class="toast-msg"></span>`;
  toast.querySelector('.toast-msg').textContent = message;

  if (actionLabel && typeof actionCallback === 'function') {
    const btn = document.createElement('button');
    btn.className = 'toast-action';
    btn.textContent = actionLabel;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      try { actionCallback(); } catch (err) { console.error(err); }
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 200);
    });
    toast.appendChild(btn);
  }

  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

async function loadCollections() {
  const result = await chrome.storage.local.get(COLLECTIONS_KEY);
  collections = (result[COLLECTIONS_KEY] || []).map(item => ({
    ...item,
    folder: normalizeFolder(item.folder || getLocalFolderForItem(item)),
    tags: ensureTags(item.tags)
  }));
  await chrome.storage.local.set({ [COLLECTIONS_KEY]: collections });
  renderCollections();
  updateTagFilter();
}

function applyTheme(theme) {
  const selectedTheme = AVAILABLE_THEMES.includes(theme) ? theme : 'douyin';
  document.body.classList.remove('theme-redbook', 'theme-bilibili');

  if (selectedTheme !== 'douyin') {
    document.body.classList.add(`theme-${selectedTheme}`);
  }

  document.querySelectorAll('[data-theme]').forEach(button => {
    button.classList.toggle('active', button.dataset.theme === selectedTheme);
  });
}

async function initThemeSwitcher() {
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  const themeMenu = document.getElementById('themeMenu');
  if (!themeToggleBtn || !themeMenu) return;

  const result = await chrome.storage.local.get(THEME_STORAGE_KEY);
  applyTheme(result[THEME_STORAGE_KEY] || 'douyin');

  themeToggleBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    const isOpen = themeMenu.hidden;
    themeMenu.hidden = !isOpen;
    themeToggleBtn.setAttribute('aria-expanded', String(isOpen));
  });

  themeMenu.addEventListener('click', async (event) => {
    const option = event.target.closest('[data-theme]');
    if (!option) return;

    const theme = option.dataset.theme;
    applyTheme(theme);
    themeMenu.hidden = true;
    themeToggleBtn.setAttribute('aria-expanded', 'false');
    await chrome.storage.local.set({ [THEME_STORAGE_KEY]: theme });
  });

  document.addEventListener('click', () => {
    themeMenu.hidden = true;
    themeToggleBtn.setAttribute('aria-expanded', 'false');
  });
}

function updateTagFilter() {
  const tagFilter = document.getElementById('tagFilter');
  const allTags = [...new Set(collections.flatMap(item => ensureTags(item.tags)))];
  
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

function getFolderCounts() {
  return collections.reduce((counts, item) => {
    const folder = normalizeFolder(item.folder || getLocalFolderForItem(item));
    counts.set(folder, (counts.get(folder) || 0) + 1);
    return counts;
  }, new Map());
}

function renderFolders() {
  const folderList = document.getElementById('folderList');
  if (!folderList) return;
  const counts = getFolderCounts();
  // build buttons: All, then user-created folders, then preset folders that have items, then Other
  const folderButtons = [ { folder: '', label: '全部收藏', count: collections.length, className: 'all' } ];

  // show all folders from unified FOLDERS list
  for (const folder of FOLDERS) {
    if (folder === DEFAULT_FOLDER) continue; // always render DEFAULT_FOLDER at end
    const count = counts.get(folder) || 0;
    folderButtons.push({ folder, label: folder, count, className: '' });
  }

  // ensure default folder present at bottom
  folderButtons.push({ folder: DEFAULT_FOLDER, label: DEFAULT_FOLDER, count: counts.get(DEFAULT_FOLDER) || 0, className: 'other' });

  folderList.innerHTML = folderButtons.map(item => `
    <button class="folder-btn ${item.className} ${selectedFolder === item.folder ? 'active' : ''}" type="button" data-folder="${escapeHtml(item.folder)}">
      ${editingFolder === item.folder ? (`<input class="folder-edit-input" data-old="${escapeHtml(item.folder)}" value="${escapeHtml(item.label)}">`) : (`<span class="folder-name">${escapeHtml(item.label)}</span>`)}
      <span class="folder-count">${item.count}</span>
      <button class="remove-folder" data-folder="${escapeHtml(item.folder)}" title="删除收藏夹">✕</button>
    </button>
  `).join('');

  // attach drag/drop handlers to folder buttons
  folderList.querySelectorAll('.folder-btn').forEach(btn => {
    btn.addEventListener('dragover', (e) => {
      e.preventDefault();
      btn.classList.add('dragover');
    });
    btn.addEventListener('dragleave', () => btn.classList.remove('dragover'));
    btn.addEventListener('drop', (e) => {
      e.preventDefault();
      btn.classList.remove('dragover');
      const folder = btn.dataset.folder || '';
      const id = e.dataTransfer.getData('text/plain');
      if (!id) return;
      const idx = collections.findIndex(i => String(i.id) === String(id));
      if (idx === -1) return;
      collections[idx].folder = folder || DEFAULT_FOLDER;
      saveCollectionsAndRender();
      showToast('已移动收藏到 ' + (folder || '全部收藏'));
    });
  });

  // attach remove-folder handlers
  folderList.querySelectorAll('.remove-folder').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const folder = btn.dataset.folder;
      if (!folder) return;
      if (folder === DEFAULT_FOLDER) { showToast('无法删除默认分区'); return; }
      if (!confirm(`确认删除收藏夹 “${folder}”？被删除的分类不会删除收藏内容，但会将未移动的条目归为“${DEFAULT_FOLDER}”。`)) return;
      removeFolder(folder);
    });
  });

  // in manage mode, enable double-click rename on folder buttons
  folderList.querySelectorAll('.folder-btn').forEach(btn => {
    btn.addEventListener('dblclick', (e) => {
      if (!manageMode) return;
      const folder = btn.dataset.folder;
      if (!folder || folder === DEFAULT_FOLDER) return;
      editingFolder = folder;
      renderFolders();
      // focus the input
      const input = folderList.querySelector('.folder-edit-input');
      if (input) {
        input.focus();
        input.setSelectionRange(0, input.value.length);
      }
    });
  });

  // bind inline edit events
  folderList.querySelectorAll('.folder-edit-input').forEach(input => {
    const oldName = input.dataset.old;
    const commit = async () => {
      const v = String(input.value || '').trim();
      editingFolder = null;
      if (!v || v === oldName) { renderFolders(); return; }
      await renameFolder(oldName, v);
    };
    input.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        await commit();
      } else if (e.key === 'Escape') {
        editingFolder = null;
        renderFolders();
      }
    });
    input.addEventListener('blur', () => commit());
  });
}

async function addFolder(name) {
  const n = String(name || '').trim();
  if (!n) return;
  const combined = new Set(FOLDERS);
  if (combined.has(n) || n === DEFAULT_FOLDER) {
    showToast('收藏夹已存在');
    return;
  }
  FOLDERS.push(n);
  await saveFoldersToStorage();
  renderFolders();
}

async function removeFolder(name) {
  const n = String(name || '').trim();
  if (!n) return;

  // backup affected items for undo
  const affectedIds = collections.filter(item => normalizeFolder(item.folder) === n).map(i => i.id);

  // remove folder from list and move items to default
  FOLDERS = (FOLDERS || []).filter(f => f !== n);
  collections.forEach(item => {
    if (normalizeFolder(item.folder) === n) item.folder = DEFAULT_FOLDER;
  });

  await saveFoldersToStorage();
  await chrome.storage.local.set({ [COLLECTIONS_KEY]: collections });
  renderCollections();
  updateTagFilter();

  // set pending delete to allow undo
  if (pendingDeletedFolder && pendingDeletedFolder.timeoutId) {
    clearTimeout(pendingDeletedFolder.timeoutId);
  }
  pendingDeletedFolder = {
    folder: n,
    itemIds: affectedIds,
    timeoutId: setTimeout(() => {
      pendingDeletedFolder = null;
      showToast('已永久删除');
    }, 8000)
  };

  showToast(`已删除收藏夹：${n}`, { actionLabel: '撤销', actionCallback: undoDelete, duration: 8000 });
}

function undoDelete() {
  if (!pendingDeletedFolder) return;
  const { folder, itemIds, timeoutId } = pendingDeletedFolder;
  if (timeoutId) clearTimeout(timeoutId);

  // restore folder if not exists
  if (!FOLDERS.includes(folder)) FOLDERS.push(folder);

  // move items back
  collections.forEach(item => {
    if (itemIds.includes(item.id)) item.folder = folder;
  });

  pendingDeletedFolder = null;
  saveFoldersToStorage();
  chrome.storage.local.set({ [COLLECTIONS_KEY]: collections });
  renderCollections();
  updateTagFilter();
  showToast('已撤销删除');
}

async function renameFolder(oldName, newName) {
  const o = String(oldName || '').trim();
  const n = String(newName || '').trim();
  if (!o || !n) return;
  if (FOLDERS.includes(n)) {
    showToast('目标名称已存在');
    return;
  }
  FOLDERS = FOLDERS.map(f => (f === o ? n : f));
  // update item folders
  collections.forEach(item => {
    if (normalizeFolder(item.folder) === o) item.folder = n;
  });
  await saveFoldersToStorage();
  await chrome.storage.local.set({ [COLLECTIONS_KEY]: collections });
  renderCollections();
  updateTagFilter();
}

function filterCollections() {
  let filtered = collections;

  if (selectedFolder) {
    filtered = filtered.filter(item =>
      normalizeFolder(item.folder || getLocalFolderForItem(item)) === selectedFolder
    );
  }
  
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
  renderFolders();
  const filtered = filterCollections();
  
  if (filtered.length === 0) {
    list.innerHTML = '<p class="empty-hint">暂无收藏内容</p>';
    document.getElementById('itemCount').textContent = collections.length ? `共 0/${collections.length} 条收藏` : '共 0 条收藏';
    return;
  }
  
  list.innerHTML = filtered.map(item => {
    const tagsHtml = ensureTags(item.tags).map(tag => {
      if (manageMode) {
        return `<span class="tag" data-item-id="${escapeHtml(item.id)}" data-tag="${escapeHtml(tag)}"><span class="tag-text">#${escapeHtml(tag)}</span><button class="tag-remove" data-item-id="${escapeHtml(item.id)}" data-tag="${escapeHtml(tag)}">×</button></span>`;
      }

      return `<span class="tag">#${escapeHtml(tag)}</span>`;
    }).join('');

    const addBtn = manageMode ? `<button class="tag-add" data-item-id="${escapeHtml(item.id)}">+</button>` : '';

    return `
    <div draggable="true" class="collection-item ${manageMode ? 'manage-mode' : ''}" data-id="${escapeHtml(item.id)}" data-url="${escapeHtml(item.url || '')}" data-dom-index="${Number.isInteger(item.domIndex) ? item.domIndex : ''}" title="${item.url ? 'Open original' : ''}">
      ${item.cover ? `<img src="${item.cover}" class="cover" alt="封面">` : ''}
      <div class="info">
        <div class="title">${escapeHtml(item.title) || '无标题'}</div>
        ${item.author ? `<div class="author">${escapeHtml(item.author)}</div>` : ''}
        ${item.stats && Object.keys(item.stats).length > 0 ? `
          <div class="stats">
            ${item.stats.likes ? `<span>👍 ${item.stats.likes}</span>` : ''}
            ${item.stats.comments ? `<span>💬 ${item.stats.comments}</span>` : ''}
            ${item.stats.collection ? `<span>📌 ${item.stats.collection}</span>` : ''}
          </div>
        ` : ''}
        <div class="tags">
          ${tagsHtml}${addBtn}
        </div>
      </div>
    </div>
  `;
  }).join('');

  // attach dragstart listeners so items can be moved into folders
  list.querySelectorAll('.collection-item').forEach(el => {
    el.addEventListener('dragstart', (e) => {
      const id = el.dataset.id;
      if (!id) return;
      e.dataTransfer.setData('text/plain', String(id));
      try { e.dataTransfer.effectAllowed = 'move'; } catch (err) {}
    });
  });
  
  document.getElementById('itemCount').textContent = filtered.length === collections.length
    ? `共 ${collections.length} 条收藏`
    : `共 ${filtered.length}/${collections.length} 条收藏`;
}

async function saveCollectionsAndRender() {
  await chrome.storage.local.set({ [COLLECTIONS_KEY]: collections });
  renderCollections();
  updateTagFilter();
}

function removeTagFromItem(itemId, tag) {
  const idx = collections.findIndex(i => String(i.id) === String(itemId));
  if (idx === -1) return;
  const item = collections[idx];
  item.tags = ensureTags((item.tags || []).filter(t => t !== tag));
  collections[idx] = item;
  saveCollectionsAndRender();
  showToast('已删除标签');
}

function addTagToItem(itemId, newTag) {
  newTag = String(newTag || '').replace(/^#/, '').trim();
  if (!newTag) {
    showToast('标签不能为空');
    return;
  }

  const idx = collections.findIndex(i => String(i.id) === String(itemId));
  if (idx === -1) return;
  const item = collections[idx];
  const existing = normalizeTags(item.tags || []);
  if (existing.includes(newTag)) {
    showToast('标签已存在');
    return;
  }
  existing.unshift(newTag);
  item.tags = ensureTags(existing);
  collections[idx] = item;
  saveCollectionsAndRender();
  showToast('已添加标签');
}

function replaceTagOnItem(itemId, oldTag, newTag) {
  newTag = String(newTag || '').replace(/^#/, '').trim();
  if (!newTag) {
    showToast('标签不能为空');
    return;
  }

  const idx = collections.findIndex(i => String(i.id) === String(itemId));
  if (idx === -1) return;
  const item = collections[idx];
  const tags = normalizeTags(item.tags || []).map(t => (t === oldTag ? newTag : t));
  // Remove duplicates after replace
  item.tags = ensureTags(tags);
  collections[idx] = item;
  saveCollectionsAndRender();
  showToast('已更新标签');
}

function showAddTagInput(itemId) {
  const itemEl = document.querySelector(`.collection-item[data-id="${CSS.escape(itemId)}"]`);
  if (!itemEl) return;
  const tagsContainer = itemEl.querySelector('.tags');
  if (!tagsContainer) return;
  // prevent duplicate input
  if (tagsContainer.querySelector('.tag-input')) return;

  const input = document.createElement('input');
  input.className = 'tag-input';
  input.placeholder = '输入新标签';
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const v = input.value.trim();
      if (v) addTagToItem(itemId, v);
      input.remove();
    } else if (e.key === 'Escape') {
      input.remove();
    }
  });
  input.addEventListener('blur', () => {
    const v = input.value.trim();
    if (v) addTagToItem(itemId, v);
    input.remove();
  });

  tagsContainer.appendChild(input);
  input.focus();
}

function showEditTagInput(itemId, oldTag, tagEl) {
  if (!tagEl) return;
  // prevent multiple inputs
  if (tagEl.querySelector('.tag-input')) return;
  const input = document.createElement('input');
  input.className = 'tag-input';
  input.value = oldTag;
  // replace content
  tagEl.innerHTML = '';
  tagEl.appendChild(input);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const v = input.value.trim();
      if (v) replaceTagOnItem(itemId, oldTag, v);
    } else if (e.key === 'Escape') {
      renderCollections();
    }
  });

  input.addEventListener('blur', () => {
    const v = input.value.trim();
    if (v) replaceTagOnItem(itemId, oldTag, v);
    else renderCollections();
  });

  input.focus();
  input.select();
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text).replace(/[&<>"']/g, char => {
    const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return entities[char] || char;
  });
}

function getXhsNoteIdFromUrl(url) {
  const match = String(url || '').match(/\/(?:explore|note|discovery\/item)\/([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function isXhsNoteDetailUrl(url) {
  return Boolean(getXhsNoteIdFromUrl(url));
}

function normalizeXhsCollectionNoteUrl(url) {
  const value = String(url || '');
  if (!value.includes('xiaohongshu.com') || !getXhsNoteIdFromUrl(value)) {
    return value;
  }

  let normalized = value.replace(/([?&]xsec_token=)([^&#]*)/i, (match, prefix, token) => {
    try {
      return `${prefix}${decodeURIComponent(token)}`;
    } catch (error) {
      return match;
    }
  });

  if (!/[?&]xsec_source=/i.test(normalized)) {
    normalized += `${normalized.includes('?') ? '&' : '?'}xsec_source=pc_collect`;
  }

  return normalized;
}

function hasXhsXsecToken(url) {
  try {
    return new URL(url).searchParams.has('xsec_token');
  } catch (error) {
    return false;
  }
}

function hasXhsCollectSource(url) {
  return /[?&]xsec_source=pc_collect\b/i.test(String(url || ''));
}

function isXhsCollectionPageUrl(url) {
  const value = String(url || '');
  if (!value.includes('xiaohongshu.com')) return false;
  if (/\/favorites\b|\/collection\b|\/collect\b/i.test(value)) return true;

  try {
    const parsed = new URL(value);
    return /\/user\/profile\//i.test(parsed.pathname) && parsed.searchParams.get('tab') === 'fav';
  } catch (error) {
    return false;
  }
}

async function rememberXhsCollectionPage(tab) {
  if (!tab?.id || !isXhsCollectionPageUrl(tab.url)) return;

  const result = await chrome.storage.local.get(XHS_LAST_COLLECTION_PAGES_KEY);
  const pages = result[XHS_LAST_COLLECTION_PAGES_KEY] || {};
  pages[String(tab.id)] = tab.url;
  await chrome.storage.local.set({ [XHS_LAST_COLLECTION_PAGES_KEY]: pages });
}

async function getRememberedXhsCollectionPage(tabId) {
  const result = await chrome.storage.local.get(XHS_LAST_COLLECTION_PAGES_KEY);
  return result[XHS_LAST_COLLECTION_PAGES_KEY]?.[String(tabId)] || '';
}

async function openCollection(url, domIndex) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const normalizedUrl = typeof url === 'string' && url.includes('xiaohongshu.com')
    ? normalizeXhsCollectionNoteUrl(url)
    : url;

  // If the item is a Douyin link, open it directly in a new tab.
  if (typeof normalizedUrl === 'string' && normalizedUrl.includes('douyin.com')) {
    try {
      await chrome.tabs.create({ url: normalizedUrl });
      return;
    } catch (err) {
      console.warn('open douyin url failed:', err);
    }
  }

  // If current tab is xiaohongshu, prefer in-page open by sending message to content script.
  const isXhs = String(tab?.url || '').includes('xiaohongshu.com');

  if (isXhs) {
    try {
      await rememberXhsCollectionPage(tab);

      if (normalizedUrl && getXhsNoteIdFromUrl(normalizedUrl)) {
        await chrome.tabs.create({ url: normalizedUrl, active: true });
        return;
      }

      if (Number.isInteger(domIndex)) {
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'openCollectionCard', domIndex, url: normalizedUrl });
        if (response?.success) return;
      }

      if (normalizedUrl) {
        // try to ask content script to find and click matching link in page
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'openCollectionUrl', url: normalizedUrl });
        if (response?.success) return;
      }
    } catch (err) {
      console.warn('page open message failed:', err);
    }
  }

  // If we reach here, page-side open failed — do NOT navigate. Notify user instead.
  showToast('无法在当前页面内唤起笔记，请在小红书页面手动点击对应卡片或刷新收藏页');
}


function getCollectionKey(item) {
  return item?.id || item?.url || '';
}

function getItemPlatform(item) {
  const value = `${item?.platform || ''} ${item?.url || ''}`.toLowerCase();
  if (value.includes('douyin.com') || value.includes('抖音') || value.includes('鎶栭煶')) {
    return 'douyin';
  }
  if (value.includes('xiaohongshu.com') || value.includes('小红书') || value.includes('灏忕孩涔')) {
    return 'xhs';
  }
  return '';
}

function getTabPlatform(tabUrl) {
  const value = String(tabUrl || '').toLowerCase();
  if (value.includes('douyin.com')) return 'douyin';
  if (value.includes('xiaohongshu.com')) return 'xhs';
  return '';
}

function resetCollectionsForPlatformIfNeeded(nextPlatform) {
  if (!nextPlatform || collections.length === 0) {
    return;
  }

  const currentPlatform = getItemPlatform(collections[0]);
  if (currentPlatform && currentPlatform !== nextPlatform) {
    collections = [];
  }
}

function mergeExtractedCollections(extractedItems) {
  const existingIndexByKey = new Map();
  collections.forEach((item, index) => {
    const key = getCollectionKey(item);
    if (key) existingIndexByKey.set(key, index);
  });

  const appendedItems = [];

  extractedItems.forEach(item => {
    if (typeof item.url === 'string' && item.url.includes('xiaohongshu.com')) {
      item = {
        ...item,
        url: normalizeXhsCollectionNoteUrl(item.url)
      };
    }

    const key = getCollectionKey(item);
    if (!key) return;

    const existingIndex = existingIndexByKey.get(key);
    if (existingIndex !== undefined) {
      const existing = collections[existingIndex];
      collections[existingIndex] = {
        ...existing,
        ...item,
        folder: normalizeFolder(existing.folder || item.folder || getLocalFolderForItem(item)),
        tags: ensureTags(existing.tags)
      };
      return;
    }

    const nextItem = {
      ...item,
      folder: normalizeFolder(item.folder || getLocalFolderForItem(item)),
      tags: getLocalTagsForItem(item)
    };
    existingIndexByKey.set(key, collections.length);
    collections.push(nextItem);
    appendedItems.push(nextItem);
  });

  return appendedItems;
}

async function extractCollections() {
  const extractBtn = document.getElementById('extractBtn');
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  const supportedSites = ['xiaohongshu.com', 'douyin.com'];
  if (!supportedSites.some(site => tab.url.includes(site))) {
    showToast('请在支持的平台页面使用');
    return;
  }

  if (extractBtn.disabled) {
    return;
  }

  extractBtn.disabled = true;
  
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'extractCollections' });
    
    if (response && response.success && response.data.length > 0) {
      const nextPlatform = getItemPlatform(response.data[0]) || getTabPlatform(tab.url);
      resetCollectionsForPlatformIfNeeded(nextPlatform);
      const appendedItems = mergeExtractedCollections(response.data);

      await chrome.storage.local.set({ [COLLECTIONS_KEY]: collections });
      // classify: first determine folder for all newly fetched items, then generate tags one-by-one
      const toClassify = appendedItems.length ? appendedItems : collections;
      if (toClassify.length > 0) {
        showToast(`已提取 ${collections.length} 条，正在后台生成主分类…`);
        // bulk folder-only pass
        await applyClassificationTags(toClassify, { includeImage: false, mode: 'folder-only' });

        // After folder-only pass: auto-create user folders if AI assigned new dominant folders
        const countsAfter = getFolderCounts();
        const combinedBefore = new Set(FOLDERS);
        const toAdd = [];
        // threshold: at least 2 items or >=5% of all collections
        const thresholdCount = Math.max(2, Math.ceil(collections.length * 0.05));
        for (const [folder, cnt] of countsAfter.entries()) {
          if (!folder) continue;
          if (folder === DEFAULT_FOLDER) continue;
          if (combinedBefore.has(folder)) continue;
          if (cnt >= thresholdCount) {
            toAdd.push(folder);
          }
        }

        if (toAdd.length > 0) {
          toAdd.forEach(f => { if (!FOLDERS.includes(f)) FOLDERS.push(f); });
          await saveFoldersToStorage();
          showToast('已根据收藏习惯创建收藏夹：' + toAdd.join(', '));
        }

        // persist and render after folders assigned
        await chrome.storage.local.set({ [COLLECTIONS_KEY]: collections });
        renderCollections();
        updateTagFilter();

        // then generate tags one-by-one, updating UI per item
        await applyClassificationTags(toClassify, {
          includeImage: false,
          mode: 'tags-only',
          onItemDone: async () => {
            await chrome.storage.local.set({ [COLLECTIONS_KEY]: collections });
            renderCollections();
            updateTagFilter();
          }
        });

        showToast(`完成：共 ${collections.length} 条收藏`);
      } else {
        // nothing to classify
        renderCollections();
        updateTagFilter();
        showToast(`已提取 ${collections.length} 条`);
      }
    } else {
      if (response?.debug) {
        console.info('XHS extraction debug:', response.debug);
      }
      collections = [];
      await chrome.storage.local.set({ [COLLECTIONS_KEY]: collections });
      renderCollections();
      updateTagFilter();
      const debugHint = response?.debug
        ? ` bridge:${response.debug.bridgeItems || 0} links:${response.debug.visibleExploreLinks} cards:${response.debug.visibleDataCards}`
        : '';
      const refreshHint = response?.debug && !response.debug.bridgeItems
        ? '，请在收藏页刷新后重试'
        : '';
      showToast(`未找到收藏内容${debugHint}${refreshHint}`);
    }
  } catch (error) {
    console.error('提取失败:', error);
    showToast('提取失败，请刷新页面重试');
  } finally {
    extractBtn.disabled = false;
    setClassificationStatus('');
  }
}

function exportMarkdown() {
  if (collections.length === 0) {
    showToast('没有可导出的内容');
    return;
  }
  
  const filtered = filterCollections();
  let markdown = `# Memora 收藏知识库\n\n`;
  markdown += `> 共 ${filtered.length} 条收藏 | 导出时间: ${new Date().toLocaleString('zh-CN')}\n\n`;
  
  filtered.forEach((item, index) => {
    markdown += `## ${index + 1}. ${item.title || '无标题'}\n\n`;
    if (item.author) {
      markdown += `- **作者**: ${item.author}\n`;
    }
    if (item.url) {
      markdown += `- **链接**: [查看原文](${item.url})\n`;
    }
    markdown += `- **收藏夹**: ${normalizeFolder(item.folder || getLocalFolderForItem(item))}\n`;
    if (item.cover) {
      markdown += `- **封面**: ![](${item.cover})\n`;
    }
    if (item.stats) {
      markdown += `- **互动**: 👍 ${item.stats.likes || 0} | 💬 ${item.stats.comments || 0} | 📌 ${item.stats.collection || 0}\n`;
    }
    markdown += `- **标签**: ${ensureTags(item.tags).map(t => `#${t}`).join(' ')}\n`;
    markdown += `\n---\n\n`;
  });
  
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `memora-collection-${new Date().toISOString().split('T')[0]}.md`;
  a.click();
  URL.revokeObjectURL(url);
  
  showToast('导出成功');
}

async function removeCollection(id) {
  collections = collections.filter(item => item.id !== id);
  await chrome.storage.local.set({ [COLLECTIONS_KEY]: collections });
  renderCollections();
  updateTagFilter();
  showToast('已删除');
}

document.addEventListener('DOMContentLoaded', async () => {
  initThemeSwitcher();
  await loadFoldersFromStorage();
  await loadCollections();

  const switchToFullBtn = document.getElementById('switchToFullBtn');
  if (switchToFullBtn) {
    switchToFullBtn.addEventListener('click', async () => {
      try {
        await chrome.runtime.sendMessage({ action: 'set_ui_mode', mode: 'full' });
      } catch (e) {}
      window.close();
    });
  }

  // folder add controls
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
  
  document.getElementById('extractBtn').addEventListener('click', extractCollections);
  document.getElementById('exportBtn').addEventListener('click', exportMarkdown);
  document.getElementById('manageBtn').addEventListener('click', () => {
    manageMode = !manageMode;
    document.getElementById('manageBtn').textContent = manageMode ? '完成' : '管理';
    document.body.classList.toggle('manage-mode', manageMode);
    renderCollections();
  });
  document.getElementById('folderList').addEventListener('click', (event) => {
    const folderButton = event.target.closest('[data-folder]');
    if (!folderButton) return;

    selectedFolder = folderButton.dataset.folder || '';
    renderCollections();
  });
  document.getElementById('collectionList').addEventListener('click', (event) => {
    // Tag remove
    const tagRemove = event.target.closest('.tag-remove');
    if (tagRemove) {
      event.stopPropagation();
      const itemId = tagRemove.dataset.itemId;
      const tag = tagRemove.dataset.tag;
      removeTagFromItem(itemId, tag);
      return;
    }

    // Tag add
    const tagAdd = event.target.closest('.tag-add');
    if (tagAdd) {
      event.stopPropagation();
      const itemId = tagAdd.dataset.itemId;
      showAddTagInput(itemId);
      return;
    }

    // If clicking on a tag area while in manage mode, don't open the note
    if (manageMode && event.target.closest('.tag')) {
      event.stopPropagation();
      return;
    }

    if (event.target.closest('.remove-btn')) return;

    const item = event.target.closest('.collection-item');
      if (item) {
        if (manageMode) return; // don't open while managing
        const domIndex = item.dataset.domIndex === '' ? null : Number(item.dataset.domIndex);
        openCollection(item.dataset.url, Number.isInteger(domIndex) ? domIndex : null);
      }
  });

  // Double-click to edit tag text
  document.getElementById('collectionList').addEventListener('dblclick', (event) => {
    if (!manageMode) return;
    const tagText = event.target.closest('.tag-text');
    if (!tagText) return;
    event.stopPropagation();
    const tagEl = tagText.parentElement;
    const itemId = tagEl.dataset.itemId;
    const oldTag = tagEl.dataset.tag;
    showEditTagInput(itemId, oldTag, tagEl);
  });
  
  document.getElementById('searchInput').addEventListener('input', (e) => {
    searchTerm = e.target.value;
    renderCollections();
  });
  
  document.getElementById('tagFilter').addEventListener('change', (e) => {
    selectedTag = e.target.value;
    renderCollections();
  });
});

window.removeCollection = removeCollection;
window.openCollection = openCollection;
