import Phaser from 'phaser'
import { generateObjectTextures, type ObjectType } from '../objects/objectTypes'
import { WORLD_WIDTH, WORLD_HEIGHT, GRID_COLS, GRID_ROWS } from '../config/world'
import { gridToScreen, getTileCorners, snapToIsoGrid } from '../utils/isoGrid'
import { MenuUI } from '../ui/MenuUI'
import { PlacementManager } from '../placement/PlacementManager'
import { loadPlacedObjects } from '../storage/persistence'
import { removeFromInventory } from '../storage/inventoryPersistence'
import { loadPlacedBuildings } from '../storage/buildingPersistence'
import { loadPlacedStages } from '../storage/stagePersistence'
import { Nirv, NirvVariant } from '../entities/Nirv'
import { BotNirv } from '../entities/BotNirv'
import { generateDefaultSchedules } from '../entities/NirvSchedule'
import { Building } from '../entities/Building'
import { Stage } from '../entities/Stage'
import { BuildingTypeUI } from '../ui/BuildingTypeUI'
import { RestaurantSystem } from '../systems/RestaurantSystem'
import { StageSystem } from '../systems/StageSystem'
import { CookingSystem } from '../systems/CookingSystem'
import { RecipeSelectUI } from '../ui/RecipeSelectUI'
import { GridPathfinder } from '../pathfinding/GridPathfinder'
import { ObjectSpawner, type SpawnerState } from '../world/ObjectSpawner'
import { BuildingPlacer } from '../world/BuildingPlacer'
import { StagePlacer } from '../world/StagePlacer'
import { PlayerInput } from '../input/PlayerInput'
import { InteractionManager } from '../interaction/InteractionManager'
import { FoodHandler } from '../interaction/FoodHandler'
import { removeObjectByType } from '../storage/persistence'

const PLAYER_SPEED = 200

export class GameScene extends Phaser.Scene {
  private playerNirv!: Nirv
  private menuUI!: MenuUI
  private placementManager!: PlacementManager
  private obstacleGroup!: Phaser.Physics.Arcade.StaticGroup
  private nirvGroup!: Phaser.Physics.Arcade.Group
  private botNirvs: BotNirv[] = []
  private buildings: Building[] = []
  private stages: Stage[] = []
  private buildingTypeUI!: BuildingTypeUI
  private restaurantSystem!: RestaurantSystem
  private stageSystem!: StageSystem
  private cookingSystem!: CookingSystem
  private recipeSelectUI!: RecipeSelectUI
  private pathfinder!: GridPathfinder

  // Extracted modules
  private spawnerState!: SpawnerState
  private objectSpawner!: ObjectSpawner
  private buildingPlacer!: BuildingPlacer
  private stagePlacer!: StagePlacer
  private playerInput!: PlayerInput
  private interactionManager!: InteractionManager
  private foodHandler!: FoodHandler

  constructor() { super({ key: 'GameScene' }) }

  preload(): void {
    generateObjectTextures(this)
    const frameConfig = { frameWidth: 48, frameHeight: 48 }
    this.load.spritesheet('m_idle', 'assets/Player/MPlayer 1 idle.png', frameConfig)
    this.load.spritesheet('m_walk', 'assets/Player/MPlayer 1 walking.png', frameConfig)
    this.load.spritesheet('f_idle', 'assets/Player/FPlayer 1 idle.png', frameConfig)
    this.load.spritesheet('f_walk', 'assets/Player/FPlayer 1 walking.png', frameConfig)
    this.load.spritesheet('f2_idle', 'assets/Player/FPlayer 1 idle.png', frameConfig)
    this.load.spritesheet('f2_walk', 'assets/Player/FPlayer 2 walking.png', frameConfig)
    this.load.spritesheet('f3_idle', 'assets/Player/FPlayer 3 idle.png', frameConfig)
    this.load.spritesheet('f3_walk', 'assets/Player/FPlayer 3 walking.png', frameConfig)
    this.load.spritesheet('furniture_table', 'assets/Furniture/ModernTable1.png', { frameWidth: 250, frameHeight: 250 })
    this.load.spritesheet('furniture_chair', 'assets/Furniture/chair sprite.png', { frameWidth: 250, frameHeight: 250 })
    this.load.spritesheet('furniture_stove', 'assets/Furniture/cookerwhite01_all.png', { frameWidth: 600, frameHeight: 750 })
  }

  create(): void {
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
    this.drawBackground()
    this.createNirvAnimations()

    const startPos = gridToScreen(Math.floor(GRID_COLS / 2), Math.floor(GRID_ROWS / 2))
    this.playerNirv = new Nirv(this, 'Player', 0, startPos.x, startPos.y, true)
    this.playerNirv.sprite.setCollideWorldBounds(true)
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
    this.cameras.main.startFollow(this.playerNirv.sprite, true, 0.08, 0.08)

    this.obstacleGroup = this.physics.add.staticGroup()
    this.physics.add.collider(this.playerNirv.sprite, this.obstacleGroup)
    this.nirvGroup = this.physics.add.group()
    this.nirvGroup.add(this.playerNirv.sprite)

    this.buildingTypeUI = new BuildingTypeUI(this)
    this.recipeSelectUI = new RecipeSelectUI(this)
    this.restaurantSystem = new RestaurantSystem(this.buildings, this.botNirvs)
    this.cookingSystem = new CookingSystem(this)
    this.pathfinder = new GridPathfinder(GRID_COLS, GRID_ROWS)
    this.stageSystem = new StageSystem(this.stages, this.botNirvs)

    this.spawnerState = {
      placedSprites: [], tableSprites: [], counterSprites: [],
      interactableSprites: [], backgroundSprites: [], plateSprites: [],
    }

    this.restaurantSystem.onPlateConsumed = (x, y, sprite) => {
      removeObjectByType(x, y, 'food_plate')
      this.spawnerState.plateSprites = this.spawnerState.plateSprites.filter(p => p.sprite !== sprite)
    }

    this.objectSpawner = new ObjectSpawner(
      this, this.obstacleGroup, this.pathfinder,
      this.restaurantSystem, this.cookingSystem, this.spawnerState,
      (s) => this.foodHandler.onStoveClicked(s),
      (s) => this.foodHandler.onTrashClicked(s),
      (s) => {
        if (this.placementManager?.isActive()) return
        const player = this.playerNirv.sprite
        const dist = Phaser.Math.Distance.Between(player.x, player.y, s.x, s.y)
        if (dist >= 96) this.playerInput.setWalkTarget(s.x, s.y)
      },
      (e) => this.foodHandler.onPlateClicked(e, () => this.menuUI?.isShopMode() ?? false),
    )

    this.buildingPlacer = new BuildingPlacer(
      this, this.buildings, this.obstacleGroup,
      this.pathfinder, this.buildingTypeUI,
      () => this.placementManager?.isActive() ?? false,
    )

    this.stagePlacer = new StagePlacer(
      this, this.stages, this.buildings,
      (rotation) => this.placementManager?.enterStagePlacement(rotation),
    )

    this.playerInput = new PlayerInput(this, PLAYER_SPEED)

    this.interactionManager = new InteractionManager(() => this.spawnerState.interactableSprites)

    this.foodHandler = new FoodHandler(
      this, this.cookingSystem, this.restaurantSystem, this.recipeSelectUI,
      () => this.playerNirv.sprite,
      (x, y) => this.playerInput.setWalkTarget(x, y),
      (type, x, y, persist, recipeId) => this.objectSpawner.spawn(type, x, y, persist, recipeId),
      () => this.spawnerState.tableSprites,
      () => this.spawnerState.counterSprites,
      (entry) => {
        this.spawnerState.plateSprites = this.spawnerState.plateSprites.filter(p => p !== entry)
      },
      () => this.placementManager?.isActive() ?? false,
    )

    this.restoreWorld()
    this.launchUI()

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.onWorldClicked(pointer))
    this.spawnBots()
  }

  update(_time: number, delta: number): void {
    const player = this.playerNirv.sprite
    const result = this.playerInput.update(player)

    if (result.hasInput) this.foodHandler.clearPending()

    if (result.arrivedAtTarget) {
      this.foodHandler.handlePendingInteractions()
    }

    player.setVelocity(result.vx, result.vy)
    this.playerNirv.updateAnimation(player.body!.velocity.x, player.body!.velocity.y)
    this.interactionManager.update(player)

    for (const bot of this.botNirvs) bot.update(delta)

    this.cookingSystem.update(delta)
    this.restaurantSystem.update(delta)
    this.restaurantSystem.cleanupUnseated()
    this.stageSystem.update(delta)
    this.foodHandler.updateCarryIndicator()

    if (this.menuUI?.isShopMode() && !this.placementManager?.isActive()) {
      this.interactionManager.updateShopCursor(
        this, this.spawnerState.placedSprites,
        (wx, wy) => this.stagePlacer.isOverStage(wx, wy),
      )
    } else {
      this.game.canvas.style.cursor = ''
    }
  }

  private onWorldClicked(pointer: Phaser.Input.Pointer): void {
    if (!this.menuUI || !this.placementManager) return
    if (this.placementManager.isActive()) return

    if (this.menuUI.isShopMode() && !this.foodHandler.isCarrying()) {
      if (this.menuUI.isPointerOverUI(pointer)) return
      if (this.stagePlacer.tryPickUp(pointer)) return
      this.objectSpawner.removeAt(
        pointer,
        snapToIsoGrid(pointer.worldX, pointer.worldY),
        this.menuUI.isInventoryMode(),
        () => this.menuUI.refreshInventoryGrid(),
        this.placementManager,
      )
      return
    }

    if (this.menuUI.isPointerOverUI(pointer)) return
    this.foodHandler.handleWorldClick(pointer)
  }

  private restoreWorld(): void {
    loadPlacedBuildings().forEach(r => {
      const b = new Building(this, r.id, r.gridX, r.gridY, r.type)
      b.createWalls(this, this.obstacleGroup)
      this.buildings.push(b)
      this.buildingPlacer.createSign(b)
      this.buildingPlacer.blockCells(b)
    })
    loadPlacedStages().forEach(r => {
      this.stages.push(new Stage(this, r.id, r.gridX, r.gridY, r.rotation ?? 0))
    })
    loadPlacedObjects().forEach(r =>
      this.objectSpawner.spawn(r.type, r.x, r.y, false, r.recipeId, r.rotation),
    )
  }

  private launchUI(): void {
    this.scene.launch('UIScene')
    const uiScene = this.scene.get('UIScene') as import('./UIScene').UIScene
    const initUI = () => {
      this.menuUI = uiScene.menuUI
      this.placementManager = new PlacementManager(
        this, this.menuUI,
        (type, x, y, rotation) => this.objectSpawner.spawn(type, x, y, true, undefined, rotation),
        (gx, gy) => this.buildingPlacer.place(gx, gy),
        (gx, gy, rot) => this.stagePlacer.place(gx, gy, rot),
      )
      this.events.on('store:select', (type: ObjectType) => this.placementManager.enter(type))
      this.events.on('store:select-building', () => this.placementManager.enterBuildingPlacement())
      this.events.on('store:select-stage', () => this.placementManager.enterStagePlacement())
      this.events.on('inventory:select', (type: ObjectType) => {
        if (!removeFromInventory(type)) return
        this.menuUI.refreshInventoryGrid()
        this.placementManager.enterFromInventory(type)
      })
      this.events.on('menu:shop-close', () => {
        if (this.placementManager.isActive()) this.placementManager.exit()
        this.game.canvas.style.cursor = ''
      })
    }
    if (uiScene.menuUI) initUI()
    else uiScene.events.once('create', () => initUI())
  }

  private drawBackground(): void {
    const bg = this.add.graphics()
    bg.fillStyle(0x4a7c59)
    bg.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
    bg.lineStyle(1, 0x3d6b4a, 0.4)
    for (let gx = 0; gx < GRID_COLS; gx++) {
      for (let gy = 0; gy < GRID_ROWS; gy++) {
        const c = getTileCorners(gx, gy)
        bg.lineBetween(c.top.x, c.top.y, c.right.x, c.right.y)
        bg.lineBetween(c.right.x, c.right.y, c.bottom.x, c.bottom.y)
        bg.lineBetween(c.bottom.x, c.bottom.y, c.left.x, c.left.y)
        bg.lineBetween(c.left.x, c.left.y, c.top.x, c.top.y)
      }
    }
    bg.setDepth(0)
  }

  private createNirvAnimations(): void {
    const directions = [
      { dir: 'down', startFrame: 8 }, { dir: 'up', startFrame: 12 },
      { dir: 'left', startFrame: 0 }, { dir: 'right', startFrame: 4 },
    ]
    for (const variant of ['m', 'f', 'f2', 'f3'] as NirvVariant[]) {
      for (const { dir, startFrame } of directions) {
        this.anims.create({ key: `${variant}_idle_${dir}`, frames: this.anims.generateFrameNumbers(`${variant}_idle`, { start: startFrame, end: startFrame + 3 }), frameRate: 4, repeat: -1 })
        this.anims.create({ key: `${variant}_walk_${dir}`, frames: this.anims.generateFrameNumbers(`${variant}_walk`, { start: startFrame, end: startFrame + 3 }), frameRate: 8, repeat: -1 })
      }
    }
  }

  private spawnBots(): void {
    for (const config of generateDefaultSchedules(GRID_COLS, GRID_ROWS)) {
      let variant = config.colorIndex % 2 === 0 ? 'f' as NirvVariant : 'm' as NirvVariant
      if (config.colorIndex === 2) variant = 'f2' as NirvVariant
      if (config.colorIndex === 3) variant = 'f3' as NirvVariant
      const bot = new BotNirv(this, config.name, config.colorIndex, config.waypoints, variant, this.pathfinder)
      bot.nirv.sprite.setCollideWorldBounds(true)
      this.nirvGroup.add(bot.nirv.sprite)
      this.botNirvs.push(bot)
    }
  }

  // ── Public API for UIScene ──
  getBotNirvs(): BotNirv[] { return this.botNirvs }

  isPlayerInsideRestaurant(): boolean {
    const { x, y } = this.playerNirv.sprite
    return this.buildings.some(b => b.type === 'restaurant' && b.containsPixel(x, y))
  }

  getPlayerStage(): Stage | null {
    const { x, y } = this.playerNirv.sprite
    return this.stages.find(s => s.containsPixel(x, y)) ?? null
  }

  getStageWatchers(stageId: string): BotNirv[] {
    return this.botNirvs.filter(b =>
      (b.state === 'watching_stage' || b.state === 'walking_to_stage') && b.stageId === stageId,
    )
  }
}
