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

export class MenuUI {
  private scene: Phaser.Scene
  private gameEvents: Phaser.Events.EventEmitter
  private container: Phaser.GameObjects.Container
  private tabBar!: Phaser.GameObjects.Container
  private activeTab: MenuTab = 'home'
  private tabButtons = new Map<MenuTab, TabButton>()

  private shopPanel!: ShopPanel
  private workPanel!: WorkPanel

  constructor(scene: Phaser.Scene, gameEvents: Phaser.Events.EventEmitter) {
    this.scene = scene
    this.gameEvents = gameEvents
    this.container = scene.add.container(0, 0)

    this.shopPanel = new ShopPanel(scene, gameEvents)
    this.container.add(this.shopPanel.container)

    this.workPanel = new WorkPanel(scene)
    this.container.add(this.workPanel.container)

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
    if (this.activeTab === 'shop' || this.activeTab === 'work') {
      const panelH = this.activeTab === 'work' ? WORK_PANEL_HEIGHT : SHOP_PANEL_HEIGHT
      const panelW = this.activeTab === 'work' ? WORK_PANEL_WIDTH : SHOP_PANEL_WIDTH
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

    if (tab === 'shop') this.gameEvents.emit('menu:shop-open')
    else if (prevTab === 'shop') this.gameEvents.emit('menu:shop-close')

    if (tab === 'work') this.workPanel.refresh()
  }
}
