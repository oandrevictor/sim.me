import Phaser from 'phaser'

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

  constructor() {
    super({ key: 'GameScene' })
  }

  preload(): void {
    // Generate player texture programmatically — no external assets needed
    const graphics = this.make.graphics({ x: 0, y: 0 })
    graphics.fillStyle(0xe8c547) // warm yellow
    graphics.fillRect(0, 0, 32, 32)
    graphics.generateTexture('player', 32, 32)
    graphics.destroy()
  }

  create(): void {
    // Draw plain ground
    const bg = this.add.graphics()
    bg.fillStyle(0x4a7c59) // grass green
    bg.fillRect(0, 0, 800, 600)

    // Add subtle grid to give depth to the plain
    bg.lineStyle(1, 0x3d6b4a, 0.4)
    for (let x = 0; x <= 800; x += 40) {
      bg.lineBetween(x, 0, x, 600)
    }
    for (let y = 0; y <= 600; y += 40) {
      bg.lineBetween(0, y, 800, y)
    }

    // Create player with arcade physics
    this.player = this.physics.add.sprite(400, 300, 'player')
    this.player.setCollideWorldBounds(true)

    // Set up controls: arrow keys
    this.cursors = this.input.keyboard!.createCursorKeys()

    // WASD keys
    this.wasd = {
      up: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    }

    // Controls hint
    this.add.text(10, 10, 'Move: WASD / Arrow keys', {
      fontSize: '14px',
      color: '#ffffff',
    }).setAlpha(0.7)
  }

  update(): void {
    let vx = 0
    let vy = 0

    if (this.cursors.left.isDown || this.wasd.left.isDown) vx -= 1
    if (this.cursors.right.isDown || this.wasd.right.isDown) vx += 1
    if (this.cursors.up.isDown || this.wasd.up.isDown) vy -= 1
    if (this.cursors.down.isDown || this.wasd.down.isDown) vy += 1

    // Normalize diagonal movement
    if (vx !== 0 && vy !== 0) {
      const INV_SQRT2 = 0.7071
      vx *= INV_SQRT2
      vy *= INV_SQRT2
    }

    this.player.setVelocity(vx * PLAYER_SPEED, vy * PLAYER_SPEED)
  }
}
