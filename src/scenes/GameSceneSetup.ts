// @ts-nocheck
import { gridToScreen } from '../utils/isoGrid'
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
import { Building, BUILDING_GRID_H } from '../entities/Building'
import { Stage } from '../entities/Stage'
import { PlacementManager } from '../placement/PlacementManager'
import { LotPlacementManager } from '../world/LotPlacementManager'
import { WallPlacementManager } from '../world/WallPlacementManager'
import { BuildOverlayLayer } from '../world/BuildOverlayLayer'
import { countRestaurantEquipment } from '../world/restaurantBuildingCounts'
import { maxChefs, maxWaiters } from '../systems/restaurantStaffCaps'
import { installStageBarrier } from '../world/stageBarrier'
import { debugLog } from '../debug/DebugLogger'

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
		this.buildNavMesh()
		debugLog.log('world.restore_complete', {
			buildingCount: this.buildings.length,
			stageCount: this.stages.length,
			objectCount: this.spawnerState.placedSprites.length,
		}, 'info')
	}
	private buildNavMesh(): void {
		const extra: { gx: number; gy: number }[] = []
		for (const b of this.buildings) {
			// Waypoints at each door threshold: one cell inside and one outside
			const x1 = b.gridX + 3, x2 = b.gridX + 4
			const inside = b.gridY + BUILDING_GRID_H - 2
			const outside = b.gridY + BUILDING_GRID_H
			extra.push({ gx: x1, gy: inside }, { gx: x2, gy: inside }, { gx: x1, gy: outside }, { gx: x2, gy: outside })
		}
		this.pathfinder.rebuildNavMesh(extra)
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
			this.lotPlacementManager = new LotPlacementManager(
				this,
				this.menuUI,
				this.buildOverlay,
				() => this.menuUI.getSelectedBuildTool(),
				() => this.menuUI.getSelectedLotType(),
				(botId) => this.botNirvs.find(b => b.id === botId)?.nirv.name ?? null,
				(onMerge, onCancel) => this.menuUI.openLotMergePrompt(onMerge, onCancel),
			)
			this.wallPlacementManager = new WallPlacementManager(
				this,
				this.menuUI,
				this.obstacleGroup,
				this.pathfinder,
				() => this.menuUI.getSelectedBuildTool(),
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
				if (!this.menuUI.isBuildMode()) this.buildOverlay.setVisible(false)
				if (!this.menuUI.isBuildMode()) this.lotPlacementManager.setSignsVisible(false)
			})
			this.events.on('menu:shop-open', () => {
				this.buildOverlay.setVisible(true)
				this.lotPlacementManager.setSignsVisible(true)
			})
			this.events.on('menu:build-open', () => {
				if (this.placementManager.isActive()) this.placementManager.exit()
				this.game.canvas.style.cursor = ''
				this.buildOverlay.setVisible(true)
				this.lotPlacementManager.setSignsVisible(true)
				this.lotPlacementManager.enter()
				this.wallPlacementManager.enter()
				this.setBuildModePaused(true)
			})
			this.events.on('build:tool-select', (tool: import('../ui/BuildPanel').BuildTool) => {
				if (!this.menuUI.isBuildMode()) return
				if (tool === 'path') this.placementManager.enter('path')
				else if (this.placementManager.isActive()) this.placementManager.exit()
			})
			this.events.on('menu:build-close', () => {
				if (this.placementManager.isActive()) this.placementManager.exit()
				this.lotPlacementManager.exit()
				this.wallPlacementManager.exit()
				this.setBuildModePaused(false)
				if (!this.menuUI.isShopMode()) this.buildOverlay.setVisible(false)
				if (!this.menuUI.isShopMode()) this.lotPlacementManager.setSignsVisible(false)
			})
			this.events.on('world:walls-changed', () => {
				debugLog.log('world.walls_changed', {
					botCount: this.botNirvs.length,
				}, 'info')
				for (const bot of this.botNirvs) bot.refreshNavigationPath?.()
			})
			this.events.on('world:nav-changed', () => {
				debugLog.log('world.nav_changed', {
					botCount: this.botNirvs.length,
				}, 'info')
				this.buildNavMesh()
				for (const bot of this.botNirvs) bot.refreshNavigationPath?.()
			})
			this.menuUI.setRelationshipProviders(
				() => this.botNirvs,
				() => this.relationshipSystem ?? null,
			)
			this.menuUI.setNirvsProviders(
				() => this.playerNirv ?? null,
				() => this.botNirvs,
				() => this.houseSystem?.getHomes() ?? [],
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
		bg.setDepth(0)
		this.buildOverlay = new BuildOverlayLayer(this)
		this.buildOverlay.setVisible(false)
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
