import Phaser from 'phaser'
import { OBJECT_TYPE_REGISTRY, OBJECT_SIZE, type ObjectType } from '../objects/objectTypes'
import { BUILDING_GRID_W, BUILDING_GRID_H } from '../entities/Building'
import type { MenuUI } from '../ui/MenuUI'
import { snapToIsoGrid, screenToGrid, gridToScreen, TILE_W, TILE_H } from '../utils/isoGrid'

/** Object types that support rotation (spritesheet with directional frames) */
const ROTATABLE_TYPES: Set<ObjectType> = new Set(['chair', 'stove'])

type PlacementMode = 'object' | 'building'

export class PlacementManager {
  private ghost: Phaser.GameObjects.GameObject | null = null
  private activeType: ObjectType | null = null
  private mode: PlacementMode | null = null
  private escKey: Phaser.Input.Keyboard.Key | null = null
  private rotateKey: Phaser.Input.Keyboard.Key | null = null
  private repositionMode = false
  private inventoryMode = false
  private rotation = 0

  private boundOnPointerMove: (pointer: Phaser.Input.Pointer) => void
  private boundOnPointerDown: (
    pointer: Phaser.Input.Pointer,
    _gameObjects: Phaser.GameObjects.GameObject[]
  ) => void
  private boundOnPointerUp: (pointer: Phaser.Input.Pointer) => void

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly menuUI: MenuUI,
    private readonly onPlace: (type: ObjectType, x: number, y: number, rotation?: number) => void,
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
    this.rotation = 0
    this.ghost = this.createGhost(type)

    this.bindInput()
  }

  enterReposition(type: ObjectType, startX: number, startY: number, rotation = 0): void {
    if (this.mode !== null) this.exit()

    this.mode = 'object'
    this.activeType = type
    this.repositionMode = true
    this.rotation = rotation
    this.ghost = this.createGhost(type)
    ;(this.ghost as Phaser.GameObjects.Sprite).setPosition(startX, startY)

    this.scene.game.canvas.style.cursor = 'grabbing'
    this.bindInput()
  }

  enterFromInventory(type: ObjectType): void {
    if (this.mode !== null) this.exit()

    this.mode = 'object'
    this.activeType = type
    this.inventoryMode = true
    this.rotation = 0
    this.ghost = this.createGhost(type)

    this.bindInput()
  }

  enterBuildingPlacement(): void {
    if (this.mode !== null) this.exit()

    this.mode = 'building'
    this.activeType = null

    // Draw isometric building preview
    const gfx = this.scene.add.graphics()
    gfx.fillStyle(0x6b5b3a, 0.4)
    gfx.lineStyle(2, 0x4a3d28, 0.6)
    // Draw a diamond shape for the building footprint
    const hw = BUILDING_GRID_W * TILE_W / 2
    const hh = BUILDING_GRID_H * TILE_H / 2
    gfx.beginPath()
    gfx.moveTo(0, -hh)
    gfx.lineTo(hw, 0)
    gfx.lineTo(0, hh)
    gfx.lineTo(-hw, 0)
    gfx.closePath()
    gfx.fillPath()
    gfx.strokePath()
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
    if (this.rotateKey) {
      this.rotateKey.removeAllListeners()
      this.rotateKey = null
    }

    this.activeType = null
    this.mode = null
    this.repositionMode = false
    this.inventoryMode = false
    this.rotation = 0
    this.scene.game.canvas.style.cursor = ''
  }

  isActive(): boolean {
    return this.mode !== null
  }

  private createGhost(type: ObjectType): Phaser.GameObjects.Sprite {
    const config = OBJECT_TYPE_REGISTRY[type]

    if (ROTATABLE_TYPES.has(type) && config.frame !== undefined) {
      // Show the actual sprite as preview
      const sprite = this.scene.add.sprite(0, 0, config.textureKey, config.frame + this.rotation)
      const displaySize = OBJECT_SIZE * 1.6
      sprite.setDisplaySize(displaySize, displaySize)
      sprite.setAlpha(0.65)
      sprite.setDepth(10)
      return sprite
    }

    const sprite = this.scene.add.sprite(0, 0, 'obj_ghost')
    sprite.setTint(config.previewColor)
    sprite.setAlpha(0.55)
    sprite.setDepth(10)
    return sprite
  }

  private cycleRotation(): void {
    if (!this.activeType || !ROTATABLE_TYPES.has(this.activeType)) return
    const config = OBJECT_TYPE_REGISTRY[this.activeType]
    if (config.frame === undefined) return

    this.rotation = (this.rotation + 1) % 4

    // Update ghost sprite frame
    if (this.ghost && this.ghost instanceof Phaser.GameObjects.Sprite) {
      this.ghost.setFrame(config.frame + this.rotation)
    }
  }

  private bindInput(): void {
    this.scene.input.on('pointermove', this.boundOnPointerMove)
    this.scene.input.on('pointerdown', this.boundOnPointerDown)
    this.scene.input.on('pointerup', this.boundOnPointerUp)
    this.escKey = this.scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC)
    this.escKey.on('down', () => this.exit())

    // R key to rotate
    this.rotateKey = this.scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.R)
    this.rotateKey.on('down', () => this.cycleRotation())
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.ghost) return

    if (this.mode === 'object') {
      const snapped = snapToIsoGrid(pointer.worldX, pointer.worldY)
      ;(this.ghost as Phaser.GameObjects.Sprite).setPosition(snapped.x, snapped.y)
    } else {
      // Building: snap to grid corner and center the building footprint
      const g = screenToGrid(pointer.worldX, pointer.worldY)
      const cornerGX = Math.floor(g.gx)
      const cornerGY = Math.floor(g.gy)
      // Center of the building footprint
      const center = gridToScreen(
        cornerGX + BUILDING_GRID_W / 2,
        cornerGY + BUILDING_GRID_H / 2,
      )
      ;(this.ghost as Phaser.GameObjects.Graphics).setPosition(center.x, center.y)
    }
  }

  private onPointerDown(
    pointer: Phaser.Input.Pointer,
    _gameObjects: Phaser.GameObjects.GameObject[]
  ): void {
    if (!pointer.leftButtonDown()) return
    if (this.menuUI.isPointerOverUI(pointer)) return

    if (this.repositionMode) return

    if (this.mode === 'object' && this.activeType) {
      const snapped = snapToIsoGrid(pointer.worldX, pointer.worldY)
      const rot = ROTATABLE_TYPES.has(this.activeType) ? this.rotation : undefined
      this.onPlace(this.activeType, snapped.x, snapped.y, rot)
      if (this.inventoryMode) {
        this.exit()
        return
      }
    } else if (this.mode === 'building') {
      const g = screenToGrid(pointer.worldX, pointer.worldY)
      const gridX = Math.floor(g.gx)
      const gridY = Math.floor(g.gy)
      const placed = this.onPlaceBuilding(gridX, gridY)
      if (placed) this.exit()
    }
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    if (!this.repositionMode) return
    if (!this.activeType) return
    if (this.menuUI.isPointerOverUI(pointer)) return

    const snapped = snapToIsoGrid(pointer.worldX, pointer.worldY)
    const rot = ROTATABLE_TYPES.has(this.activeType) ? this.rotation : undefined
    this.onPlace(this.activeType, snapped.x, snapped.y, rot)
    this.exit()
  }
}
