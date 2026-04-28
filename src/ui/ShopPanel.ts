import Phaser from 'phaser'
import { OBJECT_TYPE_REGISTRY, type ObjectType } from '../objects/objectTypes'
import { loadInventory } from '../storage/inventoryPersistence'
import { createPanelBackground } from './components/Panel'
import { createShopCardChrome, createShopItemIcon } from './components/ShopCard'
import { CATEGORIES, CATEGORY_MAP, HIDDEN_TYPES, type Category } from './shopConfig'
import {
  SHOP_BAR_HEIGHT,
  SHOP_CARD_GAP,
  SHOP_CARD_SIZE,
  SHOP_CARDS_PER_ROW,
  SHOP_CAT_GAP,
  SHOP_CAT_TAB_H,
  SHOP_CAT_TAB_W,
  SHOP_PANEL_HEIGHT,
  SHOP_PANEL_WIDTH,
} from './ShopPanelLayout'

export class ShopPanel {
  readonly container: Phaser.GameObjects.Container
  private activeCategory: Category = 'build'
  private categoryContainers = new Map<Category, Phaser.GameObjects.Container>()
  private categoryTabGraphics = new Map<Category, { bg: Phaser.GameObjects.Graphics; label: Phaser.GameObjects.Text }>()
  private inventoryContainer!: Phaser.GameObjects.Container
  private gameEvents: Phaser.Events.EventEmitter

  constructor(scene: Phaser.Scene, gameEvents: Phaser.Events.EventEmitter) {
    this.gameEvents = gameEvents
    this.container = scene.add.container(0, -SHOP_BAR_HEIGHT - 6)
    this.container.setVisible(false)
    this.build(scene)
  }

  isInventoryMode(): boolean {
    return this.activeCategory === 'inventory'
  }

  refreshInventoryGrid(): void {
    this.inventoryContainer.removeAll(true)
    const scene = this.container.scene
    const gridTop = -SHOP_PANEL_HEIGHT + 40
    const gridLeft = -SHOP_PANEL_WIDTH / 2 + 16
    const items = loadInventory()

    if (items.length === 0) {
      const emptyText = scene.add.text(0, -SHOP_PANEL_HEIGHT / 2, 'Inventory is empty — drag objects from the map here', {
        fontSize: '11px', color: '#666688',
      }).setOrigin(0.5)
      this.inventoryContainer.add(emptyText)
      return
    }

    items.forEach((item, idx) => {
      const config = OBJECT_TYPE_REGISTRY[item.type]
      if (!config) return

      const col = idx % SHOP_CARDS_PER_ROW
      const row = Math.floor(idx / SHOP_CARDS_PER_ROW)
      const cx = gridLeft + col * (SHOP_CARD_SIZE + SHOP_CARD_GAP) + SHOP_CARD_SIZE / 2
      const cy = gridTop + row * (SHOP_CARD_SIZE + SHOP_CARD_GAP + 14) + SHOP_CARD_SIZE / 2

      const card = createShopCardChrome(scene, cx, cy)

      const icon = createShopItemIcon(scene, {
        type: item.type, textureKey: config.textureKey, frame: config.frame,
        previewColor: config.previewColor,
      }, cx, cy)

      const countText = scene.add.text(cx + SHOP_CARD_SIZE / 2 - 6, cy - SHOP_CARD_SIZE / 2 + 2, `${item.count}`, {
        fontSize: '10px', color: '#ffffff', fontStyle: 'bold',
        backgroundColor: '#555577', padding: { x: 3, y: 1 },
      }).setOrigin(1, 0)

      const label = scene.add.text(cx, cy + SHOP_CARD_SIZE / 2 - 8, config.label, {
        fontSize: '9px', color: '#ccccdd',
      }).setOrigin(0.5)

      card.zone.on('pointerdown', () => this.gameEvents.emit('inventory:select', item.type))

      this.inventoryContainer.add([card.bg, card.hover, icon, countText, label, card.zone])
    })
  }

  private build(scene: Phaser.Scene): void {
    const bg = createPanelBackground(
      scene, SHOP_PANEL_WIDTH, SHOP_PANEL_HEIGHT, -SHOP_PANEL_WIDTH / 2, -SHOP_PANEL_HEIGHT,
    )
    this.container.add(bg)
    this.buildCategoryTabs(scene)
    this.buildItemGrids(scene)
    this.showCategory(this.activeCategory)
  }

  private buildCategoryTabs(scene: Phaser.Scene): void {
    const totalW = CATEGORIES.length * SHOP_CAT_TAB_W + (CATEGORIES.length - 1) * SHOP_CAT_GAP
    const startX = -totalW / 2

    CATEGORIES.forEach((cat, i) => {
      const cx = startX + i * (SHOP_CAT_TAB_W + SHOP_CAT_GAP) + SHOP_CAT_TAB_W / 2
      const cy = -SHOP_PANEL_HEIGHT + 18

      const bg = scene.add.graphics()
      bg.setPosition(cx, cy)
      const label = scene.add.text(cx, cy, cat.label, {
        fontSize: '12px', color: '#ffffff', fontStyle: 'bold',
      }).setOrigin(0.5)

      const zone = scene.add.zone(cx, cy, SHOP_CAT_TAB_W, SHOP_CAT_TAB_H)
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
        gfx.bg.fillRoundedRect(-SHOP_CAT_TAB_W / 2, -SHOP_CAT_TAB_H / 2, SHOP_CAT_TAB_W, SHOP_CAT_TAB_H, 4)
        gfx.bg.lineStyle(2, 0xffd700, 0.8)
        gfx.bg.lineBetween(-30, SHOP_CAT_TAB_H / 2, 30, SHOP_CAT_TAB_H / 2)
        gfx.label.setColor('#ffd700')
      } else {
        gfx.label.setColor('#8888aa')
      }
    })
  }

  private buildItemGrids(scene: Phaser.Scene): void {
    const gridTop = -SHOP_PANEL_HEIGHT + 40
    const gridLeft = -SHOP_PANEL_WIDTH / 2 + 16

    const itemsByCategory = new Map<Category, { type: ObjectType; label: string; textureKey: string; frame?: number; previewColor: number }[]>()
    for (const cat of CATEGORIES) itemsByCategory.set(cat.key, [])

    for (const [type, config] of Object.entries(OBJECT_TYPE_REGISTRY)) {
      if (HIDDEN_TYPES.has(type as ObjectType)) continue
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
        const col = idx % SHOP_CARDS_PER_ROW
        const row = Math.floor(idx / SHOP_CARDS_PER_ROW)
        const cx = gridLeft + col * (SHOP_CARD_SIZE + SHOP_CARD_GAP) + SHOP_CARD_SIZE / 2
        const cy = gridTop + row * (SHOP_CARD_SIZE + SHOP_CARD_GAP + 14) + SHOP_CARD_SIZE / 2

        const card = createShopCardChrome(scene, cx, cy)
        const icon = createShopItemIcon(scene, item, cx, cy)
        const label = scene.add.text(cx, cy + SHOP_CARD_SIZE / 2 - 8, item.label, { fontSize: '9px', color: '#ccccdd' }).setOrigin(0.5)
        card.zone.on('pointerdown', () => {
          if ((item.type as string) === '__building') this.gameEvents.emit('store:select-building')
          else if ((item.type as string) === '__stage') this.gameEvents.emit('store:select-stage')
          else if ((item.type as string) === '__stage_solo') this.gameEvents.emit('store:select-stage-solo')
          else this.gameEvents.emit('store:select', item.type)
        })
        catContainer.add([card.bg, card.hover, icon, label, card.zone])
      })
    }
  }

  private showCategory(cat: Category): void {
    this.categoryContainers.forEach((c, key) => c.setVisible(key === cat))
    if (cat === 'inventory') this.refreshInventoryGrid()
  }
}
