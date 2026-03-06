import Phaser from 'phaser';
import { loadCustomCards, saveCustomCards, loadCollection, saveCollection, loadDeck } from '../data/storage.js';
import { getAllCards, getBaseCards, rebuildPool, getSpriteList, getNpcList } from '../data/cardPool.js';
import { loadNpcDeckOverrides, saveNpcDeckOverride, removeNpcDeckOverride } from '../data/npcDecks.js';

const W = 1024, H = 768;
const VALID_TYPES = ['minion', 'spell'];
const VALID_EFFECTS = ['dealDamage', 'heal', 'draw', 'drawOverTurns', 'buff'];
const VALID_TARGETS = ['enemy_any', 'enemy_hero', 'friendly_hero', 'friendly_minion', 'self'];
const VALID_TRIGGERS = ['turn_start', 'turn_end'];

export default class MasterModeScene extends Phaser.Scene {
  constructor() { super('MasterMode'); }

  create() {
    this.selectedCardId = null;
    this.activeTab = 'json';
    this.pendingSprite = null;
    this.buildDom();
    this.refreshList();
    this.events.on('shutdown', () => this.destroyDom());
  }

  buildDom() {
    const canvas = this.game.canvas;
    const rect = canvas.getBoundingClientRect();

    this.domContainer = document.createElement('div');
    this.domContainer.id = 'master-mode-overlay';
    Object.assign(this.domContainer.style, {
      position: 'fixed',
      left: rect.left + 'px', top: rect.top + 'px',
      width: rect.width + 'px', height: rect.height + 'px',
      display: 'flex', flexDirection: 'column',
      background: '#0d0d16', color: '#ccc',
      fontFamily: '"Press Start 2P", monospace, Arial', fontSize: '11px',
      zIndex: '1000', overflow: 'hidden'
    });

    // header
    const header = document.createElement('div');
    Object.assign(header.style, {
      display: 'flex', alignItems: 'center', padding: '6px 12px', gap: '10px',
      background: '#14142a', borderBottom: '2px solid #333'
    });

    const title = document.createElement('span');
    title.textContent = 'MASTER MODE';
    Object.assign(title.style, { fontSize: '14px', fontWeight: 'bold', color: '#e6b422', letterSpacing: '2px' });
    header.appendChild(title);

    this.searchInput = document.createElement('input');
    this.searchInput.placeholder = 'Search...';
    Object.assign(this.searchInput.style, {
      flex: '1', background: '#1a1a2e', color: '#fff', border: '1px solid #444',
      padding: '4px 8px', fontSize: '11px', fontFamily: 'inherit'
    });
    this.searchInput.addEventListener('input', () => this.refreshList());
    header.appendChild(this.searchInput);

    const backBtn = this.makeBtn('BACK', '#552222', () => this.scene.start('Hub'));
    header.appendChild(backBtn);

    this.domContainer.appendChild(header);

    // body
    const body = document.createElement('div');
    Object.assign(body.style, { display: 'flex', flex: '1', overflow: 'hidden' });

    // LEFT panel
    this.listPanel = document.createElement('div');
    Object.assign(this.listPanel.style, {
      width: '230px', overflowY: 'auto', borderRight: '2px solid #222', padding: '2px',
      background: '#0f0f1a'
    });
    body.appendChild(this.listPanel);

    // CENTER panel with tabs
    const center = document.createElement('div');
    Object.assign(center.style, { flex: '1', display: 'flex', flexDirection: 'column' });

    // tab bar
    const tabBar = document.createElement('div');
    Object.assign(tabBar.style, {
      display: 'flex', gap: '0', background: '#14142a', borderBottom: '2px solid #333'
    });

    this.jsonTabBtn = this.makeTabBtn('JSON Editor', 'json', tabBar);
    this.spriteTabBtn = this.makeTabBtn('Sprite Picker', 'sprite', tabBar);
    this.npcTabBtn = this.makeTabBtn('NPC Decks', 'npc', tabBar);
    center.appendChild(tabBar);

    // tab content
    this.tabContent = document.createElement('div');
    Object.assign(this.tabContent.style, { flex: '1', display: 'flex', flexDirection: 'column', overflow: 'hidden' });
    center.appendChild(this.tabContent);

    // status bar
    this.statusEl = document.createElement('div');
    Object.assign(this.statusEl.style, {
      minHeight: '32px', padding: '4px 8px', fontSize: '10px',
      background: '#111122', borderTop: '1px solid #333', whiteSpace: 'pre-wrap'
    });
    center.appendChild(this.statusEl);

    body.appendChild(center);

    // RIGHT panel
    const right = document.createElement('div');
    Object.assign(right.style, {
      width: '160px', display: 'flex', flexDirection: 'column', gap: '6px',
      padding: '8px', borderLeft: '2px solid #222', background: '#0f0f1a'
    });

    const actLabel = document.createElement('div');
    actLabel.textContent = 'ACTIONS';
    Object.assign(actLabel.style, { color: '#e6b422', fontWeight: 'bold', textAlign: 'center', fontSize: '10px', letterSpacing: '2px' });
    right.appendChild(actLabel);

    const actions = [
      { label: 'New Card',       color: '#2a4433', fn: () => this.newCard() },
      { label: 'Validate',       color: '#2a3344', fn: () => this.validateCurrent() },
      { label: 'Save as New',    color: '#2a4422', fn: () => this.saveAsNew() },
      { label: 'Save Changes',   color: '#2a4422', fn: () => this.saveChanges() },
      { label: 'Duplicate',      color: '#3a3a22', fn: () => this.duplicateCard() },
      { label: 'Delete',         color: '#442222', fn: () => this.deleteCard() },
      { label: 'Revert Base',    color: '#3a3322', fn: () => this.revertToBase() },
      { label: 'Export JSON',    color: '#222244', fn: () => this.exportJson() },
      { label: 'Import JSON',    color: '#222244', fn: () => this.importJson() }
    ];

    actions.forEach(({ label, color, fn }) => {
      right.appendChild(this.makeBtn(label, color, fn));
    });

    body.appendChild(right);
    this.domContainer.appendChild(body);
    document.body.appendChild(this.domContainer);

    this.showTab('json');
  }

  makeBtn(label, bg, fn) {
    const btn = document.createElement('button');
    btn.textContent = label;
    Object.assign(btn.style, {
      background: bg, color: '#ccc', border: '1px solid #444', padding: '6px 10px',
      cursor: 'pointer', fontFamily: 'inherit', fontSize: '10px', borderRadius: '2px',
      letterSpacing: '0.5px', width: '100%'
    });
    btn.addEventListener('mouseenter', () => { btn.style.filter = 'brightness(1.4)'; btn.style.color = '#fff'; });
    btn.addEventListener('mouseleave', () => { btn.style.filter = ''; btn.style.color = '#ccc'; });
    btn.addEventListener('click', fn);
    return btn;
  }

  makeTabBtn(label, tabId, container) {
    const btn = document.createElement('button');
    btn.textContent = label;
    Object.assign(btn.style, {
      background: 'transparent', color: '#888', border: 'none', borderBottom: '2px solid transparent',
      padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '10px', letterSpacing: '1px'
    });
    btn.addEventListener('click', () => this.showTab(tabId));
    container.appendChild(btn);
    return btn;
  }

  showTab(tabId) {
    this.activeTab = tabId;
    this.tabContent.innerHTML = '';

    [this.jsonTabBtn, this.spriteTabBtn, this.npcTabBtn].forEach(btn => {
      btn.style.color = '#666';
      btn.style.borderBottom = '2px solid transparent';
    });

    const btnMap = { json: this.jsonTabBtn, sprite: this.spriteTabBtn, npc: this.npcTabBtn };
    const activeBtn = btnMap[tabId];
    if (activeBtn) {
      activeBtn.style.color = '#e6b422';
      activeBtn.style.borderBottom = '2px solid #e6b422';
    }

    if (tabId === 'json') this.buildJsonTab();
    else if (tabId === 'sprite') this.buildSpriteTab();
    else if (tabId === 'npc') this.buildNpcTab();
  }

  buildJsonTab() {
    this.textarea = document.createElement('textarea');
    Object.assign(this.textarea.style, {
      flex: '1', background: '#0d0d1a', color: '#ddd', border: 'none',
      padding: '10px', fontFamily: '"Courier New", monospace', fontSize: '12px',
      resize: 'none', whiteSpace: 'pre', tabSize: '2', lineHeight: '1.5'
    });
    this.textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const s = this.textarea.selectionStart;
        this.textarea.value = this.textarea.value.substring(0, s) + '  ' + this.textarea.value.substring(this.textarea.selectionEnd);
        this.textarea.selectionStart = this.textarea.selectionEnd = s + 2;
      }
    });

    if (this.selectedCardId) {
      const card = getAllCards().find(c => c.id === this.selectedCardId);
      if (card) this.textarea.value = JSON.stringify(card, null, 2);
    }

    this.tabContent.appendChild(this.textarea);
  }

  buildSpriteTab() {
    const container = document.createElement('div');
    Object.assign(container.style, {
      flex: '1', overflowY: 'auto', padding: '10px',
      display: 'flex', flexDirection: 'column', gap: '8px'
    });

    let currentSprite = null;
    let currentSpriteData = null;
    if (this.selectedCardId) {
      const card = getAllCards().find(c => c.id === this.selectedCardId);
      if (card) {
        currentSprite = card.sprite || null;
        currentSpriteData = card.spriteData || null;
      }
    }

    if (!this.selectedCardId) {
      const notice = document.createElement('div');
      notice.textContent = 'Select a card from the list first.';
      Object.assign(notice.style, { color: '#ff8844', fontSize: '11px', padding: '20px', textAlign: 'center' });
      container.appendChild(notice);
      this.tabContent.appendChild(container);
      return;
    }

    // initialize pending sprite to current on first open
    if (this.pendingSprite === null) {
      if (currentSprite) this.pendingSprite = currentSprite;
      else if (currentSpriteData) this.pendingSprite = '__uploaded__';
    }

    const displaySprite = this.pendingSprite;
    const savedSprite = currentSprite || (currentSpriteData ? '__uploaded__' : null);
    const hasChanged = displaySprite !== savedSprite;

    // preview row
    const previewRow = document.createElement('div');
    Object.assign(previewRow.style, {
      display: 'flex', alignItems: 'center', gap: '12px',
      padding: '10px', background: '#14142a', borderRadius: '4px', border: '1px solid #333'
    });

    // saved sprite
    const savedBox = document.createElement('div');
    Object.assign(savedBox.style, {
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px'
    });
    const savedLabel = document.createElement('div');
    savedLabel.textContent = 'Saved';
    Object.assign(savedLabel.style, { fontSize: '8px', color: '#888' });
    savedBox.appendChild(savedLabel);
    const savedImg = document.createElement('div');
    Object.assign(savedImg.style, {
      width: '64px', height: '64px', background: '#0a0a14', border: '1px solid #444',
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    });
    if (currentSprite || currentSpriteData) {
      const img = document.createElement('img');
      img.src = currentSpriteData || `./sprites/${currentSprite}`;
      Object.assign(img.style, { maxWidth: '60px', maxHeight: '60px', imageRendering: 'pixelated' });
      savedImg.appendChild(img);
    } else {
      savedImg.textContent = 'None';
      Object.assign(savedImg.style, { color: '#444', fontSize: '9px' });
    }
    savedBox.appendChild(savedImg);
    previewRow.appendChild(savedBox);

    // arrow
    const arrow = document.createElement('div');
    arrow.textContent = '→';
    Object.assign(arrow.style, { fontSize: '18px', color: hasChanged ? '#e6b422' : '#333' });
    previewRow.appendChild(arrow);

    // pending sprite
    const pendingBox = document.createElement('div');
    Object.assign(pendingBox.style, {
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px'
    });
    const pendingLabel = document.createElement('div');
    pendingLabel.textContent = 'Selected';
    Object.assign(pendingLabel.style, { fontSize: '8px', color: hasChanged ? '#e6b422' : '#888' });
    pendingBox.appendChild(pendingLabel);
    const pendingImg = document.createElement('div');
    Object.assign(pendingImg.style, {
      width: '64px', height: '64px', background: '#0a0a14',
      border: hasChanged ? '2px solid #e6b422' : '1px solid #444',
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    });
    if (displaySprite === '__uploaded__' && currentSpriteData) {
      const img = document.createElement('img');
      img.src = currentSpriteData;
      Object.assign(img.style, { maxWidth: '60px', maxHeight: '60px', imageRendering: 'pixelated' });
      pendingImg.appendChild(img);
    } else if (displaySprite && displaySprite !== '__uploaded__') {
      const img = document.createElement('img');
      img.src = `./sprites/${displaySprite}`;
      Object.assign(img.style, { maxWidth: '60px', maxHeight: '60px', imageRendering: 'pixelated' });
      pendingImg.appendChild(img);
    } else {
      pendingImg.textContent = 'None';
      Object.assign(pendingImg.style, { color: '#444', fontSize: '9px' });
    }
    pendingBox.appendChild(pendingImg);
    previewRow.appendChild(pendingBox);

    // spacer
    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    previewRow.appendChild(spacer);

    // buttons
    const btnCol = document.createElement('div');
    Object.assign(btnCol.style, { display: 'flex', flexDirection: 'column', gap: '6px' });

    const saveBtn = this.makeBtn('SAVE SPRITE', '#224422', () => this.commitSprite(this.pendingSprite));
    Object.assign(saveBtn.style, { width: 'auto', padding: '6px 14px', fontSize: '10px' });
    if (hasChanged) {
      saveBtn.style.border = '2px solid #44aa44';
      saveBtn.style.color = '#44ff44';
    }
    btnCol.appendChild(saveBtn);

    const clearBtn = this.makeBtn('CLEAR SPRITE', '#442222', () => this.commitSprite(null));
    Object.assign(clearBtn.style, { width: 'auto', padding: '6px 14px', fontSize: '10px' });
    btnCol.appendChild(clearBtn);

    previewRow.appendChild(btnCol);
    container.appendChild(previewRow);

    if (hasChanged) {
      const hint = document.createElement('div');
      hint.textContent = 'Sprite changed — click SAVE SPRITE to apply.';
      Object.assign(hint.style, { fontSize: '8px', color: '#e6b422', textAlign: 'center' });
      container.appendChild(hint);
    }

    // sprite grid
    const gridLabel = document.createElement('div');
    gridLabel.textContent = 'Click a sprite to select it, then SAVE SPRITE';
    Object.assign(gridLabel.style, { color: '#888', fontSize: '8px', letterSpacing: '0.5px' });
    container.appendChild(gridLabel);

    const grid = document.createElement('div');
    Object.assign(grid.style, {
      display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))',
      gap: '6px'
    });

    const sprites = getSpriteList();
    // Add uploaded image as first selectable option when card has spriteData
    if (currentSpriteData) {
      const isSelected = displaySprite === '__uploaded__';
      const cell = document.createElement('div');
      Object.assign(cell.style, {
        background: isSelected ? '#2a3344' : '#111122',
        border: isSelected ? '2px solid #66aaff' : '1px solid #333',
        borderRadius: '4px', padding: '4px', cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
        transition: 'border-color 0.15s'
      });
      const img = document.createElement('img');
      img.src = currentSpriteData;
      Object.assign(img.style, {
        width: '64px', height: '64px', objectFit: 'contain', imageRendering: 'pixelated'
      });
      cell.appendChild(img);
      const label = document.createElement('div');
      label.textContent = 'Uploaded';
      Object.assign(label.style, { fontSize: '7px', color: isSelected ? '#66aaff' : '#888', textAlign: 'center' });
      cell.appendChild(label);
      cell.addEventListener('mouseenter', () => { if (!isSelected) cell.style.borderColor = '#556688'; });
      cell.addEventListener('mouseleave', () => { if (!isSelected) cell.style.borderColor = '#333'; });
      cell.addEventListener('click', () => {
        this.pendingSprite = '__uploaded__';
        this.showTab('sprite');
      });
      grid.appendChild(cell);
    }
    sprites.forEach(name => {
      const isSelected = displaySprite === name;
      const isSaved = currentSprite === name;
      const cell = document.createElement('div');
      Object.assign(cell.style, {
        background: isSelected ? '#2a3344' : '#111122',
        border: isSelected ? '2px solid #66aaff' : (isSaved ? '2px solid #336633' : '1px solid #333'),
        borderRadius: '4px', padding: '4px', cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
        transition: 'border-color 0.15s'
      });

      const img = document.createElement('img');
      img.src = `./sprites/${name}`;
      Object.assign(img.style, {
        width: '64px', height: '64px', objectFit: 'contain', imageRendering: 'pixelated'
      });
      cell.appendChild(img);

      const label = document.createElement('div');
      label.textContent = name.replace('.png', '');
      Object.assign(label.style, { fontSize: '7px', color: isSelected ? '#66aaff' : '#888', textAlign: 'center', wordBreak: 'break-all' });
      cell.appendChild(label);

      cell.addEventListener('mouseenter', () => { if (!isSelected) cell.style.borderColor = '#556688'; });
      cell.addEventListener('mouseleave', () => {
        if (!isSelected) cell.style.borderColor = isSaved ? '#336633' : '#333';
      });
      cell.addEventListener('click', () => {
        this.pendingSprite = name;
        this.showTab('sprite');
      });

      grid.appendChild(cell);
    });

    container.appendChild(grid);

    // upload section
    const uploadRow = document.createElement('div');
    Object.assign(uploadRow.style, {
      display: 'flex', gap: '8px', alignItems: 'center', padding: '8px',
      background: '#14142a', borderRadius: '4px', border: '1px solid #333', marginTop: '8px'
    });
    const uploadLabel = document.createElement('span');
    uploadLabel.textContent = 'Upload custom sprite:';
    Object.assign(uploadLabel.style, { fontSize: '9px', color: '#888' });
    uploadRow.appendChild(uploadLabel);

    const uploadBtn = this.makeBtn('Upload PNG', '#222244', () => this.uploadSprite());
    Object.assign(uploadBtn.style, { width: 'auto', padding: '4px 10px' });
    uploadRow.appendChild(uploadBtn);
    container.appendChild(uploadRow);

    this.tabContent.appendChild(container);
  }

  commitSprite(spriteName) {
    if (!this.selectedCardId) {
      this.setStatus('Select a card first.', '#ff8844');
      return;
    }

    const card = getAllCards().find(c => c.id === this.selectedCardId);
    if (!card) { this.setStatus('Card not found.', '#ff4444'); return; }

    const updated = { ...card };
    if (spriteName === '__uploaded__') {
      // Keep existing spriteData (already saved via upload)
      delete updated.sprite;
    } else if (spriteName) {
      updated.sprite = spriteName;
      delete updated.spriteData;
    } else {
      delete updated.sprite;
      delete updated.spriteData;
    }

    const custom = loadCustomCards();
    const idx = custom.findIndex(c => c.id === updated.id);
    if (idx !== -1) {
      custom[idx] = updated;
    } else {
      custom.push(updated);
    }

    saveCustomCards(custom);
    rebuildPool();

    this.pendingSprite = spriteName;

    if (this.textarea) {
      this.textarea.value = JSON.stringify(updated, null, 2);
    }

    this.refreshList();
    this.showTab('sprite');

    if (spriteName) {
      this.setStatus(`Sprite saved: ${spriteName}`, '#44ff44');
    } else {
      this.setStatus('Sprite cleared.', '#ff8844');
    }
  }

  uploadSprite() {
    if (!this.selectedCardId) {
      this.setStatus('Select a card first.', '#ff8844');
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.png,.jpg,.jpeg,.webp';
    input.addEventListener('change', () => {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result;

        const card = getAllCards().find(c => c.id === this.selectedCardId);
        if (!card) { this.setStatus('Card not found.', '#ff4444'); return; }

        const updated = { ...card, spriteData: base64 };
        delete updated.sprite;

        const custom = loadCustomCards();
        const idx = custom.findIndex(c => c.id === updated.id);
        if (idx !== -1) custom[idx] = updated;
        else custom.push(updated);

        saveCustomCards(custom);
        rebuildPool();

        this.pendingSprite = '__uploaded__';

        if (this.textarea) {
          this.textarea.value = JSON.stringify(updated, null, 2);
        }

        this.refreshList();
        this.showTab('sprite');
        this.setStatus(`Custom sprite uploaded and saved for ${updated.name}.`, '#44ff44');
      };
      reader.readAsDataURL(file);
    });
    input.click();
  }

  buildNpcTab() {
    const container = document.createElement('div');
    Object.assign(container.style, {
      flex: '1', overflowY: 'auto', padding: '10px',
      display: 'flex', flexDirection: 'column', gap: '8px'
    });

    const title = document.createElement('div');
    title.textContent = 'Assign decks to NPCs for overworld battles';
    Object.assign(title.style, { color: '#888', fontSize: '9px', marginBottom: '8px' });
    container.appendChild(title);

    const npcs = getNpcList();
    const overrides = loadNpcDeckOverrides();

    npcs.forEach(npc => {
      const row = document.createElement('div');
      Object.assign(row.style, {
        display: 'flex', alignItems: 'center', gap: '10px', padding: '8px',
        background: '#14142a', borderRadius: '4px', border: '1px solid #333'
      });

      const info = document.createElement('div');
      info.style.flex = '1';
      const nameEl = document.createElement('div');
      nameEl.textContent = `${npc.name} (Lv${npc.level})`;
      Object.assign(nameEl.style, { color: '#e6b422', fontSize: '10px', marginBottom: '4px' });
      info.appendChild(nameEl);

      const hasDeck = overrides[npc.id] && overrides[npc.id].length > 0;
      const deckInfo = document.createElement('div');
      deckInfo.textContent = hasDeck ? `Custom deck: ${overrides[npc.id].length} cards` : 'Using random deck';
      Object.assign(deckInfo.style, { color: hasDeck ? '#88ff88' : '#666', fontSize: '8px' });
      info.appendChild(deckInfo);
      row.appendChild(info);

      const assignBtn = document.createElement('button');
      assignBtn.textContent = 'Assign My Deck';
      Object.assign(assignBtn.style, {
        background: '#224422', color: '#88ff88', border: '1px solid #44aa44',
        padding: '4px 8px', fontSize: '8px', fontFamily: 'inherit', cursor: 'pointer', borderRadius: '2px'
      });
      assignBtn.addEventListener('click', () => {
        const deck = loadDeck();
        if (!deck || deck.length === 0) { this.setStatus('No active deck saved.', '#ff4444'); return; }
        saveNpcDeckOverride(npc.id, deck);
        this.setStatus(`Assigned ${deck.length}-card deck to ${npc.name}`, '#44ff44');
        this.showTab('npc');
      });
      row.appendChild(assignBtn);

      if (hasDeck) {
        const clearBtn = document.createElement('button');
        clearBtn.textContent = 'Clear';
        Object.assign(clearBtn.style, {
          background: '#442222', color: '#ff8888', border: '1px solid #aa4444',
          padding: '4px 8px', fontSize: '8px', fontFamily: 'inherit', cursor: 'pointer', borderRadius: '2px'
        });
        clearBtn.addEventListener('click', () => {
          removeNpcDeckOverride(npc.id);
          this.setStatus(`Cleared deck for ${npc.name}`, '#ff8844');
          this.showTab('npc');
        });
        row.appendChild(clearBtn);
      }

      container.appendChild(row);
    });

    this.tabContent.appendChild(container);
  }

  destroyDom() {
    if (this.domContainer?.parentNode) {
      this.domContainer.parentNode.removeChild(this.domContainer);
    }
  }

  refreshList() {
    const query = (this.searchInput?.value || '').toLowerCase();
    const all = getAllCards();
    const baseIds = new Set(getBaseCards().map(c => c.id));
    const customIds = new Set(loadCustomCards().map(c => c.id));

    const filtered = all.filter(c =>
      c.name.toLowerCase().includes(query) ||
      c.id.toLowerCase().includes(query) ||
      c.type.toLowerCase().includes(query)
    );

    this.listPanel.innerHTML = '';

    filtered.forEach(card => {
      const row = document.createElement('div');
      const isBase = baseIds.has(card.id);
      const hasOverride = isBase && customIds.has(card.id);
      const isCustomOnly = !isBase;
      const isSelected = card.id === this.selectedCardId;

      let color = '#aaa';
      let tag = 'base';
      if (hasOverride) { color = '#ffcc44'; tag = 'mod'; }
      else if (isCustomOnly) { color = '#88ff88'; tag = 'custom'; }

      Object.assign(row.style, {
        padding: '3px 6px', cursor: 'pointer', borderBottom: '1px solid #1a1a2a',
        background: isSelected ? '#2a3344' : 'transparent',
        color, fontSize: '9px', display: 'flex', alignItems: 'center', gap: '4px'
      });

      if (card.sprite || card.spriteData) {
        const thumb = document.createElement('img');
        thumb.src = card.spriteData || `./sprites/${card.sprite}`;
        Object.assign(thumb.style, { width: '18px', height: '18px', imageRendering: 'pixelated', objectFit: 'contain' });
        row.appendChild(thumb);
      }

      const text = document.createElement('span');
      text.textContent = `[${card.cost}] ${card.name}`;
      text.style.flex = '1';
      row.appendChild(text);

      const badge = document.createElement('span');
      badge.textContent = tag;
      Object.assign(badge.style, { fontSize: '7px', color: '#666', background: '#1a1a2a', padding: '1px 4px', borderRadius: '2px' });
      row.appendChild(badge);

      row.addEventListener('click', () => this.selectCard(card.id));
      row.addEventListener('mouseenter', () => { if (!isSelected) row.style.background = '#1a2233'; });
      row.addEventListener('mouseleave', () => { if (!isSelected) row.style.background = 'transparent'; });

      this.listPanel.appendChild(row);
    });
  }

  selectCard(id) {
    this.selectedCardId = id;
    const card = getAllCards().find(c => c.id === id);
    this.pendingSprite = card?.sprite || (card?.spriteData ? '__uploaded__' : null);
    if (card && this.textarea) {
      this.textarea.value = JSON.stringify(card, null, 2);
    }
    this.refreshList();
    if (this.activeTab === 'sprite') this.showTab('sprite');
  }

  setStatus(msg, color = '#ccc') {
    if (this.statusEl) {
      this.statusEl.textContent = msg;
      this.statusEl.style.color = color;
    }
  }

  newCard() {
    const template = { id: 'custom_' + Date.now(), name: 'New Card', type: 'minion', cost: 1, atk: 1, hp: 1 };
    this.showTab('json');
    this.textarea.value = JSON.stringify(template, null, 2);
    this.selectedCardId = null;
    this.setStatus('New card template. Edit and Save as New.', '#88ccff');
  }

  validateCurrent() {
    const result = this.parseAndValidate();
    if (result.error) this.setStatus('INVALID: ' + result.error, '#ff4444');
    else this.setStatus('VALID', '#44ff44');
    return result;
  }

  saveAsNew() {
    if (this.activeTab !== 'json') this.showTab('json');
    const result = this.parseAndValidate();
    if (result.error) { this.setStatus('INVALID: ' + result.error, '#ff4444'); return; }

    const card = result.card;
    if (!card.id || card.id.trim() === '') card.id = 'custom_' + Date.now();

    const baseIds = new Set(getBaseCards().map(c => c.id));
    if (baseIds.has(card.id)) card.id = 'custom_' + card.id + '_' + Date.now();

    const custom = loadCustomCards();
    if (custom.find(c => c.id === card.id)) {
      this.setStatus('ID exists. Change id or use Save Changes.', '#ff8844');
      return;
    }

    custom.push(card);
    saveCustomCards(custom);
    rebuildPool();
    this.addToCollection(card.id);
    this.selectedCardId = card.id;
    this.textarea.value = JSON.stringify(card, null, 2);
    this.refreshList();
    this.setStatus(`Saved: ${card.name} (added to collection)`, '#44ff44');
  }

  saveChanges() {
    if (this.activeTab !== 'json') this.showTab('json');
    const result = this.parseAndValidate();
    if (result.error) { this.setStatus('INVALID: ' + result.error, '#ff4444'); return; }

    const card = result.card;
    const custom = loadCustomCards();
    const idx = custom.findIndex(c => c.id === card.id);
    if (idx !== -1) custom[idx] = card;
    else custom.push(card);

    saveCustomCards(custom);
    rebuildPool();
    this.selectedCardId = card.id;
    this.refreshList();

    const isBase = getBaseCards().some(c => c.id === card.id);
    this.setStatus(`Updated: ${card.name}${isBase ? ' (base override)' : ''}`, '#44ff44');
  }

  duplicateCard() {
    if (this.activeTab !== 'json') this.showTab('json');
    const result = this.parseAndValidate();
    if (result.error) { this.setStatus('INVALID: ' + result.error, '#ff4444'); return; }

    const card = { ...result.card, id: 'custom_' + Date.now(), name: result.card.name + ' (copy)' };
    const custom = loadCustomCards();
    custom.push(card);
    saveCustomCards(custom);
    rebuildPool();
    this.addToCollection(card.id);
    this.selectedCardId = card.id;
    this.textarea.value = JSON.stringify(card, null, 2);
    this.refreshList();
    this.setStatus(`Duplicated: ${card.name}`, '#44ff44');
  }

  deleteCard() {
    if (!this.selectedCardId) { this.setStatus('No card selected.', '#ff8844'); return; }
    if (getBaseCards().some(c => c.id === this.selectedCardId)) {
      this.setStatus('Cannot delete base cards. Use Revert.', '#ff4444');
      return;
    }
    const custom = loadCustomCards();
    const idx = custom.findIndex(c => c.id === this.selectedCardId);
    if (idx === -1) { this.setStatus('Not in custom pool.', '#ff8844'); return; }
    const name = custom[idx].name;
    custom.splice(idx, 1);
    saveCustomCards(custom);
    rebuildPool();
    this.selectedCardId = null;
    if (this.textarea) this.textarea.value = '';
    this.refreshList();
    this.setStatus(`Deleted: ${name}`, '#ff8844');
  }

  revertToBase() {
    if (!this.selectedCardId) { this.setStatus('No card selected.', '#ff8844'); return; }
    const baseCard = getBaseCards().find(c => c.id === this.selectedCardId);
    if (!baseCard) { this.setStatus('Not a base card.', '#ff8844'); return; }
    const custom = loadCustomCards();
    const idx = custom.findIndex(c => c.id === this.selectedCardId);
    if (idx === -1) { this.setStatus('No override to revert.', '#ff8844'); return; }
    custom.splice(idx, 1);
    saveCustomCards(custom);
    rebuildPool();
    if (this.textarea) this.textarea.value = JSON.stringify(baseCard, null, 2);
    this.refreshList();
    this.setStatus(`Reverted: ${baseCard.name}`, '#44ff44');
  }

  exportJson() {
    const custom = loadCustomCards();
    if (!custom.length) { this.setStatus('No custom cards.', '#ff8844'); return; }
    const blob = new Blob([JSON.stringify(custom, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'custom_cards.json';
    a.click();
    URL.revokeObjectURL(a.href);
    this.setStatus(`Exported ${custom.length} card(s).`, '#44ff44');
  }

  importJson() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', () => {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const imported = JSON.parse(reader.result);
          if (!Array.isArray(imported)) { this.setStatus('Must be JSON array.', '#ff4444'); return; }
          let added = 0, skipped = 0;
          const custom = loadCustomCards();
          const existingIds = new Set(custom.map(c => c.id));
          const baseIds = new Set(getBaseCards().map(c => c.id));
          for (const card of imported) {
            if (this.validateCard(card)) { skipped++; continue; }
            if (baseIds.has(card.id)) card.id = 'custom_' + card.id + '_' + Date.now() + '_' + added;
            if (existingIds.has(card.id)) { skipped++; continue; }
            custom.push(card);
            existingIds.add(card.id);
            added++;
          }
          saveCustomCards(custom);
          rebuildPool();
          const col = loadCollection() || [];
          custom.forEach(c => { if (!col.includes(c.id)) col.push(c.id); });
          saveCollection(col);
          this.refreshList();
          this.setStatus(`Imported ${added}, skipped ${skipped}.`, '#44ff44');
        } catch (e) {
          this.setStatus('Parse error: ' + e.message, '#ff4444');
        }
      };
      reader.readAsText(file);
    });
    input.click();
  }

  addToCollection(cardId) {
    const col = loadCollection() || [];
    if (!col.includes(cardId)) { col.push(cardId); saveCollection(col); }
  }

  parseAndValidate() {
    if (!this.textarea) return { error: 'Switch to JSON tab first.' };
    let card;
    try { card = JSON.parse(this.textarea.value); }
    catch (e) { return { error: 'Invalid JSON: ' + e.message }; }
    const err = this.validateCard(card);
    return err ? { error: err } : { card };
  }

  validateCard(card) {
    if (!card || typeof card !== 'object') return 'Must be an object.';
    if (typeof card.id !== 'string' || !card.id.trim()) return 'id required.';
    if (typeof card.name !== 'string' || !card.name.trim()) return 'name required.';
    if (!VALID_TYPES.includes(card.type)) return `type: ${VALID_TYPES.join(', ')}`;
    if (typeof card.cost !== 'number' || !Number.isInteger(card.cost) || card.cost < 0 || card.cost > 10) return 'cost: 0-10 int.';
    if (card.type === 'minion') {
      if (typeof card.atk !== 'number' || !Number.isInteger(card.atk) || card.atk < 0) return 'atk: int >= 0.';
      if (typeof card.hp !== 'number' || !Number.isInteger(card.hp) || card.hp < 1) return 'hp: int >= 1.';
    }
    if (card.requiredLevel != null) {
      if (typeof card.requiredLevel !== 'number' || !Number.isInteger(card.requiredLevel) || card.requiredLevel < 1)
        return 'requiredLevel: int >= 1.';
    }
    if (card.effect != null) {
      const err = this.validateEffect(card.effect);
      if (err) return err;
    }
    if (card.triggers != null) {
      if (!Array.isArray(card.triggers)) return 'triggers: must be array.';
      for (let i = 0; i < card.triggers.length; i++) {
        const t = card.triggers[i];
        if (!t || typeof t !== 'object') return `triggers[${i}]: must be object.`;
        if (!VALID_TRIGGERS.includes(t.when)) return `triggers[${i}].when: ${VALID_TRIGGERS.join(', ')}`;
        if (!t.effect || typeof t.effect !== 'object') return `triggers[${i}].effect: required object.`;
        const err = this.validateEffect(t.effect);
        if (err) return `triggers[${i}].effect: ${err}`;
      }
    }
    return null;
  }

  validateEffect(e) {
    if (typeof e !== 'object') return 'effect: object.';
    if (!VALID_EFFECTS.includes(e.kind)) return `kind: ${VALID_EFFECTS.join(', ')}`;
    if (e.kind !== 'drawOverTurns' && !VALID_TARGETS.includes(e.target)) return `target: ${VALID_TARGETS.join(', ')}`;
    if (['dealDamage', 'heal', 'draw'].includes(e.kind)) {
      if (typeof e.value !== 'number' || !Number.isInteger(e.value) || e.value < 0) return `value: int >= 0 for ${e.kind}.`;
    }
    if (e.kind === 'drawOverTurns') {
      if (typeof e.value !== 'number' || !Number.isInteger(e.value) || e.value < 1) return 'value: int >= 1 for drawOverTurns.';
    }
    if (e.kind === 'buff') {
      if (typeof e.value !== 'object' || typeof e.value.atk !== 'number' || typeof e.value.hp !== 'number')
        return 'buff value: {atk,hp}.';
    }
    return null;
  }
}
