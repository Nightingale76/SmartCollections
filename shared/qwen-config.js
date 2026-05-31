(function() {
  'use strict';

  // Aliyun Bailian DashScope API config
  // Get API key: https://bailian.console.aliyun.com/

  const DASHSCOPE_API_KEY = ''; // 用户需要自行填写
  const QWEN_MODEL = 'qwen3.6-plus';
  const QWEN_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';

  window.SMART_COLLECTIONS_AI_CONFIG = {
    apiKey: DASHSCOPE_API_KEY,
    model: QWEN_MODEL,
    baseUrl: QWEN_BASE_URL
  };
})();
