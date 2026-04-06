import Phaser from 'phaser'
import { OBJECT_TYPE_REGISTRY, getFramedObjectDisplaySize, type ObjectType } from '../objects/objectTypes'
import { loadInventory } from '../storage/inventoryPersistence'
import { createPanelBackground } from './components/Panel'

const PANEL_WIDTH = 520
const PANEL_HEIGHT = 220
const BAR_HEIGHT = 44
const CARD_SIZE = 56
const CARD_GAP = 8
const CARDS_PER_ROW = 6
const CAT_TAB_H = 28
const CAT_GAP = 4

type Category = 'build' | 'dine' | 'bedroom' | 'decoration' | 'misc' | 'inventory'

const CATEGORIES: { key: Category; label: string }[] = [
  { key: 'build', label: 'Build' },
  { key: 'dine', label: 'Dine' },
  { key: 'bedroom', label: 'Bedroom' },
  { key: 'decoration', label: 'Decoration' },
  { key: 'misc', label: 'Misc' },
  { key: 'inventory', label: 'Inventory' },
]

const CATEGORY_MAP: Record<string, Category> = {
  obstacle: 'build', floor_yellow: 'build', table2: 'dine', table4: 'dine', chair: 'dine',
  stove: 'dine', counter: 'dine', drinking_water: 'dine', background: 'decoration',
  interactable: 'misc', trash: 'misc',
  bed_ms_blue: 'bedroom', bed_ms_red: 'bedroom', bed_ms_grey: 'bedroom', bed_ms_space: 'bedroom',
  bed_ws_blue: 'bedroom', bed_ws_red: 'bedroom', bed_ws_grey: 'bedroom', bed_ws_space: 'bedroom',
}

const HIDDEN_TYPES = new Set<string>(['food_plate'])

export class ShopPanel {
  readonly container: Phaser.GameObjects.Container
  private activeCategory: Category = 'build'
  private categoryContainers = new Map<Category, Phaser.GameObjects.Container>()
  private categoryTabGraphics = new Map<Category, { bg: Phaser.GameObjects.Graphics; label: Phaser.GameObjects.Text }>()
  private inventoryContainer!: Phaser.GameObjects.Container
  private gameEvents: Phaser.Events.EventEmitter

  constructor(scene: Phaser.Scene, gameEvents: Phaser.Events.EventEmitter) {
    this.gameEvents = gameEvents
    this.container = scene.add.container(0, -BAR_HEIGHT - 6)
    this.container.setVisible(false)
    this.build(scene)
  }

  isInventoryMode(): boolean {
    return this.activeCategory === 'inventory'
  }

  refreshInventoryGrid(): void {
    this.inventoryContainer.removeAll(true)
    const scene = this.container.scene
    const gridTop = -PANEL_HEIGHT + 40
    const gridLeft = -PANEL_WIDTH / 2 + 16
    const items = loadInventory()

    if (items.length === 0) {
      const emptyText = scene.add.text(0, -PANEL_HEIGHT / 2, 'Inventory is empty — drag objects from the map here', {
        fontSize: '11px', color: '#666688',
      }).setOrigin(0.5)
      this.inventoryContainer.add(emptyText)
      return
    }

    items.forEach((item, idx) => {
      const config = OBJECT_TYPE_REGISTRY[item.type]
      if (!config) return

      const col = idx % CARDS_PER_ROW
      const row = Math.floor(idx / CARDS_PER_ROW)
      const cx = gridLeft + col * (CARD_SIZE + CARD_GAP) + CARD_SIZE / 2
      const cy = gridTop + row * (CARD_SIZE + CARD_GAP + 14) + CARD_SIZE / 2

      const cardBg = this.makeCardBg(scene, cx, cy)

      let icon: Phaser.GameObjects.Sprite | Phaser.GameObjects.Graphics
      if (config.textureKey && scene.textures.exists(config.textureKey)) {
        icon = scene.add.sprite(cx, cy - 6, config.textureKey, config.frame ?? 0)
        const { w, h } = getFramedObjectDisplaySize(item.type, 1.1)
        icon.setDisplaySize(w, h)
      } else {
        const g = scene.add.graphics()
        g.fillStyle(config.previewColor)
        g.fillRect(cx - 10, cy - 10, 20, 20)
        icon = g
      }

      const countText = scene.add.text(cx + CARD_SIZE / 2 - 6, cy - CARD_SIZE / 2 + 2, `${item.count}`, {
        fontSize: '10px', color: '#ffffff', fontStyle: 'bold',
        backgroundColor: '#555577', padding: { x: 3, y: 1 },
      }).setOrigin(1, 0)

      const label = scene.add.text(cx, cy + CARD_SIZE / 2 - 8, config.label, {
        fontSize: '9px', color: '#ccccdd',
      }).setOrigin(0.5)

      const zone = this.makeCardZone(scene, cx, cy, cardBg)
      zone.on('pointerdown', () => this.gameEvents.emit('inventory:select', item.type))

      this.inventoryContainer.add([cardBg, icon, countText, label, zone])
    })
  }

  private build(scene: Phaser.Scene): void {
    const bg = createPanelBackground(scene, PANEL_WIDTH, PANEL_HEIGHT, -PANEL_WIDTH / 2, -PANEL_HEIGHT)
    this.container.add(bg)
    this.buildCategoryTabs(scene)
    this.buildItemGrids(scene)
    this.showCategory(this.activeCategory)
  }

  private buildCategoryTabs(scene: Phaser.Scene): void {
    const totalW = CATEGORIES.length * 80 + (CATEGORIES.length - 1) * CAT_GAP
    const startX = -totalW / 2

    CATEGORIES.forEach((cat, i) => {
      const cx = startX + i * (80 + CAT_GAP) + 40
      const cy = -PANEL_HEIGHT + 18

      const bg = scene.add.graphics()
      bg.setPosition(cx, cy)
      const label = scene.add.text(cx, cy, cat.label, {
        fontSize: '12px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5)

      const zone = scene.add.zone(cx, cy, 80, CAT_TAB_H)
      zone.setInteractive({ useHandCursor: true })
      zone.on('pointerdown', () => {
        this.activeCategory = cat.key
        this.showCategory(cat.key)
        this.refreshCategoryStyles()
      })

      this.container.add([bg, label, zone])
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

  private buildItemGrids(scene: Phaser.Scene): void {
    const gridTop = -PANEL_HEIGHT + 40
    const gridLeft = -PANEL_WIDTH / 2 + 16

    const itemsByCategory = new Map<Category, { type: ObjectType; label: string; textureKey: string; frame?: number; previewColor: number }[]>()
    for (const cat of CATEGORIES) itemsByCategory.set(cat.key, [])

    for (const [type, config] of Object.entries(OBJECT_TYPE_REGISTRY)) {
      if (HIDDEN_TYPES.has(type)) continue
      const cat = CATEGORY_MAP[type] ?? 'misc'
      itemsByCategory.get(cat)?.push({ type: type as ObjectType, label: config.label, textureKey: config.textureKey, frame: config.frame, previewColor: config.previewColor })
    }

    itemsByCategory.get('build')?.push({ type: '__building' as ObjectType, label: 'Building', textureKey: '', previewColor: 0x6b5b3a })
    itemsByCategory.get('build')?.push({ type: '__stage' as ObjectType, label: 'Stage', textureKey: '', previewColor: 0x1a1a2e })
    itemsByCategory.get('build')?.push({ type: '__stage_solo' as ObjectType, label: 'Solo stage', textureKey: 'furniture_stage_solo', previewColor: 0x8b6914 })

    this.inventoryContainer = scene.add.container(0, 0)
    this.inventoryContainer.setVisible(false)
    this.container.add(this.inventoryContainer)
    this.categoryContainers.set('inventory', this.inventoryContainer)

    for (const [cat, items] of itemsByCategory) {
      if (cat === 'inventory') continue
      const catContainer = scene.add.container(0, 0)
      catContainer.setVisible(false)
      this.container.add(catContainer)
      this.categoryContainers.set(cat, catContainer)

      items.forEach((item, idx) => {
        const col = idx % CARDS_PER_ROW
        const row = Math.floor(idx / CARDS_PER_ROW)
        const cx = gridLeft + col * (CARD_SIZE + CARD_GAP) + CARD_SIZE / 2
        const cy = gridTop + row * (CARD_SIZE + CARD_GAP + 14) + CARD_SIZE / 2

        const cardBg = this.makeCardBg(scene, cx, cy)
        const icon = this.makeItemIcon(scene, item, cx, cy)
        const label = scene.add.text(cx, cy + CARD_SIZE / 2 - 8, item.label, { fontSize: '9px', color: '#ccccdd' }).setOrigin(0.5)
        const zone = this.makeCardZone(scene, cx, cy, cardBg)
        zone.on('pointerdown', () => {
          if ((item.type as string) === '__building') this.gameEvents.emit('store:select-building')
          else if ((item.type as string) === '__stage') this.gameEvents.emit('store:select-stage')
          else if ((item.type as string) === '__stage_solo') this.gameEvents.emit('store:select-stage-solo')
          else this.gameEvents.emit('store:select', item.type)
        })
        catContainer.add([cardBg, icon, label, zone])
      })
    }
  }

  private showCategory(cat: Category): void {
    this.categoryContainers.forEach((c, key) => c.setVisible(key === cat))
    if (cat === 'inventory') this.refreshInventoryGrid()
  }

  private makeCardBg(scene: Phaser.Scene, cx: number, cy: number): Phaser.GameObjects.Graphics {
    const g = scene.add.graphics()
    g.fillStyle(0x2a2a44, 0.8)
    g.fillRoundedRect(cx - CARD_SIZE / 2, cy - CARD_SIZE / 2, CARD_SIZE, CARD_SIZE, 6)
    g.lineStyle(1, 0x444466, 0.6)
    g.strokeRoundedRect(cx - CARD_SIZE / 2, cy - CARD_SIZE / 2, CARD_SIZE, CARD_SIZE, 6)
    return g
  }

  private makeCardZone(scene: Phaser.Scene, cx: number, cy: number, cardBg: Phaser.GameObjects.Graphics): Phaser.GameObjects.Zone {
    const zone = scene.add.zone(cx, cy, CARD_SIZE, CARD_SIZE)
    zone.setInteractive({ useHandCursor: true })
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
    return zone
  }

  private makeItemIcon(
    scene: Phaser.Scene,
    item: { type: ObjectType; textureKey: string; frame?: number; previewColor: number },
    cx: number, cy: number,
  ): Phaser.GameObjects.Sprite | Phaser.GameObjects.Graphics {
    if ((item.type as string) === '__stage_solo' && item.textureKey && scene.textures.exists(item.textureKey)) {
      const sprite = scene.add.sprite(cx, cy - 4, item.textureKey)
      sprite.setDisplaySize(40, 40)
      return sprite
    }
    if (item.textureKey && scene.textures.exists(item.textureKey)) {
      const sprite = scene.add.sprite(cx, cy - 6, item.textureKey, item.frame ?? 0)
      const { w, h } = getFramedObjectDisplaySize(item.type, 1.1)
      sprite.setDisplaySize(w, h)
      return sprite
    }
    if ((item.type as string) === '__stage') {
      const g = scene.add.graphics()
      g.fillStyle(0x1a1a2e); g.fillRect(cx - 14, cy - 8, 28, 16)
      g.lineStyle(1, 0xffd700); g.strokeRect(cx - 14, cy - 8, 28, 16)
      g.fillStyle(0x2d2d4a); g.fillRect(cx - 11, cy - 5, 22, 10)
      const lc = [0xff6644, 0x44aaff, 0xff6644, 0x44aaff]
      for (let li = 0; li < 4; li++) { g.fillStyle(lc[li]); g.fillCircle(cx - 9 + li * 6, cy - 5, 2) }
      return g
    }
    const g = scene.add.graphics()
    g.fillStyle(item.previewColor); g.fillRect(cx - 12, cy - 14, 24, 20)
    g.lineStyle(1, 0x4a3d28); g.strokeRect(cx - 12, cy - 14, 24, 20)
    g.fillStyle(0x8b7355); g.fillRect(cx - 4, cy + 2, 8, 4)
    return g
  }
}
