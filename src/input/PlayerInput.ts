import Phaser from 'phaser'
import { BuildCameraController } from './BuildCameraController'

export interface InputResult {
  vx: number
  vy: number
  hasInput: boolean
  arrivedAtTarget: boolean
}

export class PlayerInput {
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys
  private wasd: {
    up: Phaser.Input.Keyboard.Key
    down: Phaser.Input.Keyboard.Key
    left: Phaser.Input.Keyboard.Key
    right: Phaser.Input.Keyboard.Key
  }
  private buildCamera: BuildCameraController
  private walkTarget: { x: number; y: number } | null = null
  private prevX = 0
  private prevY = 0
  private stuckFrames = 0

  constructor(scene: Phaser.Scene, private readonly speed: number) {
    this.buildCamera = new BuildCameraController(scene)
    this.cursors = scene.input.keyboard!.createCursorKeys()
    this.wasd = {
      up: scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    }

    scene.input.on('wheel', (_p: Phaser.Input.Pointer, _go: unknown, _dx: number, dy: number) => {
      this.buildCamera.changeZoom(dy > 0 ? -1 : 1)
    })
    scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.PLUS).on('down', () => this.buildCamera.changeZoom(1))
    scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.MINUS).on('down', () => this.buildCamera.changeZoom(-1))
    scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.NUMPAD_ADD).on('down', () => this.buildCamera.changeZoom(1))
    scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.NUMPAD_SUBTRACT).on('down', () => this.buildCamera.changeZoom(-1))
  }

  setWalkTarget(x: number, y: number): void {
    this.walkTarget = { x, y }
    this.stuckFrames = 0
  }

  clearWalkTarget(): void {
    this.walkTarget = null
    this.stuckFrames = 0
  }

  getWalkTarget(): { x: number; y: number } | null {
    return this.walkTarget
  }

  /** Returns the velocity to apply to the player sprite this frame. */
  update(playerSprite: Phaser.Physics.Arcade.Sprite): InputResult {
    const { dx, dy } = this.readMoveDirection()
    const hasInput = dx !== 0 || dy !== 0

    if (hasInput) {
      this.walkTarget = null
      this.stuckFrames = 0
      const len = Math.sqrt(dx * dx + dy * dy)
      return { vx: (dx / len) * this.speed, vy: (dy / len) * this.speed, hasInput, arrivedAtTarget: false }
    }

    if (this.walkTarget) {
      const dist = Phaser.Math.Distance.Between(playerSprite.x, playerSprite.y, this.walkTarget.x, this.walkTarget.y)
      if (dist < 18) {
        this.walkTarget = null
        return { vx: 0, vy: 0, hasInput: false, arrivedAtTarget: true }
      }
      const moved = Phaser.Math.Distance.Between(playerSprite.x, playerSprite.y, this.prevX, this.prevY)
      this.stuckFrames = moved < 0.5 ? this.stuckFrames + 1 : 0
      this.prevX = playerSprite.x
      this.prevY = playerSprite.y
      if (this.stuckFrames > 24) {
        this.walkTarget = null
        this.stuckFrames = 0
        return { vx: 0, vy: 0, hasInput: false, arrivedAtTarget: false }
      }
      const angle = Phaser.Math.Angle.Between(playerSprite.x, playerSprite.y, this.walkTarget.x, this.walkTarget.y)
      return { vx: Math.cos(angle) * this.speed, vy: Math.sin(angle) * this.speed, hasInput: false, arrivedAtTarget: false }
    }

    this.stuckFrames = 0
    this.prevX = playerSprite.x
    this.prevY = playerSprite.y
    return { vx: 0, vy: 0, hasInput: false, arrivedAtTarget: false }
  }

  updateBuildCamera(delta: number): void {
    const { dx, dy } = this.readMoveDirection()
    this.buildCamera.update(delta, dx, dy)
  }

  private readMoveDirection(): { dx: number; dy: number } {
    let dx = 0, dy = 0
    if (this.cursors.up.isDown || this.wasd.up.isDown) dy -= 1
    if (this.cursors.down.isDown || this.wasd.down.isDown) dy += 1
    if (this.cursors.left.isDown || this.wasd.left.isDown) dx -= 1
    if (this.cursors.right.isDown || this.wasd.right.isDown) dx += 1
    return { dx, dy }
  }
}
