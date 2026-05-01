import Phaser from 'phaser'
import type { Stage } from '../entities/Stage'
import type { DayPhase } from './DayNightSystem'
import { gridToScreen } from '../utils/isoGrid'

/** Spotlight colors cycling during night performances. */
const SPOT_COLORS = [0xff4488, 0x44aaff, 0xffdd00, 0x88ffaa, 0xff8833]

const SPOT_RADIUS      = 40
const SPOT_ALPHA_BASE  = 0.22
const SPOT_ALPHA_NIGHT = 0.55
const PULSE_SPEED_MS   = 1800

interface SpotState {
  gfx: Phaser.GameObjects.Graphics
  colorIndex: number
  phaseOffset: number
}

/**
 * Manages colored spotlight circles drawn on/around active stages.
 *
 * - Hidden during day/sunrise
 * - Fade in at golden_hour, full brightness at night
 * - Pulse alpha to simulate rotating lights
 * - One spotlight per stage performer mark
 */
export class ConcertSpotlightSystem {
  private spotsPerStage = new Map<string, SpotState[]>()
  private elapsed = 0

  constructor(private readonly scene: Phaser.Scene) {}

  /** Sync spotlights whenever a stage's performer marks change. */
  syncStage(stage: Stage, performerCount: number): void {
    this.clearStage(stage.id)
    if (performerCount === 0) return

    const marks = stage.getPerformMarkPositions(performerCount)
    const spots: SpotState[] = marks.map((_mark, i) => {
      const gfx = this.scene.add.graphics()
      gfx.setDepth(stage.graphics.depth + 1)
      gfx.setVisible(false)
      gfx.setBlendMode(Phaser.BlendModes.ADD)
      return {
        gfx,
        colorIndex: i % SPOT_COLORS.length,
        phaseOffset: (i / marks.length) * Math.PI * 2,
      }
    })

    // Add an extra ambient glow at stage center
    const center = gridToScreen(
      stage.gridX + stage.gridW / 2,
      stage.gridY + stage.gridH / 2,
    )
    const centerGfx = this.scene.add.graphics()
    centerGfx.setDepth(stage.graphics.depth + 1)
    centerGfx.setVisible(false)
    centerGfx.setBlendMode(Phaser.BlendModes.ADD)
    // Draw once at a static color; alpha will be driven by update()
    centerGfx.fillStyle(0xffffff, 1)
    centerGfx.fillCircle(center.x, center.y, SPOT_RADIUS * 1.6)

    spots.push({
      gfx: centerGfx,
      colorIndex: 0xffffff as unknown as number, // sentinel for white center
      phaseOffset: Math.PI,
    })

    this.spotsPerStage.set(stage.id, spots)
  }

  clearStage(stageId: string): void {
    const spots = this.spotsPerStage.get(stageId)
    if (!spots) return
    for (const s of spots) s.gfx.destroy()
    this.spotsPerStage.delete(stageId)
  }

  clearAll(): void {
    for (const [id] of this.spotsPerStage) this.clearStage(id)
  }

  update(
    delta: number,
    phase: DayPhase,
    stages: readonly Stage[],
    activeStageIds: Set<string>,
  ): void {
    this.elapsed += delta

    const baseAlpha = this.phaseAlpha(phase)

    for (const [stageId, spots] of this.spotsPerStage) {
      const stage = stages.find(s => s.id === stageId)
      const active = activeStageIds.has(stageId)
      const visible = baseAlpha > 0.01 && active && !!stage

      for (const spot of spots) {
        if (!visible) {
          spot.gfx.setVisible(false)
          continue
        }

        const pulse = 0.6 + 0.4 * Math.sin(
          (this.elapsed / PULSE_SPEED_MS) * Math.PI * 2 + spot.phaseOffset,
        )
        const alpha = baseAlpha * pulse
        spot.gfx.setVisible(true)
        spot.gfx.setAlpha(alpha)
      }

      // Redraw colored spots each frame (cheap — just small circles)
      if (visible && stage) {
        const marks = stage.getPerformMarkPositions(spots.length - 1)
        marks.forEach((mark, i) => {
          const spot = spots[i]
          if (!spot) return
          const color = SPOT_COLORS[spot.colorIndex % SPOT_COLORS.length]!
          spot.gfx.clear()
          spot.gfx.fillStyle(color, 1)
          spot.gfx.fillCircle(mark.x, mark.y, SPOT_RADIUS)
        })
      }
    }
  }

  /** Maps DayPhase → base spotlight alpha. Zero during full daylight. */
  private phaseAlpha(phase: DayPhase): number {
    switch (phase) {
      case 'night':       return SPOT_ALPHA_NIGHT
      case 'dusk':        return SPOT_ALPHA_BASE * 1.8
      case 'golden_hour': return SPOT_ALPHA_BASE * 0.7
      default:            return 0
    }
  }
}
