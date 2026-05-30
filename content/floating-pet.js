import { PET_STATES, PET_MODES, PLATFORMS } from '../shared/constants.js';

const PET_EVENTS = {
  EXTRACT_REQUEST: 'PET_EXTRACT_REQUEST',
  EXTRACT_COMPLETE: 'PET_EXTRACT_COMPLETE',
  EXTRACT_ERROR: 'PET_EXTRACT_ERROR',
  OPEN_SIDEPANEL: 'PET_OPEN_SIDEPANEL',
  HIDE_PET: 'PET_HIDE_PET',
  UPDATE_STATE: 'PET_UPDATE_STATE'
};

class FloatingPet {
  constructor() {
    this.state = PET_STATES.IDLE;
    this.mode = PET_MODES.COMPANION;
    this.platform = null;
    this.isVisible = true;
    this.isPanelOpen = false;
    this.element = null;
    this.messageTimeout = null;
    
    this.init();
  }

  async init() {
    this.detectPlatform();
    if (!this.platform) return;
    
    await this.loadState();
    this.createPet();
    this.setupEventListeners();
    this.setupMessageListener();
    this.startIdleAnimation();
  }

  detectPlatform() {
    const hostname = window.location.hostname;
    if (hostname.includes('xiaohongshu.com')) {
      this.platform = PLATFORMS.XIAOHONGSHU;
    } else if (hostname.includes('douyin.com')) {
      this.platform = PLATFORMS.DOUYIN;
    }
  }

  async loadState() {
    try {
      const result = await chrome.storage.local.get(['xhs_settings', 'xhs_pet_state']);
      if (result.xhs_settings) {
        this.mode = result.xhs_settings.petMode || PET_MODES.COMPANION;
      }
      if (result.xhs_pet_state) {
        this.state = result.xhs_pet_state.state || PET_STATES.IDLE;
      }
    } catch (e) {
      console.log('Pet state load error:', e);
    }
  }

  createPet() {
    this.element = document.createElement('div');
    this.element.id = 'floating-pet';
    
    const platformIcon = this.platform === PLATFORMS.DOUYIN ? '🎵' : '✨';
    const platformName = this.platform === PLATFORMS.DOUYIN ? '抖音' : '小红书';
    
    this.element.innerHTML = `
      <div class="pet-mini-panel">
        <div class="mini-panel-header">
          <span class="platform-badge">${platformIcon} ${platformName}</span>
        </div>
        <div class="mini-panel-content">
          <button class="mini-btn extract-btn" data-action="extract">
            <span class="btn-icon">📥</span>
            <span class="btn-text">提取当前页内容</span>
          </button>
          <button class="mini-btn sidepanel-btn" data-action="sidepanel">
            <span class="btn-icon">📚</span>
            <span class="btn-text">打开知识库</span>
          </button>
          <button class="mini-btn close-pet-btn" data-action="hide">
            <span class="btn-icon">👋</span>
            <span class="btn-text">收起宠物</span>
          </button>
        </div>
      </div>
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
    `;
    
    document.body.appendChild(this.element);
    this.updatePetExpression(this.state);
  }

  setupEventListeners() {
    const petBody = this.element.querySelector('.pet-body');
    const extractBtn = this.element.querySelector('.extract-btn');
    const sidepanelBtn = this.element.querySelector('.sidepanel-btn');
    const closeBtn = this.element.querySelector('.close-pet-btn');

    petBody.addEventListener('click', (e) => {
      if (!e.target.closest('.mini-panel-content')) {
        this.togglePanel();
      }
    });

    extractBtn.addEventListener('click', () => this.handleExtract());
    sidepanelBtn.addEventListener('click', () => this.handleOpenSidepanel());
    closeBtn.addEventListener('click', () => this.handleHidePet());

    document.addEventListener('click', (e) => {
      if (this.isPanelOpen && !this.element.contains(e.target)) {
        this.closePanel();
      }
    });
  }

  setupMessageListener() {
    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'FROM_BACKGROUND') {
        this.handleBackgroundMessage(event.data);
      }
    });

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      this.handleExtensionMessage(request);
      sendResponse({ received: true });
      return true;
    });
  }

  handleBackgroundMessage(data) {
    switch (data.action) {
      case 'EXTRACT_COMPLETE':
        this.onExtractComplete(data.count);
        break;
      case 'EXTRACT_ERROR':
        this.onExtractError(data.message);
        break;
      case 'UPDATE_PET_STATE':
        if (data.state) this.setState(data.state);
        if (data.message) this.showMessage(data.message);
        break;
    }
  }

  handleExtensionMessage(request) {
    if (request.action === 'update_pet_state') {
      if (request.state) this.setState(request.state);
      if (request.message) this.showMessage(request.message);
    }
  }

  togglePanel() {
    this.isPanelOpen = !this.isPanelOpen;
    const panel = this.element.querySelector('.pet-mini-panel');
    
    if (this.isPanelOpen) {
      panel.classList.add('show');
      if (this.state === PET_STATES.IDLE) {
        this.showMessage('点击按钮开始整理收藏~');
      }
    } else {
      panel.classList.remove('show');
    }
  }

  closePanel() {
    this.isPanelOpen = false;
    const panel = this.element.querySelector('.pet-mini-panel');
    panel.classList.remove('show');
  }

  async handleExtract() {
    if (!this.platform) {
      this.showMessage('当前页面暂不支持整理');
      this.closePanel();
      return;
    }

    this.setState(PET_STATES.THINKING);
    this.showMessage('正在整理...');
    this.closePanel();

    window.dispatchEvent(new CustomEvent(PET_EVENTS.EXTRACT_REQUEST, {
      detail: { platform: this.platform }
    }));

    chrome.runtime.sendMessage({
      action: 'saveExtractedItems',
      platform: this.platform
    });
  }

  async handleOpenSidepanel() {
    this.closePanel();
    try {
      await chrome.runtime.sendMessage({ action: 'openSidePanel' });
      this.showMessage('知识库已打开~');
    } catch (error) {
      this.showMessage('打开知识库失败');
    }
  }

  handleHidePet() {
    this.closePanel();
    this.hide();
    
    window.dispatchEvent(new CustomEvent(PET_EVENTS.HIDE_PET));
  }

  onExtractComplete(count) {
    this.setState(PET_STATES.HAPPY);
    this.showMessage(`整理好了，已保存 ${count} 条内容`);
  }

  onExtractError(message) {
    this.setState(PET_STATES.IDLE);
    this.showMessage(message || '提取失败，请重试');
  }

  setState(state) {
    this.state = state;
    const body = this.element.querySelector('.pet-body');
    body.className = `pet-body ${state}`;
    this.updatePetExpression(state);
    
    chrome.storage.local.set({
      xhs_pet_state: { state: this.state }
    });
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
        eyes.forEach(eye => eye.style.cssText = 'height: 8px;');
        break;
      case PET_STATES.HAPPY:
        mouth.style.cssText = 'border: 3px solid #333; border-radius: 50%; width: 16px; height: 10px; border-top: none; background: transparent;';
        eyes.forEach(eye => eye.style.cssText = 'height: 3px;');
        break;
    }
  }

  showMessage(text) {
    const bubbleText = this.element.querySelector('.bubble-text');
    const bubble = this.element.querySelector('.pet-bubble');
    
    if (bubbleText && bubble) {
      bubbleText.textContent = text;
      bubble.classList.add('show');
      
      if (this.messageTimeout) {
        clearTimeout(this.messageTimeout);
      }
      
      this.messageTimeout = setTimeout(() => {
        bubble.classList.remove('show');
      }, 3000);
    }
  }

  hide() {
    this.element.style.opacity = '0';
    this.element.style.transform = 'scale(0.8) translateY(20px)';
    this.element.style.pointerEvents = 'none';
    this.isVisible = false;
  }

  show() {
    this.element.style.opacity = '1';
    this.element.style.transform = 'scale(1) translateY(0)';
    this.element.style.pointerEvents = 'auto';
    this.isVisible = true;
  }

  startIdleAnimation() {
    setInterval(() => {
      if (this.state === PET_STATES.IDLE && this.isVisible) {
        const tail = this.element.querySelector('.pet-tail');
        if (tail) {
          tail.style.animation = 'none';
          setTimeout(() => tail.style.animation = 'wagTail 0.5s ease-in-out', 10);
        }
      }
    }, 5000);
  }
}

let petInstance = null;

function init() {
  if (petInstance) return;
  
  const hostname = window.location.hostname;
  if (!hostname.includes('xiaohongshu.com') && !hostname.includes('douyin.com')) {
    return;
  }

  petInstance = new FloatingPet();

  window.addEventListener(PET_EVENTS.HIDE_PET, () => {
    if (petInstance) {
      petInstance.hide();
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

export { FloatingPet, PET_EVENTS };
