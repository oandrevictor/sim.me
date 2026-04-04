import Phaser from 'phaser'
import { OBJECT_TYPE_REGISTRY, OBJECT_SIZE, type ObjectType } from '../objects/objectTypes'
import type { BotNirv } from '../entities/BotNirv'

// ── Layout constants ──
const BAR_WIDTH = 360
const BAR_HEIGHT = 44
const TAB_W = 112
const TAB_H = 36
const TAB_GAP = 6

const PANEL_WIDTH = 520
const PANEL_HEIGHT = 220

const CARD_SIZE = 56
const CARD_GAP = 8
const CARDS_PER_ROW = 6

const CAT_TAB_H = 28
const CAT_GAP = 4

// ── Item categories ──
type Category = 'build' | 'dine' | 'decoration' | 'misc'

const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'build', label: 'Build' },
  { key: 'dine', label: 'Dine' },
  { key: 'decoration', label: 'Decoration' },
  { key: 'misc', label: 'Misc' },
]

const CATEGORY_MAP: Record<string, Category> = {
  obstacle: 'build',
  table2: 'dine',
  table4: 'dine',
  chair: 'dine',
  stove: 'dine',
  counter: 'dine',
  background: 'decoration',
  interactable: 'misc',
}

// Items hidden from the shop
const HIDDEN_TYPES = new Set<string>(['food_plate'])

type MenuTab = 'home' | 'shop' | 'work'

export class MenuUI {
  private scene: Phaser.Scene
  private container: Phaser.GameObjects.Container

  // Bottom tab bar
  private tabBar!: Phaser.GameObjects.Container
  private activeTab: MenuTab = 'home'

  // Shop panel
  private shopPanel!: Phaser.GameObjects.Container
  private activeCategory: Category = 'build'
  private categoryContainers = new Map<Category, Phaser.GameObjects.Container>()
  private categoryTabGraphics = new Map<Category, { bg: Phaser.GameObjects.Graphics; label: Phaser.GameObjects.Text }>()

  // Work panel
  private workPanel!: Phaser.GameObjects.Container
  private workContent!: Phaser.GameObjects.Container
  private workDisabledText!: Phaser.GameObjects.Text

  // Tab button references
  private tabButtons = new Map<MenuTab, {
    bg: Phaser.GameObjects.Graphics
    label: Phaser.GameObjects.Text
    zone: Phaser.GameObjects.Zone
  }>()

  // External callbacks
  private getBotNirvs: () => BotNirv[] = () => []
  private isPlayerInRestaurant: () => boolean = () => false

  constructor(scene: Phaser.Scene) {
    this.scene = scene
    this.container = scene.add.container(0, 0)
    this.container.setDepth(20)

    this.buildTabBar()
    this.buildShopPanel()
    this.buildWorkPanel()

    this.setTab('home')
  }

  // ── Public API ──

  setPosition(x: number, y: number): void {
    this.container.setPosition(x, y)
  }

  isPointerOverUI(pointer: Phaser.Input.Pointer): boolean {
    // Check tab bar area (always visible)
    const barBounds = new Phaser.Geom.Rectangle(
      this.container.x - BAR_WIDTH / 2,
      this.container.y - BAR_HEIGHT,
      BAR_WIDTH,
      BAR_HEIGHT,
    )
    if (barBounds.contains(pointer.worldX, pointer.worldY)) return true

    // Check panel area when open
    if (this.activeTab === 'shop' || this.activeTab === 'work') {
      const panelBounds = new Phaser.Geom.Rectangle(
        this.container.x - PANEL_WIDTH / 2,
        this.container.y - BAR_HEIGHT - PANEL_HEIGHT - 6,
        PANEL_WIDTH,
        PANEL_HEIGHT,
      )
      if (panelBounds.contains(pointer.worldX, pointer.worldY)) return true
    }

    return false
  }

  isShopMode(): boolean {
    return this.activeTab === 'shop'
  }

  /** Set external data providers */
  setProviders(
    getBotNirvs: () => BotNirv[],
    isPlayerInRestaurant: () => boolean,
  ): void {
    this.getBotNirvs = getBotNirvs
    this.isPlayerInRestaurant = isPlayerInRestaurant
  }

  /** Called each frame to refresh work panel if visible */
  updateWorkPanel(): void {
    if (this.activeTab !== 'work') return
    this.refreshWorkContent()
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

    // Bar background
    const barBg = this.scene.add.graphics()
    barBg.fillStyle(0x1a1a2e, 0.88)
    barBg.fillRoundedRect(-BAR_WIDTH / 2, -BAR_HEIGHT - 2, BAR_WIDTH, BAR_HEIGHT + 4, { tl: 10, tr: 10, bl: 0, br: 0 })
    this.tabBar.add(barBg)

    tabs.forEach((t, i) => {
      const tx = startX + i * (TAB_W + TAB_GAP) + TAB_W / 2

      const bg = this.scene.add.graphics()
      bg.setPosition(tx, -BAR_HEIGHT / 2 - 1)

      const label = this.scene.add.text(tx, -BAR_HEIGHT / 2 - 1, t.label, {
        fontSize: '13px',
        color: '#ffffff',
        fontStyle: 'bold',
      }).setOrigin(0.5)

      const zone = this.scene.add.zone(tx, -BAR_HEIGHT / 2 - 1, TAB_W, TAB_H)
      zone.setInteractive({ useHandCursor: true })
      zone.on('pointerdown', () => this.onTabClicked(t.tab))
      zone.on('pointerover', () => {
        if (t.tab !== this.activeTab) {
          label.setColor('#ffd700')
        }
      })
      zone.on('pointerout', () => {
        if (t.tab !== this.activeTab) {
          label.setColor('#aaaacc')
        }
      })

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
    if (tab === this.activeTab) {
      // Clicking the active tab goes back to home
      this.setTab('home')
      return
    }
    this.setTab(tab)
  }

  private setTab(tab: MenuTab): void {
    const prevTab = this.activeTab
    this.activeTab = tab
    this.refreshTabStyles()

    this.shopPanel.setVisible(tab === 'shop')
    this.workPanel.setVisible(tab === 'work')

    if (tab === 'shop') {
      this.scene.events.emit('menu:shop-open')
    } else if (prevTab === 'shop') {
      this.scene.events.emit('menu:shop-close')
    }

    if (tab === 'work') {
      this.refreshWorkContent()
    }
  }

  // ── Shop Panel ──

  private buildShopPanel(): void {
    this.shopPanel = this.scene.add.container(0, -BAR_HEIGHT - 6)
    this.shopPanel.setVisible(false)
    this.container.add(this.shopPanel)

    // Panel background
    const panelBg = this.scene.add.graphics()
    panelBg.fillStyle(0x1a1a2e, 0.94)
    panelBg.fillRoundedRect(-PANEL_WIDTH / 2, -PANEL_HEIGHT, PANEL_WIDTH, PANEL_HEIGHT, 10)
    panelBg.lineStyle(1, 0x444466)
    panelBg.strokeRoundedRect(-PANEL_WIDTH / 2, -PANEL_HEIGHT, PANEL_WIDTH, PANEL_HEIGHT, 10)
    this.shopPanel.add(panelBg)

    // Category tabs
    this.buildCategoryTabs()

    // Item grids per category
    this.buildItemGrids()

    // Building entry at the end of Build category
    this.showCategory(this.activeCategory)
  }

  private buildCategoryTabs(): void {
    const totalW = CATEGORIES.length * 80 + (CATEGORIES.length - 1) * CAT_GAP
    const startX = -totalW / 2

    CATEGORIES.forEach((cat, i) => {
      const cx = startX + i * (80 + CAT_GAP) + 40
      const cy = -PANEL_HEIGHT + 18

      const bg = this.scene.add.graphics()
      bg.setPosition(cx, cy)

      const label = this.scene.add.text(cx, cy, cat.label, {
        fontSize: '12px',
        color: '#ffffff',
        fontStyle: 'bold',
      }).setOrigin(0.5)

      const zone = this.scene.add.zone(cx, cy, 80, CAT_TAB_H)
      zone.setInteractive({ useHandCursor: true })
      zone.on('pointerdown', () => {
        this.activeCategory = cat.key
        this.showCategory(cat.key)
        this.refreshCategoryStyles()
      })

      this.shopPanel.add([bg, label, zone])
      this.categoryTabGraphics.set(cat.key, { bg, label })
    })

    this.refreshCategoryStyles()
  }

  private refreshCategoryStyles(): void {
    this.categoryTabGraphics.forEach((gfx, key) => {
      gfx.bg.clear()
      if (key === this.activeCategory) {
        gfx.bg.fillStyle(0x3a3a5e)
        gfx.bg.fillRoundedRect(-40, -CAT_TAB_H / 2, 80, CAT_TAB_H, 4)
        gfx.bg.lineStyle(2, 0xffd700, 0.8)
        gfx.bg.lineBetween(-30, CAT_TAB_H / 2, 30, CAT_TAB_H / 2)
        gfx.label.setColor('#ffd700')
      } else {
        gfx.label.setColor('#8888aa')
      }
    })
  }

  private buildItemGrids(): void {
    const gridTop = -PANEL_HEIGHT + 40
    const gridLeft = -PANEL_WIDTH / 2 + 16

    // Group items by category
    const itemsByCategory = new Map<Category, { type: ObjectType; label: string; textureKey: string; previewColor: number }[]>()
    for (const cat of CATEGORIES) {
      itemsByCategory.set(cat.key, [])
    }

    for (const [type, config] of Object.entries(OBJECT_TYPE_REGISTRY)) {
      if (HIDDEN_TYPES.has(type)) continue
      const cat = CATEGORY_MAP[type] ?? 'misc'
      itemsByCategory.get(cat)?.push({
        type: type as ObjectType,
        label: config.label,
        textureKey: config.textureKey,
        previewColor: config.previewColor,
      })
    }

    // Add building to 'build' category
    itemsByCategory.get('build')?.push({
      type: '__building' as ObjectType,
      label: 'Building',
      textureKey: '',
      previewColor: 0x6b5b3a,
    })

    for (const [cat, items] of itemsByCategory) {
      const catContainer = this.scene.add.container(0, 0)
      catContainer.setVisible(false)
      this.shopPanel.add(catContainer)
      this.categoryContainers.set(cat, catContainer)

      items.forEach((item, idx) => {
        const col = idx % CARDS_PER_ROW
        const row = Math.floor(idx / CARDS_PER_ROW)
        const cx = gridLeft + col * (CARD_SIZE + CARD_GAP) + CARD_SIZE / 2
        const cy = gridTop + row * (CARD_SIZE + CARD_GAP + 14) + CARD_SIZE / 2

        // Card background
        const cardBg = this.scene.add.graphics()
        cardBg.fillStyle(0x2a2a44, 0.8)
        cardBg.fillRoundedRect(cx - CARD_SIZE / 2, cy - CARD_SIZE / 2, CARD_SIZE, CARD_SIZE, 6)
        cardBg.lineStyle(1, 0x444466, 0.6)
        cardBg.strokeRoundedRect(cx - CARD_SIZE / 2, cy - CARD_SIZE / 2, CARD_SIZE, CARD_SIZE, 6)

        // Item preview (icon)
        let icon: Phaser.GameObjects.Sprite | Phaser.GameObjects.Graphics
        if (item.textureKey && this.scene.textures.exists(item.textureKey)) {
          icon = this.scene.add.sprite(cx, cy - 6, item.textureKey)
          icon.setDisplaySize(OBJECT_SIZE * 1.1, OBJECT_SIZE * 1.1)
        } else {
          // Building: draw a small building icon
          const g = this.scene.add.graphics()
          g.fillStyle(item.previewColor)
          g.fillRect(cx - 12, cy - 14, 24, 20)
          g.lineStyle(1, 0x4a3d28)
          g.strokeRect(cx - 12, cy - 14, 24, 20)
          // Door
          g.fillStyle(0x8b7355)
          g.fillRect(cx - 4, cy + 2, 8, 4)
          icon = g
        }

        // Label
        const label = this.scene.add.text(cx, cy + CARD_SIZE / 2 - 8, item.label, {
          fontSize: '9px',
          color: '#ccccdd',
        }).setOrigin(0.5)

        // Hit zone
        const zone = this.scene.add.zone(cx, cy, CARD_SIZE, CARD_SIZE)
        zone.setInteractive({ useHandCursor: true })
        zone.on('pointerdown', () => {
          if ((item.type as string) === '__building') {
            this.scene.events.emit('store:select-building')
          } else {
            this.scene.events.emit('store:select', item.type)
          }
        })
        zone.on('pointerover', () => {
          cardBg.clear()
          cardBg.fillStyle(0x3a3a5e, 0.9)
          cardBg.fillRoundedRect(cx - CARD_SIZE / 2, cy - CARD_SIZE / 2, CARD_SIZE, CARD_SIZE, 6)
          cardBg.lineStyle(1, 0xffd700, 0.8)
          cardBg.strokeRoundedRect(cx - CARD_SIZE / 2, cy - CARD_SIZE / 2, CARD_SIZE, CARD_SIZE, 6)
        })
        zone.on('pointerout', () => {
          cardBg.clear()
          cardBg.fillStyle(0x2a2a44, 0.8)
          cardBg.fillRoundedRect(cx - CARD_SIZE / 2, cy - CARD_SIZE / 2, CARD_SIZE, CARD_SIZE, 6)
          cardBg.lineStyle(1, 0x444466, 0.6)
          cardBg.strokeRoundedRect(cx - CARD_SIZE / 2, cy - CARD_SIZE / 2, CARD_SIZE, CARD_SIZE, 6)
        })

        catContainer.add([cardBg, icon, label, zone])
      })
    }
  }

  private showCategory(cat: Category): void {
    this.categoryContainers.forEach((c, key) => c.setVisible(key === cat))
  }

  // ── Work Panel ──

  private buildWorkPanel(): void {
    this.workPanel = this.scene.add.container(0, -BAR_HEIGHT - 6)
    this.workPanel.setVisible(false)
    this.container.add(this.workPanel)

    // Panel background
    const panelBg = this.scene.add.graphics()
    panelBg.fillStyle(0x1a1a2e, 0.94)
    panelBg.fillRoundedRect(-PANEL_WIDTH / 2, -PANEL_HEIGHT, PANEL_WIDTH, PANEL_HEIGHT, 10)
    panelBg.lineStyle(1, 0x444466)
    panelBg.strokeRoundedRect(-PANEL_WIDTH / 2, -PANEL_HEIGHT, PANEL_WIDTH, PANEL_HEIGHT, 10)
    this.workPanel.add(panelBg)

    // Title
    const title = this.scene.add.text(0, -PANEL_HEIGHT + 18, 'Customers', {
      fontSize: '14px',
      color: '#ffd700',
      fontStyle: 'bold',
    }).setOrigin(0.5)
    this.workPanel.add(title)

    // Disabled message
    this.workDisabledText = this.scene.add.text(0, -PANEL_HEIGHT / 2, 'Enter a restaurant to manage customers', {
      fontSize: '12px',
      color: '#666688',
    }).setOrigin(0.5)
    this.workPanel.add(this.workDisabledText)

    // Dynamic content container (rebuilt each refresh)
    this.workContent = this.scene.add.container(0, 0)
    this.workPanel.add(this.workContent)
  }

  private refreshWorkContent(): void {
    // Clear old content
    this.workContent.removeAll(true)

    const inRestaurant = this.isPlayerInRestaurant()
    this.workDisabledText.setVisible(!inRestaurant)

    if (!inRestaurant) return

    const bots = this.getBotNirvs()
    const restaurantBots = bots.filter(b =>
      b.state === 'walking_to_chair' ||
      b.state === 'seated' ||
      b.state === 'awaiting_service' ||
      b.state === 'eating'
    )

    if (restaurantBots.length === 0) {
      const emptyText = this.scene.add.text(0, -PANEL_HEIGHT / 2, 'No customers right now', {
        fontSize: '12px',
        color: '#8888aa',
      }).setOrigin(0.5)
      this.workContent.add(emptyText)
      return
    }

    const startY = -PANEL_HEIGHT + 42
    const rowH = 32

    restaurantBots.forEach((bot, i) => {
      const y = startY + i * rowH
      const leftX = -PANEL_WIDTH / 2 + 20

      // Color indicator
      const dot = this.scene.add.graphics()
      dot.fillStyle(bot.nirv.color)
      dot.fillCircle(leftX + 8, y + 8, 6)
      dot.lineStyle(1, 0x333355)
      dot.strokeCircle(leftX + 8, y + 8, 6)

      // Name
      const name = this.scene.add.text(leftX + 22, y, bot.nirv.name, {
        fontSize: '12px',
        color: '#ffffff',
        fontStyle: 'bold',
      })

      // Status
      const statusText = this.getStatusLabel(bot.state)
      const statusColor = this.getStatusColor(bot.state)
      const status = this.scene.add.text(leftX + 120, y, statusText, {
        fontSize: '11px',
        color: statusColor,
      })

      // Status dot
      const statusDot = this.scene.add.graphics()
      statusDot.fillStyle(Phaser.Display.Color.HexStringToColor(statusColor).color)
      statusDot.fillCircle(leftX + 112, y + 7, 3)

      this.workContent.add([dot, name, status, statusDot])
    })
  }

  private getStatusLabel(state: string): string {
    switch (state) {
      case 'walking_to_chair': return 'Arriving...'
      case 'seated': return 'Seated'
      case 'awaiting_service': return 'Waiting for food'
      case 'eating': return 'Eating'
      default: return state
    }
  }

  private getStatusColor(state: string): string {
    switch (state) {
      case 'walking_to_chair': return '#8888aa'
      case 'seated': return '#44cccc'
      case 'awaiting_service': return '#ffaa33'
      case 'eating': return '#44dd88'
      default: return '#aaaacc'
    }
  }
}
