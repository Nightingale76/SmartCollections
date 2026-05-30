let collections = [];
let searchTerm = '';
let selectedTag = '';

const AI_CONFIG = window.SMART_COLLECTIONS_AI_CONFIG || {};
const DEFAULT_TAG = '其他';

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

function getAiEndpoint() {
  if (AI_CONFIG.endpoint) {
    return AI_CONFIG.endpoint;
  }

  const baseUrl = AI_CONFIG.baseUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
  return `${baseUrl.replace(/\/$/, '')}/chat/completions`;
}

function buildClassificationPrompt(item) {
  return [
    '你是小红书收藏内容分类器。',
    '只生成归档用的分类标签，不要生成标题，不要提取笔记自带话题标签。',
    '请结合标题、可见文本、作者、链接和封面图判断。视频笔记也要根据封面和文字判断内容主题，不要因为是视频就放弃分类。',
    '只输出 JSON，不要 Markdown，不要解释。',
    '格式必须是 {"tags":["标签1","标签2","标签3"]}。',
    '输出 2 到 5 个中文分类标签，每个标签 2 到 6 个字；如果信息很少，也至少输出 1 个最接近的分类。',
    `只有完全无法判断时才输出 {"tags":["${DEFAULT_TAG}"]}。`,
    '优先使用稳定分类，如：美食、旅行、穿搭、美妆、家居、装修、收纳、数码、健身、学习、摄影、职场、母婴、手作、理财、影视、音乐、游戏、宠物、汽车、艺术、情感、攻略、教程、清单、测评、素材、剪辑。',
    '避免泛标签：生活、分享、小红书、收藏、笔记、推荐。',
    '',
    `标题：${item.title || '无'}`,
    `内容形态：${item.mediaType || '未知'}`,
    `作者：${item.author || '无'}`,
    `链接：${item.url || '无'}`,
    `可见文本：${item.excerpt || '无'}`,
    `是否有封面图：${item.cover ? '有' : '无'}`
  ].join('\n');
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

async function generateClassificationTags(item, options = {}) {
  const { includeImage = false } = options;
  const localTags = getLocalTagsForItem(item);

  if (!AI_CONFIG.apiKey) {
    return localTags;
  }

  const content = [{ type: 'text', text: buildClassificationPrompt(item) }];
  if (includeImage && item.cover) {
    content.push({
      type: 'image_url',
      image_url: { url: item.cover }
    });
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
        messages: [
          {
            role: 'user',
            content
          }
        ],
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
    const aiTags = removeDefaultTagWhenSpecific(parsed?.tags);
    return aiTags.length > 0 && !aiTags.includes(DEFAULT_TAG) ? aiTags : localTags;
  } catch (error) {
    console.warn('AI classification failed, fallback to local tags:', error);
    return localTags;
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
  const { includeImage = false, onItemDone } = options;

  for (let index = 0; index < items.length; index += 1) {
    setClassificationStatus(`正在生成分类 ${index + 1}/${items.length}…`);
    items[index].tags = await generateClassificationTags(items[index], { includeImage });

    if (typeof onItemDone === 'function') {
      await onItemDone(items[index], index, items.length);
    }
  }

  setClassificationStatus('');
}

function showToast(message) {
  const existingToast = document.querySelector('.toast');
  if (existingToast) {
    existingToast.remove();
  }
  
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

async function loadCollections() {
  const result = await chrome.storage.local.get('xhs_collections');
  collections = (result.xhs_collections || []).map(item => ({
    ...item,
    tags: ensureTags(item.tags)
  }));
  await chrome.storage.local.set({ xhs_collections: collections });
  renderCollections();
  updateTagFilter();
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
    list.innerHTML = '<p class="empty-hint">暂无收藏内容</p>';
    document.getElementById('itemCount').textContent = `共 0 条收藏`;
    return;
  }
  
  list.innerHTML = filtered.map(item => `
    <div class="collection-item" data-id="${escapeHtml(item.id)}" data-url="${escapeHtml(item.url || '')}" data-dom-index="${Number.isInteger(item.domIndex) ? item.domIndex : ''}" title="${item.url ? 'Open original' : ''}">
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
          ${ensureTags(item.tags).map(tag => `<span class="tag">#${tag}</span>`).join('')}
        </div>
      </div>
      <button class="remove-btn" onclick="removeCollection('${item.id}')">×</button>
    </div>
  `).join('');
  
  document.getElementById('itemCount').textContent = `共 ${collections.length} 条收藏`;
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text).replace(/[&<>"']/g, char => {
    const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return entities[char] || char;
  });
}

async function openCollection(url, domIndex) {
  if (url) {
    chrome.tabs.create({ url });
    return;
  }

  if (!Number.isInteger(domIndex)) {
    showToast('No URL');
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const response = await chrome.tabs.sendMessage(tab.id, {
    action: 'openCollectionCard',
    domIndex
  });

  if (!response?.success) {
    showToast('Open failed');
  }
}

async function extractCollections() {
  const extractBtn = document.getElementById('extractBtn');
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!tab.url.includes('xiaohongshu.com')) {
    showToast('请在小红书页面使用');
    return;
  }

  if (extractBtn.disabled) {
    return;
  }

  extractBtn.disabled = true;
  
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'extractCollections' });
    
    if (response && response.success && response.data.length > 0) {
      collections = response.data.map(item => {
        const existing = collections.find(c => c.id === item.id);
        return {
          ...existing,
          ...item,
          tags: getLocalTagsForItem({ ...existing, ...item })
        };
      });

      await chrome.storage.local.set({ xhs_collections: collections });
      renderCollections();
      updateTagFilter();
      showToast(`已提取 ${collections.length} 条，正在后台生成分类…`);

      await applyClassificationTags(collections, {
        includeImage: false,
        onItemDone: async () => {
          await chrome.storage.local.set({ xhs_collections: collections });
          renderCollections();
          updateTagFilter();
        }
      });

      showToast(`完成：共 ${collections.length} 条收藏`);
    } else {
      if (response?.debug) {
        console.info('XHS extraction debug:', response.debug);
      }
      collections = [];
      await chrome.storage.local.set({ xhs_collections: collections });
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
  let markdown = `# 小红书收藏夹\n\n`;
  markdown += `> 共 ${filtered.length} 条收藏 | 导出时间: ${new Date().toLocaleString('zh-CN')}\n\n`;
  
  filtered.forEach((item, index) => {
    markdown += `## ${index + 1}. ${item.title || '无标题'}\n\n`;
    if (item.author) {
      markdown += `- **作者**: ${item.author}\n`;
    }
    if (item.url) {
      markdown += `- **链接**: [查看原文](${item.url})\n`;
    }
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
  a.download = `xhs-collection-${new Date().toISOString().split('T')[0]}.md`;
  a.click();
  URL.revokeObjectURL(url);
  
  showToast('导出成功');
}

async function removeCollection(id) {
  collections = collections.filter(item => item.id !== id);
  await chrome.storage.local.set({ xhs_collections: collections });
  renderCollections();
  updateTagFilter();
  showToast('已删除');
}

document.addEventListener('DOMContentLoaded', () => {
  loadCollections();
  
  document.getElementById('extractBtn').addEventListener('click', extractCollections);
  document.getElementById('exportBtn').addEventListener('click', exportMarkdown);
  document.getElementById('collectionList').addEventListener('click', (event) => {
    if (event.target.closest('.remove-btn')) return;

    const item = event.target.closest('.collection-item');
    if (item) {
      const domIndex = item.dataset.domIndex === '' ? null : Number(item.dataset.domIndex);
      openCollection(item.dataset.url, Number.isInteger(domIndex) ? domIndex : null);
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
});

window.removeCollection = removeCollection;
window.openCollection = openCollection;
