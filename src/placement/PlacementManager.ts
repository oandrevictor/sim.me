import Phaser from 'phaser'
import { stageFootprint, type StageVariant } from '../config/stageVariants'
import { OBJECT_TYPE_REGISTRY, type ObjectType } from '../objects/objectTypes'
import { BUILDING_GRID_W, BUILDING_GRID_H } from '../entities/Building'
import type { MenuUI } from '../ui/MenuUI'
import { snapToIsoGrid, screenToGrid, gridToScreen } from '../utils/isoGrid'
import { layoutSoloStageSprite } from '../utils/soloStageSpriteLayout'
import { createObjectGhost, createBuildingGhost, createStageGhost, ROTATABLE_TYPES } from './GhostFactory'
import { isBedType } from '../objects/bedTypes'

type PlacementMode = 'object' | 'building' | 'stage'

export class PlacementManager {
  private ghost: Phaser.GameObjects.GameObject | null = null
  private activeType: ObjectType | null = null
  private mode: PlacementMode | null = null
  private escKey: Phaser.Input.Keyboard.Key | null = null
  private rotateKey: Phaser.Input.Keyboard.Key | null = null
  private repositionMode = false
  private inventoryMode = false
  private rotation = 0
  private stageRotation: 0 | 1 = 0
  private stagePlacingVariant: StageVariant = 'default'

  private boundOnPointerMove: (pointer: Phaser.Input.Pointer) => void
  private boundOnPointerDown: (pointer: Phaser.Input.Pointer, _gos: Phaser.GameObjects.GameObject[]) => void
  private boundOnPointerUp: (pointer: Phaser.Input.Pointer) => void

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly menuUI: MenuUI,
    private readonly onPlace: (type: ObjectType, x: number, y: number, rotation?: number) => void,
    private readonly onPlaceBuilding: (gridX: number, gridY: number) => boolean,
    private readonly onPlaceStage: (gridX: number, gridY: number, rotation: 0 | 1, variant: StageVariant) => boolean = () => false,
  ) {
    this.boundOnPointerMove = this.onPointerMove.bind(this)
    this.boundOnPointerDown = this.onPointerDown.bind(this)
    this.boundOnPointerUp = this.onPointerUp.bind(this)
  }

  enter(type: ObjectType): void {
    if (this.mode !== null) this.exit()
    this.mode = 'object'; this.activeType = type; this.rotation = 0
    this.ghost = createObjectGhost(this.scene, type, this.rotation)
    this.bindInput()
  }

  enterReposition(type: ObjectType, startX: number, startY: number, rotation = 0): void {
    if (this.mode !== null) this.exit()
    this.mode = 'object'; this.activeType = type; this.repositionMode = true; this.rotation = rotation
    this.ghost = createObjectGhost(this.scene, type, rotation)
    ;(this.ghost as Phaser.GameObjects.Sprite).setPosition(startX, startY)
    this.scene.game.canvas.style.cursor = 'grabbing'
    this.bindInput()
  }

  enterFromInventory(type: ObjectType): void {
    if (this.mode !== null) this.exit()
    this.mode = 'object'; this.activeType = type; this.inventoryMode = true; this.rotation = 0
    this.ghost = createObjectGhost(this.scene, type, this.rotation)
    this.bindInput()
  }

  enterBuildingPlacement(): void {
    if (this.mode !== null) this.exit()
    this.mode = 'building'; this.activeType = null
    this.ghost = createBuildingGhost(this.scene)
    this.bindInput()
  }

  enterStagePlacement(initialRotation: 0 | 1 = 0, variant: StageVariant = 'default'): void {
    if (this.mode !== null) this.exit()
    this.mode = 'stage'; this.activeType = null; this.stageRotation = initialRotation; this.stagePlacingVariant = variant
    this.ghost = createStageGhost(this.scene, initialRotation, variant)
    this.bindInput()
  }

  exit(): void {
    this.ghost?.destroy(); this.ghost = null
    this.scene.input.off('pointermove', this.boundOnPointerMove)
    this.scene.input.off('pointerdown', this.boundOnPointerDown)
    this.scene.input.off('pointerup', this.boundOnPointerUp)
    this.escKey?.removeAllListeners(); this.escKey = null
    this.rotateKey?.removeAllListeners(); this.rotateKey = null
    this.activeType = null; this.mode = null
    this.repositionMode = false; this.inventoryMode = false
    this.rotation = 0; this.stageRotation = 0; this.stagePlacingVariant = 'default'
    this.scene.game.canvas.style.cursor = ''
  }

  isActive(): boolean { return this.mode !== null }

  private cycleRotation(): void {
    if (this.mode === 'stage') {
      this.ghost?.destroy()
      this.stageRotation = this.stageRotation === 0 ? 1 : 0
      this.ghost = createStageGhost(this.scene, this.stageRotation, this.stagePlacingVariant)
      this.onPointerMove(this.scene.input.activePointer)
      return
    }
    if (!this.activeType) return
    if (isBedType(this.activeType)) {
      this.rotation = (this.rotation + 1) % 2
      if (this.ghost instanceof Phaser.GameObjects.Sprite) {
        this.ghost.destroy()
        this.ghost = createObjectGhost(this.scene, this.activeType, this.rotation)
        this.onPointerMove(this.scene.input.activePointer)
      }
      return
    }
    if (!ROTATABLE_TYPES.has(this.activeType)) return
    const config = OBJECT_TYPE_REGISTRY[this.activeType]
    if (config?.frame === undefined) return
    this.rotation = (this.rotation + 1) % 4
    if (this.ghost instanceof Phaser.GameObjects.Sprite) {
      this.ghost.setFrame(config.frame + this.rotation)
    }
  }

  private bindInput(): void {
    this.scene.input.on('pointermove', this.boundOnPointerMove)
    this.scene.input.on('pointerdown', this.boundOnPointerDown)
    this.scene.input.on('pointerup', this.boundOnPointerUp)
    this.escKey = this.scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC)
    this.escKey.on('down', () => this.exit())
    this.rotateKey = this.scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.R)
    this.rotateKey.on('down', () => this.cycleRotation())
  }

  private stageGW(): number { return stageFootprint(this.stagePlacingVariant, this.stageRotation).w }
  private stageGH(): number { return stageFootprint(this.stagePlacingVariant, this.stageRotation).h }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.ghost) return
    if (this.mode === 'object') {
      const snapped = snapToIsoGrid(pointer.worldX, pointer.worldY)
      ;(this.ghost as Phaser.GameObjects.Sprite).setPosition(snapped.x, snapped.y)
    } else if (this.mode === 'building') {
      const g = screenToGrid(pointer.worldX, pointer.worldY)
      const center = gridToScreen(Math.floor(g.gx) + BUILDING_GRID_W / 2, Math.floor(g.gy) + BUILDING_GRID_H / 2)
      ;(this.ghost as Phaser.GameObjects.Graphics).setPosition(center.x, center.y)
    } else if (this.mode === 'stage') {
      const g = screenToGrid(pointer.worldX, pointer.worldY)
      const gx = Math.floor(g.gx)
      const gy = Math.floor(g.gy)
      const gw = this.stageGW()
      const gh = this.stageGH()
      if (this.stagePlacingVariant === 'solo_platform' && this.ghost instanceof Phaser.GameObjects.Sprite) {
        layoutSoloStageSprite(this.ghost, gx, gy, gw, gh)
      } else {
        const center = gridToScreen(gx + gw / 2, gy + gh / 2)
        ;(this.ghost as Phaser.GameObjects.Graphics).setPosition(center.x, center.y)
      }
    }
  }

  private onPointerDown(pointer: Phaser.Input.Pointer, _gos: Phaser.GameObjects.GameObject[]): void {
    if (!pointer.leftButtonDown()) return
    if (this.menuUI.isPointerOverUI(pointer)) return
    if (this.repositionMode) return

    if (this.mode === 'object' && this.activeType) {
      const snapped = snapToIsoGrid(pointer.worldX, pointer.worldY)
      const rot = ROTATABLE_TYPES.has(this.activeType) || isBedType(this.activeType) ? this.rotation : undefined
      this.onPlace(this.activeType, snapped.x, snapped.y, rot)
      if (this.inventoryMode) { this.exit(); return }
    } else if (this.mode === 'building') {
      const g = screenToGrid(pointer.worldX, pointer.worldY)
      if (this.onPlaceBuilding(Math.floor(g.gx), Math.floor(g.gy))) this.exit()
    } else if (this.mode === 'stage') {
      const g = screenToGrid(pointer.worldX, pointer.worldY)
      if (this.onPlaceStage(Math.floor(g.gx), Math.floor(g.gy), this.stageRotation, this.stagePlacingVariant)) this.exit()
    }
  }

  private onPointerUp(pointer: Phaser.Input.Pointer): void {
    if (!this.repositionMode || !this.activeType) return
    if (this.menuUI.isPointerOverUI(pointer)) return
    const snapped = snapToIsoGrid(pointer.worldX, pointer.worldY)
    const rot = ROTATABLE_TYPES.has(this.activeType) || isBedType(this.activeType) ? this.rotation : undefined
    this.onPlace(this.activeType, snapped.x, snapped.y, rot)
    this.exit()
  }
}
