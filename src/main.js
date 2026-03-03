import Phaser from 'phaser';
import BootScene from './scenes/BootScene.js';
import HubScene from './scenes/HubScene.js';
import OverworldScene from './scenes/OverworldScene.js';
import DeckSelectScene from './scenes/DeckSelectScene.js';
import BattleScene from './scenes/BattleScene.js';
import DeckBuilderScene from './scenes/DeckBuilderScene.js';
import MasterModeScene from './scenes/MasterModeScene.js';
import CraftingScene from './scenes/CraftingScene.js';

const config = {
  type: Phaser.AUTO,
  width: 1024,
  height: 768,
  parent: document.body,
  backgroundColor: '#1a1a2e',
  pixelArt: true,
  physics: {
    default: 'arcade',
    arcade: { debug: false }
  },
  scene: [BootScene, HubScene, OverworldScene, DeckSelectScene, BattleScene, DeckBuilderScene, MasterModeScene, CraftingScene]
};

new Phaser.Game(config);
