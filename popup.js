let collections = [];
let searchTerm = '';
let selectedTag = '';

const DEFAULT_AI_SETTINGS = {
  baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  model: 'qwen3.6-plus',
  apiKey: ''
};

let aiSettings = {
  ...DEFAULT_AI_SETTINGS,
  ...(window.SMART_COLLECTIONS_AI_CONFIG || {})
};

function getAiEndpoint() {
  if (aiSettings.endpoint) {
    return aiSettings.endpoint;
  }

  return `${aiSettings.baseUrl.replace(/\/$/, '')}/chat/completions`;
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

function generateTags(title) {
  const result = [];
  const lowerTitle = title.toLowerCase();
  
  for (const rule of TAG_RULES) {
    for (const keyword of rule.keywords) {
      if (lowerTitle.includes(keyword.toLowerCase())) {
        result.push(...rule.tags);
        break;
      }
    }
  }
  
  return [...new Set(result)];
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
  collections = result.xhs_collections || [];
  renderCollections();
  updateTagFilter();
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
    <div class="collection-item" data-id="${escapeHtml(item.id)}" data-url="${escapeHtml(item.url || '')}" title="${item.url ? 'Open original' : ''}">
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
        ${item.tags && item.tags.length > 0 ? `
          <div class="tags">
            ${item.tags.map(tag => `<span class="tag">#${tag}</span>`).join('')}
          </div>
        ` : ''}
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

function openCollection(url) {
  if (!url) {
    showToast('No URL');
    return;
  }

  chrome.tabs.create({ url });
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
      collections = response.data.map(item => {
        const existing = collections.find(c => c.id === item.id);
        return {
          ...existing,
          ...item,
          tags: existing?.tags || generateTags(item.title || '')
        };
      });
      
      await chrome.storage.local.set({ xhs_collections: collections });
      renderCollections();
      updateTagFilter();
      showToast(`成功提取 ${collections.length} 条收藏`);
    } else {
      collections = [];
      await chrome.storage.local.set({ xhs_collections: collections });
      renderCollections();
      updateTagFilter();
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
  
  await chrome.storage.local.set({ xhs_collections: collections });
  renderCollections();
  updateTagFilter();
  showToast(`更新了 ${updatedCount} 条收藏的标签`);
}

function buildAiPrompt(item) {
  return [
    '你是一个小红书收藏内容的智能分类器。请结合标题、作者、链接语义，以及随后的封面图片进行识图判断。',
    '目标：给这条收藏生成便于之后检索和归档的中文标签。',
    '规则：',
    '1. 只输出 JSON，不要 markdown，不要解释。',
    '2. JSON 格式必须是 {"tags":["标签1","标签2","标签3"]}。',
    '3. 输出 3 到 6 个中文标签，每个标签 2 到 6 个字。',
    '4. 标签要具体，优先描述内容主题、场景、用途、风格、物品或人群。',
    '5. 避免“生活”“分享”“小红书”“收藏”“笔记”“推荐”等过泛标签。',
    '6. 如果标题和图片冲突，以图片内容为主，但保留标题里的明确意图。',
    '7. 可参考这些大类但不要受限：美食、旅行、穿搭、美妆、家居、装修、数码、科技、健身、运动、读书、学习、摄影、职场、母婴、手作、理财、影视、音乐、游戏。',
    '',
    `标题：${item.title || '无'}`,
    `作者：${item.author || '无'}`,
    `卡片可见文本：${item.excerpt || '无'}`,
    `链接：${item.url || '无'}`,
    `已有本地规则标签：${(item.tags || []).join('、') || '无'}`
  ].join('\n');
}

function extractJsonObject(text) {
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

function normalizeAiTags(value) {
  const tags = Array.isArray(value?.tags) ? value.tags : [];
  return [...new Set(
    tags
      .map(tag => String(tag || '').replace(/^#/, '').trim())
      .filter(tag => tag.length > 0 && tag.length <= 20)
  )].slice(0, 6);
}

async function generateTagsWithAi(item) {
  const content = [{ type: 'text', text: buildAiPrompt(item) }];

  if (item.cover) {
    content.push({
      type: 'image_url',
      image_url: { url: item.cover }
    });
  }

  const response = await fetch(getAiEndpoint(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${aiSettings.apiKey}`
    },
    body: JSON.stringify({
      model: aiSettings.model,
      messages: [
        {
          role: 'system',
          content: '你擅长给中文社交媒体收藏内容做高质量、可检索的短标签。'
        },
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
    const detail = await response.text();
    throw new Error(`AI request failed: ${response.status} ${detail}`);
  }

  const data = await response.json();
  const message = data?.choices?.[0]?.message?.content;
  const parsed = extractJsonObject(Array.isArray(message) ? JSON.stringify(message) : message);
  const tags = normalizeAiTags(parsed);

  return tags.length > 0 ? tags : generateTags(item.title || '');
}

async function generateAllTagsWithAi() {
  if (!aiSettings.apiKey) {
    showToast('Missing API key');
    return;
  }

  if (collections.length === 0) {
    showToast('No collections');
    return;
  }

  const button = document.getElementById('generateAiTagsBtn');
  if (button) button.disabled = true;

  let updatedCount = 0;

  try {
    for (let index = 0; index < collections.length; index++) {
      const item = collections[index];
      if (button) button.textContent = `AI ${index + 1}/${collections.length}`;

      const newTags = await generateTagsWithAi(item);
      if (JSON.stringify(newTags) !== JSON.stringify(item.tags || [])) {
        item.tags = newTags;
        updatedCount++;
      }
    }

    await chrome.storage.local.set({ xhs_collections: collections });
    renderCollections();
    updateTagFilter();
    showToast(`AI updated ${updatedCount}`);
  } catch (error) {
    console.error('AI tag failed:', error);
    showToast('AI request failed');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = 'AI Tags';
    }
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
    if (item.tags && item.tags.length > 0) {
      markdown += `- **标签**: ${item.tags.map(t => `#${t}`).join(' ')}\n`;
    }
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
  document.getElementById('generateTagsBtn').addEventListener('click', generateAllTags);
  document.getElementById('exportBtn').addEventListener('click', exportMarkdown);
  document.getElementById('generateAiTagsBtn').addEventListener('click', generateAllTagsWithAi);
  document.getElementById('collectionList').addEventListener('click', (event) => {
    if (event.target.closest('.remove-btn')) return;

    const item = event.target.closest('.collection-item');
    if (item) {
      openCollection(item.dataset.url);
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
