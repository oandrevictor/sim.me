import Phaser from 'phaser'
import { generateObjectTextures, OBJECT_TYPE_REGISTRY, GRID_SIZE, type ObjectType } from '../objects/objectTypes'
import { WORLD_WIDTH, WORLD_HEIGHT, GRID_COLS, GRID_ROWS, CANVAS_WIDTH, CANVAS_HEIGHT } from '../config/world'
import { StoreUI } from '../ui/StoreUI'
import { PlacementManager } from '../placement/PlacementManager'
import { loadPlacedObjects, savePlacedObject } from '../storage/persistence'
import { loadPlacedBuildings, savePlacedBuilding } from '../storage/buildingPersistence'
import { Nirv } from '../entities/Nirv'
import { BotNirv } from '../entities/BotNirv'
import { generateDefaultSchedules } from '../entities/NirvSchedule'
import { Building } from '../entities/Building'

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

  private storeUI!: StoreUI
  private helpText!: Phaser.GameObjects.Text
  private placementManager!: PlacementManager
  private obstacleGroup!: Phaser.Physics.Arcade.StaticGroup
  private nirvGroup!: Phaser.Physics.Arcade.Group
  private interactableSprites: Phaser.GameObjects.Sprite[] = []
  private backgroundSprites: Phaser.GameObjects.Sprite[] = []
  private botNirvs: BotNirv[] = []
  private buildings: Building[] = []

  private walkTarget: WalkTarget | null = null
  private activeInteractable: Phaser.GameObjects.Sprite | null = null

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

    // Restore persisted buildings
    loadPlacedBuildings().forEach(r => {
      this.buildings.push(new Building(this, r.id, r.gridX, r.gridY))
    })

    // Restore persisted objects
    loadPlacedObjects().forEach(r => this.spawnObject(r.type, r.x, r.y, false))

    // Store UI (positioned each frame to follow camera)
    this.storeUI = new StoreUI(this, 0, 0)
    this.add.existing(this.storeUI)
    this.storeUI.setDepth(20)

    // Placement manager
    this.placementManager = new PlacementManager(
      this,
      this.storeUI,
      (type, x, y) => this.spawnObject(type, x, y, true),
      (gridX, gridY) => this.placeBuilding(gridX, gridY),
    )

    // Wire store events
    this.events.on('store:select', (type: ObjectType) => {
      this.placementManager.enter(type)
    })
    this.events.on('store:select-building', () => {
      this.placementManager.enterBuildingPlacement()
    })
    this.events.on('store:open', () => {
      if (this.placementManager.isActive()) this.placementManager.exit()
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
    this.helpText = this.add.text(0, 0, 'Move: WASD / Arrows  |  Click bag to place objects  |  ESC to cancel', {
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

    if (this.walkTarget !== null) {
      const dist = Phaser.Math.Distance.Between(
        player.x, player.y,
        this.walkTarget.x, this.walkTarget.y
      )
      if (dist < 18) {
        player.setVelocity(0, 0)
        this.walkTarget = null
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

    // Keep UI pinned to camera viewport
    const cam = this.cameras.main
    this.storeUI.setPosition(
      cam.scrollX + CANVAS_WIDTH / 2,
      cam.scrollY + CANVAS_HEIGHT - 24,
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

  private spawnObject(type: ObjectType, x: number, y: number, persist: boolean): void {
    const config = OBJECT_TYPE_REGISTRY[type]

    if (type === 'obstacle') {
      const sprite = this.obstacleGroup.create(
        x, y, config.textureKey
      ) as Phaser.Physics.Arcade.Sprite
      sprite.setDepth(config.depth)
      sprite.refreshBody()
    } else {
      const sprite = this.add.sprite(x, y, config.textureKey)
      sprite.setDepth(config.depth)

      if (type === 'interactable') {
        this.interactableSprites.push(sprite)
        sprite.setInteractive({ useHandCursor: true })
        sprite.on('pointerdown', () => this.onInteractableClicked(sprite))
      } else {
        this.backgroundSprites.push(sprite)
      }
    }

    if (persist) {
      savePlacedObject({ id: crypto.randomUUID(), type, x, y })
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
    const building = new Building(this, id, gridX, gridY)
    this.buildings.push(building)
    savePlacedBuilding({ id, gridX, gridY })
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
