(function() {
  'use strict';

  const TAG_RULES = window.XHS_CONSTANTS ? window.XHS_CONSTANTS.TAG_RULES : [];

  const escapeHtml = (text) => {
    if (!text) return '';
    return String(text).replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char] || char));
  };

  const generateTags = (title) => {
    const result = [];
    const lowerTitle = (title || '').toLowerCase();
    
    for (const rule of TAG_RULES) {
      for (const keyword of rule.keywords) {
        if (lowerTitle.includes(keyword.toLowerCase())) {
          result.push(...rule.tags);
          break;
        }
      }
    }
    
    return [...new Set(result)];
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const exportToMarkdown = (collections) => {
    let markdown = '# 小红书收藏知识库\n\n';
    markdown += `> 共 ${collections.length} 条收藏 | 导出时间: ${new Date().toLocaleString('zh-CN')}\n\n`;
    
    collections.forEach((item, index) => {
      markdown += `## ${index + 1}. ${item.title || '无标题'}\n\n`;
      if (item.author) markdown += `- **作者**: ${item.author}\n`;
      if (item.url) markdown += `- **链接**: [查看原文](${item.url})\n`;
      if (item.cover) markdown += `- **封面**: ![](${item.cover})\n`;
      if (item.stats) {
        const stats = item.stats;
        markdown += `- **互动**: 👍 ${stats.likes || 0} | 💬 ${stats.comments || 0} | 📌 ${stats.collection || 0}\n`;
      }
      if (item.tags && item.tags.length > 0) {
        markdown += `- **标签**: ${item.tags.map(t => `#${t}`).join(' ')}\n`;
      }
      if (item.savedAt) {
        markdown += `- **保存时间**: ${formatDate(item.savedAt)}\n`;
      }
      markdown += '\n---\n\n';
    });
    
    return markdown;
  };

  const saveToStorage = async (key, data) => {
    try {
      await chrome.storage.local.set({ [key]: data });
      return true;
    } catch (error) {
      console.error('Storage save error:', error);
      return false;
    }
  };

  const loadFromStorage = async (key, defaultValue = null) => {
    try {
      const result = await chrome.storage.local.get(key);
      return result[key] !== undefined ? result[key] : defaultValue;
    } catch (error) {
      console.error('Storage load error:', error);
      return defaultValue;
    }
  };

  const getUniqueId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

  const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  };

  window.XHS_UTILS = {
    escapeHtml,
    generateTags,
    formatDate,
    exportToMarkdown,
    saveToStorage,
    loadFromStorage,
    getUniqueId,
    debounce
  };
})();
