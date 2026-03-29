import Phaser from 'phaser'
import { generateObjectTextures, OBJECT_TYPE_REGISTRY, type ObjectType } from '../objects/objectTypes'
import { StoreUI } from '../ui/StoreUI'
import { PlacementManager } from '../placement/PlacementManager'
import { loadPlacedObjects, savePlacedObject } from '../storage/persistence'

const PLAYER_SPEED = 200

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

  constructor() {
    super({ key: 'GameScene' })
  }

  preload(): void {
    // Player texture
    const playerGfx = this.make.graphics({ x: 0, y: 0 })
    playerGfx.fillStyle(0xe8c547)
    playerGfx.fillRect(0, 0, 32, 32)
    playerGfx.generateTexture('player', 32, 32)
    playerGfx.destroy()

    // All object textures
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

    // Controls hint
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

    if (vx !== 0 && vy !== 0) {
      const INV_SQRT2 = 0.7071
      vx *= INV_SQRT2
      vy *= INV_SQRT2
    }

    this.player.setVelocity(vx * PLAYER_SPEED, vy * PLAYER_SPEED)
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

        // Click to interact
        sprite.setInteractive({ useHandCursor: true })
        sprite.on('pointerdown', () => this.triggerInteraction(sprite))

        // Walk-through overlap
        this.physics.add.overlap(
          this.player,
          sprite,
          () => this.triggerInteraction(sprite)
        )
      } else {
        // background
        this.backgroundSprites.push(sprite)
      }
    }

    if (persist) {
      savePlacedObject({ id: crypto.randomUUID(), type, x, y })
    }
  }

  private triggerInteraction(sprite: Phaser.GameObjects.Sprite): void {
    if (sprite.getData('flashing') === true) return
    sprite.setData('flashing', true)

    // Flash the interactable: white fill → back to normal
    sprite.setTintFill(0xffffff)
    this.tweens.add({
      targets: sprite,
      alpha: 0.35,
      duration: 120,
      yoyo: true,
      onComplete: () => {
        sprite.clearTint()
        sprite.setAlpha(1)
        sprite.setData('flashing', false)
      },
    })

    // Flash the player: brief yellow tint
    this.tweens.add({
      targets: this.player,
      alpha: 0.65,
      duration: 120,
      yoyo: true,
      onStart: () => this.player.setTint(0xffff44),
      onComplete: () => {
        this.player.clearTint()
        this.player.setAlpha(1)
      },
    })
  }
}
