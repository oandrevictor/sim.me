import Phaser from 'phaser'
import { GameScene } from './scenes/GameScene'
import { UIScene } from './scenes/UIScene'

const GAME_FONT_FAMILY = '"Fredoka", "Trebuchet MS", sans-serif'

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: window.innerWidth,
  height: window.innerHeight,
  parent: 'game',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      debug: false,
    },
  },
  scene: [GameScene, UIScene],
}

installDefaultTextFont()
void startGame()

function installDefaultTextFont(): void {
  type TextFactory = typeof Phaser.GameObjects.GameObjectFactory.prototype.text
  const factory = Phaser.GameObjects.GameObjectFactory.prototype
  const createText = factory.text as TextFactory
  factory.text = function (this: Phaser.GameObjects.GameObjectFactory, x, y, text, style) {
    return createText.call(this, x, y, text, { fontFamily: GAME_FONT_FAMILY, ...style })
  } as TextFactory
}

async function startGame(): Promise<void> {
  await loadGameFont()
  new Phaser.Game(config)
}

async function loadGameFont(): Promise<void> {
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load(`400 16px ${GAME_FONT_FAMILY}`),
        document.fonts.load(`600 16px ${GAME_FONT_FAMILY}`),
      ]),
      new Promise(resolve => window.setTimeout(resolve, 1200)),
    ])
  } catch {
    // Fall back to the CSS font stack if the hosted font is unavailable.
  }
}
