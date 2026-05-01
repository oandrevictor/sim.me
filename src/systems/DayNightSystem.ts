import Phaser from 'phaser'

/**
 * Named time-of-day phases that drive the visual tint and gameplay modifiers.
 * Times are in game-minutes from midnight (0–1439).
 */
export type DayPhase =
  | 'night'       // 0–359 (midnight–5:59am) + 1260–1439 (9pm–11:59pm)
  | 'sunrise'     // 360–419  (6am–6:59am)
  | 'day'         // 420–1019 (7am–4:59pm)
  | 'golden_hour' // 1020–1139 (5pm–6:59pm)
  | 'dusk'        // 1140–1259 (7pm–8:59pm)

interface PhaseConfig {
  /** RGB overlay fill color blended at overlayAlpha on top of the world. */
  overlayColor: number
  /** 0–1 alpha of the overlay rectangle. 0 = fully invisible (day). */
  overlayAlpha: number
  /** Hex CSS string for the clock text color in UIScene. */
  clockColor: string
  /** Additive bonus added to rollAttractedToStage probability at night. */
  nightAttractionBonus: number
}

const PHASE_CONFIG: Record<DayPhase, PhaseConfig> = {
  sunrise: {
    overlayColor:  0xff8833,
    overlayAlpha:  0.10,
    clockColor:    '#ffb347',
    nightAttractionBonus: 0,
  },
  day: {
    overlayColor:  0xffffff,
    overlayAlpha:  0,
    clockColor:    '#ffffff',
    nightAttractionBonus: 0,
  },
  golden_hour: {
    overlayColor:  0xff9933,
    overlayAlpha:  0.13,
    clockColor:    '#ffcc44',
    nightAttractionBonus: 0.08,
  },
  dusk: {
    overlayColor:  0x334488,
    overlayAlpha:  0.25,
    clockColor:    '#88aaff',
    nightAttractionBonus: 0.18,
  },
  night: {
    overlayColor:  0x000033,
    overlayAlpha:  0.50,
    clockColor:    '#7799ff',
    nightAttractionBonus: 0.28,
  },
}

/** Transition duration in real milliseconds for smooth phase cross-fading. */
const TRANSITION_MS = 3000

export function getPhaseForMinute(minute: number): DayPhase {
  if (minute >= 360  && minute < 420)  return 'sunrise'
  if (minute >= 420  && minute < 1020) return 'day'
  if (minute >= 1020 && minute < 1140) return 'golden_hour'
  if (minute >= 1140 && minute < 1260) return 'dusk'
  return 'night'
}

/** Linearly interpolate between two hex colors. t is 0–1. */
function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff; const br = (b >> 16) & 0xff
  const ag = (a >>  8) & 0xff; const bg = (b >>  8) & 0xff
  const ab =  a        & 0xff; const bb =  b        & 0xff
  return (
    (Math.round(ar + (br - ar) * t) << 16) |
    (Math.round(ag + (bg - ag) * t) <<  8) |
     Math.round(ab + (bb - ab) * t)
  )
}

/**
 * Manages day/night visual feedback via a full-screen tinted overlay rectangle.
 *
 * Responsibilities:
 *  - Compute current `DayPhase` from WorldClock minutes
 *  - Drive a semi-transparent overlay (scrollFactor 0, high depth) with the
 *    appropriate color and alpha — faded orange for sunrise/golden hour,
 *    blue-black for night
 *  - Smooth cross-fade between phases over 3 real seconds
 *  - Expose `getNightAttractionBonus()` for StageSystem
 *  - Expose `getClockColor()` for UIScene clock text
 */
export class DayNightSystem {
  private overlay: Phaser.GameObjects.Rectangle
  private currentPhase: DayPhase = 'day'
  private targetPhase: DayPhase = 'day'
  private transitionAccum = 0
  private currentColor: number = PHASE_CONFIG['day'].overlayColor
  private currentAlpha: number = PHASE_CONFIG['day'].overlayAlpha

  constructor(scene: Phaser.Scene) {
    // Overlay covers the full world; scrollFactor 0 means it doesn't scroll —
    // it always covers the viewport.  High depth sits above world objects but
    // we keep it below UI by placing it in the game scene (UI runs in a
    // separate scene on top).
    this.overlay = scene.add.rectangle(
      scene.scale.width / 2,
      scene.scale.height / 2,
      scene.scale.width * 4,
      scene.scale.height * 4,
      PHASE_CONFIG['day'].overlayColor,
      0,
    )
    this.overlay.setScrollFactor(0)
    this.overlay.setDepth(500)
    this.overlay.setVisible(false)
  }

  /** Call once per frame with the current game-minute and real delta (ms). */
  update(minuteOfDay: number, deltaMs: number): void {
    const newTarget = getPhaseForMinute(minuteOfDay)
    if (newTarget !== this.targetPhase) {
      this.targetPhase = newTarget
      this.transitionAccum = 0
    }

    const fromCfg = PHASE_CONFIG[this.currentPhase]
    const toCfg   = PHASE_CONFIG[this.targetPhase]

    if (this.currentPhase !== this.targetPhase) {
      this.transitionAccum += deltaMs
      const t = Math.min(1, this.transitionAccum / TRANSITION_MS)
      this.currentColor = lerpColor(fromCfg.overlayColor, toCfg.overlayColor, t)
      this.currentAlpha = fromCfg.overlayAlpha + (toCfg.overlayAlpha - fromCfg.overlayAlpha) * t
      if (t >= 1) this.currentPhase = this.targetPhase
    } else {
      this.currentColor = fromCfg.overlayColor
      this.currentAlpha = fromCfg.overlayAlpha
    }

    this.applyOverlay(this.currentColor, this.currentAlpha)
  }

  /** Additive probability bonus for stage attraction during night/dusk. */
  getNightAttractionBonus(): number {
    return PHASE_CONFIG[this.currentPhase].nightAttractionBonus
  }

  /** CSS hex color for the UIScene clock text. */
  getClockColor(): string {
    return PHASE_CONFIG[this.currentPhase].clockColor
  }

  getCurrentPhase(): DayPhase {
    return this.currentPhase
  }

  private applyOverlay(color: number, alpha: number): void {
    if (alpha <= 0.005) {
      this.overlay.setVisible(false)
      return
    }
    this.overlay.setVisible(true)
    this.overlay.setFillStyle(color, alpha)
  }
}
