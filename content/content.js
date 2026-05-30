const STORAGE_KEYS = {
  COLLECTIONS: 'xhs_collections',
  SETTINGS: 'xhs_settings',
  PET_STATE: 'xhs_pet_state'
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

const TAG_RULES = [
  { tags: ['美食', '菜谱', '餐厅', '做饭'], keywords: ['美食', '菜谱', '餐厅', '做饭', '烹饪', '甜点', '探店', '打卡', '食谱'] },
  { tags: ['旅行', '攻略'], keywords: ['旅行', '旅游', '攻略', '景点', '酒店', '民宿', '周末', '假期', '出游'] },
  { tags: ['穿搭', '时尚'], keywords: ['穿搭', '时尚', '衣服', '搭配', '女装', '鞋子', '包包', '配饰'] },
  { tags: ['美妆', '护肤'], keywords: ['美妆', '护肤', '化妆品', '口红', '粉底', '面膜', '精华', '防晒'] },
  { tags: ['家居', '装修'], keywords: ['家居', '装修', '装饰', '收纳', '家具', '软装', '改造', '设计'] },
  { tags: ['数码', '科技'], keywords: ['数码', '手机', '电脑', '耳机', '相机', '测评', '开箱', 'APP'] },
  { tags: ['健身', '运动'], keywords: ['健身', '运动', '减肥', '瑜伽', '跑步', '减脂', '健康'] },
  { tags: ['读书', '学习'], keywords: ['读书', '书单', '学习', '考研', '笔记', '效率', '成长'] },
  { tags: ['摄影', '拍照'], keywords: ['摄影', '拍照', '相机', '滤镜', '教程', '技巧', 'vlog'] },
  { tags: ['职场', '求职'], keywords: ['职场', '求职', '面试', '简历', '工作', '经验'] }
];

const PET_RESPONSES = {
  idle: ['喵~', '在整理收藏呢', '发现了什么有趣的？', '主人你好呀'],
  thinking: ['让我看看...', '分析中...', '思考中...', '嗯...让我想想'],
  happy: ['太棒了！', '哇，收藏又增加了！', '好开心！', '完美~', '收藏整理完成！']
};

const PET_SUGGESTIONS = [
  '我发现了一些收藏内容，需要我帮你整理吗？✨',
  '看起来有新内容，要提取到知识库吗？📚',
  '需要帮你管理这些收藏吗？🤗'
];

class XHSPet {
  constructor() {
    this.state = PET_STATES.IDLE;
    this.mode = PET_MODES.COMPANION;
    this.element = null;
    this.messageBubble = null;
    this.currentMessage = '';
    this.isVisible = false;
    this.init();
  }

  async init() {
    await this.loadState();
    this.createPet();
    this.setupEventListeners();
    this.startIdleAnimation();
    
    if (this.mode !== PET_MODES.QUIET) {
      setTimeout(() => this.show(), 1000);
    }
  }

  async loadState() {
    try {
      const result = await chrome.storage.local.get([STORAGE_KEYS.SETTINGS, STORAGE_KEYS.PET_STATE]);
      if (result[STORAGE_KEYS.SETTINGS]) {
        this.mode = result[STORAGE_KEYS.SETTINGS].petMode || PET_MODES.COMPANION;
      }
      if (result[STORAGE_KEYS.PET_STATE]) {
        this.state = result[STORAGE_KEYS.PET_STATE].state || PET_STATES.IDLE;
      }
    } catch (e) {
      console.log('Pet state load error:', e);
    }
  }

  createPet() {
    this.element = document.createElement('div');
    this.element.id = 'xhs-pet';
    this.element.innerHTML = `
      <div class="pet-container">
        <div class="pet-bubble">
          <span class="bubble-text"></span>
        </div>
        <div class="pet-body ${this.state}">
          <div class="pet-face">
            <div class="pet-eyes">
              <div class="eye left"></div>
              <div class="eye right"></div>
            </div>
            <div class="pet-mouth"></div>
          </div>
        </div>
        <div class="pet-tail"></div>
      </div>
    `;
    this.element.style.cssText = `
      position: fixed;
      bottom: 80px;
      right: 20px;
      z-index: 999999;
      opacity: 0;
      transform: scale(0.8) translateY(20px);
      transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
      pointer-events: none;
    `;
    document.body.appendChild(this.element);
    this.messageBubble = this.element.querySelector('.bubble-text');
  }

  setupEventListeners() {
    this.element.addEventListener('click', () => this.onPetClick());
    
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'update_pet_state') {
        if (request.state) {
          this.setState(request.state);
        }
        if (request.message) {
          this.showMessage(request.message);
        }
        if (request.petMode) {
          this.mode = request.petMode;
        }
      }
    });
  }

  show() {
    if (!this.isVisible) {
      this.element.style.opacity = '1';
      this.element.style.transform = 'scale(1) translateY(0)';
      this.element.style.pointerEvents = 'auto';
      this.isVisible = true;
      
      if (this.mode === PET_MODES.ACTIVE) {
        this.showIdleMessage();
      }
    }
  }

  hide() {
    if (this.isVisible) {
      this.element.style.opacity = '0';
      this.element.style.transform = 'scale(0.8) translateY(20px)';
      this.element.style.pointerEvents = 'none';
      this.isVisible = false;
    }
  }

  setState(state) {
    this.state = state;
    const body = this.element.querySelector('.pet-body');
    body.className = `pet-body ${state}`;
    
    this.updatePetExpression(state);
    
    if (state === PET_STATES.HAPPY) {
      this.showRandomResponse(PET_RESPONSES.happy);
    }
  }

  updatePetExpression(state) {
    const mouth = this.element.querySelector('.pet-mouth');
    const eyes = this.element.querySelectorAll('.eye');
    
    switch (state) {
      case PET_STATES.IDLE:
        mouth.style.cssText = 'border-bottom: 3px solid #333; border-radius: 0 0 20px 20px;';
        eyes.forEach(eye => eye.style.cssText = 'height: 4px;');
        break;
      case PET_STATES.THINKING:
        mouth.style.cssText = 'width: 6px; height: 6px; background: #333; border-radius: 50%; border: none;';
        eyes.forEach(eye => eye.style.cssText = 'height: 8px; transform: rotate(10deg);');
        break;
      case PET_STATES.HAPPY:
        mouth.style.cssText = 'border: 3px solid #333; border-radius: 50%; width: 16px; height: 10px; border-top: none; background: transparent;';
        eyes.forEach(eye => eye.style.cssText = 'height: 3px;');
        break;
    }
  }

  showMessage(text) {
    if (this.messageBubble) {
      this.messageBubble.textContent = text;
      const bubble = this.element.querySelector('.pet-bubble');
      bubble.classList.add('show');
      
      setTimeout(() => {
        bubble.classList.remove('show');
      }, 3000);
    }
  }

  showRandomResponse(responses) {
    const response = responses[Math.floor(Math.random() * responses.length)];
    this.showMessage(response);
  }

  showIdleMessage() {
    if (this.mode !== PET_MODES.QUIET && this.isVisible) {
      const message = PET_SUGGESTIONS[Math.floor(Math.random() * PET_SUGGESTIONS.length)];
      this.showMessage(message);
    }
  }

  onPetClick() {
    this.showRandomResponse(PET_RESPONSES.idle);
  }

  startIdleAnimation() {
    setInterval(() => {
      if (this.state === PET_STATES.IDLE && this.isVisible && this.mode !== PET_MODES.QUIET) {
        const tail = this.element.querySelector('.pet-tail');
        tail.style.animation = 'none';
        setTimeout(() => tail.style.animation = 'wagTail 0.5s ease-in-out', 10);
      }
    }, 5000);
  }

  async suggestCollection() {
    if (this.mode === PET_MODES.QUIET) return;
    
    this.setState(PET_STATES.THINKING);
    
    setTimeout(() => {
      this.setState(PET_STATES.IDLE);
      this.showMessage(PET_SUGGESTIONS[Math.floor(Math.random() * PET_SUGGESTIONS.length)]);
    }, 1500);
  }
}

function extractCollectionsFromPage() {
  const collections = [];
  
  const collectionCards = document.querySelectorAll('[data-note-id], .note-card, .feeds-item, .flow-item, .note-item');
  
  collectionCards.forEach(card => {
    const item = extractCardInfo(card);
    if (item && item.id && item.url) {
      const exists = collections.some(c => c.id === item.id);
      if (!exists) {
        collections.push(item);
      }
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
    stats: { likes: null, comments: null, collection: null },
    extractedAt: new Date().toISOString()
  };
  
  const noteId = card.getAttribute('data-note-id') || card.getAttribute('data-id') || card.getAttribute('id');
  
  const linkElement = card.querySelector('a[href*="/note/"]') || card.closest('a[href*="/note/"]') || card.querySelector('a');
  
  if (linkElement) {
    const href = linkElement.href;
    const match = href.match(/\/note\/([a-zA-Z0-9]+)/);
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
  
  if (!item.id) return null;
  
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
  
  return item;
}

let pet = null;
let hasSuggested = false;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractCollections') {
    const collections = extractCollectionsFromPage();
    sendResponse({ success: true, data: collections });
  }
  return true;
});

function init() {
  if (!window.location.href.includes('xiaohongshu.com')) return;
  
  pet = new XHSPet();
  
  if (window.location.href.includes('/favorites') || window.location.href.includes('/collection')) {
    setTimeout(() => {
      if (!hasSuggested) {
        pet.suggestCollection();
        hasSuggested = true;
      }
    }, 3000);
  }
  
  setTimeout(() => {
    const cards = document.querySelectorAll('[data-note-id], .note-card, .feeds-item');
    if (cards.length > 0 && !hasSuggested) {
      pet.suggestCollection();
      hasSuggested = true;
    }
  }, 5000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
