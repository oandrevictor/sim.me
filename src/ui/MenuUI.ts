import Phaser from 'phaser'
import type { BotNirv } from '../entities/BotNirv'
import type { Stage } from '../entities/Stage'
import type { StageWorkBridge } from './WorkPanelStageSection'
import { ShopPanel } from './ShopPanel'
import { WorkPanel, WORK_PANEL_HEIGHT, WORK_PANEL_WIDTH, type RestaurantStaffBridge } from './WorkPanel'
import type { FarmWorkBridge } from './WorkPanelFarmSection'
import type { StockWorkBridge } from './WorkPanelStockSection'
import { BAR_HEIGHT, BAR_WIDTH, buildMenuDock, refreshMenuDock, type MenuTab, type TabButton } from './MenuDock'
import { SHOP_PANEL_HEIGHT, SHOP_PANEL_WIDTH } from './ShopPanelLayout'
import { RelationshipsPanel, RELATIONSHIPS_PANEL_HEIGHT, RELATIONSHIPS_PANEL_WIDTH } from './RelationshipsPanel'
import { NirvsPanel, NIRVS_PANEL_HEIGHT, NIRVS_PANEL_WIDTH } from './NirvsPanel'
import type { RelationshipSystem } from '../systems/RelationshipSystem'
import type { Building } from '../entities/Building'
import type { Nirv } from '../entities/Nirv'

export class MenuUI {
  private scene: Phaser.Scene
  private gameEvents: Phaser.Events.EventEmitter
  private container: Phaser.GameObjects.Container
  private tabBar!: Phaser.GameObjects.Container
  private activeTab: MenuTab = 'home'
  private tabButtons = new Map<MenuTab, TabButton>()

  private shopPanel!: ShopPanel
  private workPanel!: WorkPanel
  private relationshipsPanel!: RelationshipsPanel
  private nirvsPanel!: NirvsPanel

  constructor(scene: Phaser.Scene, gameEvents: Phaser.Events.EventEmitter) {
    this.scene = scene
    this.gameEvents = gameEvents
    this.container = scene.add.container(0, 0)

    this.shopPanel = new ShopPanel(scene, gameEvents)
    this.container.add(this.shopPanel.container)

    this.workPanel = new WorkPanel(scene)
    this.container.add(this.workPanel.container)

    this.relationshipsPanel = new RelationshipsPanel(scene)
    this.container.add(this.relationshipsPanel.container)

    this.nirvsPanel = new NirvsPanel(scene)
    this.container.add(this.nirvsPanel.container)

    this.buildTabBar()
    this.setTab('home')
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
    const barBounds = new Phaser.Geom.Rectangle(
      this.container.x - BAR_WIDTH / 2, this.container.y - BAR_HEIGHT, BAR_WIDTH, BAR_HEIGHT,
    )
    if (barBounds.contains(px, py)) return true
    if (this.activeTab === 'shop' || this.activeTab === 'work' || this.activeTab === 'social' || this.activeTab === 'nirvs') {
      const panelH =
        this.activeTab === 'work' ? WORK_PANEL_HEIGHT
        : this.activeTab === 'social' ? RELATIONSHIPS_PANEL_HEIGHT
        : this.activeTab === 'nirvs' ? NIRVS_PANEL_HEIGHT
        : SHOP_PANEL_HEIGHT
      const panelW =
        this.activeTab === 'work' ? WORK_PANEL_WIDTH
        : this.activeTab === 'social' ? RELATIONSHIPS_PANEL_WIDTH
        : this.activeTab === 'nirvs' ? NIRVS_PANEL_WIDTH
        : SHOP_PANEL_WIDTH
      const panelBounds = new Phaser.Geom.Rectangle(
        this.container.x - panelW / 2,
        this.container.y - BAR_HEIGHT - panelH - 6,
        panelW, panelH,
      )
      if (panelBounds.contains(px, py)) return true
    }
    return false
  }

  isShopMode(): boolean { return this.activeTab === 'shop' }
  isInventoryMode(): boolean { return this.activeTab === 'shop' && this.shopPanel.isInventoryMode() }

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
    this.setTab(tab === this.activeTab ? 'home' : tab)
  }

  private setTab(tab: MenuTab): void {
    const prevTab = this.activeTab
    this.activeTab = tab
    this.refreshTabStyles()

    this.shopPanel.container.setVisible(tab === 'shop')
    this.workPanel.container.setVisible(tab === 'work')
    this.relationshipsPanel.container.setVisible(tab === 'social')
    this.nirvsPanel.container.setVisible(tab === 'nirvs')
    if (tab !== 'social') this.relationshipsPanel.clearSelection()

    if (tab === 'shop') this.gameEvents.emit('menu:shop-open')
    else if (prevTab === 'shop') this.gameEvents.emit('menu:shop-close')

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
    getBuildings: () => readonly Building[],
    getRelationships: () => RelationshipSystem | null,
  ): void {
    this.nirvsPanel.setProviders(getPlayer, getBots, getBuildings, getRelationships)
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
