import Phaser from 'phaser'
import { GameScene } from './scenes/GameScene'
import { CANVAS_WIDTH, CANVAS_HEIGHT } from './config/world'

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  parent: 'game',
  physics: {
    default: 'arcade',
    arcade: {
      debug: false,
    },
  },
  scene: [GameScene],
}

new Phaser.Game(config)
