chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractCollections') {
    const collections = extractCollectionsFromPage();
    sendResponse({ success: true, data: collections });
  }
});

function extractCollectionsFromPage() {
  const collections = [];
  
  const collectionCards = document.querySelectorAll('[data-note-id], .note-card, .feeds-item, .flow-item, .note-item');
  
  collectionCards.forEach(card => {
    const item = extractCardInfo(card);
    if (item && item.id && item.url) {
      collections.push(item);
    }
  });
  
  if (collections.length === 0) {
    const alternativeCards = document.querySelectorAll('a[href*="/note/"]');
    alternativeCards.forEach(card => {
      const item = extractCardInfo(card);
      if (item && item.id && item.url) {
        const exists = collections.some(c => c.id === item.id);
        if (!exists) {
          collections.push(item);
        }
      }
    });
  }
  
  return collections;
}

function extractCardInfo(card) {
  const item = {
    id: null,
    title: null,
    url: null,
    author: null,
    cover: null,
    stats: {
      likes: null,
      comments: null,
      collection: null
    },
    extractedAt: new Date().toISOString()
  };
  
  const noteId = card.getAttribute('data-note-id') || 
                 card.getAttribute('data-id') || 
                 card.getAttribute('id');
  
  const linkElement = card.querySelector('a[href*="/note/"]') || 
                     card.closest('a[href*="/note/"]') ||
                     card.querySelector('a');
  
  if (linkElement) {
    const href = linkElement.href;
    const match = href.match(/\/note\/(\d+)/);
    if (match) {
      item.id = match[1];
    } else {
      item.id = href.split('?')[0];
    }
    item.url = href;
  } else if (noteId) {
    item.id = noteId;
    item.url = `https://www.xiaohongshu.com/note/${noteId}`;
  }
  
  if (!item.id) {
    return null;
  }
  
  const titleElements = card.querySelectorAll('h3, .title, .note-title, .content-title, .desc, .note-desc, [class*="title"], [class*="desc"]');
  for (const el of titleElements) {
    const text = el.textContent.trim();
    if (text && text.length > 0 && text.length < 200) {
      item.title = text;
      break;
    }
  }
  
  if (!item.title) {
    const titleAttr = card.getAttribute('title');
    if (titleAttr && titleAttr.length > 0 && titleAttr.length < 200) {
      item.title = titleAttr;
    }
  }
  
  const authorElements = card.querySelectorAll('.user-name, .author, .nickname, [class*="user"], [class*="author"]');
  for (const el of authorElements) {
    const text = el.textContent.trim();
    if (text && text.length > 0 && text.length < 50) {
      item.author = text;
      break;
    }
  }
  
  const imgElement = card.querySelector('img[src*="http"]');
  if (imgElement) {
    let src = imgElement.src || imgElement.getAttribute('data-src') || imgElement.getAttribute('data-lazy-src');
    if (src) {
      src = src.replace(/\/w\d+\/h\d+/, '/w600/h600');
      item.cover = src;
    }
  }
  
  const statsElements = card.querySelectorAll('span, .like, .comment, .collect, [class*="like"], [class*="comment"], [class*="collect"], [class*="count"]');
  statsElements.forEach(el => {
    const text = el.textContent.trim();
    const num = parseInt(text.replace(/[^0-9]/g, ''));
    if (!isNaN(num) && num > 0) {
      const classList = el.className.toLowerCase();
      if (classList.includes('like') || classList.includes('thumb') || classList.includes('heart')) {
        item.stats.likes = num;
      } else if (classList.includes('comment') || classList.includes('msg')) {
        item.stats.comments = num;
      } else if (classList.includes('collect') || classList.includes('save') || classList.includes('bookmark')) {
        item.stats.collection = num;
      }
    }
  });
  
  return item;
}