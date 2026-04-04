import Phaser from 'phaser'
import { generateObjectTextures, OBJECT_TYPE_REGISTRY, GRID_SIZE, type ObjectType } from '../objects/objectTypes'
import { StoreUI } from '../ui/StoreUI'
import { PlacementManager } from '../placement/PlacementManager'
import { loadPlacedObjects, savePlacedObject } from '../storage/persistence'

const PLAYER_SPEED = 200
// How close the player must be (center-to-center) to activate an interactable
const INTERACTION_RADIUS = GRID_SIZE

interface WalkTarget {
  x: number
  y: number
}

export class GameScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Sprite
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd!: {
    up: Phaser.Input.Keyboard.Key
    down: Phaser.Input.Keyboard.Key
    left: Phaser.Input.Keyboard.Key
    right: Phaser.Input.Keyboard.Key
  }

  private storeUI!: StoreUI
  private placementManager!: PlacementManager
  private obstacleGroup!: Phaser.Physics.Arcade.StaticGroup
  private interactableSprites: Phaser.GameObjects.Sprite[] = []
  private backgroundSprites: Phaser.GameObjects.Sprite[] = []

  // Auto-walk state
  private walkTarget: WalkTarget | null = null

  // The interactable currently in active state (null = none)
  private activeInteractable: Phaser.GameObjects.Sprite | null = null

  constructor() {
    super({ key: 'GameScene' })
  }

  preload(): void {
    const playerGfx = this.make.graphics({ x: 0, y: 0 })
    playerGfx.fillStyle(0xe8c547)
    playerGfx.fillRect(0, 0, 32, 32)
    playerGfx.generateTexture('player', 32, 32)
    playerGfx.destroy()

    generateObjectTextures(this)
  }

  create(): void {
    // Background
    const bg = this.add.graphics()
    bg.fillStyle(0x4a7c59)
    bg.fillRect(0, 0, 800, 600)
    bg.lineStyle(1, 0x3d6b4a, 0.4)
    for (let x = 0; x <= 800; x += 40) bg.lineBetween(x, 0, x, 600)
    for (let y = 0; y <= 600; y += 40) bg.lineBetween(0, y, 800, y)
    bg.setDepth(0)

    // Player
    this.player = this.physics.add.sprite(400, 300, 'player')
    this.player.setCollideWorldBounds(true)
    this.player.setDepth(4)

    // Obstacle group + collider
    this.obstacleGroup = this.physics.add.staticGroup()
    this.physics.add.collider(this.player, this.obstacleGroup)

    // Restore persisted objects
    loadPlacedObjects().forEach(r => this.spawnObject(r.type, r.x, r.y, false))

    // Store UI
    this.storeUI = new StoreUI(this, 400, 576)
    this.add.existing(this.storeUI)
    this.storeUI.setDepth(20)

    // Placement manager
    this.placementManager = new PlacementManager(
      this,
      this.storeUI,
      (type, x, y) => this.spawnObject(type, x, y, true)
    )

    // Wire store events
    this.events.on('store:select', (type: ObjectType) => {
      this.placementManager.enter(type)
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

    this.add.text(10, 10, 'Move: WASD / Arrows  |  Click bag to place objects  |  ESC to cancel', {
      fontSize: '12px',
      color: '#ffffff',
    }).setAlpha(0.6).setDepth(20)
  }

  update(): void {
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
      // Auto-walk toward target
      const dist = Phaser.Math.Distance.Between(
        this.player.x, this.player.y,
        this.walkTarget.x, this.walkTarget.y
      )
      if (dist < 18) {
        this.player.setVelocity(0, 0)
        this.walkTarget = null
      } else {
        const angle = Phaser.Math.Angle.Between(
          this.player.x, this.player.y,
          this.walkTarget.x, this.walkTarget.y
        )
        this.player.setVelocity(
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
      this.player.setVelocity(vx * PLAYER_SPEED, vy * PLAYER_SPEED)
    } else {
      this.player.setVelocity(0, 0)
    }

    this.updateInteractableStates()
  }

  // Each frame: find the closest interactable within range and set it active.
  // Swap textures and player tint when the active interactable changes.
  private updateInteractableStates(): void {
    let closest: Phaser.GameObjects.Sprite | null = null
    let closestDist = Infinity

    for (const sprite of this.interactableSprites) {
      const dist = Phaser.Math.Distance.Between(
        this.player.x, this.player.y,
        sprite.x, sprite.y
      )
      if (dist < INTERACTION_RADIUS && dist < closestDist) {
        closest = sprite
        closestDist = dist
      }
    }

    if (closest === this.activeInteractable) return

    // Deactivate previous
    if (this.activeInteractable !== null) {
      this.activeInteractable.setTexture('obj_interactable')
      this.activeInteractable = null
      this.player.clearTint()
    }

    // Activate new
    if (closest !== null) {
      this.activeInteractable = closest
      this.activeInteractable.setTexture('obj_interactable_active')
      this.player.setTint(0xffcc44)
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

  // If the player is already close enough, proximity in updateInteractableStates()
  // handles activation. Otherwise, auto-walk to the object first.
  private onInteractableClicked(sprite: Phaser.GameObjects.Sprite): void {
    if (this.placementManager.isActive()) return

    const dist = Phaser.Math.Distance.Between(
      this.player.x, this.player.y,
      sprite.x, sprite.y
    )

    if (dist >= INTERACTION_RADIUS) {
      this.walkTarget = { x: sprite.x, y: sprite.y }
    }
  }
}
