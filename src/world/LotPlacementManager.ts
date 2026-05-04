import Phaser from 'phaser'
import { GRID_COLS, GRID_ROWS } from '../config/world'
import { loadLots, saveLots, type LotRecord, type LotType } from '../storage/lotPersistence'
import { screenToCell } from '../utils/isoGrid'
import type { MenuUI } from '../ui/MenuUI'
import type { BuildOverlayLayer } from './BuildOverlayLayer'
import { ResidentialLotHomeSpace, type HomeSpace } from '../systems/HomeSpace'
import { LotSign } from './LotSign'
import type { BuildTool } from '../ui/BuildPanel'
import { lotAtCell, lotCellKey, parseLotCellKey } from './lotGrid'

interface DragState {
  sourceLotId: string
  type: LotType
  cells: Set<string>
  lastCell: string
  invalid: boolean
  mergeLotIds: Set<string>
}

export class LotPlacementManager {
  private lots: LotRecord[] = []
  private drag: DragState | null = null
  private enabled = false
  private signsVisible = false
  private promptOpen = false
  private escKey: Phaser.Input.Keyboard.Key | null = null
  private signs = new Map<string, LotSign>()

  private readonly onPointerDownBound = this.onPointerDown.bind(this)
  private readonly onPointerMoveBound = this.onPointerMove.bind(this)
  private readonly onPointerUpBound = this.onPointerUp.bind(this)
  private readonly preventContextMenu = (event: Event) => event.preventDefault()

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly menuUI: MenuUI,
    private readonly overlay: BuildOverlayLayer,
    private readonly getSelectedTool: () => BuildTool,
    private readonly getSelectedType: () => LotType,
    private readonly getOwnerName: (botId: string) => string | null,
    private readonly confirmMerge: (onMerge: () => void, onCancel: () => void) => void,
  ) {
    this.lots = loadLots()
    this.overlay.setLots(this.lots)
    this.syncSigns()
  }

  enter(): void {
    if (this.enabled) return
    this.enabled = true
    this.scene.input.on('pointerdown', this.onPointerDownBound)
    this.scene.input.on('pointermove', this.onPointerMoveBound)
    this.scene.input.on('pointerup', this.onPointerUpBound)
    this.scene.game.canvas.addEventListener('contextmenu', this.preventContextMenu)
    this.escKey = this.scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC)
    this.escKey.on('down', () => this.cancelDrag())
  }

  exit(): void {
    if (!this.enabled) return
    this.enabled = false
    this.scene.input.off('pointerdown', this.onPointerDownBound)
    this.scene.input.off('pointermove', this.onPointerMoveBound)
    this.scene.input.off('pointerup', this.onPointerUpBound)
    this.scene.game.canvas.removeEventListener('contextmenu', this.preventContextMenu)
    this.escKey?.removeAllListeners()
    this.escKey = null
    this.cancelDrag()
  }

  getHomeSpaces(): HomeSpace[] {
    return this.lots
      .filter(lot => lot.type === 'residential')
      .map(lot => new ResidentialLotHomeSpace(lot, () => this.persist()))
  }

  setSignsVisible(visible: boolean): void {
    this.signsVisible = visible
    for (const sign of this.signs.values()) sign.setVisible(visible)
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (this.getSelectedTool() !== 'lot') return
    if (!this.isPointerActive(pointer) || this.promptOpen || this.menuUI.isPointerOverUI(pointer)) return
    const cell = this.pointerCell(pointer)
    if (!cell) return
    const selectedType = this.getSelectedType()
    const lot = lotAtCell(this.lots, cell.gx, cell.gy)
    if (this.isControlDown(pointer)) {
      if (lot) this.removeLot(lot)
      return
    }

    if (!lot) {
      this.lots.push({ id: crypto.randomUUID(), type: selectedType, cells: [cell] })
      this.persist()
      return
    }
    if (lot.type !== selectedType) return

    const key = lotCellKey(cell.gx, cell.gy)
    this.drag = {
      sourceLotId: lot.id,
      type: selectedType,
      cells: new Set([key]),
      lastCell: key,
      invalid: false,
      mergeLotIds: new Set(),
    }
    this.overlay.setPreview([...this.drag.cells], selectedType, false)
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.getSelectedTool() !== 'lot') return
    if (!this.drag || this.promptOpen || !pointer.leftButtonDown()) return
    const cell = this.pointerCell(pointer)
    if (!cell) return
    this.addLineToDraft(cell)
    this.validateDraft()
    this.overlay.setPreview([...this.drag.cells], this.drag.type, this.drag.invalid)
  }

  private onPointerUp(): void {
    if (!this.drag || this.promptOpen) return
    const draft = this.drag
    if (draft.invalid) {
      this.cancelDrag()
      return
    }
    if (draft.mergeLotIds.size > 0) {
      this.promptOpen = true
      this.confirmMerge(
        () => this.commitDraft(true),
        () => this.cancelDrag(),
      )
      return
    }
    this.commitDraft(false)
  }

  private commitDraft(includeMerges: boolean): void {
    if (!this.drag) return
    const draft = this.drag
    const source = this.lots.find(l => l.id === draft.sourceLotId)
    if (!source) {
      this.cancelDrag()
      return
    }

    const mergedCells = new Map(source.cells.map(cell => [lotCellKey(cell.gx, cell.gy), cell]))
    const mergedOwnerIds = new Set(source.ownerBotIds ?? (source.ownerBotId ? [source.ownerBotId] : []))
    for (const key of draft.cells) {
      const [gx, gy] = parseLotCellKey(key)
      mergedCells.set(key, { gx, gy })
    }
    if (includeMerges) {
      for (const lot of this.lots) {
        if (!draft.mergeLotIds.has(lot.id)) continue
        for (const cell of lot.cells) mergedCells.set(lotCellKey(cell.gx, cell.gy), cell)
        for (const ownerId of lot.ownerBotIds ?? (lot.ownerBotId ? [lot.ownerBotId] : [])) {
          mergedOwnerIds.add(ownerId)
        }
      }
      this.lots = this.lots.filter(l => !draft.mergeLotIds.has(l.id))
    }
    source.cells = [...mergedCells.values()].sort((a, b) => a.gy - b.gy || a.gx - b.gx)
    source.ownerBotIds = [...mergedOwnerIds]
    source.ownerBotId = source.ownerBotIds[0] ?? null
    this.drag = null
    this.promptOpen = false
    this.overlay.clearPreview()
    this.persist()
  }

  private removeLot(lot: LotRecord): void {
    this.cancelDrag()
    this.lots = this.lots.filter(candidate => candidate.id !== lot.id)
    this.persist()
  }

  private cancelDrag(): void {
    this.drag = null
    this.promptOpen = false
    this.overlay.clearPreview()
  }

  private addLineToDraft(cell: { gx: number; gy: number }): void {
    if (!this.drag) return
    const [lastGX, lastGY] = parseLotCellKey(this.drag.lastCell)
    const dx = cell.gx - lastGX
    const dy = cell.gy - lastGY
    const steps = Math.max(Math.abs(dx), Math.abs(dy), 1)
    for (let i = 1; i <= steps; i++) {
      const gx = Math.round(lastGX + dx * (i / steps))
      const gy = Math.round(lastGY + dy * (i / steps))
      if (this.isInBounds(gx, gy)) this.drag.cells.add(lotCellKey(gx, gy))
    }
    this.drag.lastCell = lotCellKey(cell.gx, cell.gy)
  }

  private validateDraft(): void {
    if (!this.drag) return
    this.drag.invalid = false
    this.drag.mergeLotIds.clear()
    for (const key of this.drag.cells) {
      const [gx, gy] = parseLotCellKey(key)
      const lot = lotAtCell(this.lots, gx, gy)
      if (!lot || lot.id === this.drag.sourceLotId) continue
      if (lot.type !== this.drag.type) {
        this.drag.invalid = true
        continue
      }
      this.drag.mergeLotIds.add(lot.id)
    }
  }

  private pointerCell(pointer: Phaser.Input.Pointer): { gx: number; gy: number } | null {
    const cell = screenToCell(pointer.worldX, pointer.worldY)
    return this.isInBounds(cell.gx, cell.gy) ? cell : null
  }

  private isInBounds(gx: number, gy: number): boolean {
    return gx >= 0 && gy >= 0 && gx < GRID_COLS && gy < GRID_ROWS
  }

  private isPointerActive(pointer: Phaser.Input.Pointer): boolean {
    return pointer.leftButtonDown() || (this.isControlDown(pointer) && pointer.isDown)
  }

  private isControlDown(pointer: Phaser.Input.Pointer): boolean {
    return (pointer.event as PointerEvent | MouseEvent | undefined)?.ctrlKey === true
  }

  private persist(): void {
    saveLots(this.lots)
    this.overlay.setLots(this.lots)
    this.syncSigns()
  }

  private syncSigns(): void {
    for (const sign of this.signs.values()) sign.destroy()
    this.signs.clear()
    for (const lot of this.lots) {
      const sign = new LotSign(this.scene, lot, this.getOwnerName)
      sign.setVisible(this.signsVisible)
      this.signs.set(lot.id, sign)
    }
  }
}
