import Phaser from 'phaser'
import { GRID_SIZE, OBJECT_TYPE_REGISTRY, type ObjectType } from '../objects/objectTypes'
import { BUILDING_GRID_W, BUILDING_GRID_H } from '../entities/Building'
import type { MenuUI } from '../ui/MenuUI'

type PlacementMode = 'object' | 'building'

export class PlacementManager {
  private ghost: Phaser.GameObjects.GameObject | null = null
  private activeType: ObjectType | null = null
  private mode: PlacementMode | null = null
  private escKey: Phaser.Input.Keyboard.Key | null = null
  private repositionMode = false

  private boundOnPointerMove: (pointer: Phaser.Input.Pointer) => void
  private boundOnPointerDown: (
    pointer: Phaser.Input.Pointer,
    _gameObjects: Phaser.GameObjects.GameObject[]
  ) => void
  private boundOnPointerUp: (pointer: Phaser.Input.Pointer) => void

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly menuUI: MenuUI,
    private readonly onPlace: (type: ObjectType, x: number, y: number) => void,
    private readonly onPlaceBuilding: (gridX: number, gridY: number) => boolean,
  ) {
    this.boundOnPointerMove = this.onPointerMove.bind(this)
    this.boundOnPointerDown = this.onPointerDown.bind(this)
    this.boundOnPointerUp = this.onPointerUp.bind(this)
  }

  enter(type: ObjectType): void {
    if (this.mode !== null) this.exit()

    this.mode = 'object'
    this.activeType = type
    const config = OBJECT_TYPE_REGISTRY[type]

    const sprite = this.scene.add.sprite(0, 0, 'obj_ghost')
    sprite.setTint(config.previewColor)
    sprite.setAlpha(0.55)
    sprite.setDepth(10)
    this.ghost = sprite

    this.bindInput()
  }

  /** Enter single-place reposition mode: ghost follows pointer, placed on pointerup, then auto-exits. */
  enterReposition(type: ObjectType, startX: number, startY: number): void {
    if (this.mode !== null) this.exit()

    this.mode = 'object'
    this.activeType = type
    this.repositionMode = true
    const config = OBJECT_TYPE_REGISTRY[type]

    const sprite = this.scene.add.sprite(startX, startY, 'obj_ghost')
    sprite.setTint(config.previewColor)
    sprite.setAlpha(0.55)
    sprite.setDepth(10)
    this.ghost = sprite

    this.scene.game.canvas.style.cursor = 'grabbing'
    this.bindInput()
  }

  enterBuildingPlacement(): void {
    if (this.mode !== null) this.exit()

    this.mode = 'building'
    this.activeType = null

    const pw = BUILDING_GRID_W * GRID_SIZE
    const ph = BUILDING_GRID_H * GRID_SIZE
    const gfx = this.scene.add.graphics()
    gfx.fillStyle(0x6b5b3a, 0.4)
    gfx.fillRect(-pw / 2, -ph / 2, pw, ph)
    gfx.lineStyle(2, 0x4a3d28, 0.6)
    gfx.strokeRect(-pw / 2, -ph / 2, pw, ph)
    gfx.setDepth(10)
    this.ghost = gfx

    this.bindInput()
  }

  exit(): void {
    if (this.ghost) {
      this.ghost.destroy()
      this.ghost = null
    }

    this.scene.input.off('pointermove', this.boundOnPointerMove)
    this.scene.input.off('pointerdown', this.boundOnPointerDown)
    this.scene.input.off('pointerup', this.boundOnPointerUp)

    if (this.escKey) {
      this.escKey.removeAllListeners()
      this.escKey = null
    }

    this.activeType = null
    this.mode = null
    this.repositionMode = false
    this.scene.game.canvas.style.cursor = ''
  }

  isActive(): boolean {
    return this.mode !== null
  }

  private bindInput(): void {
    this.scene.input.on('pointermove', this.boundOnPointerMove)
    this.scene.input.on('pointerdown', this.boundOnPointerDown)
    this.scene.input.on('pointerup', this.boundOnPointerUp)
    this.escKey = this.scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC)
    this.escKey.on('down', () => this.exit())
  }

  private snapToGrid(val: number): number {
    return Math.round(val / GRID_SIZE) * GRID_SIZE
  }

  private snapToGridCorner(val: number): number {
    return Math.floor(val / GRID_SIZE) * GRID_SIZE
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.ghost) return

    if (this.mode === 'object') {
      (this.ghost as Phaser.GameObjects.Sprite).setPosition(
        this.snapToGrid(pointer.worldX),
        this.snapToGrid(pointer.worldY),
      )
    } else {
      const gx = this.snapToGridCorner(pointer.worldX)
      const gy = this.snapToGridCorner(pointer.worldY)
      const cx = gx + (BUILDING_GRID_W * GRID_SIZE) / 2
      const cy = gy + (BUILDING_GRID_H * GRID_SIZE) / 2
      ;(this.ghost as Phaser.GameObjects.Graphics).setPosition(cx, cy)
    }
  }

  private onPointerDown(
    pointer: Phaser.Input.Pointer,
    _gameObjects: Phaser.GameObjects.GameObject[]
  ): void {
    if (!pointer.leftButtonDown()) return
    if (this.menuUI.isPointerOverUI(pointer)) return

    // In reposition mode, placement happens on pointerup
    if (this.repositionMode) return

    if (this.mode === 'object' && this.activeType) {
      this.onPlace(this.activeType, this.snapToGrid(pointer.worldX), this.snapToGrid(pointer.worldY))
    } else if (this.mode === 'building') {
      const gridX = Math.floor(pointer.worldX / GRID_SIZE)
      const gridY = Math.floor(pointer.worldY / GRID_SIZE)
      const placed = this.onPlaceBuilding(gridX, gridY)
      if (placed) this.exit()
    }
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    if (!this.repositionMode) return
    if (!this.activeType) return
    if (this.menuUI.isPointerOverUI(pointer)) return

    this.onPlace(this.activeType, this.snapToGrid(pointer.worldX), this.snapToGrid(pointer.worldY))
    this.exit()
  }
}
