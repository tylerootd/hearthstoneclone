import Phaser from 'phaser';
import { loadResources, canCraft, spendResources, CRAFT_RECIPES, RES, RES_META } from '../data/resources.js';
import { loadCustomCards, saveCustomCards, loadCollection, saveCollection } from '../data/storage.js';
import { rebuildPool } from '../data/cardPool.js';

const W = 1024, H = 768;
const FONT = { fontFamily: '"Press Start 2P", monospace' };

export default class CraftingScene extends Phaser.Scene {
  constructor() { super('Crafting'); }

  create(data) {
    this.returnData = data || {};
    this.uiGroup = this.add.group();
    this.cameras.main.setZoom(1);
    this.redraw();
  }

  redraw() {
    this.uiGroup.clear(true, true);

    this.uiGroup.add(this.add.rectangle(W / 2, H / 2, W, H, 0x0e0e1a));

    // title
    this.uiGroup.add(this.add.text(W / 2, 40, 'CARD FORGE', {
      ...FONT, fontSize: '24px', color: '#e6b422'
    }).setOrigin(0.5));

    this.uiGroup.add(this.add.text(W / 2, 70, 'Combine resources to craft new cards', {
      ...FONT, fontSize: '9px', color: '#888'
    }).setOrigin(0.5));

    // resource display
    const res = loadResources();
    const types = [RES.WOOD, RES.STONE, RES.HERB, RES.CRYSTAL];
    let rx = 200;
    types.forEach(type => {
      const meta = RES_META[type];
      this.uiGroup.add(this.add.text(rx, 100, `${meta.icon} ${meta.name}: ${res[type] || 0}`, {
        fontSize: '14px', color: meta.color
      }).setOrigin(0.5));
      rx += 170;
    });

    // recipe grid
    const cols = 2, cardW = 440, cardH = 110, gapX = 20, gapY = 12;
    const startX = W / 2 - (cols * cardW + (cols - 1) * gapX) / 2 + cardW / 2;
    const startY = 150;

    CRAFT_RECIPES.forEach((recipe, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const cx = startX + col * (cardW + gapX);
      const cy = startY + row * (cardH + gapY);

      const affordable = canCraft(recipe);

      // card bg
      const bg = this.add.rectangle(cx, cy, cardW, cardH, affordable ? 0x1a2a1a : 0x1a1a2a, 0.9)
        .setStrokeStyle(2, affordable ? 0x44aa44 : 0x333344);
      this.uiGroup.add(bg);

      // card name
      this.uiGroup.add(this.add.text(cx - cardW / 2 + 12, cy - cardH / 2 + 10, recipe.name, {
        ...FONT, fontSize: '11px', color: affordable ? '#ffffff' : '#666666'
      }));

      // card stats
      const c = recipe.card;
      const stats = c.type === 'minion' ? `[${c.cost}] ${c.atk}/${c.hp} minion` : `[${c.cost}] spell`;
      this.uiGroup.add(this.add.text(cx - cardW / 2 + 12, cy - cardH / 2 + 30, stats, {
        ...FONT, fontSize: '8px', color: '#aaaaaa'
      }));

      if (c.effect) {
        const eff = `${c.effect.kind}: ${c.effect.value} → ${c.effect.target}`;
        this.uiGroup.add(this.add.text(cx - cardW / 2 + 12, cy - cardH / 2 + 45, eff, {
          ...FONT, fontSize: '7px', color: '#88ccaa'
        }));
      }

      // cost display
      const costStr = Object.entries(recipe.cost)
        .map(([type, amt]) => `${RES_META[type].icon}${amt}`)
        .join('  ');
      this.uiGroup.add(this.add.text(cx - cardW / 2 + 12, cy + cardH / 2 - 25, `Cost: ${costStr}`, {
        fontSize: '11px', color: affordable ? '#88ff88' : '#664444'
      }));

      // craft button
      if (affordable) {
        const btn = this.add.rectangle(cx + cardW / 2 - 55, cy + cardH / 2 - 20, 80, 24, 0x225522)
          .setInteractive({ useHandCursor: true }).setStrokeStyle(1, 0x44aa44);
        this.uiGroup.add(btn);
        this.uiGroup.add(this.add.text(cx + cardW / 2 - 55, cy + cardH / 2 - 20, 'CRAFT', {
          ...FONT, fontSize: '9px', color: '#44ff44'
        }).setOrigin(0.5));

        btn.on('pointerdown', () => this.craftCard(recipe));
      }
    });

    // back button
    const backBtn = this.add.rectangle(W / 2, H - 50, 200, 40, 0x333344)
      .setInteractive({ useHandCursor: true }).setStrokeStyle(2, 0x5577aa);
    this.uiGroup.add(backBtn);
    this.uiGroup.add(this.add.text(W / 2, H - 50, 'BACK', {
      ...FONT, fontSize: '14px', color: '#ffffff'
    }).setOrigin(0.5));

    backBtn.on('pointerdown', () => {
      this.scene.start('Overworld', {
        playerX: this.returnData.returnPlayerX,
        playerY: this.returnData.returnPlayerY
      });
    });
  }

  craftCard(recipe) {
    spendResources(recipe);

    // add card to custom cards + collection
    const custom = loadCustomCards();
    if (!custom.find(c => c.id === recipe.card.id)) {
      custom.push({ ...recipe.card });
      saveCustomCards(custom);
    }

    const collection = loadCollection();
    collection.push(recipe.card.id);
    saveCollection(collection);

    rebuildPool();

    // flash effect
    const flash = this.add.rectangle(W / 2, H / 2, W, H, 0x44ff44, 0.15).setDepth(100);
    this.tweens.add({
      targets: flash, alpha: 0, duration: 400,
      onComplete: () => { flash.destroy(); this.redraw(); }
    });

    // success text
    const t = this.add.text(W / 2, H / 2 - 20, `Crafted: ${recipe.name}!`, {
      ...FONT, fontSize: '16px', color: '#44ff44', stroke: '#000', strokeThickness: 3
    }).setOrigin(0.5).setDepth(101);
    this.tweens.add({
      targets: t, y: t.y - 40, alpha: 0, duration: 1200,
      onComplete: () => t.destroy()
    });
  }
}
