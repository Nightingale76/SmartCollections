/**
 * Floating Pet Component - IIFE 格式（无 ES6 模块依赖）
 * 支持小红书和抖音平台
 */

(function() {
  'use strict';

  console.log('[pet] floating-pet.js loading...');

  const PET_EVENTS = {
    EXTRACT_REQUEST: 'PET_EXTRACT_REQUEST',
    EXTRACT_COMPLETE: 'PET_EXTRACT_COMPLETE',
    EXTRACT_ERROR: 'PET_EXTRACT_ERROR',
    OPEN_SIDEPANEL: 'PET_OPEN_SIDEPANEL',
    HIDE_PET: 'PET_HIDE_PET',
    UPDATE_STATE: 'PET_UPDATE_STATE'
  };

  const PET_STATES = {
    IDLE: 'idle',
    THINKING: 'thinking',
    HAPPY: 'happy'
  };

  const PET_MODES = {
    QUIET: 'quiet',
    COMPANION: 'companion',
    ACTIVE: 'active'
  };

  const PLATFORMS = {
    XIAOHONGSHU: 'xiaohongshu',
    DOUYIN: 'douyin'
  };

  function FloatingPet() {
    this.state = PET_STATES.IDLE;
    this.mode = PET_MODES.COMPANION;
    this.platform = null;
    this.isVisible = true;
    this.isPanelOpen = false;
    this.element = null;
    this.messageTimeout = null;
    this.petSettings = { petName: '小助手', petPosition: null };
    this.isDragging = false;
    this.dragOffset = { x: 0, y: 0 };

    console.log('[pet] FloatingPet constructor called');
    this.init();
  }

  FloatingPet.prototype.init = async function() {
    console.log('[pet] init() called');

    this.detectPlatform();
    if (!this.platform) {
      console.log('[pet] No supported platform detected, skipping initialization');
      return;
    }

    console.log('[pet] Detected platform:', this.platform);

    await this.loadState();
    this.createPet();
    this.setupEventListeners();
    this.setupMessageListener();
    this.startIdleAnimation();

    console.log('[pet] Pet initialization complete');
  };

  FloatingPet.prototype.detectPlatform = function() {
    const hostname = window.location.hostname;
    console.log('[pet] Current hostname:', hostname);

    if (hostname.includes('xiaohongshu.com')) {
      this.platform = PLATFORMS.XIAOHONGSHU;
      console.log('[pet] Platform set to: xiaohongshu');
    } else if (hostname.includes('douyin.com')) {
      this.platform = PLATFORMS.DOUYIN;
      console.log('[pet] Platform set to: douyin');
    }
  };

  FloatingPet.prototype.loadState = async function() {
    try {
      console.log('[pet] Loading pet state from storage...');
      const result = await chrome.storage.local.get(['xhs_settings', 'xhs_pet_state', 'xhs_pet_settings']);

      if (result.xhs_settings) {
        this.mode = result.xhs_settings.petMode || PET_MODES.COMPANION;
        console.log('[pet] Loaded mode:', this.mode);
      }

      if (result.xhs_pet_state) {
        this.state = result.xhs_pet_state.state || PET_STATES.IDLE;
        console.log('[pet] Loaded state:', this.state);
      }

      if (result.xhs_pet_settings) {
        this.petSettings = {
          petName: result.xhs_pet_settings.petName || '小助手',
          petPosition: result.xhs_pet_settings.petPosition || null
        };
        console.log('[pet] Loaded pet settings:', this.petSettings);
      }
    } catch (e) {
      console.log('[pet] Failed to load state:', e);
    }
  };

  FloatingPet.prototype.createPet = function() {
    console.log('[pet] Creating pet element...');

    this.element = document.createElement('div');
    this.element.id = 'floating-pet';

    // 应用自定义位置
    if (this.petSettings.petPosition) {
      this.element.style.right = 'auto';
      this.element.style.bottom = 'auto';
      this.element.style.left = this.petSettings.petPosition.x + 'px';
      this.element.style.top = this.petSettings.petPosition.y + 'px';
    }

    const platformIcon = this.platform === PLATFORMS.DOUYIN ? '🎵' : '✨';
    const platformName = this.platform === PLATFORMS.DOUYIN ? '抖音' : '小红书';

    this.element.innerHTML = '<div id="pet-root"></div>';

    const root = this.element.querySelector('#pet-root');
    root.innerHTML = '<div class="pet-mini-panel">' +
      '<div class="mini-panel-header">' +
        '<span class="platform-badge">💾 Memora</span>' +
      '</div>' +
      '<div class="mini-panel-content">' +
        '<button class="mini-btn extract-btn" data-action="extract">' +
          '<span class="btn-icon">📥</span>' +
          '<span class="btn-text">提取当前页</span>' +
        '</button>' +
        '<button class="mini-btn sidepanel-btn" data-action="sidepanel">' +
          '<span class="btn-icon">📚</span>' +
          '<span class="btn-text">打开知识库</span>' +
        '</button>' +
        '<button class="mini-btn close-pet-btn" data-action="hide">' +
          '<span class="btn-icon">👋</span>' +
          '<span class="btn-text">收起宠物</span>' +
        '</button>' +
      '</div>' +
    '</div>' +
    '<div class="pet-bubble">' +
      '<span class="bubble-text"></span>' +
    '</div>' +
    '<div class="pet-body ' + this.state + '">' +
      '<div class="pet-face">' +
        '<div class="pet-eyes">' +
          '<div class="eye left"></div>' +
          '<div class="eye right"></div>' +
        '</div>' +
        '<div class="pet-mouth"></div>' +
      '</div>' +
    '</div>' +
    '<div class="pet-tail"></div>';

    document.body.appendChild(this.element);
    console.log('[pet] Pet element appended to body');

    this.updatePetExpression(this.state);
  };

  FloatingPet.prototype.setupEventListeners = function() {
    console.log('[pet] Setting up event listeners...');

    const self = this;
    const petBody = this.element.querySelector('.pet-body');
    const extractBtn = this.element.querySelector('.extract-btn');
    const sidepanelBtn = this.element.querySelector('.sidepanel-btn');
    const closeBtn = this.element.querySelector('.close-pet-btn');

    // 拖拽事件处理
    let hasMoved = false;
    
    petBody.addEventListener('mousedown', function(e) {
      console.log('[pet] Drag start');
      self.isDragging = true;
      hasMoved = false;
      
      const rect = self.element.getBoundingClientRect();
      self.dragOffset = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      };
      
      petBody.classList.add('dragging');
      
      e.preventDefault();
      e.stopPropagation();
    });

    document.addEventListener('mousemove', function(e) {
      if (!self.isDragging) return;
      
      hasMoved = true;
      console.log('[pet] Dragging...');
      
      const newX = e.clientX - self.dragOffset.x;
      const newY = e.clientY - self.dragOffset.y;
      
      self.element.style.right = 'auto';
      self.element.style.bottom = 'auto';
      self.element.style.left = newX + 'px';
      self.element.style.top = newY + 'px';
      
      e.preventDefault();
    });

    document.addEventListener('mouseup', function(e) {
      if (!self.isDragging) return;
      
      console.log('[pet] Drag end');
      self.isDragging = false;
      petBody.classList.remove('dragging');
      
      if (hasMoved) {
        const rect = self.element.getBoundingClientRect();
        self.petSettings.petPosition = {
          x: rect.left,
          y: rect.top
        };
        self.savePetSettings();
      }
    });

    // 点击事件 - 区分拖拽和点击
    petBody.addEventListener('click', function(e) {
      if (hasMoved) {
        hasMoved = false;
        return;
      }
      
      if (!e.target.closest('.mini-panel-content')) {
        console.log('[pet] Pet body clicked, toggling panel');
        self.togglePanel();
      }
    });

    extractBtn.addEventListener('click', function() {
      console.log('[pet] Extract button clicked');
      self.handleExtract();
    });

    sidepanelBtn.addEventListener('click', function() {
      console.log('[pet] Sidepanel button clicked');
      self.handleOpenSidepanel();
    });

    closeBtn.addEventListener('click', function() {
      console.log('[pet] Close button clicked');
      self.handleHidePet();
    });

    document.addEventListener('click', function(e) {
      if (self.isPanelOpen && !self.element.contains(e.target)) {
        console.log('[pet] Click outside panel, closing');
        self.closePanel();
      }
    });

    console.log('[pet] Event listeners set up complete');
  };

  FloatingPet.prototype.savePetSettings = async function() {
    try {
      console.log('[pet] Saving pet settings:', this.petSettings);
      await chrome.storage.local.set({ xhs_pet_settings: this.petSettings });
    } catch (e) {
      console.error('[pet] Failed to save pet settings:', e);
    }
  };

  FloatingPet.prototype.updatePetName = function(newName) {
    this.petSettings.petName = newName;
    const nameElement = this.element.querySelector('.pet-name');
    if (nameElement) {
      nameElement.textContent = newName;
    }
    this.savePetSettings();
  };

  FloatingPet.prototype.resetPosition = function() {
    this.petSettings.petPosition = null;
    this.element.style.right = '20px';
    this.element.style.bottom = '80px';
    this.element.style.left = 'auto';
    this.element.style.top = 'auto';
    this.savePetSettings();
  };

  FloatingPet.prototype.setupMessageListener = function() {
    console.log('[pet] Setting up message listeners...');

    const self = this;

    window.addEventListener('message', function(event) {
      if (event.data && event.data.type === 'FROM_BACKGROUND') {
        console.log('[pet] Received postMessage:', event.data);
        self.handleBackgroundMessage(event.data);
      }
    });

    chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
      console.log('[pet] Received chrome message:', request);
      
      if (request.action === 'update_pet_name') {
        self.updatePetName(request.petName);
      } else if (request.action === 'reset_pet_position') {
        self.resetPosition();
      } else {
        self.handleExtensionMessage(request);
      }
      
      sendResponse({ received: true });
      return true;
    });

    console.log('[pet] Message listeners set up complete');
  };

  FloatingPet.prototype.handleBackgroundMessage = function(data) {
    console.log('[pet] Handling background message:', data.action);

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
  };

  FloatingPet.prototype.handleExtensionMessage = function(request) {
    console.log('[pet] Handling extension message:', request.action);

    if (request.action === 'update_pet_state') {
      if (request.state) this.setState(request.state);
      if (request.message) this.showMessage(request.message);
    }
  };

  FloatingPet.prototype.togglePanel = function() {
    this.isPanelOpen = !this.isPanelOpen;
    const panel = this.element.querySelector('.pet-mini-panel');

    console.log('[pet] Toggling panel, new state:', this.isPanelOpen ? 'open' : 'closed');

    if (this.isPanelOpen) {
      panel.classList.add('show');
      if (this.state === PET_STATES.IDLE) {
        this.showMessage('点击按钮开始整理收藏~');
      }
    } else {
      panel.classList.remove('show');
    }
  };

  FloatingPet.prototype.closePanel = function() {
    this.isPanelOpen = false;
    const panel = this.element.querySelector('.pet-mini-panel');
    panel.classList.remove('show');
  };

  FloatingPet.prototype.handleExtract = async function() {
    console.log('[pet] handleExtract called');

    if (!this.platform) {
      this.showMessage('当前页面暂不支持整理');
      this.closePanel();
      return;
    }

    this.setState(PET_STATES.THINKING);
    this.showMessage('正在整理...');
    this.closePanel();

    console.log('[pet] Dispatching PET_EXTRACT_REQUEST event');

    window.dispatchEvent(new CustomEvent(PET_EVENTS.EXTRACT_REQUEST, {
      detail: { platform: this.platform }
    }));

    try {
      await chrome.runtime.sendMessage({
        action: 'saveExtractedItems',
        platform: this.platform
      });
      console.log('[pet] saveExtractedItems message sent');
    } catch (error) {
      console.error('[pet] Failed to send message:', error);
      this.onExtractError('发送请求失败');
    }
  };

  FloatingPet.prototype.handleOpenSidepanel = async function() {
    console.log('[pet] handleOpenSidepanel called');

    this.closePanel();

    try {
      await chrome.runtime.sendMessage({ action: 'openSidePanel' });
      this.showMessage('知识库已打开~');
      console.log('[pet] Sidepanel opened successfully');
    } catch (error) {
      console.error('[pet] Failed to open sidepanel:', error);
      this.showMessage('打开知识库失败');
    }
  };

  FloatingPet.prototype.handleHidePet = function() {
    console.log('[pet] handleHidePet called');

    this.closePanel();
    this.hide();

    window.dispatchEvent(new CustomEvent(PET_EVENTS.HIDE_PET));
  };

  FloatingPet.prototype.onExtractComplete = function(count) {
    console.log('[pet] Extract complete, count:', count);

    this.setState(PET_STATES.HAPPY);
    this.showMessage('整理好了，已保存 ' + count + ' 条内容');
  };

  FloatingPet.prototype.onExtractError = function(message) {
    console.error('[pet] Extract error:', message);

    this.setState(PET_STATES.IDLE);
    this.showMessage(message || '提取失败，请重试');
  };

  FloatingPet.prototype.setState = function(state) {
    console.log('[pet] Setting state:', state);

    this.state = state;
    const body = this.element.querySelector('.pet-body');
    body.className = 'pet-body ' + state;
    this.updatePetExpression(state);

    chrome.storage.local.set({
      xhs_pet_state: { state: this.state }
    });
  };

  FloatingPet.prototype.updatePetExpression = function(state) {
    console.log('[pet] Updating pet expression for state:', state);

    const mouth = this.element.querySelector('.pet-mouth');
    const eyes = this.element.querySelectorAll('.eye');

    switch (state) {
      case PET_STATES.IDLE:
        mouth.style.cssText = 'border-bottom: 3px solid #333; border-radius: 0 0 20px 20px;';
        eyes.forEach(function(eye) { eye.style.cssText = 'height: 4px;'; });
        break;
      case PET_STATES.THINKING:
        mouth.style.cssText = 'width: 6px; height: 6px; background: #333; border-radius: 50%; border: none;';
        eyes.forEach(function(eye) { eye.style.cssText = 'height: 8px;'; });
        break;
      case PET_STATES.HAPPY:
        mouth.style.cssText = 'border: 3px solid #333; border-radius: 50%; width: 16px; height: 10px; border-top: none; background: transparent;';
        eyes.forEach(function(eye) { eye.style.cssText = 'height: 3px;'; });
        break;
    }
  };

  FloatingPet.prototype.showMessage = function(text) {
    console.log('[pet] Showing message:', text);

    const bubbleText = this.element.querySelector('.bubble-text');
    const bubble = this.element.querySelector('.pet-bubble');

    if (bubbleText && bubble) {
      bubbleText.textContent = text;
      bubble.classList.add('show');

      if (this.messageTimeout) {
        clearTimeout(this.messageTimeout);
      }

      const self = this;
      this.messageTimeout = setTimeout(function() {
        bubble.classList.remove('show');
      }, 3000);
    }
  };

  FloatingPet.prototype.hide = function() {
    console.log('[pet] Hiding pet');

    this.element.style.opacity = '0';
    this.element.style.transform = 'scale(0.8) translateY(20px)';
    this.element.style.pointerEvents = 'none';
    this.isVisible = false;
  };

  FloatingPet.prototype.show = function() {
    console.log('[pet] Showing pet');

    this.element.style.opacity = '1';
    this.element.style.transform = 'scale(1) translateY(0)';
    this.element.style.pointerEvents = 'auto';
    this.isVisible = true;
  };

  FloatingPet.prototype.startIdleAnimation = function() {
    console.log('[pet] Starting idle animation');

    const self = this;
    setInterval(function() {
      if (self.state === PET_STATES.IDLE && self.isVisible) {
        const tail = self.element.querySelector('.pet-tail');
        if (tail) {
          tail.style.animation = 'none';
          setTimeout(function() {
            tail.style.animation = 'wagTail 0.5s ease-in-out';
          }, 10);
        }
      }
    }, 5000);
  };

  let petInstance = null;

  function initPet() {
    console.log('[pet] initPet() called');
    console.log('[pet] Document ready state:', document.readyState);

    if (petInstance) {
      console.log('[pet] Pet already initialized, skipping');
      return;
    }

    const hostname = window.location.hostname;
    console.log('[pet] Current page hostname:', hostname);

    if (!hostname.includes('xiaohongshu.com') && !hostname.includes('douyin.com')) {
      console.log('[pet] Not a supported platform, skipping initialization');
      return;
    }

    console.log('[pet] Creating new FloatingPet instance');
    petInstance = new FloatingPet();

    window.addEventListener(PET_EVENTS.HIDE_PET, function() {
      console.log('[pet] Received HIDE_PET event');
      if (petInstance) {
        petInstance.hide();
      }
    });
  }

  console.log('[pet] floating-pet.js script loaded');

  if (document.readyState === 'loading') {
    console.log('[pet] Document still loading, waiting for DOMContentLoaded');
    document.addEventListener('DOMContentLoaded', initPet);
  } else {
    console.log('[pet] Document already loaded, initializing immediately');
    initPet();
  }

  window.XHS_FLOATTING_PET = {
    FloatingPet: FloatingPet,
    PET_EVENTS: PET_EVENTS,
    getInstance: function() { return petInstance; }
  };

  console.log('[pet] XHS_FLOATTING_PET exposed to window');

})();
