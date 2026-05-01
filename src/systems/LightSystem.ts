import Phaser from 'phaser'
import type { DayPhase } from './DayNightSystem'

/** World-space radius of the glow circle drawn around each lamp (pixels). */
const GLOW_RADIUS = 110

/** Outer halo radius — softer, wider ambient ring. */
const HALO_RADIUS = 180

/** ADD-blend alpha at full night. The overlay darkness is 0.50, so we need
 *  enough luminosity to meaningfully punch through it. */
const GLOW_ALPHA_NIGHT   = 0.60
const HALO_ALPHA_NIGHT   = 0.20

/**
 * Tracks all placed lamp_post positions and renders warm glow circles above
 * the night overlay (depth > 500). Uses ADD blend mode so lights genuinely
 * brighten the dark overlay rather than just sitting on top of it.
 *
 * Responsibilities:
 *  - Register / unregister lamp sprites
 *  - On each frame, scale glow alpha from the current DayPhase
 *  - Pulse glow very subtly to simulate a flame/bulb flicker
 */
export class LightSystem {
  /** Maps each lamp sprite to its glow graphics object. */
  private lights = new Map<Phaser.GameObjects.Sprite, {
    inner: Phaser.GameObjects.Graphics
    outer: Phaser.GameObjects.Graphics
  }>()
  private elapsed = 0

  constructor(private readonly scene: Phaser.Scene) {}

  /** Called by ObjectSpawnNonPhysics when a lamp_post is placed. */
  registerLamp(sprite: Phaser.GameObjects.Sprite): void {
    const inner = this.scene.add.graphics()
    inner.setDepth(501)
    inner.setBlendMode(Phaser.BlendModes.ADD)
    inner.setVisible(false)

    const outer = this.scene.add.graphics()
    outer.setDepth(501)
    outer.setBlendMode(Phaser.BlendModes.ADD)
    outer.setVisible(false)

    this.lights.set(sprite, { inner, outer })
  }

  /** Called by ObjectRemoval when a lamp_post is removed from the world. */
  unregisterLamp(sprite: Phaser.GameObjects.Sprite): void {
    const entry = this.lights.get(sprite)
    if (!entry) return
    entry.inner.destroy()
    entry.outer.destroy()
    this.lights.delete(sprite)
  }

  /** Call once per frame with current phase and real delta (ms). */
  update(deltaMs: number, phase: DayPhase): void {
    this.elapsed += deltaMs

    const baseAlpha = this.phaseAlpha(phase)
    if (baseAlpha <= 0.005) {
      // Fast path: fully day — just hide everything
      for (const [, { inner, outer }] of this.lights) {
        inner.setVisible(false)
        outer.setVisible(false)
      }
      return
    }

    // Subtle flicker: ±5% amplitude, ~1.5 Hz
    const flicker = 1 + 0.05 * Math.sin((this.elapsed / 660) * Math.PI * 2)

    for (const [sprite, { inner, outer }] of this.lights) {
      const { x, y } = sprite

      // Inner warm glow (bright amber)
      inner.clear()
      inner.setVisible(true)
      inner.setAlpha(baseAlpha * flicker * GLOW_ALPHA_NIGHT)
      inner.fillStyle(0xffdd88, 1)
      inner.fillCircle(x, y, GLOW_RADIUS)

      // Outer soft halo (softer orange)
      outer.clear()
      outer.setVisible(true)
      outer.setAlpha(baseAlpha * flicker * HALO_ALPHA_NIGHT)
      outer.fillStyle(0xff9944, 1)
      outer.fillCircle(x, y, HALO_RADIUS)
    }
  }

  /** How bright lights should be based on time of day. 0 = off, 1 = full. */
  private phaseAlpha(phase: DayPhase): number {
    switch (phase) {
      case 'night':       return 1.00
      case 'dusk':        return 0.75
      case 'golden_hour': return 0.30
      default:            return 0       // sunrise / day: lamps off
    }
  }
}
