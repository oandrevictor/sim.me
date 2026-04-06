import Phaser from 'phaser'
import type { BotNirv } from './BotNirv'
import type { Nirv } from './Nirv'

/** Minimum distance before separation kicks in (pixels). */
const SEP_RADIUS = 24
/** Strength of the steering nudge (pixels/sec added per overlap). */
const SEP_STRENGTH = 80

/**
 * Apply soft separation steering to all moving Nirv sprites.
 * Walking bots that are too close to another Nirv get their velocity
 * nudged away, so they steer around each other instead of overlapping.
 */
export function applyNirvSeparation(
  bots: readonly BotNirv[],
  player: Nirv,
): void {
  const sprites: Phaser.Physics.Arcade.Sprite[] = [player.sprite]
  for (const b of bots) sprites.push(b.nirv.sprite)

  for (const bot of bots) {
    if (!isMovingState(bot.state)) continue

    const s = bot.nirv.sprite
    const body = s.body as Phaser.Physics.Arcade.Body
    if (!body) continue

    let sepX = 0
    let sepY = 0

    for (const other of sprites) {
      if (other === s) continue
      const dx = s.x - other.x
      const dy = s.y - other.y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist < SEP_RADIUS && dist > 0.1) {
        const factor = (SEP_RADIUS - dist) / SEP_RADIUS
        sepX += (dx / dist) * factor
        sepY += (dy / dist) * factor
      }
    }

    if (sepX !== 0 || sepY !== 0) {
      const len = Math.sqrt(sepX * sepX + sepY * sepY)
      body.velocity.x += (sepX / len) * SEP_STRENGTH
      body.velocity.y += (sepY / len) * SEP_STRENGTH
    }
  }
}

function isMovingState(state: string): boolean {
  return (
    state === 'walking' ||
    state === 'walking_to_chair' ||
    state === 'walking_to_water' ||
    state === 'walking_to_water_queue' ||
    state === 'walking_to_stage' ||
    state === 'walking_to_perform'
  )
}
