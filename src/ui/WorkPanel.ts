import Phaser from 'phaser'
import type { BotNirv } from '../entities/BotNirv'
import type { Stage } from '../entities/Stage'
import { addBotRow } from './components/CardRow'
import { createPanelBackground } from './components/Panel'

const PANEL_WIDTH = 520
const PANEL_HEIGHT = 220
const BAR_HEIGHT = 44

export class WorkPanel {
  readonly container: Phaser.GameObjects.Container
  private content!: Phaser.GameObjects.Container
  private disabledText!: Phaser.GameObjects.Text
  private titleText!: Phaser.GameObjects.Text

  private getBotNirvs: () => BotNirv[] = () => []
  private isPlayerInRestaurant: () => boolean = () => false
  private getPlayerStage: () => Stage | null = () => null
  private getStageWatchers: (stageId: string) => BotNirv[] = () => []

  constructor(scene: Phaser.Scene) {
    this.container = scene.add.container(0, -BAR_HEIGHT - 6)
    this.container.setVisible(false)
    this.build(scene)
  }

  setProviders(
    getBotNirvs: () => BotNirv[],
    isPlayerInRestaurant: () => boolean,
    getPlayerStage: () => Stage | null,
    getStageWatchers: (stageId: string) => BotNirv[],
  ): void {
    this.getBotNirvs = getBotNirvs
    this.isPlayerInRestaurant = isPlayerInRestaurant
    this.getPlayerStage = getPlayerStage
    this.getStageWatchers = getStageWatchers
  }

  refresh(): void {
    this.content.removeAll(true)

    const stage = this.getPlayerStage()
    const inRestaurant = this.isPlayerInRestaurant()
    const active = stage !== null || inRestaurant

    this.disabledText.setVisible(!active)
    if (!active) {
      this.titleText.setText('Work')
      return
    }

    if (stage !== null) {
      this.titleText.setText('Audience')
      this.renderBotList(this.getStageWatchers(stage.id), 'No audience yet')
    } else {
      this.titleText.setText('Customers')
      const restaurantBots = this.getBotNirvs().filter(b =>
        b.state === 'walking_to_chair' || b.state === 'seated' ||
        b.state === 'awaiting_service' || b.state === 'eating',
      )
      this.renderBotList(restaurantBots, 'No customers right now')
    }
  }

  private renderBotList(bots: BotNirv[], emptyMsg: string): void {
    const scene = this.container.scene

    if (bots.length === 0) {
      const emptyText = scene.add.text(0, -PANEL_HEIGHT / 2, emptyMsg, {
        fontSize: '12px', color: '#8888aa',
      }).setOrigin(0.5)
      this.content.add(emptyText)
      return
    }

    const startY = -PANEL_HEIGHT + 42
    const rowH = 32
    const leftX = -PANEL_WIDTH / 2 + 20
    bots.forEach((bot, i) => addBotRow(scene, this.content, bot, leftX, startY + i * rowH))
  }

  private build(scene: Phaser.Scene): void {
    const bg = createPanelBackground(scene, PANEL_WIDTH, PANEL_HEIGHT, -PANEL_WIDTH / 2, -PANEL_HEIGHT)
    this.container.add(bg)

    this.titleText = scene.add.text(0, -PANEL_HEIGHT + 18, 'Work', {
      fontSize: '14px', color: '#ffd700', fontStyle: 'bold',
    }).setOrigin(0.5)
    this.container.add(this.titleText)

    this.disabledText = scene.add.text(0, -PANEL_HEIGHT / 2, 'Enter a restaurant or stand on a stage', {
      fontSize: '12px', color: '#666688',
    }).setOrigin(0.5)
    this.container.add(this.disabledText)

    this.content = scene.add.container(0, 0)
    this.container.add(this.content)
  }
}
