import Phaser from 'phaser'
import type { BotNirv } from '../entities/BotNirv'
import type { Stage } from '../entities/Stage'
import { addBotRow } from './components/CardRow'
import { createPanelBackground } from './components/Panel'
import {
  addStageWorkSection,
  type StagePanelHitTarget,
  type StageWorkBridge,
} from './WorkPanelStageSection'

export const WORK_PANEL_WIDTH = 520
export const WORK_PANEL_HEIGHT = 300
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
  private getStagePerformers: (stageId: string) => BotNirv[] = () => []
  private stageBridge: StageWorkBridge = {
    getPerformanceView: () => null,
    setStageAttraction: () => false,
    getBands: () => [],
    getPerformerBots: () => [],
    formBandFromFirstTwoPerformers: () => false,
  }

  private soloPickIdx = 0
  private bandPickIdx = 0
  /** Clicks routed from GameScene (see MenuUI / GameScene.onWorldClicked) */
  private stagePanelHitTargets: StagePanelHitTarget[] = []

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
    getStagePerformers: (stageId: string) => BotNirv[],
    stageBridge: StageWorkBridge,
  ): void {
    this.getBotNirvs = getBotNirvs
    this.isPlayerInRestaurant = isPlayerInRestaurant
    this.getPlayerStage = getPlayerStage
    this.getStageWatchers = getStageWatchers
    this.getStagePerformers = getStagePerformers
    this.stageBridge = stageBridge
  }

  refresh(): void {
    this.content.removeAll(true)
    this.stagePanelHitTargets = []

    const stage = this.getPlayerStage()
    const inRestaurant = this.isPlayerInRestaurant()
    const active = stage !== null || inRestaurant

    this.disabledText.setVisible(!active)
    if (!active) {
      this.titleText.setText('Work')
      return
    }

    const scene = this.container.scene

    if (stage !== null) {
      this.titleText.setText('Stage')
      const listTop = addStageWorkSection(
        scene,
        this.content,
        WORK_PANEL_HEIGHT,
        stage.id,
        this.stageBridge,
        {
          getSoloIndex: () => this.soloPickIdx,
          bumpSolo: () => { this.soloPickIdx++ },
          getBandIndex: () => this.bandPickIdx,
          bumpBand: () => { this.bandPickIdx++ },
        },
        this.stagePanelHitTargets,
      )
      let listY = listTop
      const leftX = -WORK_PANEL_WIDTH / 2 + 20
      const rowH = 26
      const performers = this.getStagePerformers(stage.id)
      if (performers.length > 0) {
        this.content.add(scene.add.text(-WORK_PANEL_WIDTH / 2 + 14, listY, 'On stage', {
          fontSize: '11px', color: '#ff88cc', fontStyle: 'bold',
        }).setOrigin(0, 0))
        listY += 14
        performers.forEach((bot, i) => addBotRow(scene, this.content, bot, leftX, listY + i * rowH))
        listY += performers.length * rowH + 8
      }
      if (performers.length > 0) {
        this.content.add(scene.add.text(-WORK_PANEL_WIDTH / 2 + 14, listY, 'Audience', {
          fontSize: '11px', color: '#aabbcc', fontStyle: 'bold',
        }).setOrigin(0, 0))
        listY += 14
      }
      this.renderBotList(
        this.getStageWatchers(stage.id),
        'No audience heading here yet',
        listY,
      )
    } else {
      this.titleText.setText('Customers')
      const restaurantBots = this.getBotNirvs().filter(b =>
        b.state === 'walking_to_chair' || b.state === 'seated' ||
        b.state === 'awaiting_service' || b.state === 'eating',
      )
      this.renderBotList(restaurantBots, 'No customers right now')
    }
  }

  private renderBotList(bots: BotNirv[], emptyMsg: string, startY?: number): void {
    const scene = this.container.scene
    const baseY = startY ?? -WORK_PANEL_HEIGHT + 42

    if (bots.length === 0) {
      const emptyText = scene.add.text(-WORK_PANEL_WIDTH / 2 + 14, baseY, emptyMsg, {
        fontSize: '12px', color: '#8888aa',
      }).setOrigin(0, 0)
      this.content.add(emptyText)
      return
    }

    const rowH = 28
    const leftX = -WORK_PANEL_WIDTH / 2 + 20
    bots.forEach((bot, i) => addBotRow(scene, this.content, bot, leftX, baseY + i * rowH))
  }

  private build(scene: Phaser.Scene): void {
    const bg = createPanelBackground(
      scene, WORK_PANEL_WIDTH, WORK_PANEL_HEIGHT, -WORK_PANEL_WIDTH / 2, -WORK_PANEL_HEIGHT,
    )
    this.container.add(bg)

    this.titleText = scene.add.text(0, -WORK_PANEL_HEIGHT + 18, 'Work', {
      fontSize: '14px', color: '#ffd700', fontStyle: 'bold',
    }).setOrigin(0.5)
    this.container.add(this.titleText)

    this.disabledText = scene.add.text(0, -WORK_PANEL_HEIGHT / 2, 'Enter a restaurant or stand on a stage', {
      fontSize: '12px', color: '#666688',
    }).setOrigin(0.5)
    this.container.add(this.disabledText)

    this.content = scene.add.container(0, 0)
    this.container.add(this.content)
  }

  /** Returns true if a stage control was activated (caller should skip world input). */
  tryConsumeStagePanelClick(canvasX: number, canvasY: number): boolean {
    if (!this.container.visible || this.stagePanelHitTargets.length === 0) return false
    if (this.getPlayerStage() === null) return false
    for (const t of this.stagePanelHitTargets) {
      const r = t.getBounds()
      if (Phaser.Geom.Rectangle.Contains(r, canvasX, canvasY)) {
        t.action()
        return true
      }
    }
    return false
  }
}
