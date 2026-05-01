import Phaser from 'phaser'
import type { GridPathfinder } from '../pathfinding/GridPathfinder'
import { loadWalls, saveWalls, wallCellKey, type WallRecord, type WallSide } from '../storage/wallPersistence'
import type { BuildTool } from '../ui/BuildPanel'
import type { MenuUI } from '../ui/MenuUI'
import { screenToCell, getGridRect, TILE_W, TILE_H } from '../utils/isoGrid'
import { GRID_COLS, GRID_ROWS } from '../config/world'
import { WallLayer } from './WallLayer'

const SAMPLE_STEP_PX = 18

type DragMode = 'add' | 'remove'

export class WallPlacementManager {
  private readonly walls = new Map<string, WallRecord>()
  private readonly layer: WallLayer
  private enabled = false
  private dragMode: DragMode | null = null
  private lastWorld: { x: number; y: number } | null = null
  private dirty = false

  private readonly onPointerDownBound = this.onPointerDown.bind(this)
  private readonly onPointerMoveBound = this.onPointerMove.bind(this)
  private readonly onPointerUpBound = this.onPointerUp.bind(this)
  private readonly preventContextMenu = (event: Event) => event.preventDefault()

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly menuUI: MenuUI,
    obstacleGroup: Phaser.Physics.Arcade.StaticGroup,
    pathfinder: GridPathfinder,
    private readonly getSelectedTool: () => BuildTool,
  ) {
    this.layer = new WallLayer(scene, obstacleGroup, pathfinder)
    for (const wall of loadWalls()) this.walls.set(wallCellKey(wall), wall)
    this.layer.setWalls(this.walls.values())
  }

  enter(): void {
    if (this.enabled) return
    this.enabled = true
    this.scene.input.on('pointerdown', this.onPointerDownBound)
    this.scene.input.on('pointermove', this.onPointerMoveBound)
    this.scene.input.on('pointerup', this.onPointerUpBound)
    this.scene.game.canvas.addEventListener('contextmenu', this.preventContextMenu)
  }

  exit(): void {
    if (!this.enabled) return
    this.enabled = false
    this.scene.input.off('pointerdown', this.onPointerDownBound)
    this.scene.input.off('pointermove', this.onPointerMoveBound)
    this.scene.input.off('pointerup', this.onPointerUpBound)
    this.scene.game.canvas.removeEventListener('contextmenu', this.preventContextMenu)
    this.finishDrag()
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.getSelectedTool() !== 'wall') return
    if (!this.isPointerActive(pointer) || this.menuUI.isPointerOverUI(pointer)) return
    this.dragMode = this.isControlDown(pointer) ? 'remove' : 'add'
    this.lastWorld = { x: pointer.worldX, y: pointer.worldY }
    this.applyAt(pointer.worldX, pointer.worldY)
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.dragMode || !this.isPointerActive(pointer)) return
    if (this.menuUI.isPointerOverUI(pointer)) return
    this.applyLineTo(pointer.worldX, pointer.worldY)
  }

  private onPointerUp(): void {
    this.finishDrag()
  }

  private applyLineTo(x: number, y: number): void {
    if (!this.lastWorld) {
      this.applyAt(x, y)
      this.lastWorld = { x, y }
      return
    }
    const dx = x - this.lastWorld.x
    const dy = y - this.lastWorld.y
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / SAMPLE_STEP_PX))
    for (let i = 1; i <= steps; i++) {
      this.applyAt(
        this.lastWorld.x + dx * (i / steps),
        this.lastWorld.y + dy * (i / steps),
      )
    }
    this.lastWorld = { x, y }
  }

  private applyAt(x: number, y: number): void {
    const wall = snapToWallSide(x, y)
    if (!wall) return
    if (this.dragMode === 'remove') this.removeWall(wall)
    else this.addWall(wall)
  }

  private addWall(wall: WallRecord): void {
    const key = wallCellKey(wall)
    if (this.walls.has(key)) return
    this.walls.set(key, wall)
    this.dirty = true
    this.layer.setWalls(this.walls.values())
  }

  private removeWall(wall: WallRecord): void {
    const key = wallCellKey(wall)
    if (!this.walls.delete(key)) return
    this.dirty = true
    this.layer.setWalls(this.walls.values())
  }

  private finishDrag(): void {
    this.dragMode = null
    this.lastWorld = null
    if (!this.dirty) return
    this.dirty = false
    saveWalls([...this.walls.values()])
    this.scene.events.emit('world:walls-changed')
  }

  private isPointerActive(pointer: Phaser.Input.Pointer): boolean {
    return pointer.leftButtonDown() || (this.isControlDown(pointer) && pointer.isDown)
  }

  private isControlDown(pointer: Phaser.Input.Pointer): boolean {
    return (pointer.event as PointerEvent | MouseEvent | undefined)?.ctrlKey === true
  }
}

/**
 * Given a world pixel position, determine which cell it's in and which
 * edge of that cell is nearest. Returns null if out of bounds.
 */
function snapToWallSide(worldX: number, worldY: number): WallRecord | null {
  const cell = screenToCell(worldX, worldY)
  if (cell.gx < 0 || cell.gy < 0 || cell.gx >= GRID_COLS || cell.gy >= GRID_ROWS) return null

  const rect = getGridRect(cell.gx, cell.gy)
  const rx = worldX - rect.x           // relative x within cell
  const ry = worldY - rect.y           // relative y within cell

  // Distance to each edge
  const dTop = ry
  const dBottom = TILE_H - ry
  const dLeft = rx
  const dRight = TILE_W - rx

  const min = Math.min(dTop, dBottom, dLeft, dRight)
  let side: WallSide
  if (min === dTop) side = 'n'
  else if (min === dBottom) side = 's'
  else if (min === dLeft) side = 'w'
  else side = 'e'

  return { gx: cell.gx, gy: cell.gy, side }
}
