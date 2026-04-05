import Phaser from 'phaser'

const ZOOM_LEVELS = [0.5, 0.75, 1, 1.25, 1.5, 2]
const DEFAULT_ZOOM_INDEX = 2

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
  private zoomIndex = DEFAULT_ZOOM_INDEX
  private walkTarget: { x: number; y: number } | null = null

  constructor(private readonly scene: Phaser.Scene, private readonly speed: number) {
    this.cursors = scene.input.keyboard!.createCursorKeys()
    this.wasd = {
      up: scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    }

    scene.input.on('wheel', (_p: Phaser.Input.Pointer, _go: unknown, _dx: number, dy: number) => {
      this.changeZoom(dy > 0 ? -1 : 1)
    })
    scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.PLUS).on('down', () => this.changeZoom(1))
    scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.MINUS).on('down', () => this.changeZoom(-1))
    scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.NUMPAD_ADD).on('down', () => this.changeZoom(1))
    scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.NUMPAD_SUBTRACT).on('down', () => this.changeZoom(-1))
  }

  setWalkTarget(x: number, y: number): void {
    this.walkTarget = { x, y }
  }

  clearWalkTarget(): void {
    this.walkTarget = null
  }

  getWalkTarget(): { x: number; y: number } | null {
    return this.walkTarget
  }

  /** Returns the velocity to apply to the player sprite this frame. */
  update(playerSprite: Phaser.Physics.Arcade.Sprite): InputResult {
    let isoX = 0, isoY = 0
    if (this.cursors.up.isDown || this.wasd.up.isDown) { isoX -= 2; isoY -= 1 }
    if (this.cursors.down.isDown || this.wasd.down.isDown) { isoX += 2; isoY += 1 }
    if (this.cursors.left.isDown || this.wasd.left.isDown) { isoX -= 2; isoY += 1 }
    if (this.cursors.right.isDown || this.wasd.right.isDown) { isoX += 2; isoY -= 1 }
    const hasInput = isoX !== 0 || isoY !== 0

    if (hasInput) {
      this.walkTarget = null
      const len = Math.sqrt(isoX * isoX + isoY * isoY)
      return { vx: (isoX / len) * this.speed, vy: (isoY / len) * this.speed, hasInput, arrivedAtTarget: false }
    }

    if (this.walkTarget) {
      const dist = Phaser.Math.Distance.Between(playerSprite.x, playerSprite.y, this.walkTarget.x, this.walkTarget.y)
      if (dist < 18) {
        this.walkTarget = null
        return { vx: 0, vy: 0, hasInput: false, arrivedAtTarget: true }
      }
      const angle = Phaser.Math.Angle.Between(playerSprite.x, playerSprite.y, this.walkTarget.x, this.walkTarget.y)
      return { vx: Math.cos(angle) * this.speed, vy: Math.sin(angle) * this.speed, hasInput: false, arrivedAtTarget: false }
    }

    return { vx: 0, vy: 0, hasInput: false, arrivedAtTarget: false }
  }

  private changeZoom(direction: number): void {
    this.zoomIndex = Phaser.Math.Clamp(this.zoomIndex + direction, 0, ZOOM_LEVELS.length - 1)
    this.scene.cameras.main.setZoom(ZOOM_LEVELS[this.zoomIndex])
  }
}
