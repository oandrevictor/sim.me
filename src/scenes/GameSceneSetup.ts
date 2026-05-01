// @ts-nocheck
import { getTileCorners, gridToScreen } from '../utils/isoGrid'
import { WORLD_WIDTH, WORLD_HEIGHT, GRID_COLS, GRID_ROWS } from '../config/world'
import { loadPlacedBuildings } from '../storage/buildingPersistence'
import { loadPlacedStages } from '../storage/stagePersistence'
import { loadPlacedObjects, removeObjectByType } from '../storage/persistence'
import { removeFromInventory } from '../storage/inventoryPersistence'
import { addBand, loadBands, removeBand } from '../storage/bandPersistence'
import { isPerformerProfession } from '../data/professions'
import { generateDefaultSchedules } from '../entities/NirvSchedule'
import { NirvVariant } from '../entities/Nirv'
import { BotNirv, isRestaurantStaffState } from '../entities/BotNirv'
import { Building } from '../entities/Building'
import { Stage } from '../entities/Stage'
import { PlacementManager } from '../placement/PlacementManager'
import { countRestaurantEquipment } from '../world/restaurantBuildingCounts'
import { maxChefs, maxWaiters } from '../systems/restaurantStaffCaps'
import { installStageBarrier } from '../world/stageBarrier'

function installMethods(target: any, source: any): void {
	for (const name of Object.getOwnPropertyNames(source.prototype)) {
		if (name === 'constructor') continue
		Object.defineProperty(target.prototype, name, Object.getOwnPropertyDescriptor(source.prototype, name)!)
	}
}

export function installGameSceneSetup(target: any): void { installMethods(target, GameSceneSetupMethods) }
class GameSceneSetupMethods {
	private restoreWorld(): void {
		loadPlacedBuildings().forEach(r => {
			const b = new Building(this, r.id, r.gridX, r.gridY, r.type, r.ownerBotIds ?? r.ownerBotId ?? null)
			b.createWalls(this, this.obstacleGroup)
			this.buildings.push(b)
			this.buildingPlacer.createSign(b)
			this.buildingPlacer.blockCells(b)
		})
		const stageRecords = loadPlacedStages()
		stageRecords.forEach(r => {
			const st = new Stage(this, r.id, r.gridX, r.gridY, r.rotation ?? 0, r.variant ?? 'default')
			this.stages.push(st)
			installStageBarrier(st, this.pathfinder, this, this.obstacleGroup)
		})
		this.stageSystem.initFromRecords(stageRecords)
		loadPlacedObjects().forEach(r =>
			this.objectSpawner.spawn(r.type, r.x, r.y, false, r.recipeId, r.rotation, {
				cropStage: r.cropStage,
				cropSeed: r.cropSeed,
				cropStageStartedAt: r.cropStageStartedAt,
				stock: r.stock,
			}),
		)
	}
	private launchUI(): void {
		this.scene.launch('UIScene')
		const uiScene = this.scene.get('UIScene') as import('./UIScene').default
		const initUI = () => {
			this.menuUI = uiScene.menuUI
			this.placementManager = new PlacementManager(
				this, this.menuUI,
				(type, x, y, rotation) => this.objectSpawner.spawn(type, x, y, true, undefined, rotation),
				(gx, gy) => this.buildingPlacer.place(gx, gy),
				(gx, gy, rot, variant) => this.stagePlacer.place(gx, gy, rot, variant),
			)
			this.events.on('store:select', (type: ObjectType) => this.placementManager.enter(type))
			this.events.on('store:select-building', () => this.placementManager.enterBuildingPlacement())
			this.events.on('store:select-stage', () => this.placementManager.enterStagePlacement(0, 'default'))
			this.events.on('store:select-stage-solo', () => this.placementManager.enterStagePlacement(0, 'solo_platform'))
			this.events.on('inventory:select', (type: ObjectType) => {
				if (!removeFromInventory(type)) return
				this.menuUI.refreshInventoryGrid()
				this.placementManager.enterFromInventory(type)
			})
			this.events.on('menu:shop-close', () => {
				if (this.placementManager.isActive()) this.placementManager.exit()
				this.game.canvas.style.cursor = ''
			})
			this.menuUI.setRelationshipProviders(
				() => this.botNirvs,
				() => this.relationshipSystem ?? null,
			)
			this.menuUI.setNirvsProviders(
				() => this.playerNirv ?? null,
				() => this.botNirvs,
				() => this.buildings,
				() => this.relationshipSystem ?? null,
			)
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
			if (config.colorIndex % 3 === 0) variant = 'f2' as NirvVariant
			if (config.colorIndex % 5 === 0) variant = 'f3' as NirvVariant
			const bot = new BotNirv(
				this,
				config.name,
				config.colorIndex,
				config.waypoints,
				variant,
				this.pathfinder,
				config.id,
				config.profession,
				config.interests,
				config.performerTags,
			)
			bot.nirv.sprite.setCollideWorldBounds(true)
			this.nirvGroup.add(bot.nirv.sprite)
			this.botNirvs.push(bot)
		}
	}
}
