import Phaser from 'phaser';
import { initCardPool, getStarterCollection, getStarterDeck, getAllCards, getSpriteList } from '../data/cardPool.js';
import { loadCollection, saveCollection, loadDeck, saveDeck, loadGold, saveGold } from '../data/storage.js';
import { setBattleCardPoolRef } from '../game/battleEngine.js';

export default class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  async create() {
    const loadTxt = this.add.text(512, 350, 'Loading...', { fontSize: '28px', color: '#ffffff' }).setOrigin(0.5);

    await initCardPool();
    setBattleCardPoolRef(getAllCards);

    if (!loadCollection()) saveCollection(getStarterCollection());
    if (!loadDeck()) saveDeck(getStarterDeck());
    if (loadGold() === null) saveGold(0);

    const sprites = getSpriteList();
    sprites.forEach(name => {
      const key = 'sprite_' + name.replace('.png', '');
      this.load.image(key, `./sprites/${name}`);
    });

    // Ninja Adventure assets
    this.load.spritesheet('ninja_player', './ninja/player.png', { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet('ninja_npc_samurai', './ninja/npc_samurai.png', { frameWidth: 16, frameHeight: 16 });
    this.load.spritesheet('ninja_npc_green', './ninja/npc_green.png', { frameWidth: 16, frameHeight: 16 });
    this.load.image('ninja_bush', './ninja/bush.png');
    this.load.image('ninja_crate', './ninja/crate.png');
    this.load.image('ninja_pot', './ninja/pot.png');
    this.load.image('ninja_heart', './ninja/heart.png');

    this.load.once('complete', () => {
      this.scene.start('Hub');
    });

    loadTxt.setText('Loading sprites...');
    this.load.start();
  }
}
