import Phaser from 'phaser'
import { snapToIsoGrid } from '../utils/isoGrid'
import type { PlacedSpriteEntry } from '../world/ObjectSpawner'

const INTERACTION_RADIUS = 64 // TILE_W

export class InteractionManager {
  private activeInteractable: Phaser.GameObjects.Sprite | null = null

  constructor(
    private readonly getInteractables: () => Phaser.GameObjects.Sprite[],
  ) {}

  /** Highlights the closest interactable to the player. Call each frame. */
  update(playerSprite: Phaser.Physics.Arcade.Sprite): void {
    let closest: Phaser.GameObjects.Sprite | null = null
    let closestDist = Infinity

    for (const sprite of this.getInteractables()) {
      const dist = Phaser.Math.Distance.Between(playerSprite.x, playerSprite.y, sprite.x, sprite.y)
      if (dist < INTERACTION_RADIUS && dist < closestDist) {
        closest = sprite
        closestDist = dist
      }
    }

    if (closest === this.activeInteractable) return

    if (this.activeInteractable !== null) {
      this.activeInteractable.setTexture('obj_interactable')
      this.activeInteractable = null
      playerSprite.clearTint()
    }

    if (closest !== null) {
      this.activeInteractable = closest
      this.activeInteractable.setTexture('obj_interactable_active')
      playerSprite.setTint(0xffcc44)
    }
  }

  /** In shop mode, show grab cursor when hovering over a placed object or stage. */
  updateShopCursor(
    scene: Phaser.Scene,
    placedSprites: PlacedSpriteEntry[],
    isOverStage: (wx: number, wy: number) => boolean,
  ): void {
    const pointer = scene.input.activePointer
    const snapped = snapToIsoGrid(pointer.worldX, pointer.worldY)
    const overObject = placedSprites.some(p => Math.abs(p.x - snapped.x) < 2 && Math.abs(p.y - snapped.y) < 2)
    const overStage = isOverStage(pointer.worldX, pointer.worldY)
    scene.game.canvas.style.cursor = (overObject || overStage) ? 'grab' : ''
  }
}
