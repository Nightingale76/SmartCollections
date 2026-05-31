(function() {
  'use strict';

  const DEFAULT_TAG = '其他';

  const DEFAULT_FOLDER = '其他';

  const FOLDER_RULES = [
    { folder: '美妆', keywords: ['美妆', '护肤', '化妆', '口红', '粉底', '面膜', '精华', '眼霜', '防晒', '彩妆'] },
    { folder: '穿搭', keywords: ['穿搭', '时尚', '衣服', '搭配', '女装', '男装', '鞋子', '包包', '配饰', '品牌'] },
    { folder: '数码', keywords: ['数码', '手机', '电脑', '耳机', '相机', '测评', '开箱', '科技', 'ai', 'app', '软件', '算法', '编程'] },
    // 游戏分类由大模型判断，移除本地关键词匹配以避免误判
    { folder: '旅游', keywords: ['旅行', '旅游', '攻略', '景点', '酒店', '民宿', '周末', '假期', '出游', '周边游', '自驾'] },
    { folder: '学习', keywords: ['学习', '读书', '书单', '考研', '备考', '笔记', '效率', '时间管理', '知识', '教程', '课程'] }
  ];

  const TAG_RULES = [
    { tags: ['美食'], keywords: ['吃', '美食', '菜谱', '餐厅', '做饭', '烹饪', '甜点', '下午茶', '早餐', '午餐', '晚餐', '探店', '打卡', '食谱'] },
    { tags: ['旅行'], keywords: ['旅行', '旅游', '攻略', '景点', '酒店', '民宿', '周末', '假期', '出游', '周边游', '自驾'] },
    { tags: ['穿搭'], keywords: ['穿搭', '时尚', '衣服', '搭配', '女装', '男装', '鞋子', '包包', '配饰', '购物', '品牌'] },
    { tags: ['美妆'], keywords: ['美妆', '护肤', '化妆品', '口红', '粉底', '面膜', '精华', '眼霜', '防晒', '水乳', '彩妆'] },
    { tags: ['家居'], keywords: ['家居', '装修', '装饰', '收纳', '家具', '软装', '改造', '设计', '北欧', 'ins风'] },
    { tags: ['数码'], keywords: ['数码', '手机', '电脑', '耳机', '相机', '测评', '开箱', '黑科技', 'APP', '软件'] },
    { tags: ['健身'], keywords: ['健身', '运动', '减肥', '瑜伽', '跑步', '减脂', '增肌', '训练', '健康', '饮食'] },
    { tags: ['学习'], keywords: ['读书', '书单', '学习', '考研', '备考', '笔记', '效率', '时间管理', '知识', '成长'] },
    { tags: ['摄影'], keywords: ['摄影', '拍照', '相机', '滤镜', '教程', '技巧', '风景', '人像', 'vlog'] },
    { tags: ['职场'], keywords: ['职场', '求职', '面试', '简历', '工作', '晋升', '薪资', '经验'] },
  ];

  const EXTRA_TAG_RULES = [
    { tags: ['影视'], keywords: ['电影', '电视剧', '追剧', '综艺', '影评', '剧评'] },
    { tags: ['音乐'], keywords: ['音乐', '唱歌', '歌曲', '歌单', '演唱会', '乐队', '翻唱'] },
    { tags: ['宠物'], keywords: ['宠物', '猫', '狗', '猫咪', '狗狗', '铲屎', '喂养', '训犬'] },
    { tags: ['汽车'], keywords: ['汽车', '买车', '车主', '试驾', '新能源', '电车', '油车', '驾驶', '停车'] },
    { tags: ['母婴'], keywords: ['宝宝', '育儿', '母婴', '带娃', '怀孕', '孕期', '儿童', '早教'] },
    { tags: ['手作'], keywords: ['手作', '手工', 'diy', '编织', '黏土', '钩针', '改造'] },
    { tags: ['理财'], keywords: ['理财', '基金', '股票', '存钱', '省钱', '预算', '投资', '工资'] },
    { tags: ['情感'], keywords: ['情感', '恋爱', '分手', '婚姻', '情侣', '相亲', '关系'] },
    { tags: ['素材'], keywords: ['素材', '模板', '壁纸', '头像', '背景图', '转场', '调色', '滤镜'] },
    { tags: ['舞蹈'], keywords: ['舞蹈', '跳舞', '编舞', '燃脂操', '普拉提', '拉伸'] }
  ];

  function generateTags(text) {
    const result = [];
    const lowerTitle = String(text || '').toLowerCase();

    for (const rule of [...TAG_RULES, ...EXTRA_TAG_RULES]) {
      for (const keyword of rule.keywords) {
        const regex = new RegExp(`(^|\\s)${keyword.toLowerCase()}(\\s|$|，|。|！|？|,|\\.|!|\\?)`);
        if (regex.test(lowerTitle) || lowerTitle.includes(keyword.toLowerCase())) {
          result.push(...rule.tags);
          break;
        }
      }
    }

    const uniqueTags = [...new Set(result)];
    return uniqueTags.slice(0, 5);
  }

  function getAiEndpoint() {
    const AI_CONFIG = window.SMART_COLLECTIONS_AI_CONFIG || {};
    if (AI_CONFIG.endpoint) {
      return AI_CONFIG.endpoint;
    }

    const baseUrl = AI_CONFIG.baseUrl || 'https://dashscope.aliyuncs.com/compatible-mode/v1';
    return `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  }

  function buildClassificationPrompt(item) {
    const mediaType = item.type || item.mediaType || '未知';
    const textContent = item.text || item.excerpt || '无';
    
    return [
      '你是小红书/抖音收藏内容分类器（面向归档与检索）。',
      '仅返回用于归档的分类标签（JSON），不要生成标题或解释，不要复用笔记自带的话题标签。',
      '请结合标题、可见文本、作者、链接、封面图和（如有）字幕/描述/封面文字判断主题。',
      '如果是视频：请优先使用封面、可见字幕、视频描述和作者说明来判断主题；若封面或字幕中明确包含游戏相关内容或游戏名，则可判定为游戏。不要因为是视频就跳过分类。',
      '只输出 JSON，不要 Markdown，不要解释。',
      '格式必须是 {"tags":["标签1","标签2"]}。',
      '输出 1 到 5 个中文分类标签，每个标签 2 到 6 个字；当信息稀少时至少输出 1 个最接近的分类。',
      `只有完全无法判断时才输出 {"tags":["${DEFAULT_TAG}"]}。`,
      '优先使用稳定分类（示例）：美食、旅行、穿搭、美妆、家居、装修、收纳、数码、健身、学习、摄影、职场、母婴、手作、理财、影视、音乐、游戏、宠物、汽车、艺术、情感、攻略、教程、测评、素材、剪辑。',
      '避免泛标签：生活、分享、小红书、收藏、笔记、推荐。',
      '',
      `标题：${item.title || '无'}`,
      `内容形态：${mediaType}`,
      `作者：${item.author || '无'}`,
      `链接：${item.url || '无'}`,
      `可见文本/描述/字幕：${textContent}`,
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
      item.text || item.excerpt,
      item.url
    ].join(' ')));
  }

  function getLocalFolderForItem(item) {
    const text = [
      item.title,
      item.author,
      item.text || item.excerpt,
      item.url
    ].join(' ').toLowerCase();

    // 1) try keyword rules from text
    for (const rule of FOLDER_RULES) {
      if (rule.keywords.some(keyword => text.includes(keyword.toLowerCase()))) {
        return rule.folder;
      }
    }

    // 2) if there are tags (explicit or from item), try to infer folder from tags
    const tags = Array.isArray(item.tags) && item.tags.length > 0 ? item.tags : getLocalTagsForItem(item);
    const inferred = inferFolderFromTags(tags);
    if (inferred) return inferred;

    return DEFAULT_FOLDER;
  }

  function inferFolderFromTags(tags) {
    if (!Array.isArray(tags) || tags.length === 0) return null;
    const lowerTags = tags.map(t => String(t || '').toLowerCase());

    // direct match: tag equals folder name
    for (const rule of FOLDER_RULES) {
      if (lowerTags.includes(rule.folder.toLowerCase())) return rule.folder;
    }

    // match tag keywords against folder keywords
    for (const rule of FOLDER_RULES) {
      for (const kw of rule.keywords) {
        if (lowerTags.includes(kw.toLowerCase())) return rule.folder;
      }
    }

    return null;
  }

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

    return synonymMap[value] || value || fallback;
  }

  function buildFullClassificationPrompt(item, mode = 'full') {
    // reuse existing tag prompt but include folder guidance when mode !== 'tags'
    const base = [];
    if (mode === 'folder') {
      base.push('你是一名面向小红书/抖音收藏内容的分类器。仅输出 JSON: {"folder":"<一级分类>"}，folder 必须从这些选项中选择：美妆、穿搭、数码、游戏、旅游、学习、其他。');
    } else if (mode === 'tags') {
      base.push('你是一名面向小红书/抖音收藏内容的分类器。仅输出 JSON: {"tags":["标签1","标签2"]}，输出 1 到 5 个中文话题标签。');
    } else {
      base.push('你是一名面向小红书/抖音收藏内容的分类器。请输出 JSON: {"folder":"学习","tags":["标签1","标签2"]}。folder 必须从这些选项中选择：美妆、穿搭、数码、游戏、旅游、学习、其他。输出 1 到 5 个中文话题标签。');
    }

    base.push(`标题：${item.title || '无'}`);
    base.push(`内容形态：${item.type || item.mediaType || '未知'}`);
    base.push(`作者：${item.author || '无'}`);
    base.push(`链接：${item.url || '无'}`);
    base.push(`可见文本：${item.text || item.excerpt || '无'}`);
    base.push(`是否有封面图：${item.cover ? '有' : '无'}`);

    return base.join('\n');
  }

  async function generateClassification(item, options = {}) {
    const { includeImage = false, mode = 'full' } = options;
    const local = {
      folder: getLocalFolderForItem(item),
      tags: getLocalTagsForItem(item)
    };

    const AI_CONFIG = window.SMART_COLLECTIONS_AI_CONFIG || {};
    if (!AI_CONFIG.apiKey) {
      if (mode === 'folder') return { folder: local.folder };
      if (mode === 'tags') return { tags: local.tags };
      return local;
    }

    const prompt = buildFullClassificationPrompt(item, mode === 'folder' ? 'folder' : mode === 'tags' ? 'tags' : 'full');
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

      if (!response.ok) throw new Error(`AI request failed: ${response.status}`);
      const data = await response.json();
      const message = data?.choices?.[0]?.message?.content;
      const parsed = parseJsonObject(getMessageText(message));

      if (mode === 'folder') {
        const folder = normalizeFolder(parsed?.folder, local.folder);
        return { folder };
      }

      if (mode === 'tags') {
        const tags = ensureTags(parsed?.tags || local.tags);
        return { tags };
      }

      // full
      const folder = normalizeFolder(parsed?.folder, local.folder);
      const aiTags = removeDefaultTagWhenSpecific(parsed?.tags);
      const tags = aiTags.length > 0 && !aiTags.includes(DEFAULT_TAG) ? aiTags : local.tags;
      return { folder, tags };
    } catch (error) {
      console.warn('[ai-tags] generateClassification failed, fallback to local:', error);
      if (mode === 'folder') return { folder: local.folder };
      if (mode === 'tags') return { tags: local.tags };
      return local;
    }
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

    const AI_CONFIG = window.SMART_COLLECTIONS_AI_CONFIG || {};
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
      console.warn('[ai-tags] AI request failed, falling back to local rules:', error);
      return localTags;
    }
  }

  window.MEMORA_AI_TAGS = {
    TAG_RULES,
    EXTRA_TAG_RULES,
    DEFAULT_TAG,
    DEFAULT_FOLDER,
    FOLDER_RULES,
    generateTags,
    getAiEndpoint,
    buildClassificationPrompt,
    buildFullClassificationPrompt,
    parseJsonObject,
    normalizeTags,
    ensureTags,
    removeDefaultTagWhenSpecific,
    getMessageText,
    getLocalTagsForItem,
    getLocalFolderForItem,
    inferFolderFromTags,
    normalizeFolder,
    fetchWithTimeout,
    generateClassificationTags,
    generateClassification
  };
})();
