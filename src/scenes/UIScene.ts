import Phaser from 'phaser'
import { MenuUI } from '../ui/MenuUI'
import type { GameScene } from './GameScene'

export class UIScene extends Phaser.Scene {
  menuUI!: MenuUI
  private helpText!: Phaser.GameObjects.Text

  constructor() {
    super({ key: 'UIScene' })
  }

  create(): void {
    const gameScene = this.scene.get('GameScene') as GameScene

    this.menuUI = new MenuUI(this, gameScene.events)
    this.positionUI()

    this.menuUI.setProviders(
      () => gameScene.getBotNirvs(),
      () => gameScene.isPlayerInsideRestaurant(),
    )

    this.helpText = this.add.text(10, 10, 'Move: WASD / Arrows  |  Shop: place & move objects  |  ESC to cancel', {
      fontSize: '12px',
      color: '#ffffff',
    })
    this.helpText.setAlpha(0.6)

    this.scale.on('resize', () => this.positionUI())
  }

  update(): void {
    this.menuUI.updateWorkPanel()
  }

  private positionUI(): void {
    this.menuUI.setPosition(
      this.scale.width / 2,
      this.scale.height,
    )
  }
}
