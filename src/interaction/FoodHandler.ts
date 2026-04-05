import Phaser from 'phaser'
import { snapToIsoGrid, TILE_W } from '../utils/isoGrid'
import { getRecipe } from '../data/recipes'
import { removeObjectByType } from '../storage/persistence'
import type { CookingSystem } from '../systems/CookingSystem'
import type { RestaurantSystem } from '../systems/RestaurantSystem'
import type { RecipeSelectUI } from '../ui/RecipeSelectUI'
import type { PlateEntry } from '../world/ObjectSpawner'
import type { ObjectType } from '../objects/objectTypes'

const INTERACTION_RADIUS = TILE_W

export class FoodHandler {
  private carriedPlate: { recipeId: string } | null = null
  private carryIndicator: Phaser.GameObjects.Graphics | null = null
  private pendingStoveSprite: Phaser.Physics.Arcade.Sprite | null = null
  private pendingTrashSprite: Phaser.Physics.Arcade.Sprite | null = null
  private pendingPlatePickup: PlateEntry | null = null
  private pendingFoodTarget: { x: number; y: number } | null = null

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly cookingSystem: CookingSystem,
    private readonly restaurantSystem: RestaurantSystem,
    private readonly recipeSelectUI: RecipeSelectUI,
    private readonly getPlayer: () => Phaser.Physics.Arcade.Sprite,
    private readonly setWalkTarget: (x: number, y: number) => void,
    private readonly spawnObject: (type: ObjectType, x: number, y: number, persist: boolean, recipeId?: string) => void,
    private readonly getTableSprites: () => { x: number; y: number }[],
    private readonly getCounterSprites: () => { x: number; y: number }[],
    private readonly removePlateEntry: (entry: PlateEntry) => void,
    private readonly isPlacementActive: () => boolean,
  ) {}

  isCarrying(): boolean { return this.carriedPlate !== null }

  /** Cancel pending interactions on keyboard movement. */
  clearPending(): void {
    this.pendingStoveSprite = null
    this.pendingTrashSprite = null
    this.pendingPlatePickup = null
    this.pendingFoodTarget = null
  }

  onStoveClicked(sprite: Phaser.Physics.Arcade.Sprite): void {
    if (this.isPlacementActive()) return
    const player = this.getPlayer()
    const dist = Phaser.Math.Distance.Between(player.x, player.y, sprite.x, sprite.y)
    if (dist >= INTERACTION_RADIUS * 1.5) {
      this.setWalkTarget(sprite.x, sprite.y)
      this.pendingStoveSprite = sprite
      this.pendingFoodTarget = null
    } else {
      this.interactWithStove(sprite)
    }
  }

  onTrashClicked(sprite: Phaser.Physics.Arcade.Sprite): void {
    if (this.isPlacementActive()) return
    if (!this.carriedPlate) return
    const player = this.getPlayer()
    const dist = Phaser.Math.Distance.Between(player.x, player.y, sprite.x, sprite.y)
    if (dist >= INTERACTION_RADIUS * 1.5) {
      this.setWalkTarget(sprite.x, sprite.y)
      this.pendingTrashSprite = sprite
      this.pendingStoveSprite = null
      this.pendingFoodTarget = null
    } else {
      this.discardCarriedItem()
    }
  }

  onPlateClicked(entry: PlateEntry, isShopMode: () => boolean): void {
    if (this.isPlacementActive()) return
    if (isShopMode()) return
    if (this.carriedPlate) return
    const player = this.getPlayer()
    const dist = Phaser.Math.Distance.Between(player.x, player.y, entry.sprite.x, entry.sprite.y)
    if (dist >= INTERACTION_RADIUS * 1.5) {
      this.setWalkTarget(entry.sprite.x, entry.sprite.y)
      this.pendingPlatePickup = entry
      this.pendingStoveSprite = null
      this.pendingTrashSprite = null
      this.pendingFoodTarget = null
    } else {
      this.pickUpPlate(entry)
    }
  }

  /** Returns true if the click was handled (food placed or queued). */
  handleWorldClick(pointer: Phaser.Input.Pointer): boolean {
    if (!this.carriedPlate) return false
    const snapped = snapToIsoGrid(pointer.worldX, pointer.worldY)
    let target: { x: number; y: number } | null = null
    let bestDist = TILE_W
    for (const t of this.getTableSprites()) {
      const d = Phaser.Math.Distance.Between(snapped.x, snapped.y, t.x, t.y)
      if (d < bestDist) { bestDist = d; target = t }
    }
    for (const c of this.getCounterSprites()) {
      const d = Phaser.Math.Distance.Between(snapped.x, snapped.y, c.x, c.y)
      if (d < bestDist) { bestDist = d; target = c }
    }
    if (!target) return false
    const player = this.getPlayer()
    const dist = Phaser.Math.Distance.Between(player.x, player.y, target.x, target.y)
    if (dist >= INTERACTION_RADIUS * 1.5) {
      this.setWalkTarget(target.x, target.y)
      this.pendingFoodTarget = target
      this.pendingStoveSprite = null
    } else {
      this.placeFood(target.x, target.y)
    }
    return true
  }

  handlePendingInteractions(): void {
    if (this.pendingStoveSprite) {
      const s = this.pendingStoveSprite; this.pendingStoveSprite = null
      this.interactWithStove(s)
    }
    if (this.pendingTrashSprite) {
      this.pendingTrashSprite = null; this.discardCarriedItem()
    }
    if (this.pendingPlatePickup) {
      const e = this.pendingPlatePickup; this.pendingPlatePickup = null
      this.pickUpPlate(e)
    }
    if (this.pendingFoodTarget && this.carriedPlate) {
      const t = this.pendingFoodTarget; this.pendingFoodTarget = null
      this.placeFood(t.x, t.y)
    }
  }

  updateCarryIndicator(): void {
    if (!this.carriedPlate) {
      if (this.carryIndicator) { this.carryIndicator.destroy(); this.carryIndicator = null }
      return
    }
    if (!this.carryIndicator) this.createCarryIndicator()
    const player = this.getPlayer()
    const recipe = getRecipe(this.carriedPlate.recipeId)
    const color = recipe?.color ?? 0xffffff
    const gfx = this.carryIndicator!
    gfx.clear()
    gfx.fillStyle(0xffffff); gfx.fillCircle(player.x, player.y - 24, 7)
    gfx.fillStyle(color); gfx.fillCircle(player.x, player.y - 24, 4)
  }

  private interactWithStove(sprite: Phaser.Physics.Arcade.Sprite): void {
    const stove = this.cookingSystem.getStoveBySprite(sprite)
    if (!stove) return
    if (stove.status === 'idle' && !this.carriedPlate) {
      this.recipeSelectUI.open((recipeId) => this.cookingSystem.startCooking(stove, recipeId))
    } else if (stove.status === 'done') {
      const recipeId = this.cookingSystem.collectFood(stove)
      if (recipeId) { this.carriedPlate = { recipeId }; this.createCarryIndicator() }
    }
  }

  private pickUpPlate(entry: PlateEntry): void {
    this.restaurantSystem.removePlateFromTable(entry.tableX, entry.tableY)
    entry.sprite.destroy()
    this.removePlateEntry(entry)
    removeObjectByType(entry.tableX, entry.tableY, 'food_plate')
    this.carriedPlate = { recipeId: entry.recipeId }
    this.createCarryIndicator()
  }

  private discardCarriedItem(): void {
    this.carriedPlate = null
    if (this.carryIndicator) { this.carryIndicator.destroy(); this.carryIndicator = null }
  }

  private placeFood(x: number, y: number): void {
    if (!this.carriedPlate) return
    const recipeId = this.carriedPlate.recipeId
    this.spawnObject('food_plate', x, y, true, recipeId)
    this.carriedPlate = null
    if (this.carryIndicator) { this.carryIndicator.destroy(); this.carryIndicator = null }
  }

  private createCarryIndicator(): void {
    if (this.carryIndicator) this.carryIndicator.destroy()
    this.carryIndicator = this.scene.add.graphics()
    this.carryIndicator.setDepth(5)
  }
}
