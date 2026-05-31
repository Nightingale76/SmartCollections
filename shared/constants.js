(function() {
  'use strict';

  const STORAGE_KEYS = {
    COLLECTIONS: 'xhs_collections',
    SETTINGS: 'xhs_settings',
    PET_STATE: 'xhs_pet_state',
    PET_SETTINGS: 'xhs_pet_settings'
  };

  const PET_MODES = {
    QUIET: 'quiet',
    COMPANION: 'companion',
    ACTIVE: 'active'
  };

  const PET_STATES = {
    IDLE: 'idle',
    THINKING: 'thinking',
    HAPPY: 'happy'
  };

  const DEFAULT_SETTINGS = {
    petMode: PET_MODES.COMPANION,
    autoSuggest: true,
    showStats: true,
    uiMode: 'full'
  };

  const DEFAULT_PET_SETTINGS = {
    petName: '小助手',
    petPosition: null
  };

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

  const PET_RESPONSES = {
    idle: [
      '喵~',
      '在整理收藏呢',
      '发现了什么有趣的？',
      '主人你好呀'
    ],
    thinking: [
      '让我看看...',
      '分析中...',
      '思考中...',
      '嗯...让我想想'
    ],
    happy: [
      '太棒了！',
      '哇，收藏又增加了！',
      '好开心！',
      '完美~',
      '收藏整理完成！'
    ]
  };

  const PET_SUGGESTIONS = [
    '我发现了一些收藏内容，需要我帮你整理吗？',
    '看起来有新内容，要提取到知识库吗？',
    '需要帮你管理这些收藏吗？'
  ];

  window.XHS_CONSTANTS = {
    STORAGE_KEYS,
    PET_MODES,
    PET_STATES,
    DEFAULT_SETTINGS,
    DEFAULT_PET_SETTINGS,
    TAG_RULES,
    PET_RESPONSES,
    PET_SUGGESTIONS
  };
})();
