import Phaser from 'phaser'
import { generateObjectTextures, OBJECT_TYPE_REGISTRY, OBJECT_SIZE, type ObjectType } from '../objects/objectTypes'
import { WORLD_WIDTH, WORLD_HEIGHT, GRID_COLS, GRID_ROWS } from '../config/world'
import { gridToScreen, screenToGrid, snapToIsoGrid, getTileCorners, TILE_W } from '../utils/isoGrid'
import { MenuUI } from '../ui/MenuUI'
import { PlacementManager } from '../placement/PlacementManager'
import { loadPlacedObjects, savePlacedObject, removeObjectAt, removeObjectByType } from '../storage/persistence'
import { addToInventory, removeFromInventory } from '../storage/inventoryPersistence'
import { loadPlacedBuildings, savePlacedBuilding, updateBuildingType } from '../storage/buildingPersistence'
import { Nirv, NirvVariant } from '../entities/Nirv'
import { BotNirv } from '../entities/BotNirv'
import { generateDefaultSchedules } from '../entities/NirvSchedule'
import { Building } from '../entities/Building'
import { BuildingSign } from '../entities/BuildingSign'
import { BuildingTypeUI } from '../ui/BuildingTypeUI'
import { RestaurantSystem } from '../systems/RestaurantSystem'
import { CookingSystem } from '../systems/CookingSystem'
import { RecipeSelectUI } from '../ui/RecipeSelectUI'
import { getRecipe } from '../data/recipes'
import { GridPathfinder } from '../pathfinding/GridPathfinder'
import { BUILDING_GRID_W, BUILDING_GRID_H } from '../entities/Building'

const PLAYER_SPEED = 200
const INTERACTION_RADIUS = TILE_W
const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2]
const DEFAULT_ZOOM_INDEX = 2 // 1x

interface WalkTarget {
  x: number
  y: number
}

export class GameScene extends Phaser.Scene {
  private playerNirv!: Nirv
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd!: {
    up: Phaser.Input.Keyboard.Key
    down: Phaser.Input.Keyboard.Key
    left: Phaser.Input.Keyboard.Key
    right: Phaser.Input.Keyboard.Key
  }

  private menuUI!: MenuUI
  private placementManager!: PlacementManager
  private obstacleGroup!: Phaser.Physics.Arcade.StaticGroup
  private nirvGroup!: Phaser.Physics.Arcade.Group
  private interactableSprites: Phaser.GameObjects.Sprite[] = []
  private backgroundSprites: Phaser.GameObjects.Sprite[] = []
  private botNirvs: BotNirv[] = []
  private buildings: Building[] = []
  private buildingSigns = new Map<string, BuildingSign>()
  private buildingTypeUI!: BuildingTypeUI
  private restaurantSystem!: RestaurantSystem
  private cookingSystem!: CookingSystem
  private recipeSelectUI!: RecipeSelectUI
  private pathfinder!: GridPathfinder

  private tableSprites: { sprite: Phaser.Physics.Arcade.Sprite; x: number; y: number }[] = []
  private counterSprites: { sprite: Phaser.Physics.Arcade.Sprite; x: number; y: number }[] = []
  // Track all placed object sprites for repositioning
  private placedSprites: { sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite; type: ObjectType; x: number; y: number }[] = []

  private zoomIndex = DEFAULT_ZOOM_INDEX
  private walkTarget: WalkTarget | null = null
  private activeInteractable: Phaser.GameObjects.Sprite | null = null
  private pendingStoveSprite: Phaser.Physics.Arcade.Sprite | null = null
  private pendingTrashSprite: Phaser.Physics.Arcade.Sprite | null = null
  private pendingPlatePickup: { sprite: Phaser.GameObjects.Sprite; tableX: number; tableY: number; recipeId: string } | null = null
  private plateSprites: { sprite: Phaser.GameObjects.Sprite; tableX: number; tableY: number; recipeId: string }[] = []
  private carriedPlate: { recipeId: string } | null = null
  private carryIndicator: Phaser.GameObjects.Graphics | null = null
  private pendingFoodTarget: { x: number; y: number } | null = null

  constructor() {
    super({ key: 'GameScene' })
  }

  preload(): void {
    generateObjectTextures(this)

    const frameConfig = { frameWidth: 48, frameHeight: 48 }
    this.load.spritesheet('m_idle', 'assets/Player/MPlayer 1 idle.png', frameConfig)
    this.load.spritesheet('m_walk', 'assets/Player/MPlayer 1 walking.png', frameConfig)
    this.load.spritesheet('f_idle', 'assets/Player/FPlayer 1 idle.png', frameConfig)
    this.load.spritesheet('f_walk', 'assets/Player/FPlayer 1 walking.png', frameConfig)
    this.load.spritesheet('f2_idle', 'assets/Player/FPlayer 1 idle.png', frameConfig)
    this.load.spritesheet('f2_walk', 'assets/Player/FPlayer 2 walking.png', frameConfig)
    this.load.spritesheet('f3_idle', 'assets/Player/FPlayer 3 idle.png', frameConfig)
    this.load.spritesheet('f3_walk', 'assets/Player/FPlayer 3 walking.png', frameConfig)

    // Furniture
    this.load.spritesheet('furniture_table', 'assets/Furniture/ModernTable1.png', { frameWidth: 250, frameHeight: 250 })
  }

  create(): void {
    // Expand physics world
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT)

    // Background: fill and draw isometric grid
    const bg = this.add.graphics()
    bg.fillStyle(0x4a7c59)
    bg.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
    bg.lineStyle(1, 0x3d6b4a, 0.4)
    for (let gx = 0; gx < GRID_COLS; gx++) {
      for (let gy = 0; gy < GRID_ROWS; gy++) {
        const c = getTileCorners(gx, gy)
        bg.lineBetween(c.top.x, c.top.y, c.right.x, c.right.y)
        bg.lineBetween(c.right.x, c.right.y, c.bottom.x, c.bottom.y)
        bg.lineBetween(c.bottom.x, c.bottom.y, c.left.x, c.left.y)
        bg.lineBetween(c.left.x, c.left.y, c.top.x, c.top.y)
      }
    }
    bg.setDepth(0)

    // Create Nirv animations
    this.createNirvAnimations()

    // Player Nirv at world center
    const centerGX = Math.floor(GRID_COLS / 2)
    const centerGY = Math.floor(GRID_ROWS / 2)
    const startPos = gridToScreen(centerGX, centerGY)
    this.playerNirv = new Nirv(this, 'Player', 0, startPos.x, startPos.y, true)
    this.playerNirv.sprite.setCollideWorldBounds(true)

    // Camera
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
    this.cameras.main.startFollow(this.playerNirv.sprite, true, 0.08, 0.08)

    // Obstacle group + collider
    this.obstacleGroup = this.physics.add.staticGroup()
    this.physics.add.collider(this.playerNirv.sprite, this.obstacleGroup)

    // Nirv group for inter-Nirv collisions
    this.nirvGroup = this.physics.add.group()
    this.nirvGroup.add(this.playerNirv.sprite)

    // Building type UI
    this.buildingTypeUI = new BuildingTypeUI(this)

    // Recipe select UI
    this.recipeSelectUI = new RecipeSelectUI(this)

    // Systems (created early so objects can register during restore)
    this.restaurantSystem = new RestaurantSystem(this.buildings, this.botNirvs)
    this.restaurantSystem.onPlateConsumed = (x, y) => {
      removeObjectByType(x, y, 'food_plate')
      this.plateSprites = this.plateSprites.filter(p => !(p.tableX === x && p.tableY === y))
    }
    this.cookingSystem = new CookingSystem(this)
    this.pathfinder = new GridPathfinder(GRID_COLS, GRID_ROWS)

    // Restore persisted buildings
    loadPlacedBuildings().forEach(r => {
      const building = new Building(this, r.id, r.gridX, r.gridY, r.type)
      building.createWalls(this, this.obstacleGroup)
      this.buildings.push(building)
      this.createSign(building)
      this.blockBuildingCells(building)
    })

    // Restore persisted objects
    loadPlacedObjects().forEach(r => this.spawnObject(r.type, r.x, r.y, false, r.recipeId))

    // Launch UI scene on top
    this.scene.launch('UIScene')
    const uiScene = this.scene.get('UIScene') as import('./UIScene').UIScene

    // UIScene.create runs synchronously during launch in Phaser,
    // but the scene might not be ready yet — wait for its 'create' event
    const initUI = () => {
      this.menuUI = uiScene.menuUI

      // Placement manager
      this.placementManager = new PlacementManager(
        this,
        this.menuUI,
        (type, x, y) => this.spawnObject(type, x, y, true),
        (gridX, gridY) => this.placeBuilding(gridX, gridY),
      )

      // Wire menu events (MenuUI emits on this scene's events)
      this.events.on('store:select', (type: ObjectType) => {
        this.placementManager.enter(type)
      })
      this.events.on('store:select-building', () => {
        this.placementManager.enterBuildingPlacement()
      })
      this.events.on('inventory:select', (type: ObjectType) => {
        if (!removeFromInventory(type)) return
        this.menuUI.refreshInventoryGrid()
        this.placementManager.enterFromInventory(type)
      })
      this.events.on('menu:shop-close', () => {
        if (this.placementManager.isActive()) this.placementManager.exit()
        this.game.canvas.style.cursor = ''
      })
    }

    if (uiScene.menuUI) {
      initUI()
    } else {
      uiScene.events.once('create', () => initUI())
    }

    // Scene-level click for food placement
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.onWorldClicked(pointer)
    })

    // Keyboard controls
    this.cursors = this.input.keyboard!.createCursorKeys()
    this.wasd = {
      up: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    }

    // Zoom controls
    this.input.on('wheel', (_pointer: Phaser.Input.Pointer, _gos: Phaser.GameObjects.GameObject[], _dx: number, dy: number) => {
      this.changeZoom(dy > 0 ? -1 : 1)
    })
    this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.PLUS).on('down', () => this.changeZoom(1))
    this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.MINUS).on('down', () => this.changeZoom(-1))
    this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.NUMPAD_ADD).on('down', () => this.changeZoom(1))
    this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.NUMPAD_SUBTRACT).on('down', () => this.changeZoom(-1))

    // Spawn bot Nirvs
    this.spawnBots()
  }

  update(_time: number, delta: number): void {
    const player = this.playerNirv.sprite
    let vx = 0
    let vy = 0

    if (this.cursors.left.isDown || this.wasd.left.isDown) vx -= 1
    if (this.cursors.right.isDown || this.wasd.right.isDown) vx += 1
    if (this.cursors.up.isDown || this.wasd.up.isDown) vy -= 1
    if (this.cursors.down.isDown || this.wasd.down.isDown) vy += 1

    // Manual input cancels auto-walk
    if ((vx !== 0 || vy !== 0) && this.walkTarget !== null) {
      this.walkTarget = null
    }

    // Manual input also cancels pending interactions
    if (vx !== 0 || vy !== 0) {
      this.pendingStoveSprite = null
      this.pendingTrashSprite = null
      this.pendingPlatePickup = null
      this.pendingFoodTarget = null
    }

    if (this.walkTarget !== null) {
      const dist = Phaser.Math.Distance.Between(
        player.x, player.y,
        this.walkTarget.x, this.walkTarget.y
      )
      if (dist < 18) {
        player.setVelocity(0, 0)
        this.walkTarget = null
        this.handlePendingInteractions()
      } else {
        const angle = Phaser.Math.Angle.Between(
          player.x, player.y,
          this.walkTarget.x, this.walkTarget.y
        )
        player.setVelocity(
          Math.cos(angle) * PLAYER_SPEED,
          Math.sin(angle) * PLAYER_SPEED
        )
      }
    } else if (vx !== 0 || vy !== 0) {
      if (vx !== 0 && vy !== 0) {
        const INV_SQRT2 = 0.7071
        vx *= INV_SQRT2
        vy *= INV_SQRT2
      }
      player.setVelocity(vx * PLAYER_SPEED, vy * PLAYER_SPEED)
    } else {
      player.setVelocity(0, 0)
    }

    this.playerNirv.updateAnimation(player.body!.velocity.x, player.body!.velocity.y)

    this.updateInteractableStates()

    // Update bot Nirvs
    for (const bot of this.botNirvs) {
      bot.update(delta)
    }

    // Cooking system
    this.cookingSystem.update(delta)

    // Restaurant system
    this.restaurantSystem.update(delta)
    this.restaurantSystem.cleanupUnseated()

    // Carry indicator
    this.updateCarryIndicator()

    // Update cursor for shop mode hover
    this.updateShopCursor()
  }

  private updateInteractableStates(): void {
    const player = this.playerNirv.sprite
    let closest: Phaser.GameObjects.Sprite | null = null
    let closestDist = Infinity

    for (const sprite of this.interactableSprites) {
      const dist = Phaser.Math.Distance.Between(
        player.x, player.y,
        sprite.x, sprite.y
      )
      if (dist < INTERACTION_RADIUS && dist < closestDist) {
        closest = sprite
        closestDist = dist
      }
    }

    if (closest === this.activeInteractable) return

    if (this.activeInteractable !== null) {
      this.activeInteractable.setTexture('obj_interactable')
      this.activeInteractable = null
      player.clearTint()
    }

    if (closest !== null) {
      this.activeInteractable = closest
      this.activeInteractable.setTexture('obj_interactable_active')
      player.setTint(0xffcc44)
    }
  }

  private spawnObject(type: ObjectType, x: number, y: number, persist: boolean, recipeId?: string): void {
    const config = OBJECT_TYPE_REGISTRY[type]

    if (config.hasPhysicsBody) {
      const sprite = this.obstacleGroup.create(
        x, y, config.textureKey, config.frame ?? 0
      ) as Phaser.Physics.Arcade.Sprite
      sprite.setDepth(config.depth)
      if (config.frame !== undefined) {
        const displaySize = OBJECT_SIZE * 1.6
        sprite.setDisplaySize(displaySize, displaySize)
        sprite.body!.setSize(OBJECT_SIZE, OBJECT_SIZE)
        sprite.body!.setOffset(
          (sprite.width - OBJECT_SIZE) / 2,
          (sprite.height - OBJECT_SIZE) / 2,
        )
      }
      sprite.refreshBody()
      this.placedSprites.push({ sprite, type, x, y })

      // Block cell in pathfinder (only for generic obstacles, not furniture)
      if (this.pathfinder && type === 'obstacle') {
        const g = screenToGrid(x, y)
        this.pathfinder.blockCell(Math.round(g.gx), Math.round(g.gy))
      }

      if (type === 'table2' || type === 'table4') {
        this.tableSprites.push({ sprite, x, y })
        if (this.restaurantSystem) {
          this.restaurantSystem.registerTable(sprite, x, y, type)
        }
      } else if (type === 'counter') {
        this.counterSprites.push({ sprite, x, y })
      } else if (type === 'stove') {
        sprite.setInteractive({ useHandCursor: true })
        sprite.on('pointerdown', () => this.onStoveClicked(sprite))
        if (this.cookingSystem) {
          this.cookingSystem.registerStove(sprite, x, y)
        }
      } else if (type === 'trash') {
        sprite.setInteractive({ useHandCursor: true })
        sprite.on('pointerdown', () => this.onTrashClicked(sprite))
      }
    } else {
      const sprite = this.add.sprite(x, y, config.textureKey)
      sprite.setDepth(config.depth)
      if (type !== 'food_plate') {
        this.placedSprites.push({ sprite, type, x, y })
      }

      if (type === 'interactable') {
        this.interactableSprites.push(sprite)
        sprite.setInteractive({ useHandCursor: true })
        sprite.on('pointerdown', () => this.onInteractableClicked(sprite))
      } else if (type === 'chair') {
        if (this.restaurantSystem) {
          this.restaurantSystem.registerChair(sprite, x, y)
        }
      } else if (type === 'food_plate') {
        if (recipeId) {
          const plateEntry = { sprite, tableX: x, tableY: y, recipeId }
          this.plateSprites.push(plateEntry)
          sprite.setInteractive({ useHandCursor: true, pixelPerfect: false })
          sprite.setDepth(5)
          sprite.on('pointerdown', () => this.onPlateClicked(plateEntry))
          if (this.restaurantSystem) {
            this.restaurantSystem.placeFoodOnTable(x, y, recipeId, sprite)
          }
        }
      } else {
        this.backgroundSprites.push(sprite)
      }
    }

    if (persist) {
      savePlacedObject({ id: crypto.randomUUID(), type, x, y, recipeId })
    }
  }

  private placeBuilding(gridX: number, gridY: number): boolean {
    // Validate: no overlap with existing buildings
    for (const b of this.buildings) {
      if (b.overlaps(gridX, gridY)) return false
    }

    // Validate: within world bounds
    const maxGridX = GRID_COLS - 8
    const maxGridY = GRID_ROWS - 8
    if (gridX < 0 || gridY < 0 || gridX > maxGridX || gridY > maxGridY) return false

    const id = crypto.randomUUID()
    const building = new Building(this, id, gridX, gridY, 'empty')
    building.createWalls(this, this.obstacleGroup)
    this.buildings.push(building)
    this.createSign(building)
    this.blockBuildingCells(building)
    savePlacedBuilding({ id, gridX, gridY, type: 'empty' })
    return true
  }

  private onInteractableClicked(sprite: Phaser.GameObjects.Sprite): void {
    if (this.placementManager.isActive()) return

    const player = this.playerNirv.sprite
    const dist = Phaser.Math.Distance.Between(
      player.x, player.y,
      sprite.x, sprite.y
    )

    if (dist >= INTERACTION_RADIUS) {
      this.walkTarget = { x: sprite.x, y: sprite.y }
    }
  }

  private createSign(building: Building): void {
    const sign = new BuildingSign(this, building.id, building.gridX, building.gridY)
    sign.onClick((buildingId) => this.onSignClicked(buildingId))
    this.buildingSigns.set(building.id, sign)
  }

  private onSignClicked(buildingId: string): void {
    if (this.placementManager.isActive()) return
    const building = this.buildings.find(b => b.id === buildingId)
    if (!building) return

    this.buildingTypeUI.open(buildingId, building.type, (id, type) => {
      const b = this.buildings.find(b => b.id === id)
      if (b) {
        b.setType(type)
        updateBuildingType(id, type)
      }
    })
  }

  private onStoveClicked(sprite: Phaser.Physics.Arcade.Sprite): void {
    if (this.placementManager.isActive()) return

    const player = this.playerNirv.sprite
    const dist = Phaser.Math.Distance.Between(player.x, player.y, sprite.x, sprite.y)

    if (dist >= INTERACTION_RADIUS * 1.5) {
      // Walk to stove first, then interact
      this.walkTarget = { x: sprite.x, y: sprite.y }
      this.pendingStoveSprite = sprite
      this.pendingFoodTarget = null
    } else {
      this.interactWithStove(sprite)
    }
  }

  private interactWithStove(sprite: Phaser.Physics.Arcade.Sprite): void {
    const stove = this.cookingSystem.getStoveBySprite(sprite)
    if (!stove) return

    if (stove.status === 'idle' && !this.carriedPlate) {
      this.recipeSelectUI.open((recipeId) => {
        this.cookingSystem.startCooking(stove, recipeId)
      })
    } else if (stove.status === 'done') {
      const recipeId = this.cookingSystem.collectFood(stove)
      if (recipeId) {
        this.carriedPlate = { recipeId }
        this.createCarryIndicator()
      }
    }
    // If 'cooking', do nothing — progress bar is visible
  }

  private onTrashClicked(sprite: Phaser.Physics.Arcade.Sprite): void {
    if (this.placementManager.isActive()) return
    if (!this.carriedPlate) return

    const player = this.playerNirv.sprite
    const dist = Phaser.Math.Distance.Between(player.x, player.y, sprite.x, sprite.y)

    if (dist >= INTERACTION_RADIUS * 1.5) {
      this.walkTarget = { x: sprite.x, y: sprite.y }
      this.pendingTrashSprite = sprite
      this.pendingStoveSprite = null
      this.pendingFoodTarget = null
    } else {
      this.discardCarriedItem()
    }
  }

  private onPlateClicked(entry: { sprite: Phaser.GameObjects.Sprite; tableX: number; tableY: number; recipeId: string }): void {
    if (!this.menuUI || !this.placementManager) return
    if (this.placementManager.isActive()) return
    if (this.menuUI.isShopMode()) return
    if (this.carriedPlate) return

    const player = this.playerNirv.sprite
    const dist = Phaser.Math.Distance.Between(player.x, player.y, entry.sprite.x, entry.sprite.y)

    if (dist >= INTERACTION_RADIUS * 1.5) {
      this.walkTarget = { x: entry.sprite.x, y: entry.sprite.y }
      this.pendingPlatePickup = entry
      this.pendingStoveSprite = null
      this.pendingTrashSprite = null
      this.pendingFoodTarget = null
    } else {
      this.pickUpPlate(entry)
    }
  }

  private pickUpPlate(entry: { sprite: Phaser.GameObjects.Sprite; tableX: number; tableY: number; recipeId: string }): void {
    // Remove from restaurant system (best effort — table may have been removed)
    this.restaurantSystem.removePlateFromTable(entry.tableX, entry.tableY)

    entry.sprite.destroy()
    this.plateSprites = this.plateSprites.filter(p => p !== entry)
    removeObjectByType(entry.tableX, entry.tableY, 'food_plate')

    this.carriedPlate = { recipeId: entry.recipeId }
    this.createCarryIndicator()
  }

  private discardCarriedItem(): void {
    if (!this.carriedPlate) return
    this.carriedPlate = null
    if (this.carryIndicator) {
      this.carryIndicator.destroy()
      this.carryIndicator = null
    }
  }

  private handlePendingInteractions(): void {
    if (this.pendingStoveSprite) {
      const sprite = this.pendingStoveSprite
      this.pendingStoveSprite = null
      this.interactWithStove(sprite)
    }
    if (this.pendingTrashSprite) {
      this.pendingTrashSprite = null
      this.discardCarriedItem()
    }
    if (this.pendingPlatePickup) {
      const entry = this.pendingPlatePickup
      this.pendingPlatePickup = null
      this.pickUpPlate(entry)
    }
    if (this.pendingFoodTarget && this.carriedPlate) {
      const target = this.pendingFoodTarget
      this.pendingFoodTarget = null
      this.placeFood(target.x, target.y)
    }
  }

  private createCarryIndicator(): void {
    if (this.carryIndicator) this.carryIndicator.destroy()
    this.carryIndicator = this.add.graphics()
    this.carryIndicator.setDepth(5)
  }

  private updateCarryIndicator(): void {
    if (!this.carryIndicator || !this.carriedPlate) {
      if (this.carryIndicator) {
        this.carryIndicator.destroy()
        this.carryIndicator = null
      }
      return
    }

    const player = this.playerNirv.sprite
    const recipe = getRecipe(this.carriedPlate.recipeId)
    const color = recipe?.color ?? 0xffffff
    const gfx = this.carryIndicator
    gfx.clear()

    // White plate circle
    gfx.fillStyle(0xffffff)
    gfx.fillCircle(player.x, player.y - 24, 7)
    // Food color dot
    gfx.fillStyle(color)
    gfx.fillCircle(player.x, player.y - 24, 4)
  }

  private onWorldClicked(pointer: Phaser.Input.Pointer): void {
    if (!this.menuUI || !this.placementManager) return
    if (this.placementManager.isActive()) return

    // In Shop mode, clicking a placed object picks it up for repositioning
    // (checked before isPointerOverUI so objects behind the panel can be picked up)
    if (this.menuUI.isShopMode() && !this.carriedPlate) {
      if (this.menuUI.isPointerOverUI(pointer)) return
      this.tryPickUpObject(pointer)
      return
    }

    if (this.menuUI.isPointerOverUI(pointer)) return

    if (!this.carriedPlate) return

    // Check if clicking near a table or counter to place food
    const snapped = snapToIsoGrid(pointer.worldX, pointer.worldY)

    let target: { x: number; y: number } | null = null
    let bestDist = TILE_W // Must click within 1 tile

    for (const t of this.tableSprites) {
      const d = Phaser.Math.Distance.Between(snapped.x, snapped.y, t.x, t.y)
      if (d < bestDist) {
        bestDist = d
        target = { x: t.x, y: t.y }
      }
    }
    for (const c of this.counterSprites) {
      const d = Phaser.Math.Distance.Between(snapped.x, snapped.y, c.x, c.y)
      if (d < bestDist) {
        bestDist = d
        target = { x: c.x, y: c.y }
      }
    }

    if (!target) return

    const player = this.playerNirv.sprite
    const dist = Phaser.Math.Distance.Between(player.x, player.y, target.x, target.y)

    if (dist >= INTERACTION_RADIUS * 1.5) {
      this.walkTarget = { x: target.x, y: target.y }
      this.pendingFoodTarget = target
      this.pendingStoveSprite = null
    } else {
      this.placeFood(target.x, target.y)
    }
  }

  private placeFood(x: number, y: number): void {
    if (!this.carriedPlate) return
    const recipeId = this.carriedPlate.recipeId

    // Spawn a food plate at the target position
    this.spawnObject('food_plate', x, y, true, recipeId)

    // Clear carried plate
    this.carriedPlate = null
    if (this.carryIndicator) {
      this.carryIndicator.destroy()
      this.carryIndicator = null
    }
  }

  private tryPickUpObject(pointer: Phaser.Input.Pointer): void {
    const snapped = snapToIsoGrid(pointer.worldX, pointer.worldY)

    // Find a placed sprite at the snapped position
    const idx = this.placedSprites.findIndex(
      p => Math.abs(p.x - snapped.x) < 2 && Math.abs(p.y - snapped.y) < 2
    )
    if (idx === -1) return

    const entry = this.placedSprites[idx]
    const { sprite, type, x, y } = entry

    // Remove from scene
    sprite.destroy()
    this.placedSprites.splice(idx, 1)

    // Remove from tracking arrays
    this.interactableSprites = this.interactableSprites.filter(s => s !== sprite)
    this.backgroundSprites = this.backgroundSprites.filter(s => s !== sprite)
    this.tableSprites = this.tableSprites.filter(t => t.sprite !== sprite)
    this.counterSprites = this.counterSprites.filter(c => c.sprite !== sprite)

    // If removing a table/counter, also remove any plates on it
    if (type === 'table2' || type === 'table4' || type === 'counter') {
      const orphanedPlates = this.plateSprites.filter(p => p.tableX === x && p.tableY === y)
      for (const plate of orphanedPlates) {
        plate.sprite.destroy()
        removeObjectAt(plate.tableX, plate.tableY)
        this.restaurantSystem.removePlateFromTable(plate.tableX, plate.tableY)
      }
      this.plateSprites = this.plateSprites.filter(p => p.tableX !== x || p.tableY !== y)
    }

    // Remove from persistence
    removeObjectAt(x, y)

    // Unblock cell in pathfinder (only for generic obstacles)
    if (type === 'obstacle') {
      const g = screenToGrid(x, y)
      this.pathfinder.unblockCell(Math.round(g.gx), Math.round(g.gy))
    }

    if (this.menuUI.isInventoryMode()) {
      // Store in inventory
      addToInventory(type)
      this.menuUI.refreshInventoryGrid()
    } else {
      // Enter reposition mode: ghost follows cursor, placed on mouse-up, then auto-exits
      this.placementManager.enterReposition(type, snapped.x, snapped.y)
    }
  }

  /** In shop mode, show grab cursor when hovering over a placed object. */
  private updateShopCursor(): void {
    if (!this.menuUI) return
    if (!this.menuUI.isShopMode() || this.placementManager.isActive()) {
      return
    }

    const pointer = this.input.activePointer
    const snapped = snapToIsoGrid(pointer.worldX, pointer.worldY)

    const overObject = this.placedSprites.some(
      p => Math.abs(p.x - snapped.x) < 2 && Math.abs(p.y - snapped.y) < 2
    )

    this.game.canvas.style.cursor = overObject ? 'grab' : ''
  }

  private changeZoom(direction: number): void {
    this.zoomIndex = Phaser.Math.Clamp(this.zoomIndex + direction, 0, ZOOM_LEVELS.length - 1)
    this.cameras.main.setZoom(ZOOM_LEVELS[this.zoomIndex])
  }

  getBotNirvs(): BotNirv[] {
    return this.botNirvs
  }

  isPlayerInsideRestaurant(): boolean {
    const player = this.playerNirv.sprite
    for (const b of this.buildings) {
      if (b.type === 'restaurant' && b.containsPixel(player.x, player.y)) {
        return true
      }
    }
    return false
  }

  private createNirvAnimations(): void {
    const directions: { dir: string; startFrame: number }[] = [
      { dir: 'down', startFrame: 8 },
      { dir: 'up', startFrame: 12 },
      { dir: 'left', startFrame: 0 },
      { dir: 'right', startFrame: 4 },
    ]

    for (const variant of ['m', 'f', 'f2', 'f3'] as NirvVariant[]) {
      for (const { dir, startFrame } of directions) {
        this.anims.create({
          key: `${variant}_idle_${dir}`,
          frames: this.anims.generateFrameNumbers(`${variant}_idle`, {
            start: startFrame,
            end: startFrame + 3,
          }),
          frameRate: 4,
          repeat: -1,
        })

        this.anims.create({
          key: `${variant}_walk_${dir}`,
          frames: this.anims.generateFrameNumbers(`${variant}_walk`, {
            start: startFrame,
            end: startFrame + 3,
          }),
          frameRate: 8,
          repeat: -1,
        })
      }
    }
  }

  private blockBuildingCells(building: Building): void {
    const gx = building.gridX
    const gy = building.gridY
    const w = BUILDING_GRID_W
    const h = BUILDING_GRID_H

    // Top wall row
    for (let x = gx; x < gx + w; x++) this.pathfinder.blockCell(x, gy)
    // Bottom wall row (except door: cells gx+3 and gx+4)
    for (let x = gx; x < gx + w; x++) {
      if (x === gx + 3 || x === gx + 4) continue // door gap
      this.pathfinder.blockCell(x, gy + h - 1)
    }
    // Left wall column
    for (let y = gy; y < gy + h; y++) this.pathfinder.blockCell(gx, y)
    // Right wall column
    for (let y = gy; y < gy + h; y++) this.pathfinder.blockCell(gx + w - 1, y)
  }

  private spawnBots(): void {
    const schedules = generateDefaultSchedules(GRID_COLS, GRID_ROWS)

    for (const config of schedules) {
      let variant = config.colorIndex % 2 === 0 ? 'f' as NirvVariant : 'm' as NirvVariant
      if (config.colorIndex === 2) variant = 'f2' as NirvVariant
      if (config.colorIndex === 3) variant = 'f3' as NirvVariant
      const bot = new BotNirv(this, config.name, config.colorIndex, config.waypoints, variant, this.pathfinder)
      bot.nirv.sprite.setCollideWorldBounds(true)
      this.nirvGroup.add(bot.nirv.sprite)
      this.botNirvs.push(bot)
    }

    // Nirvs collide with obstacles (but not with each other)
    this.physics.add.collider(this.nirvGroup, this.obstacleGroup)
  }
}
