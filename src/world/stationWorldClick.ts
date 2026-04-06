import Phaser from 'phaser'
import type { Nirv } from '../entities/Nirv'
import { isBedType } from '../objects/bedTypes'
import type { HydrationSystem } from '../systems/HydrationSystem'
import type { BladderSystem } from '../systems/BladderSystem'
import type { SleepSystem } from '../systems/SleepSystem'
import { TILE_W } from '../utils/isoGrid'
import type { PlacedSpriteEntry } from './ObjectSpawner'

/** Extra tolerance when world coords are awkward (tall sprites, zoom). */
const NEAR_STATION_PX = TILE_W * 1.5

function pointerHitsPlaced(
  wx: number,
  wy: number,
  sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite,
  anchorX: number,
  anchorY: number,
): boolean {
  if (sprite.getBounds().contains(wx, wy)) return true
  return Phaser.Math.Distance.Between(wx, wy, anchorX, anchorY) < NEAR_STATION_PX
}

/**
 * Water/bed clicks are handled here (world bounds) instead of sprite.on('pointerdown'),
 * because setDisplaySize often leaves the default interactive hit area wrong so clicks never hit.
 *
 * UIScene stacks above GameScene; use GameScene's camera to convert screen → world — pointer.worldX/Y
 * can be wrong for our sprites.
 */
export function tryStationsAtPointer(
  pointer: Phaser.Input.Pointer,
  camera: Phaser.Cameras.Scene2D.Camera,
  placedSprites: PlacedSpriteEntry[],
  hydrationSystem: HydrationSystem,
  bladderSystem: BladderSystem,
  sleepSystem: SleepSystem,
  playerNirv: Nirv,
  setWalkTarget: (x: number, y: number) => void,
): boolean {
  const pt = camera.getWorldPoint(pointer.x, pointer.y)
  const wx = pt.x
  const wy = pt.y
  const sorted = [...placedSprites].sort((a, b) => b.sprite.depth - a.sprite.depth)
  for (const entry of sorted) {
    const { sprite, type, x, y } = entry
    if (!sprite.active || !sprite.visible) continue
    if (!pointerHitsPlaced(wx, wy, sprite, x, y)) continue
    if (type === 'drinking_water') {
      hydrationSystem.tryInteractWaterStation(x, y, playerNirv.sprite, setWalkTarget)
      return true
    }
    if (type === 'portable_toilet') {
      if (bladderSystem.tryInteractPortableToilet(x, y, playerNirv.sprite, setWalkTarget)) return true
    }
    if (isBedType(type)) {
      sleepSystem.tryInteractBed(sprite, x, y, playerNirv, playerNirv.sprite, setWalkTarget)
      return true
    }
  }
  return false
}
