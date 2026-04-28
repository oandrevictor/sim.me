import Phaser from 'phaser'
import type { BotNirv } from '../entities/BotNirv'
import type { Stage } from '../entities/Stage'
import { addBotRow } from './components/CardRow'
import { addContextTabs, LEFT_X, PANEL_H, PANEL_W } from './components/WorkPanelControls'
import {
  addStageWorkSection,
  type StagePanelHitTarget,
  type StageWorkBridge,
} from './WorkPanelStageSection'
import { addFarmWorkSection, type FarmWorkBridge } from './WorkPanelFarmSection'
import {
  addRestaurantWorkSection,
  type RestaurantPageControls,
} from './WorkPanelRestaurantSection'
import { buildWorkPanelChrome } from './WorkPanelChrome'
import { emptyFarmBridge, emptyStageBridge } from './workPanelDefaults'
import type { RestaurantStaffBridge, WorkContext } from './workPanelTypes'

export type { RestaurantStaffBridge, RestaurantStaffUiView } from './workPanelTypes'

export const WORK_PANEL_WIDTH = PANEL_W
export const WORK_PANEL_HEIGHT = PANEL_H
const BAR_HEIGHT = 44

export class WorkPanel {
  readonly container: Phaser.GameObjects.Container
  private content!: Phaser.GameObjects.Container
  private disabledText!: Phaser.GameObjects.Text
  private titleText!: Phaser.GameObjects.Text
  private activeContext: WorkContext | null = null
  private availabilityKey = ''
  private restaurantPage = 0
  private farmPage = 0

  private isPlayerInRestaurant: () => boolean = () => false
  private getPlayerStage: () => Stage | null = () => null
  private getStageWatchers: (stageId: string) => BotNirv[] = () => []
  private getStagePerformers: (stageId: string) => BotNirv[] = () => []
  private stageBridge: StageWorkBridge = emptyStageBridge()
  private restaurantStaffBridge: RestaurantStaffBridge | null = null
  private farmBridge: FarmWorkBridge = emptyFarmBridge()

  private hitTargets: StagePanelHitTarget[] = []
  private soloPickIdx = 0
  private bandPickIdx = 0

  constructor(scene: Phaser.Scene) {
    this.container = scene.add.container(0, -BAR_HEIGHT - 8)
    this.container.setVisible(false)
    const chrome = buildWorkPanelChrome(scene, this.container)
    this.content = chrome.content
    this.disabledText = chrome.disabledText
    this.titleText = chrome.titleText
  }

  setProviders(
    _getBotNirvs: () => BotNirv[],
    isPlayerInRestaurant: () => boolean,
    getPlayerStage: () => Stage | null,
    getStageWatchers: (stageId: string) => BotNirv[],
    getStagePerformers: (stageId: string) => BotNirv[],
    stageBridge: StageWorkBridge,
    restaurantStaffBridge: RestaurantStaffBridge | null = null,
    farmBridge?: FarmWorkBridge,
  ): void {
    this.isPlayerInRestaurant = isPlayerInRestaurant
    this.getPlayerStage = getPlayerStage
    this.getStageWatchers = getStageWatchers
    this.getStagePerformers = getStagePerformers
    this.stageBridge = stageBridge
    this.restaurantStaffBridge = restaurantStaffBridge
    if (farmBridge) this.farmBridge = farmBridge
  }

  refresh(): void {
    this.content.removeAll(true)
    this.hitTargets = []
    const scene = this.container.scene
    const stage = this.getPlayerStage()
    const contexts = this.availableContexts(stage)
    this.syncActiveContext(contexts)
    this.disabledText.setVisible(contexts.length === 0)
    if (!this.activeContext) {
      this.titleText.setText('Work')
      return
    }

    this.titleText.setText(this.contextTitle(this.activeContext))
    let y = -PANEL_H + 42
    if (contexts.length > 1) {
      y = addContextTabs(scene, this.content, contexts, this.activeContext, this.hitTargets, ctx => {
        this.activeContext = ctx
      })
    }

    if (this.activeContext === 'stage' && stage) this.renderStage(scene, stage, y)
    else if (this.activeContext === 'restaurant') this.renderRestaurant(scene, y)
    else if (this.activeContext === 'farm') {
      addFarmWorkSection(scene, this.content, this.farmBridge, this.hitTargets, this.farmPages(), y)
    }
  }

  tryConsumeWorkPanelClick(canvasX: number, canvasY: number): boolean {
    if (!this.container.visible || this.hitTargets.length === 0) return false
    for (const t of this.hitTargets) {
      const r = t.getBounds()
      if (!Phaser.Geom.Rectangle.Contains(r, canvasX, canvasY)) continue
      t.action()
      return true
    }
    return false
  }

  tryConsumeStagePanelClick(canvasX: number, canvasY: number): boolean {
    return this.tryConsumeWorkPanelClick(canvasX, canvasY)
  }

  tryConsumeRestaurantPanelClick(canvasX: number, canvasY: number): boolean {
    return this.tryConsumeWorkPanelClick(canvasX, canvasY)
  }

  tryConsumeFarmPanelClick(canvasX: number, canvasY: number): boolean {
    return this.tryConsumeWorkPanelClick(canvasX, canvasY)
  }

  private renderStage(scene: Phaser.Scene, stage: Stage, startY: number): void {
    const listTop = addStageWorkSection(scene, this.content, PANEL_H - 42, stage.id, this.stageBridge, {
      getSoloIndex: () => this.soloPickIdx,
      bumpSolo: () => { this.soloPickIdx++ },
      getBandIndex: () => this.bandPickIdx,
      bumpBand: () => { this.bandPickIdx++ },
    }, this.hitTargets)
    const y = Math.max(startY, listTop)
    const performers = this.getStagePerformers(stage.id)
    if (performers.length > 0) this.addBotGroup(scene, 'On stage', performers, y)
    else this.addBotGroup(scene, 'Audience', this.getStageWatchers(stage.id), y)
  }

  private renderRestaurant(scene: Phaser.Scene, startY: number): void {
    addRestaurantWorkSection(
      scene,
      this.content,
      this.restaurantStaffBridge,
      this.hitTargets,
      this.restaurantPages(),
      startY,
    )
  }

  private addBotGroup(scene: Phaser.Scene, label: string, bots: BotNirv[], y: number): void {
    this.content.add(scene.add.text(LEFT_X, y, label, {
      fontSize: '11px',
      color: '#f0c85a',
      fontStyle: 'bold',
    }).setOrigin(0, 0))
    bots.slice(0, 5).forEach((bot, i) => addBotRow(scene, this.content, bot, LEFT_X, y + 18 + i * 25))
  }

  private availableContexts(stage: Stage | null): WorkContext[] {
    const contexts: WorkContext[] = []
    if (stage) contexts.push('stage')
    if (this.isPlayerInRestaurant()) contexts.push('restaurant')
    if (this.farmBridge.getFarmView().totalCrops > 0) contexts.push('farm')
    return contexts
  }

  private syncActiveContext(contexts: WorkContext[]): void {
    const key = contexts.join('|')
    if (key !== this.availabilityKey) {
      this.activeContext = contexts[0] ?? null
      this.availabilityKey = key
    } else if (!this.activeContext || !contexts.includes(this.activeContext)) {
      this.activeContext = contexts[0] ?? null
    }
  }

  private contextTitle(ctx: WorkContext): string {
    if (ctx === 'stage') return 'Stage Work'
    if (ctx === 'restaurant') return 'Restaurant Work'
    return 'Farm Work'
  }

  private restaurantPages(): RestaurantPageControls {
    return { getPage: () => this.restaurantPage, setPage: page => { this.restaurantPage = page } }
  }

  private farmPages(): import('./WorkPanelFarmSection').FarmPageControls {
    return { getPage: () => this.farmPage, setPage: page => { this.farmPage = page } }
  }
}
