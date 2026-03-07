import Phaser from 'phaser';
import BootScene from './scenes/BootScene.js';
import ArtifactPickScene from './scenes/ArtifactPickScene.js';
import HubScene from './scenes/HubScene.js';
import OverworldScene from './scenes/OverworldScene.js';
import DeckSelectScene from './scenes/DeckSelectScene.js';
import BattleScene from './scenes/BattleScene.js';
import DeckBuilderScene from './scenes/DeckBuilderScene.js';
import MasterModeScene from './scenes/MasterModeScene.js';
import CraftingScene from './scenes/CraftingScene.js';
import MmoMapScene from './scenes/MmoMapScene.js';
import PvpBattleScene from './scenes/PvpBattleScene.js';
import YakuzaHideoutScene from './scenes/YakuzaHideoutScene.js';
import TutorialScene from './scenes/TutorialScene.js';
import FarmScene from './scenes/FarmScene.js';

const config = {
  type: Phaser.AUTO,
  width: 1024,
  height: 768,
  parent: document.body,
  backgroundColor: '#1a1a2e',
  pixelArt: true,
  input: { mouse: { preventDefaultDown: true }, touch: { capture: true } },
  disableContextMenu: true,
  physics: {
    default: 'arcade',
    arcade: { debug: false }
  },
  scene: [BootScene, ArtifactPickScene, HubScene, OverworldScene, DeckSelectScene, BattleScene, DeckBuilderScene, MasterModeScene, CraftingScene, MmoMapScene, PvpBattleScene, YakuzaHideoutScene, TutorialScene, FarmScene]
};

new Phaser.Game(config);
