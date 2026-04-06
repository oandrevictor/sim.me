import type Phaser from 'phaser'
import type { NirvVariant } from './Nirv'

type AnimationState = {
  isMoving: boolean
  lastDir: string
}

/** Resolves and applies the correct idle or walk animation for a Nirv sprite. */
export function updateNirvAnimation(
  sprite: Phaser.Physics.Arcade.Sprite,
  variant: NirvVariant,
  lyingDown: boolean,
  state: AnimationState,
  vx: number,
  vy: number,
): AnimationState {
  if (lyingDown) return state
  const moving = Math.abs(vx) > 10 || Math.abs(vy) > 10
  if (!moving) {
    if (state.isMoving) sprite.anims.play(`${variant}_idle_${state.lastDir}`, true)
    return { isMoving: false, lastDir: state.lastDir }
  }

  const dgx = vx + 2 * vy
  const dgy = -vx + 2 * vy
  let dir: string
  if (Math.abs(dgx) > Math.abs(dgy)) dir = dgx > 0 ? 'down' : 'up'
  else if (Math.abs(dgy) > Math.abs(dgx)) dir = dgy > 0 ? 'left' : 'right'
  else if (Math.abs(vy) > Math.abs(vx)) dir = vy > 0 ? 'down' : 'up'
  else dir = vx > 0 ? 'right' : 'left'

  const walkKey = `${variant}_walk_${dir}`
  if (sprite.anims.currentAnim?.key !== walkKey) sprite.anims.play(walkKey, true)
  return { isMoving: true, lastDir: dir }
}
