import Phaser from 'phaser'
import type { BotNirv } from '../entities/BotNirv'
import type { Stage } from '../entities/Stage'
import type { StageWorkBridge } from './WorkPanelStageSection'
import { BuildPanel, type BuildTool } from './BuildPanel'
import { ShopPanel } from './ShopPanel'
import { WorkPanel, type RestaurantStaffBridge } from './WorkPanel'
import type { FarmWorkBridge } from './WorkPanelFarmSection'
import type { StockWorkBridge } from './WorkPanelStockSection'
import { buildMenuDock, refreshMenuDock, type MenuTab, type TabButton } from './MenuDock'
import { RelationshipsPanel } from './RelationshipsPanel'
import { NirvsPanel } from './NirvsPanel'
import type { RelationshipSystem } from '../systems/RelationshipSystem'
import type { Nirv } from '../entities/Nirv'
import type { LotType } from '../storage/lotPersistence'
import type { HomeSpace } from '../systems/HomeSpace'
import { getInventoryDropBounds, getMenuBarBounds, getMenuPanelBounds } from './menuHitTargets'

export class MenuUI {
  private scene: Phaser.Scene
  private gameEvents: Phaser.Events.EventEmitter
  private container: Phaser.GameObjects.Container
  private tabBar!: Phaser.GameObjects.Container
  private activeTab: MenuTab = 'play'
  private tabButtons = new Map<MenuTab, TabButton>()

  private buildPanel!: BuildPanel
  private shopPanel!: ShopPanel
  private workPanel!: WorkPanel
  private relationshipsPanel!: RelationshipsPanel
  private nirvsPanel!: NirvsPanel

  constructor(scene: Phaser.Scene, gameEvents: Phaser.Events.EventEmitter) {
    this.scene = scene
    this.gameEvents = gameEvents
    this.container = scene.add.container(0, 0)

    this.buildPanel = new BuildPanel(scene)
    this.container.add(this.buildPanel.container)

    this.shopPanel = new ShopPanel(scene, gameEvents)
    this.container.add(this.shopPanel.container)

    this.workPanel = new WorkPanel(scene)
    this.container.add(this.workPanel.container)

    this.relationshipsPanel = new RelationshipsPanel(scene)
    this.container.add(this.relationshipsPanel.container)

    this.nirvsPanel = new NirvsPanel(scene)
    this.container.add(this.nirvsPanel.container)

    this.buildTabBar()
    this.setTab('play')
  }

  // ── Public API ──

  setPosition(x: number, y: number): void {
    this.container.setPosition(x, y)
  }

  /** Stage line-up buttons are hit-tested in GameScene because Phaser input often never reaches UIScene. */
  tryConsumeWorkPanelStageClick(canvasX: number, canvasY: number): boolean {
    if (this.activeTab !== 'work') return false
    return this.workPanel.tryConsumeWorkPanelClick(canvasX, canvasY)
  }

  isPointerOverUI(pointer: Phaser.Input.Pointer): boolean {
    // Use screen-space position; pointer.x/y can follow the last camera hit (world space).
    const px = pointer.position.x
    const py = pointer.position.y
    if (getMenuBarBounds(this.container.x, this.container.y).contains(px, py)) return true
    return getMenuPanelBounds(this.activeTab, this.container.x, this.container.y)?.contains(px, py) ?? false
  }

  isPointerOverInventoryDropTarget(pointer: Phaser.Input.Pointer): boolean {
    const px = pointer.position.x
    const py = pointer.position.y
    return getInventoryDropBounds(
      this.activeTab,
      this.shopPanel.isInventoryMode(),
      this.container.x,
      this.container.y,
    )?.contains(px, py) ?? false
  }

  isShopMode(): boolean { return this.activeTab === 'shop' }
  isBuildMode(): boolean { return this.activeTab === 'build' }
  isInventoryMode(): boolean { return this.activeTab === 'shop' && this.shopPanel.isInventoryMode() }
  isPhysicsMode(): boolean { return this.activeTab === 'physics' }

  getSelectedLotType(): LotType { return this.buildPanel.getSelectedLotType() }
  getSelectedBuildTool(): BuildTool { return this.buildPanel.getSelectedTool() }

  openLotMergePrompt(onMerge: () => void, onCancel: () => void): void {
    this.buildPanel.openMergePrompt(onMerge, onCancel)
  }

  closeLotMergePrompt(): void {
    this.buildPanel.closeMergePrompt()
  }

  setProviders(
    getBotNirvs: () => BotNirv[],
    isPlayerInRestaurant: () => boolean,
    getPlayerStage: () => Stage | null = () => null,
    getStageWatchers: (stageId: string) => BotNirv[] = () => [],
    getStagePerformers: (stageId: string) => BotNirv[] = () => [],
    stageBridge: StageWorkBridge,
    restaurantStaffBridge: RestaurantStaffBridge | null = null,
    farmBridge?: FarmWorkBridge,
    stockBridge?: StockWorkBridge,
  ): void {
    this.workPanel.setProviders(
      getBotNirvs,
      isPlayerInRestaurant,
      getPlayerStage,
      getStageWatchers,
      getStagePerformers,
      stageBridge,
      restaurantStaffBridge,
      farmBridge,
      stockBridge,
    )
  }

  updateWorkPanel(): void {
    if (this.activeTab !== 'work') return
    this.workPanel.refresh()
  }

  refreshInventoryGrid(): void {
    this.shopPanel.refreshInventoryGrid()
  }

  // ── Tab Bar ──

  private buildTabBar(): void {
    this.tabBar = this.scene.add.container(0, 0)
    this.container.add(this.tabBar)
    this.tabButtons = buildMenuDock(this.scene, this.tabBar, tab => this.onTabClicked(tab))
    this.refreshTabStyles()
  }

  private refreshTabStyles(): void {
    refreshMenuDock(this.tabButtons, this.activeTab)
  }

  private onTabClicked(tab: MenuTab): void {
    this.setTab(tab === this.activeTab ? 'play' : tab)
  }

  private setTab(tab: MenuTab): void {
    const prevTab = this.activeTab
    this.activeTab = tab
    this.refreshTabStyles()

    this.buildPanel.container.setVisible(tab === 'build')
    this.shopPanel.container.setVisible(tab === 'shop')
    this.workPanel.container.setVisible(tab === 'work')
    this.relationshipsPanel.container.setVisible(tab === 'social')
    this.nirvsPanel.container.setVisible(tab === 'nirvs')
    if (tab !== 'social') this.relationshipsPanel.clearSelection()

    if (tab === 'shop' && prevTab !== 'shop') this.gameEvents.emit('menu:shop-open')
    if (prevTab === 'shop' && tab !== 'shop') this.gameEvents.emit('menu:shop-close')
    if (tab === 'build' && prevTab !== 'build') this.gameEvents.emit('menu:build-open')
    if (prevTab === 'build' && tab !== 'build') {
      this.closeLotMergePrompt()
      this.gameEvents.emit('menu:build-close')
    }
    if (tab === 'physics' && prevTab !== 'physics') this.gameEvents.emit('menu:physics-open')
    if (prevTab === 'physics' && tab !== 'physics') this.gameEvents.emit('menu:physics-close')

    if (tab === 'work') this.workPanel.refresh()
    if (tab === 'social') this.relationshipsPanel.refresh()
    if (tab === 'nirvs') this.nirvsPanel.refresh()
  }

  setRelationshipProviders(
    getBots: () => readonly BotNirv[],
    getRelationships: () => RelationshipSystem | null,
  ): void {
    this.relationshipsPanel.setProviders(getBots, getRelationships)
  }

  setNirvsProviders(
    getPlayer: () => Nirv | null,
    getBots: () => readonly BotNirv[],
    getHomes: () => readonly HomeSpace[],
    getRelationships: () => RelationshipSystem | null,
  ): void {
    this.nirvsPanel.setProviders(getPlayer, getBots, getHomes, getRelationships)
  }

  refreshRelationshipsPanel(): void {
    if (this.activeTab !== 'social') return
    this.relationshipsPanel.refresh()
  }

  refreshNirvsPanel(): void {
    if (this.activeTab !== 'nirvs') return
    this.nirvsPanel.refresh()
  }
}
