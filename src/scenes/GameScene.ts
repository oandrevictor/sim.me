// @ts-nocheck
import * as Phaser from 'phaser';
/* START OF COMPILED CODE */
/* START-USER-IMPORTS */
import type { ObjectType } from '../objects/objectTypes'
import { preloadGameAssets } from './preloadGameAssets'
import { generateCropTextures } from '../objects/cropTextures'
import { WORLD_WIDTH, WORLD_HEIGHT, GRID_COLS, GRID_ROWS } from '../config/world'
import { gridToScreen, getTileCorners, snapToIsoGrid } from '../utils/isoGrid'
import { MenuUI } from '../ui/MenuUI'
import { PlacementManager } from '../placement/PlacementManager'
import { loadPlacedObjects } from '../storage/persistence'
import { removeFromInventory } from '../storage/inventoryPersistence'
import { loadPlacedBuildings } from '../storage/buildingPersistence'
import { loadPlacedStages, type StageAttraction } from '../storage/stagePersistence'
import { addBand, loadBands, removeBand, type BandRecord } from '../storage/bandPersistence'
import { isPerformerProfession } from '../data/professions'
import type { MusicTag } from '../data/musicTags'
import type { StagePerformanceView } from '../systems/stagePerformanceTypes'
import { Nirv, NirvVariant } from '../entities/Nirv'
import { BotNirv, isRestaurantStaffState } from '../entities/BotNirv'
import { generateDefaultSchedules } from '../entities/NirvSchedule'
import { Building } from '../entities/Building'
import { Stage } from '../entities/Stage'
import { BuildingTypeUI } from '../ui/BuildingTypeUI'
import { RestaurantSystem } from '../systems/RestaurantSystem'
import { RestaurantStaffAssignments } from '../systems/RestaurantStaffAssignments'
import { RestaurantStaffCoordinator } from '../systems/RestaurantStaffCoordinator'
import { maxChefs, maxWaiters } from '../systems/restaurantStaffCaps'
import { HydrationSystem } from '../systems/HydrationSystem'
import { HungerSystem } from '../systems/HungerSystem'
import { BladderSystem } from '../systems/BladderSystem'
import { SleepSystem } from '../systems/SleepSystem'
import { StageSystem } from '../systems/StageSystem'
import { CookingSystem } from '../systems/CookingSystem'
import { FarmingSystem } from '../systems/FarmingSystem'
import { StockSystem } from '../systems/StockSystem'
import { HouseSystem } from '../systems/HouseSystem'
import { WorldClock } from '../systems/WorldClock'
import { RelationshipSystem } from '../systems/RelationshipSystem'
import { ScheduleSystem } from '../systems/ScheduleSystem'
import { RecipeSelectUI } from '../ui/RecipeSelectUI'
import { SeedSelectUI } from '../ui/SeedSelectUI'
import { GridPathfinder } from '../pathfinding/GridPathfinder'
import { ObjectSpawner, type SpawnerState, type PlateEntry } from '../world/ObjectSpawner'
import { countRestaurantEquipment } from '../world/restaurantBuildingCounts'
import type { RestaurantStaffUiView } from '../ui/WorkPanel'
import type { FarmWorkView } from '../systems/farmingTypes'
import type { StockWorkView } from '../systems/foodStockTypes'
import { tryStationsAtPointer } from '../world/stationWorldClick'
import { BuildingPlacer } from '../world/BuildingPlacer'
import { StagePlacer } from '../world/StagePlacer'
import { installStageBarrier } from '../world/stageBarrier'
import { PlayerInput } from '../input/PlayerInput'
import { InteractionManager } from '../interaction/InteractionManager'
import { FoodHandler } from '../interaction/FoodHandler'
import { NirvNameHover } from '../interaction/NirvNameHover'
import { ObjectStockHover } from '../interaction/ObjectStockHover'
import { buildNirvHoverSubjects } from '../interaction/buildNirvHoverSubjects'
import { removeObjectByType } from '../storage/persistence'
import { applyNirvSeparation } from '../entities/nirvSeparation'
import { registerStoveAnimations } from '../animations/stoveAnims'
import { actorInsideObjectBuilding } from '../world/buildingInteractionAccess'
import { installGameSceneSetup } from './GameSceneSetup'
import { installGameSceneBridge } from './GameSceneBridge'
import { installGameSceneLoop } from './GameSceneLoop'
/* END-USER-IMPORTS */
export interface GameScene { [key: string]: any }
export default class GameScene extends Phaser.Scene {
	constructor() {
		super("GameScene");
		/* START-USER-CTR-CODE */
		/* END-USER-CTR-CODE */
	}
	editorCreate(): void {
		this.events.emit("scene-awake");
	}
	/* START-USER-CODE */
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
	private staffAssignments!: RestaurantStaffAssignments
	private staffCoordinator!: RestaurantStaffCoordinator
	private hydrationSystem!: HydrationSystem
	private hungerSystem!: HungerSystem
	private bladderSystem!: BladderSystem
	private sleepSystem!: SleepSystem
	private stageSystem!: StageSystem
	private cookingSystem!: CookingSystem
	private farmingSystem!: FarmingSystem
	private stockSystem!: StockSystem
	private houseSystem!: HouseSystem
	private worldClock!: WorldClock
	private relationshipSystem!: RelationshipSystem
	private scheduleSystem!: ScheduleSystem
	private recipeSelectUI!: RecipeSelectUI
	private seedSelectUI!: SeedSelectUI
	private pathfinder!: GridPathfinder
	private spawnerState!: SpawnerState
	private objectSpawner!: ObjectSpawner
	private buildingPlacer!: BuildingPlacer
	private stagePlacer!: StagePlacer
	private playerInput!: PlayerInput
	private interactionManager!: InteractionManager
	private foodHandler!: FoodHandler
	private nirvNameHover!: NirvNameHover
	private objectStockHover!: ObjectStockHover
	preload(): void {
		preloadGameAssets(this)
	}
	create(): void {
		this.editorCreate()
		this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
		this.drawBackground()
		this.createNirvAnimations()
		registerStoveAnimations(this)
		generateCropTextures(this)
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
		this.seedSelectUI = new SeedSelectUI(this)
		this.restaurantSystem = new RestaurantSystem(this.buildings, this.botNirvs)
		this.staffAssignments = new RestaurantStaffAssignments()
		this.restaurantSystem.setStaffBotFilter(b =>
			this.staffAssignments.isStaffBot(b) ||
			this.farmingSystem?.isFarmerBot(b) === true ||
			this.stockSystem?.isStockerBot(b) === true,
		)
		this.cookingSystem = new CookingSystem(this)
		this.pathfinder = new GridPathfinder(GRID_COLS, GRID_ROWS)
		this.worldClock = new WorldClock()
		this.stageSystem = new StageSystem(this.stages, this.botNirvs, () => loadBands())
		this.spawnerState = {
			placedSprites: [], tableSprites: [], counterSprites: [],
			interactableSprites: [], backgroundSprites: [], plateSprites: [],
		}
		this.restaurantSystem.onPlateConsumed = (x, y, sprite) => {
			removeObjectByType(x, y, 'food_plate')
			this.spawnerState.plateSprites = this.spawnerState.plateSprites.filter(p => p.sprite !== sprite)
		}
		this.sleepSystem = new SleepSystem(
			this.botNirvs,
			this.restaurantSystem,
			() => this.playerNirv,
			(bot, x, y) => this.houseSystem?.canBotUseObjectAt(bot, x, y) ?? true,
			(x, y) => this.houseSystem?.canPlayerUseObjectAt(x, y) ?? true,
			(bot, x, y) => actorInsideObjectBuilding(this.buildings, bot.nirv.sprite.x, bot.nirv.sprite.y, x, y),
			(x, y) => actorInsideObjectBuilding(this.buildings, this.playerNirv.sprite.x, this.playerNirv.sprite.y, x, y),
		)
		this.hungerSystem = new HungerSystem(
			this.botNirvs,
			this.restaurantSystem,
			this.pathfinder,
			(bot, x, y) => this.houseSystem?.canBotUseObjectAt(bot, x, y) ?? true,
			(bot, x, y) => actorInsideObjectBuilding(this.buildings, bot.nirv.sprite.x, bot.nirv.sprite.y, x, y),
		)
		this.hydrationSystem = new HydrationSystem(
			this.botNirvs,
			() => this.playerNirv,
			this.restaurantSystem,
			this.pathfinder,
			() => this.sleepSystem.isPlayerSleeping(),
			() => this.sleepSystem.wakePlayerFromBed(),
			(bot, x, y) => this.houseSystem?.canBotUseObjectAt(bot, x, y) ?? true,
			(x, y) => this.houseSystem?.canPlayerUseObjectAt(x, y) ?? true,
			(bot, x, y) => actorInsideObjectBuilding(this.buildings, bot.nirv.sprite.x, bot.nirv.sprite.y, x, y),
			(x, y) => actorInsideObjectBuilding(this.buildings, this.playerNirv.sprite.x, this.playerNirv.sprite.y, x, y),
		)
		this.relationshipSystem = new RelationshipSystem(
			this.worldClock,
			() => this.botNirvs,
			() => this.buildings,
		)
		this.restaurantSystem.setRelationshipSystem(this.relationshipSystem)
		this.stageSystem.setRelationshipSystem(this.relationshipSystem)
		this.hydrationSystem.setRelationshipSystem(this.relationshipSystem)
		this.hungerSystem.setRelationshipSystem(this.relationshipSystem)
		this.hydrationSystem.getSocialSystem().setRelationshipSystem(this.relationshipSystem)
		this.hydrationSystem.getSocialSystem().onChatTick(this.relationshipSystem.handleChatTick)
		// ScheduleSystem is created later (after farming + stock are built); systems below take it via setSchedule().
		this.bladderSystem = new BladderSystem(
			this.botNirvs,
			() => this.playerNirv,
			this.restaurantSystem,
			this.pathfinder,
			(bot, x, y) => this.houseSystem?.canBotUseObjectAt(bot, x, y) ?? true,
			(x, y) => this.houseSystem?.canPlayerUseObjectAt(x, y) ?? true,
			(bot, x, y) => actorInsideObjectBuilding(this.buildings, bot.nirv.sprite.x, bot.nirv.sprite.y, x, y),
			(x, y) => actorInsideObjectBuilding(this.buildings, this.playerNirv.sprite.x, this.playerNirv.sprite.y, x, y),
		)
		this.bladderSystem.setRelationshipSystem(this.relationshipSystem)
		this.farmingSystem = new FarmingSystem(
			this.botNirvs,
			() => this.playerNirv,
			onSelect => this.seedSelectUI.open(onSelect),
			(bot, x, y) => this.houseSystem?.canBotUseObjectAt(bot, x, y) ?? true,
			(x, y) => this.houseSystem?.canPlayerUseObjectAt(x, y) ?? true,
			(bot, x, y) => actorInsideObjectBuilding(this.buildings, bot.nirv.sprite.x, bot.nirv.sprite.y, x, y),
			(x, y) => actorInsideObjectBuilding(this.buildings, this.playerNirv.sprite.x, this.playerNirv.sprite.y, x, y),
		)
		this.stockSystem = new StockSystem(
			this.botNirvs,
			() => this.hungerSystem.getFoodStockStations(),
			(station, stock) => this.hungerSystem.setFoodStationStock(station, stock),
			(bot, x, y) => this.houseSystem?.canBotUseObjectAt(bot, x, y) ?? true,
			(bot, x, y) => actorInsideObjectBuilding(this.buildings, bot.nirv.sprite.x, bot.nirv.sprite.y, x, y),
		)
		this.houseSystem = new HouseSystem(this.buildings, this.botNirvs)
		this.houseSystem.setRelationshipSystem(this.relationshipSystem)
		this.scheduleSystem = new ScheduleSystem(
			this.worldClock,
			this.staffAssignments,
			this.farmingSystem,
			this.stockSystem,
		)
		this.sleepSystem.setSchedule(this.scheduleSystem)
		this.hungerSystem.setSchedule(this.scheduleSystem)
		this.farmingSystem.setSchedule(this.scheduleSystem)
		this.stockSystem.setSchedule(this.scheduleSystem)
		this.stageSystem.setSchedule(this.scheduleSystem)
		this.houseSystem.setSchedule(this.scheduleSystem)
		this.objectSpawner = new ObjectSpawner(
			this, this.obstacleGroup, this.pathfinder,
			this.restaurantSystem, this.cookingSystem, this.spawnerState,
			(s) => this.foodHandler.onStoveClicked(s),
			(s) => this.foodHandler.onTrashClicked(s),
			(s) => {
				if (this.placementManager?.isActive()) return
				if (!(this.houseSystem?.canPlayerUseObjectAt(s.x, s.y) ?? true)) return
				if (!actorInsideObjectBuilding(this.buildings, this.playerNirv.sprite.x, this.playerNirv.sprite.y, s.x, s.y)) return
				const player = this.playerNirv.sprite
				const dist = Phaser.Math.Distance.Between(player.x, player.y, s.x, s.y)
				if (dist >= 96) this.playerInput.setWalkTarget(s.x, s.y)
			},
			(e) => this.foodHandler.onPlateClicked(e, () => this.menuUI?.isShopMode() ?? false),
			this.hydrationSystem,
			this.sleepSystem,
			this.hungerSystem,
			this.bladderSystem,
			this.farmingSystem,
		)
		this.buildingPlacer = new BuildingPlacer(
			this, this.buildings, this.obstacleGroup,
			this.pathfinder, this.buildingTypeUI,
			() => this.placementManager?.isActive() ?? false,
			(building) => this.botNirvs.find(b => b.id === building.ownerBotId)?.nirv.name ?? null,
		)
		this.stagePlacer = new StagePlacer(
			this, this.stages, this.buildings,
			this.obstacleGroup, this.pathfinder,
			(rotation, variant) => this.placementManager?.enterStagePlacement(rotation, variant),
			(id) => this.stageSystem.removeRuntime(id),
		)
		this.playerInput = new PlayerInput(this, 200)
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
			(x, y) =>
				(this.houseSystem?.canPlayerUseObjectAt(x, y) ?? true) &&
				actorInsideObjectBuilding(this.buildings, this.playerNirv.sprite.x, this.playerNirv.sprite.y, x, y),
		)
		this.restoreWorld()
		this.launchUI()
		this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.onWorldClicked(pointer))
		this.spawnBots()
		this.stageSystem.syncPerformersAfterBotsSpawned()
		this.staffCoordinator = new RestaurantStaffCoordinator(
			this.buildings,
			this.botNirvs,
			this.staffAssignments,
			this.restaurantSystem,
			this.cookingSystem,
			this.pathfinder,
			(type, x, y, persist, recipeId) => this.objectSpawner.spawn(type, x, y, persist, recipeId),
			(entry: PlateEntry) => {
				this.spawnerState.plateSprites = this.spawnerState.plateSprites.filter(p => p !== entry)
			},
			() => this.spawnerState.plateSprites,
		)
		this.staffCoordinator.setSchedule(this.scheduleSystem)
		this.events.on('restaurant-staff-abort', (bot: BotNirv) => {
			this.staffCoordinator.releaseAllForBot(bot)
		})
		this.events.on('farmer-abort', (bot: BotNirv) => {
			this.farmingSystem.releaseAllForBot(bot)
		})
		this.events.on('stocker-abort', (bot: BotNirv) => {
			this.stockSystem.releaseAllForBot(bot)
		})
		this.nirvNameHover = new NirvNameHover(this)
		this.objectStockHover = new ObjectStockHover(this)
	}

	private onWorldClicked(pointer: Phaser.Input.Pointer): void {
		if (!this.menuUI || !this.placementManager) return
		if (this.placementManager.isActive()) return
		const cx = pointer.position.x
		const cy = pointer.position.y
		if (this.menuUI.tryConsumeWorkPanelStageClick(cx, cy)) return
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
		if (
			tryStationsAtPointer(
				pointer,
				this.cameras.main,
				this.spawnerState.placedSprites,
				this.hydrationSystem,
				this.bladderSystem,
				this.sleepSystem,
				this.farmingSystem,
				this.playerNirv,
				(tx, ty) => this.playerInput.setWalkTarget(tx, ty),
				(x, y) =>
					(this.houseSystem?.canPlayerUseObjectAt(x, y) ?? true) &&
					actorInsideObjectBuilding(this.buildings, this.playerNirv.sprite.x, this.playerNirv.sprite.y, x, y),
			)
		) return
		this.foodHandler.handleWorldClick(pointer)
	}
	/* END-USER-CODE */
}
installGameSceneSetup(GameScene)
installGameSceneBridge(GameScene)
installGameSceneLoop(GameScene)
/* END OF COMPILED CODE */
