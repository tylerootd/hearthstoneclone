import Phaser from 'phaser';
import { initCardPool, getStarterCollection, getStarterDeck, getAllCards, getSpriteList } from '../data/cardPool.js';
import { loadCollection, saveCollection, loadDeck, saveDeck, loadGold, saveGold, loadArtifacts } from '../data/storage.js';
import { setBattleCardPoolRef } from '../game/battleEngine.js';
import ChromaKeyPostFX from '../pipelines/ChromaKeyPostFX.js';

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

    // Tuxemon Tiled-map assets (loaded from GitHub CDN)
    const TUXEMON = 'https://raw.githubusercontent.com/mikewesthad/phaser-3-tilemap-blog-posts/master/examples/post-1/assets';
    this.load.image('town-tiles', `${TUXEMON}/tilesets/tuxmon-sample-32px-extruded.png`);
    this.load.tilemapTiledJSON('town-map', `${TUXEMON}/tilemaps/tuxemon-town.json`);

    this.load.image('dragons_den_building', './dragons_den.png');
    this.load.video('win_anim', './Videos/Winning animation mmo pvp.mp4');

    if (this.game.renderer.type === Phaser.WEBGL) {
      this.game.renderer.pipelines.addPostPipeline('ChromaKeyPostFX', ChromaKeyPostFX);
    }

    this.load.once('complete', () => {
      const arts = loadArtifacts();
      this.scene.start(arts && arts.length > 0 ? 'Hub' : 'ArtifactPick');
    });

    loadTxt.setText('Loading sprites...');
    this.load.start();
  }
}
