import Phaser from 'phaser'
import { generateObjectTextures, OBJECT_TYPE_REGISTRY, GRID_SIZE, type ObjectType } from '../objects/objectTypes'
import { WORLD_WIDTH, WORLD_HEIGHT, GRID_COLS, GRID_ROWS, CANVAS_WIDTH, CANVAS_HEIGHT } from '../config/world'
import { MenuUI } from '../ui/MenuUI'
import { PlacementManager } from '../placement/PlacementManager'
import { loadPlacedObjects, savePlacedObject, removeObjectAt } from '../storage/persistence'
import { loadPlacedBuildings, savePlacedBuilding, updateBuildingType } from '../storage/buildingPersistence'
import { Nirv } from '../entities/Nirv'
import { BotNirv } from '../entities/BotNirv'
import { generateDefaultSchedules } from '../entities/NirvSchedule'
import { Building } from '../entities/Building'
import { BuildingSign } from '../entities/BuildingSign'
import { BuildingTypeUI } from '../ui/BuildingTypeUI'
import { RestaurantSystem } from '../systems/RestaurantSystem'
import { CookingSystem } from '../systems/CookingSystem'
import { RecipeSelectUI } from '../ui/RecipeSelectUI'
import { getRecipe } from '../data/recipes'

const PLAYER_SPEED = 200
const INTERACTION_RADIUS = GRID_SIZE

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
  private helpText!: Phaser.GameObjects.Text
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

  private tableSprites: { sprite: Phaser.Physics.Arcade.Sprite; x: number; y: number }[] = []
  private counterSprites: { sprite: Phaser.Physics.Arcade.Sprite; x: number; y: number }[] = []
  // Track all placed object sprites for repositioning
  private placedSprites: { sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite; type: ObjectType; x: number; y: number }[] = []

  private walkTarget: WalkTarget | null = null
  private activeInteractable: Phaser.GameObjects.Sprite | null = null
  private pendingStoveSprite: Phaser.Physics.Arcade.Sprite | null = null
  private carriedPlate: { recipeId: string } | null = null
  private carryIndicator: Phaser.GameObjects.Graphics | null = null
  private pendingFoodTarget: { x: number; y: number } | null = null

  constructor() {
    super({ key: 'GameScene' })
  }

  preload(): void {
    generateObjectTextures(this)
  }

  create(): void {
    // Expand physics world
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT)

    // Background grid covering full world
    const bg = this.add.graphics()
    bg.fillStyle(0x4a7c59)
    bg.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
    bg.lineStyle(1, 0x3d6b4a, 0.4)
    for (let x = 0; x <= WORLD_WIDTH; x += GRID_SIZE) bg.lineBetween(x, 0, x, WORLD_HEIGHT)
    for (let y = 0; y <= WORLD_HEIGHT; y += GRID_SIZE) bg.lineBetween(0, y, WORLD_WIDTH, y)
    bg.setDepth(0)

    // Player Nirv at world center
    const startX = Math.round(WORLD_WIDTH / 2 / GRID_SIZE) * GRID_SIZE
    const startY = Math.round(WORLD_HEIGHT / 2 / GRID_SIZE) * GRID_SIZE
    this.playerNirv = new Nirv(this, 'Player', 0, startX, startY, true)
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
    this.cookingSystem = new CookingSystem(this)

    // Restore persisted buildings
    loadPlacedBuildings().forEach(r => {
      const building = new Building(this, r.id, r.gridX, r.gridY, r.type)
      building.createWalls(this, this.obstacleGroup)
      this.buildings.push(building)
      this.createSign(building)
    })

    // Restore persisted objects
    loadPlacedObjects().forEach(r => this.spawnObject(r.type, r.x, r.y, false, r.recipeId))

    // Menu UI
    this.menuUI = new MenuUI(this)
    this.menuUI.setProviders(
      () => this.botNirvs,
      () => this.isPlayerInsideRestaurant(),
    )

    // Placement manager
    this.placementManager = new PlacementManager(
      this,
      this.menuUI,
      (type, x, y) => this.spawnObject(type, x, y, true),
      (gridX, gridY) => this.placeBuilding(gridX, gridY),
    )

    // Wire menu events
    this.events.on('store:select', (type: ObjectType) => {
      this.placementManager.enter(type)
    })
    this.events.on('store:select-building', () => {
      this.placementManager.enterBuildingPlacement()
    })
    this.events.on('menu:shop-close', () => {
      if (this.placementManager.isActive()) this.placementManager.exit()
      this.game.canvas.style.cursor = ''
    })

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

    // Help text (positioned each frame to follow camera)
    this.helpText = this.add.text(0, 0, 'Move: WASD / Arrows  |  Shop: place & move objects  |  ESC to cancel', {
      fontSize: '12px',
      color: '#ffffff',
    })
    this.helpText.setAlpha(0.6).setDepth(20)

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

    // Update work panel data
    this.menuUI.updateWorkPanel()

    // Update cursor for shop mode hover
    this.updateShopCursor()

    // Keep UI pinned to camera viewport
    const cam = this.cameras.main
    this.menuUI.setPosition(
      cam.scrollX + CANVAS_WIDTH / 2,
      cam.scrollY + CANVAS_HEIGHT,
    )
    this.helpText.setPosition(cam.scrollX + 10, cam.scrollY + 10)
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
        x, y, config.textureKey
      ) as Phaser.Physics.Arcade.Sprite
      sprite.setDepth(config.depth)
      sprite.refreshBody()
      this.placedSprites.push({ sprite, type, x, y })

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
        if (recipeId && this.restaurantSystem) {
          this.restaurantSystem.placeFoodOnTable(x, y, recipeId, sprite)
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

  private handlePendingInteractions(): void {
    if (this.pendingStoveSprite) {
      const sprite = this.pendingStoveSprite
      this.pendingStoveSprite = null
      this.interactWithStove(sprite)
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
    const worldX = pointer.worldX
    const worldY = pointer.worldY
    const snappedX = Math.round(worldX / GRID_SIZE) * GRID_SIZE
    const snappedY = Math.round(worldY / GRID_SIZE) * GRID_SIZE

    // Find closest table or counter to the clicked position
    let target: { x: number; y: number } | null = null
    let bestDist = GRID_SIZE // Must click within 1 grid cell

    for (const t of this.tableSprites) {
      const d = Phaser.Math.Distance.Between(snappedX, snappedY, t.x, t.y)
      if (d < bestDist) {
        bestDist = d
        target = { x: t.x, y: t.y }
      }
    }
    for (const c of this.counterSprites) {
      const d = Phaser.Math.Distance.Between(snappedX, snappedY, c.x, c.y)
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
    const wx = pointer.worldX
    const wy = pointer.worldY
    const snappedX = Math.round(wx / GRID_SIZE) * GRID_SIZE
    const snappedY = Math.round(wy / GRID_SIZE) * GRID_SIZE

    // Find a placed sprite at the snapped position
    const idx = this.placedSprites.findIndex(
      p => Math.abs(p.x - snappedX) < 2 && Math.abs(p.y - snappedY) < 2
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

    // Remove from persistence
    removeObjectAt(x, y)

    // Enter reposition mode: ghost follows cursor, placed on mouse-up, then auto-exits
    this.placementManager.enterReposition(type, snappedX, snappedY)
  }

  /** In shop mode, show grab cursor when hovering over a placed object. */
  private updateShopCursor(): void {
    if (!this.menuUI.isShopMode() || this.placementManager.isActive()) {
      return
    }

    const pointer = this.input.activePointer
    const snappedX = Math.round(pointer.worldX / GRID_SIZE) * GRID_SIZE
    const snappedY = Math.round(pointer.worldY / GRID_SIZE) * GRID_SIZE

    const overObject = this.placedSprites.some(
      p => Math.abs(p.x - snappedX) < 2 && Math.abs(p.y - snappedY) < 2
    )

    this.game.canvas.style.cursor = overObject ? 'grab' : ''
  }

  private isPlayerInsideRestaurant(): boolean {
    const player = this.playerNirv.sprite
    for (const b of this.buildings) {
      if (b.type === 'restaurant' && b.containsPixel(player.x, player.y)) {
        return true
      }
    }
    return false
  }

  private spawnBots(): void {
    const schedules = generateDefaultSchedules(GRID_COLS, GRID_ROWS)

    for (const config of schedules) {
      const bot = new BotNirv(this, config.name, config.colorIndex, config.waypoints)
      bot.nirv.sprite.setCollideWorldBounds(true)
      this.nirvGroup.add(bot.nirv.sprite)
      this.botNirvs.push(bot)
    }

    // All Nirvs collide with each other and with obstacles
    this.physics.add.collider(this.nirvGroup, this.nirvGroup)
    this.physics.add.collider(this.nirvGroup, this.obstacleGroup)
  }
}
