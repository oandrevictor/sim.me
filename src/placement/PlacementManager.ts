import Phaser from 'phaser'
import { GRID_SIZE, OBJECT_TYPE_REGISTRY, type ObjectType } from '../objects/objectTypes'
import type { StoreUI } from '../ui/StoreUI'

export class PlacementManager {
  private ghost: Phaser.GameObjects.Sprite | null = null
  private activeType: ObjectType | null = null
  private escKey: Phaser.Input.Keyboard.Key | null = null

  private boundOnPointerMove: (pointer: Phaser.Input.Pointer) => void
  private boundOnPointerDown: (
    pointer: Phaser.Input.Pointer,
    _gameObjects: Phaser.GameObjects.GameObject[]
  ) => void

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly storeUI: StoreUI,
    private readonly onPlace: (type: ObjectType, x: number, y: number) => void
  ) {
    this.boundOnPointerMove = this.onPointerMove.bind(this)
    this.boundOnPointerDown = this.onPointerDown.bind(this)
  }

  enter(type: ObjectType): void {
    if (this.activeType !== null) this.exit()

    this.activeType = type
    const config = OBJECT_TYPE_REGISTRY[type]

    this.ghost = this.scene.add.sprite(0, 0, 'obj_ghost')
    this.ghost.setTint(config.previewColor)
    this.ghost.setAlpha(0.55)
    this.ghost.setDepth(10)

    this.scene.input.on('pointermove', this.boundOnPointerMove)
    this.scene.input.on('pointerdown', this.boundOnPointerDown)

    this.escKey = this.scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC)
    this.escKey.on('down', () => this.exit())
  }

  exit(): void {
    if (this.ghost) {
      this.ghost.destroy()
      this.ghost = null
    }

    this.scene.input.off('pointermove', this.boundOnPointerMove)
    this.scene.input.off('pointerdown', this.boundOnPointerDown)

    if (this.escKey) {
      this.escKey.removeAllListeners()
      this.escKey = null
    }

    this.activeType = null
  }

  isActive(): boolean {
    return this.activeType !== null
  }

  private snap(val: number): number {
    return Math.round(val / GRID_SIZE) * GRID_SIZE
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.ghost) return
    this.ghost.setPosition(this.snap(pointer.worldX), this.snap(pointer.worldY))
  }

  private onPointerDown(
    pointer: Phaser.Input.Pointer,
    _gameObjects: Phaser.GameObjects.GameObject[]
  ): void {
    if (!pointer.leftButtonDown()) return
    if (this.storeUI.isPointerOverUI(pointer)) return
    if (!this.activeType) return

    this.onPlace(this.activeType, this.snap(pointer.worldX), this.snap(pointer.worldY))
  }
}
