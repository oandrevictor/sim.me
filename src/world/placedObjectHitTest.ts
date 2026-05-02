import Phaser from 'phaser'
import { snapToIsoGrid } from '../utils/isoGrid'
import type { PlacedSpriteEntry } from './ObjectSpawner'

const HIT_PADDING = 2

export function findPlacedObjectAt(
  placedSprites: PlacedSpriteEntry[],
  worldX: number,
  worldY: number,
): PlacedSpriteEntry | null {
  const snapped = snapToIsoGrid(worldX, worldY)
  let best: { entry: PlacedSpriteEntry; score: number } | null = null

  placedSprites.forEach((entry, index) => {
    const hitScore = placedObjectHitScore(entry, worldX, worldY, snapped.x, snapped.y)
    if (hitScore === null) return
    const depth = entry.sprite.depth ?? entry.y
    const score = hitScore * 1_000_000 + depth * 1_000 + index
    if (!best || score > best.score) best = { entry, score }
  })

  return best?.entry ?? null
}

function placedObjectHitScore(
  entry: PlacedSpriteEntry,
  worldX: number,
  worldY: number,
  snappedX: number,
  snappedY: number,
): number | null {
  if (visibleSpriteBoundsHit(entry.sprite, worldX, worldY)) return 3
  if (bodyBoundsHit(entry.footprintBlocker?.body, worldX, worldY)) return 2
  if (bodyBoundsHit(entry.sprite.body, worldX, worldY)) return 2
  if (Math.abs(entry.x - snappedX) < 2 && Math.abs(entry.y - snappedY) < 2) return 1
  return null
}

function visibleSpriteBoundsHit(
  sprite: Phaser.GameObjects.Sprite | Phaser.Physics.Arcade.Sprite,
  worldX: number,
  worldY: number,
): boolean {
  if (!sprite.visible) return false
  return padRect(sprite.getBounds(), HIT_PADDING).contains(worldX, worldY)
}

function bodyBoundsHit(
  body: Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody | null | undefined,
  worldX: number,
  worldY: number,
): boolean {
  if (!body) return false
  const rect = new Phaser.Geom.Rectangle(body.x, body.y, body.width, body.height)
  return padRect(rect, HIT_PADDING).contains(worldX, worldY)
}

function padRect(rect: Phaser.Geom.Rectangle, padding: number): Phaser.Geom.Rectangle {
  return new Phaser.Geom.Rectangle(
    rect.x - padding,
    rect.y - padding,
    rect.width + padding * 2,
    rect.height + padding * 2,
  )
}
