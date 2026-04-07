import Phaser from 'phaser'
import { getRecipe } from '../data/recipes'
import { playStoveIdle, isSpritesheetStoveTexture, STOVE_ANIM_COOKING } from '../animations/stoveAnims'
import { DEPTH_UI } from '../config/world'

type StoveStatus = 'idle' | 'cooking' | 'done'

interface StoveState {
  sprite: Phaser.Physics.Arcade.Sprite
  x: number
  y: number
  /** Spritesheet row-0 frame for placed rotation (0–3) */
  rotation: number
  status: StoveStatus
  recipeId: string | null
  cookProgress: number
  cookDuration: number
  progressBar: Phaser.GameObjects.Graphics | null
}

export class CookingSystem {
  private stoves: StoveState[] = []
  private scene: Phaser.Scene

  constructor(scene: Phaser.Scene) {
    this.scene = scene
  }

  registerStove(sprite: Phaser.Physics.Arcade.Sprite, x: number, y: number, rotation: number): void {
    this.stoves.push({
      sprite, x, y,
      rotation,
      status: 'idle',
      recipeId: null,
      cookProgress: 0,
      cookDuration: 0,
      progressBar: null,
    })
    playStoveIdle(sprite, rotation)
  }

  getStoveAt(x: number, y: number): StoveState | null {
    return this.stoves.find(s => s.x === x && s.y === y) ?? null
  }

  getStoveBySprite(sprite: Phaser.Physics.Arcade.Sprite): StoveState | null {
    return this.stoves.find(s => s.sprite === sprite) ?? null
  }

  startCooking(stove: StoveState, recipeId: string): void {
    const recipe = getRecipe(recipeId)
    if (!recipe || stove.status !== 'idle') return

    stove.status = 'cooking'
    stove.recipeId = recipeId
    stove.cookProgress = 0
    stove.cookDuration = recipe.cookTimeMs
    stove.sprite.clearTint()
    // Clay oven: single image only — never play furniture_stove cooking animation.
    if (isSpritesheetStoveTexture(stove.sprite.texture.key) && stove.sprite.scene.anims.exists(STOVE_ANIM_COOKING)) {
      stove.sprite.play(STOVE_ANIM_COOKING)
    }

    // Create progress bar
    stove.progressBar = this.scene.add.graphics()
    stove.progressBar.setDepth(DEPTH_UI + 5)
  }

  collectFood(stove: StoveState): string | null {
    if (stove.status !== 'done') return null
    const recipeId = stove.recipeId
    stove.status = 'idle'
    stove.recipeId = null
    stove.cookProgress = 0
    stove.cookDuration = 0
    playStoveIdle(stove.sprite, stove.rotation)
    if (stove.progressBar) {
      stove.progressBar.destroy()
      stove.progressBar = null
    }
    return recipeId
  }

  update(delta: number): void {
    for (const stove of this.stoves) {
      if (stove.status !== 'cooking') continue

      stove.cookProgress += delta
      if (stove.cookProgress >= stove.cookDuration) {
        stove.status = 'done'
        stove.sprite.anims.stop()
        playStoveIdle(stove.sprite, stove.rotation)
        stove.sprite.setTint(0x33cc33) // green tint when done
        if (stove.progressBar) {
          stove.progressBar.destroy()
          stove.progressBar = null
        }
        continue
      }

      // Draw progress bar
      if (stove.progressBar) {
        const gfx = stove.progressBar
        gfx.clear()
        const barW = 24
        const barH = 4
        const bx = stove.x - barW / 2
        const by = stove.y - 24

        // Background
        gfx.fillStyle(0x333333, 0.8)
        gfx.fillRect(bx, by, barW, barH)

        // Fill
        const fraction = stove.cookProgress / stove.cookDuration
        gfx.fillStyle(0x33cc33)
        gfx.fillRect(bx, by, barW * fraction, barH)

        // Border
        gfx.lineStyle(1, 0x111111, 0.5)
        gfx.strokeRect(bx, by, barW, barH)
      }
    }
  }
}
