// 抖音内容提取器
(function() {
  const extractDouyinContent = function() {
    const videos = [];
    
    const videoCards = document.querySelectorAll('[class*="video"], [class*="item"], [class*="card"]');
    
    videoCards.forEach(card => {
      const video = extractVideoCard(card);
      if (video && video.id) {
        const exists = videos.some(v => v.id === video.id);
        if (!exists) {
          videos.push(video);
        }
      }
    });
    
    return videos;
  };

  const extractVideoCard = function(card) {
    const AI_TAGS = window.MEMORA_AI_TAGS;
    
    const item = {
      platform: 'douyin',
      id: null,
      url: null,
      type: 'video',
      title: null,
      author: null,
      text: null,
      cover: null,
      stats: {
        likes: null,
        comments: null,
        collects: null
      },
      collectedAt: new Date().toISOString()
    };
    
    const linkElement = card.querySelector('a[href*="/video"], a[href*="/note"]');
    if (linkElement) {
      const href = linkElement.href;
      item.url = href;
      
      const idMatch = href.match(/video\/([a-zA-Z0-9]+)/) || href.match(/note\/([a-zA-Z0-9]+)/);
      if (idMatch) {
        item.id = idMatch[1];
      } else {
        item.id = href;
      }
    }
    
    const titleElements = card.querySelectorAll('span, div[class*="desc"], div[class*="title"], div[class*="text"]');
    for (const el of titleElements) {
      const text = el.textContent.trim();
      if (text && text.length > 0 && text.length < 200) {
        item.title = text;
        item.text = text;
        break;
      }
    }
    
    const authorElements = card.querySelectorAll('[class*="author"], [class*="user"], [class*="nickname"]');
    for (const el of authorElements) {
      const text = el.textContent.trim();
      if (text && text.length > 0 && text.length < 50) {
        item.author = text;
        break;
      }
    }
    
    const imgElement = card.querySelector('img[src*="http"]');
    if (imgElement) {
      item.cover = imgElement.src;
    }
    
    const statsElements = card.querySelectorAll('[class*="like"], [class*="comment"], [class*="collect"]');
    statsElements.forEach(el => {
      const text = el.textContent.trim();
      const num = parseInt(text.replace(/[^0-9]/g, ''));
      if (!isNaN(num)) {
        const classList = el.className.toLowerCase();
        if (classList.includes('like')) {
          item.stats.likes = num;
        } else if (classList.includes('comment')) {
          item.stats.comments = num;
        } else if (classList.includes('collect')) {
          item.stats.collects = num;
        }
      }
    });
    
    if (!item.id) return null;
    
    const textForTags = [
      item.title,
      item.author,
      item.url
    ].filter(Boolean).join(' ');
    
    item.tags = AI_TAGS && AI_TAGS.generateTags 
      ? AI_TAGS.generateTags(textForTags) 
      : ['其他'];
    
    return item;
  };

  const isDouyinPage = function() {
    return window.location.hostname.includes('douyin.com');
  };

  const isDouyinFavoritePage = function() {
    return window.location.pathname.includes('favorite') || 
           window.location.pathname.includes('collection');
  };

  window.XHS_DOUYIN_EXTRACTOR = {
    extractDouyinContent,
    isDouyinPage,
    isDouyinFavoritePage
  };
})();
