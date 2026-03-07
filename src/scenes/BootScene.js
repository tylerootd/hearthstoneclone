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

    this.load.image('dragons_den_building', './dragons_den.png');
    this.load.image('battle_board', './battle_board.png');

    const F = './sprites/farmer_class_rpg/';

    // player character
    this.load.image('farm_char_idle',    F + 'character_idle.png');
    this.load.image('farm_char_walk',    F + 'character_walking.png');
    this.load.image('farm_char_hands',   F + 'character_hands_up.png');

    // tools
    this.load.image('farm_hoe',          F + 'farm_tools-hoe-tool-garden-tilling-tool-002.png');
    this.load.image('farm_water',        F + 'farm_tools-watering-can-metal-garden-tool-001.png');
    this.load.image('farm_seeds',        F + 'farm_crops_seeds-seed-packet-vegetable-seeds-bag-001.png');
    this.load.image('farm_feed',         F + 'farm_machines-hay-baler-farming-equipment-agriculture-005.png');
    this.load.image('farm_shovel',       F + 'farm_tools-shovel-spade-digging-tool-farming-009-v2.png');
    this.load.image('farm_rake',         F + 'farm_tools-rake-tool-garden-cleaning-tool-004.png');
    this.load.image('farm_axe',          F + 'axe-tool-wood-chopping-tool-006.png');
    this.load.image('farm_sickle',       F + 'farm_tools-sickle-tool-harvest-cutting-tool-011-v2.png');
    this.load.image('farm_scythe',       F + 'farming-scythe-harvest-grain-curved_20260217_040455.png');
    this.load.image('farm_shears',       F + 'farming-shears-metal-trimming-tool_20260217_040621.png');
    this.load.image('farm_pickaxe',      F + 'farming-pickaxe-mining-stone-tool_20260217_040436.png');
    this.load.image('farm_hammer',       F + 'farming-hammer-wooden-building-tool_20260217_040906.png');
    this.load.image('farm_bucket',       F + 'farming-bucket-wooden-carrying-water_20260217_040536.png');
    this.load.image('farm_wheelbarrow',  F + 'farming-wheelbarrow-wooden-wheel_20260217_040602.png');
    this.load.image('farm_watercan2',    F + 'farming-watering-can-copper-sprinkle_20260217_040327.png');
    this.load.image('farm_seedspread',   F + 'farming-seed-spreader-hand-tool_20260217_040843.png');
    this.load.image('farm_seedpkt',      F + 'farming-seed-packet-colorful-envelope_20260217_035718.png');

    // buildings
    this.load.image('farm_barn',         F + 'barn-building-red-farm-structure-001.png');
    this.load.image('farm_barn2',        F + 'barn-building-red-farm-structure-004.png');
    this.load.image('farm_barn3',        F + 'farming-barn-red-wooden-large_20260217_040958.png');
    this.load.image('farm_coop',         F + 'chicken-coop-poultry-house-farming-002.png');
    this.load.image('farm_coop2',        F + 'farming-chicken-coop-small-wooden-fenced_20260217_041034.png');
    this.load.image('farm_silo',         F + 'farm_buildings-silo-tower-grain-storage-farming-003.png');
    this.load.image('farm_greenhouse',   F + 'farming-greenhouse-glass-growing-plants_20260217_041058.png');
    this.load.image('farm_farmhouse',    F + 'farming-farmhouse-cozy-wooden-chimney_20260217_041012.png');
    this.load.image('farm_toolshed',     F + 'farming-toolshed-small-wooden-door_20260217_041357.png');
    this.load.image('farm_stable',       F + 'farming-stable-horse-wooden-open_20260217_041337.png');
    this.load.image('farm_market',       F + 'farming-market-stall-wooden-canopy_20260217_041322.png');

    // machines / structures
    this.load.image('farm_windmill',     F + 'farm_machines-windmill-building-grain-mill-structure-002.png');
    this.load.image('farm_windmill2',    F + 'farming-windmill-stone-tall-spinning_20260217_041113.png');
    this.load.image('farm_well',         F + 'farm_machines-well-pump-water-source-machine-004.png');
    this.load.image('farm_well2',        F + 'farming-well-stone-bucket-rope_20260217_041240.png');
    this.load.image('farm_tractor',      F + 'farm_machines-tractor-vehicle-red-farm-machine-001.png');
    this.load.image('farm_plow',         F + 'farm_machines-plow-attachment-tractor-tool-farming-006.png');
    this.load.image('farm_waterwheel',   F + 'farm_machines-water-wheel-river-mill-mechanism-003.png');
    this.load.image('farm_haybaler',     F + 'farm_machines-hay-baler-farming-equipment-agriculture-005.png');

    // animals
    this.load.image('farm_chicken',      F + 'chicken-hen-farm-poultry-bird-001.png');
    this.load.image('farm_chicken2',     F + 'farming-chicken-white-hen-pecking-ground_20260217_035740.png');
    this.load.image('farm_rooster',      F + 'farming-rooster-colorful-crowing-dawn_20260217_040145.png');
    this.load.image('farm_babychick',    F + 'farming-baby-chick-tiny-yellow-fluffy_20260217_040158.png');
    this.load.image('farm_sheep',        F + 'farm_animals-sheep-wool-animal-fluffy-farm-004.png');
    this.load.image('farm_sheep2',       F + 'farming-sheep-white-fluffy-wool_20260217_035824.png');
    this.load.image('farm_cow',          F + 'cow-cattle-dairy-farm-animal-008.png');
    this.load.image('farm_cow2',         F + 'farming-cow-brown-spotted-grazing_20260217_035752.png');
    this.load.image('farm_pig',          F + 'farm_animals-pig-farm-animal-pink-swine-003.png');
    this.load.image('farm_pig2',         F + 'farming-pig-pink-round-snout-muddy_20260217_035812.png');
    this.load.image('farm_horse',        F + 'farm_animals-horse-farm-animal-brown-stallion-005.png');
    this.load.image('farm_horse2',       F + 'farming-horse-brown-saddle-farm_20260217_035938.png');
    this.load.image('farm_duck',         F + 'duck-farm-bird-pond-waterfowl-006.png');
    this.load.image('farm_duck2',        F + 'farming-duck-yellow-pond-swimming_20260217_035952.png');
    this.load.image('farm_goat',         F + 'farming-goat-gray-horns-climbing_20260217_040018.png');
    this.load.image('farm_donkey',       F + 'farming-donkey-gray-working-sturdy_20260217_040255.png');
    this.load.image('farm_turkey',       F + 'farming-turkey-large-brown-feathered_20260217_040226.png');
    this.load.image('farm_rabbit',       F + 'farming-rabbit-brown-fluffy-pet_20260217_040050.png');
    this.load.image('farm_cat',          F + 'farming-cat-farm-mouser-orange-tabby_20260217_040112.png');
    this.load.image('farm_dog',          F + 'farming-dog-farm-collie-brown-white_20260217_040125.png');
    this.load.image('farm_bee',          F + 'farming-bee-honeybee-yellow-buzzing_20260217_040308.png');
    this.load.image('farm_butterfly',    F + 'farming-butterfly-colorful-flying-spring_20260217_042818.png');
    this.load.image('farm_firefly',      F + 'farming-firefly-glowing-yellow-night_20260217_042848.png');
    this.load.image('farm_egg',          F + 'egg-item-chicken-product-farming-001.png');

    // crops - growing
    this.load.image('farm_potato',       F + 'farm_crops_growing-potato-plant-brown-tuber-garden-005.png');
    this.load.image('farm_potato2',      F + 'farming-potato-crop-brown-root-vegetable_20260217_035259.png');
    this.load.image('farm_tomato',       F + 'farm_crops_growing-tomato-plant-red-fruit-vine-003.png');
    this.load.image('farm_tomato2',      F + 'farming-tomato-crop-ripe-red-vine_20260217_034735.png');
    this.load.image('farm_pumpkin',      F + 'farm_crops_growing-pumpkin-crop-orange-gourd-vine-006.png');
    this.load.image('farm_pumpkin2',     F + 'farming-pumpkin-crop-large-orange-patch_20260217_034907.png');
    this.load.image('farm_strawberry',   F + 'farm_crops_growing-strawberry-plant-red-berry-bush-007.png');
    this.load.image('farm_strawberry2',  F + 'farming-strawberry-crop-red-berries-small_20260217_035043.png');
    this.load.image('farm_wheat',        F + 'farm_crops_growing-wheat-crop-golden-grain-field-009-v2.png');
    this.load.image('farm_wheat2',       F + 'farming-wheat-crop-golden-grain-bundle_20260217_034838.png');
    this.load.image('farm_corn',         F + 'corn-stalk-tall-yellow-maize-004.png');
    this.load.image('farm_corn2',        F + 'farming-corn-stalk-tall-golden-harvest_20260217_034802.png');
    this.load.image('farm_carrot',       F + 'carrot-crop-orange-vegetable-garden-002.png');
    this.load.image('farm_carrot2',      F + 'farming-carrot-crop-orange-top-green-leaves_20260217_034826.png');
    this.load.image('farm_cabbage',      F + 'cabbage-crop-green-leafy-vegetable-008.png');
    this.load.image('farm_cabbage2',     F + 'farming-cabbage-crop-green-leafy-round_20260217_035353.png');
    this.load.image('farm_onion',        F + 'farming-onion-crop-brown-bulb-green-top_20260217_035549.png');
    this.load.image('farm_eggplant',     F + 'farming-eggplant-crop-dark-purple-long_20260217_035626.png');
    this.load.image('farm_pepper',       F + 'farming-pepper-crop-red-green-bell_20260217_035536.png');
    this.load.image('farm_turnip',       F + 'farming-turnip-crop-white-purple-root_20260217_035608.png');
    this.load.image('farm_watermelon',   F + 'farming-watermelon-crop-striped-green-large_20260217_035412.png');
    this.load.image('farm_grape',        F + 'farming-grape-vine-crop-purple-cluster_20260217_035456.png');
    this.load.image('farm_blueberry',    F + 'farming-blueberry-bush-small-blue-berries_20260217_035517.png');
    this.load.image('farm_rice',         F + 'farming-rice-paddy-crop-green-stalks-water_20260217_035442.png');
    this.load.image('farm_bean',         F + 'farming-bean-plant-climbing-green-vine_20260217_035639.png');
    this.load.image('farm_carrot_tomato',F + 'carrot_and_tomato.png');

    // crops - harvested
    this.load.image('farm_wheat_bundle', F + 'farm_crops_harvested-harvested-wheat-bundle-grain-sheaf-001.png');
    this.load.image('farm_vegbasket',    F + 'farm_crops_harvested-vegetable-basket-mixed-harvest-crops-002.png');
    this.load.image('farm_fruitcrate',   F + 'farm_crops_harvested-fruit-crate-apple-orange-harvest-003.png');
    this.load.image('farm_flowers',      F + 'farm_crops_harvested-flower-bouquet-picked-garden-flowers-004.png');

    // seeds
    this.load.image('farm_treesapling',  F + 'farm_crops_seeds-tree-sapling-young-plant-seedling-004.png');
    this.load.image('farm_wheatseeds',   F + 'farm_crops_seeds-wheat-seeds-grain-planting-item-002.png');
    this.load.image('farm_flowerseeds',  F + 'farm_crops_seeds-flower-seeds-garden-planting-packet-003.png');

    // animal products
    this.load.image('farm_milk',         F + 'farm_animal_products-milk-bottle-dairy-product-farming-002.png');
    this.load.image('farm_wool',         F + 'farm_animal_products-wool-bundle-sheep-product-farming-003.png');

    // nature / decoration
    this.load.image('farm_tree',         F + 'tree.png');
    this.load.image('farm_appletree',    F + 'farming-apple-tree-small-red-fruit_20260217_035705.png');
    this.load.image('farm_cherrytree',   F + 'farming-spring-cherry-blossom-tree-pink_20260217_042527.png');
    this.load.image('farm_autumntree',   F + 'farming-autumn-maple-tree-orange-leaves_20260217_042626.png');
    this.load.image('farm_sunflower',    F + 'farming-sunflower-tall-yellow-bloom_20260217_035327.png');
    this.load.image('farm_scarecrow',    F + 'farming-scarecrow-straw-hat-field_20260217_041552.png');
    this.load.image('farm_beehive',      F + 'farming-beehive-wooden-box-stacked_20260217_041441.png');
    this.load.image('farm_fence',        F + 'farming-fence-wooden-picket-section_20260217_041500.png');
    this.load.image('farm_gate',         F + 'farming-gate-farm-wooden-swinging_20260217_041513.png');
    this.load.image('farm_mailbox',      F + 'farming-mailbox-rustic-wooden-flag_20260217_041532.png');
    this.load.image('farm_basket',       F + 'farming-basket-woven-carrying-harvest_20260217_040932.png');
    this.load.image('farm_barrel',       F + 'farming-barrel-wooden-wine-storage_20260217_042344.png');
    this.load.image('farm_chest',        F + 'farming-chest-storage-wooden-lid_20260217_042325.png');
    this.load.image('farm_plantpot',     F + 'farming-plant-pot-indoor-houseplant_20260217_042358.png');
    this.load.image('farm_flowervase',   F + 'farming-flower-vase-ceramic-colorful_20260217_042024.png');

    // weather / sky
    this.load.image('farm_rainbow',      F + 'farming-rainbow-colorful-arc-sky_20260217_042721.png');
    this.load.image('farm_raincloud',    F + 'farming-rain-cloud-dark-droplets_20260217_042657.png');
    this.load.image('farm_harvestmoon',  F + 'farming-harvest-moon-large-orange-sky_20260217_042949.png');
    this.load.image('farm_shootingstar', F + 'farming-shooting-star-bright-night-sky_20260217_043003.png');
    this.load.image('farm_fog',          F + 'farming-fog-mist-white-transparent-low_20260217_043023.png');
    this.load.image('farm_fallenleaves', F + 'farming-fallen-leaves-pile-autumn-brown_20260217_042802.png');

    // grass tiles
    this.load.image('farm_grass',        F + 'grass.png');
    this.load.image('farm_grass_up',     F + 'environment/grass/up.png');
    this.load.image('farm_earth',        F + 'earth.png');

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
