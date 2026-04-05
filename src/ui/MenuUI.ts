import Phaser from 'phaser'
import type { BotNirv } from '../entities/BotNirv'
import type { Stage } from '../entities/Stage'
import { ShopPanel } from './ShopPanel'
import { WorkPanel } from './WorkPanel'

// ── Layout constants ──
const BAR_WIDTH = 360
const BAR_HEIGHT = 44
const TAB_W = 112
const TAB_H = 36
const TAB_GAP = 6
const PANEL_WIDTH = 520
const PANEL_HEIGHT = 220

type MenuTab = 'home' | 'shop' | 'work'

export class MenuUI {
  private scene: Phaser.Scene
  private gameEvents: Phaser.Events.EventEmitter
  private container: Phaser.GameObjects.Container
  private tabBar!: Phaser.GameObjects.Container
  private activeTab: MenuTab = 'home'
  private tabButtons = new Map<MenuTab, {
    bg: Phaser.GameObjects.Graphics
    label: Phaser.GameObjects.Text
    zone: Phaser.GameObjects.Zone
  }>()

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

  isPointerOverUI(pointer: Phaser.Input.Pointer): boolean {
    const px = pointer.x
    const py = pointer.y
    const barBounds = new Phaser.Geom.Rectangle(
      this.container.x - BAR_WIDTH / 2, this.container.y - BAR_HEIGHT, BAR_WIDTH, BAR_HEIGHT,
    )
    if (barBounds.contains(px, py)) return true
    if (this.activeTab === 'shop' || this.activeTab === 'work') {
      const panelBounds = new Phaser.Geom.Rectangle(
        this.container.x - PANEL_WIDTH / 2,
        this.container.y - BAR_HEIGHT - PANEL_HEIGHT - 6,
        PANEL_WIDTH, PANEL_HEIGHT,
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
  ): void {
    this.workPanel.setProviders(getBotNirvs, isPlayerInRestaurant, getPlayerStage, getStageWatchers)
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

    const tabs: { tab: MenuTab; label: string }[] = [
      { tab: 'home', label: 'Home' },
      { tab: 'shop', label: 'Shop' },
      { tab: 'work', label: 'Work' },
    ]
    const totalW = tabs.length * TAB_W + (tabs.length - 1) * TAB_GAP
    const startX = -totalW / 2

    const barBg = this.scene.add.graphics()
    barBg.fillStyle(0x1a1a2e, 0.88)
    barBg.fillRoundedRect(-BAR_WIDTH / 2, -BAR_HEIGHT - 2, BAR_WIDTH, BAR_HEIGHT + 4, { tl: 10, tr: 10, bl: 0, br: 0 })
    this.tabBar.add(barBg)

    tabs.forEach((t, i) => {
      const tx = startX + i * (TAB_W + TAB_GAP) + TAB_W / 2

      const bg = this.scene.add.graphics()
      bg.setPosition(tx, -BAR_HEIGHT / 2 - 1)

      const label = this.scene.add.text(tx, -BAR_HEIGHT / 2 - 1, t.label, {
        fontSize: '13px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5)

      const zone = this.scene.add.zone(tx, -BAR_HEIGHT / 2 - 1, TAB_W, TAB_H)
      zone.setInteractive({ useHandCursor: true })
      zone.on('pointerdown', () => this.onTabClicked(t.tab))
      zone.on('pointerover', () => { if (t.tab !== this.activeTab) label.setColor('#ffd700') })
      zone.on('pointerout', () => { if (t.tab !== this.activeTab) label.setColor('#aaaacc') })

      this.tabBar.add([bg, label, zone])
      this.tabButtons.set(t.tab, { bg, label, zone })
    })

    this.refreshTabStyles()
  }

  private refreshTabStyles(): void {
    this.tabButtons.forEach((btn, tab) => {
      btn.bg.clear()
      if (tab === this.activeTab) {
        btn.bg.fillStyle(0x3a3a5e, 1)
        btn.bg.fillRoundedRect(-TAB_W / 2, -TAB_H / 2, TAB_W, TAB_H, 6)
        btn.bg.lineStyle(1, 0xffd700, 0.6)
        btn.bg.strokeRoundedRect(-TAB_W / 2, -TAB_H / 2, TAB_W, TAB_H, 6)
        btn.label.setColor('#ffd700')
      } else {
        btn.bg.fillStyle(0x2a2a44, 0.7)
        btn.bg.fillRoundedRect(-TAB_W / 2, -TAB_H / 2, TAB_W, TAB_H, 6)
        btn.label.setColor('#aaaacc')
      }
    })
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
