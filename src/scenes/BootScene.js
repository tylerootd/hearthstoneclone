import Phaser from 'phaser';
import { initCardPool, getStarterCollection, getStarterDeck, getAllCards, getSpriteList } from '../data/cardPool.js';
import { loadCollection, saveCollection, loadDeck, saveDeck, loadGold, saveGold, loadArtifacts } from '../data/storage.js';
import { setBattleCardPoolRef } from '../game/battleEngine.js';
import ChromaKeyPostFX from '../pipelines/ChromaKeyPostFX.js';

const base = import.meta.env.BASE_URL || './';

export default class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  async create() {
    const loadTxt = this.add.text(512, 350, 'Loading...', { fontSize: '28px', color: '#ffffff' }).setOrigin(0.5);

    const [, manifestData] = await Promise.all([
      initCardPool(),
      fetch(base + 'sprites/sheets/manifest.json').then(r => r.ok ? r.json() : []).catch(() => [])
    ]);
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

    // Super Retro Collection tileset + map
    this.load.image('super-retro-tiles', './tilesets/gigantic_pack.png');
    this.load.tilemapTiledJSON('super-retro-map', './maps/super-retro-town.json');

    // Super Retro house + door (for map transitions)
    const SRC = './Super_retro_collection';
    this.load.image('retro_house_tl', `${SRC}/building/Resources__Environments__TilePalette__Autotiles__root__atlas__house_autotile_0_0.png`);
    this.load.image('retro_house_tr', `${SRC}/building/Resources__Environments__TilePalette__Autotiles__root__atlas__house_autotile_0_1.png`);
    this.load.image('retro_house_bl', `${SRC}/building/Resources__Environments__TilePalette__Autotiles__root__atlas__house_autotile_1_0.png`);
    this.load.image('retro_house_br', `${SRC}/building/Resources__Environments__TilePalette__Autotiles__root__atlas__house_autotile_1_1.png`);
    this.load.spritesheet('retro_door', `${SRC}/animated/Resources__Animations__Door__door_0_16x16.png`, { frameWidth: 16, frameHeight: 16 });

    this.load.image('dragons_den_building', './dragons_den.png');
    this.load.image('battle_board', './battle_board.png');

    (manifestData || []).forEach(s => {
      const key = 'sheet_' + s.name;
      this.load.spritesheet(key, `./sprites/sheets/${s.file}`, {
        frameWidth: s.frameWidth, frameHeight: s.frameHeight
      });
    });
    this._sheetManifest = manifestData || [];

    if (this.game.renderer.type === Phaser.WEBGL) {
      this.game.renderer.pipelines.addPostPipeline('ChromaKeyPostFX', ChromaKeyPostFX);
    }

    this.load.once('complete', () => {
      (this._sheetManifest || []).forEach(s => {
        const key = 'sheet_' + s.name;
        if (!this.anims.exists(key)) {
          this.anims.create({
            key,
            frames: this.anims.generateFrameNumbers(key, { start: 0, end: s.frameCount - 1 }),
            frameRate: 10,
            repeat: -1
          });
        }
      });
      const arts = loadArtifacts();
      this.scene.start(arts && arts.length > 0 ? 'Hub' : 'ArtifactPick');
    });

    loadTxt.setText('Loading sprites...');
    this.load.start();
  }
}
