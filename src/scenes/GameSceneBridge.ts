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
import type { BotWorkRole } from '../entities/botWorkRoles'
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

export function installGameSceneBridge(target: any): void { installMethods(target, GameSceneBridgeMethods) }
class GameSceneBridgeMethods {
	getBotNirvs(): BotNirv[] { return this.botNirvs }
	getAssignedWorkRoleForBot(bot: BotNirv): BotWorkRole | null {
		const staffRole = this.staffAssignments.roleForBot(bot.id)
		if (staffRole) return staffRole
		if (this.farmingSystem.isFarmerBot(bot)) return 'farmer'
		if (this.stockSystem.isStockerBot(bot)) return 'stocker'
		if (this.stageSystem.isPerformerAssigned(bot.id)) return 'performer'
		return null
	}
	getPerformerBotsForUI(): { id: string; label: string }[] {
		return this.botNirvs
			.filter(b => isPerformerProfession(b.profession))
			.map(b => ({ id: b.id, label: b.nirv.name }))
	}
	isPlayerInsideRestaurant(): boolean {
		const { x, y } = this.playerNirv.sprite
		return this.buildings.some(b => b.type === 'restaurant' && b.containsPixel(x, y))
	}
	getPlayerRestaurantBuilding(): Building | null {
		const { x, y } = this.playerNirv.sprite
		return this.buildings.find(b => b.type === 'restaurant' && b.containsPixel(x, y)) ?? null
	}
	getRestaurantStaffUiView(): RestaurantStaffUiView | null {
		const b = this.getPlayerRestaurantBuilding()
		if (!b) return null
		const counts = countRestaurantEquipment(b, this.spawnerState)
		const maxC = maxChefs(counts.stoves, counts.counters)
		const maxW = maxWaiters(counts.counters, counts.tables)
		const botIds = new Set(this.botNirvs.map(x => x.id))
		this.staffAssignments.clampToCaps(b.id, maxC, maxW, botIds)
		const staff = this.staffAssignments.get(b.id)
		return {
			buildingId: b.id,
			maxChefs: maxC,
			maxWaiters: maxW,
			stoves: counts.stoves,
			counters: counts.counters,
			tables: counts.tables,
			chefIds: [...staff.chefBotIds],
			waiterIds: [...staff.waiterBotIds],
			bots: this.botNirvs,
		}
	}
	setRestaurantStaffRole(buildingId: string, botId: string, role: 'none' | 'chef' | 'waiter'): void {
		const building = this.buildings.find(x => x.id === buildingId)
		if (!building || building.type !== 'restaurant') return
		const counts = countRestaurantEquipment(building, this.spawnerState)
		const maxC = maxChefs(counts.stoves, counts.counters)
		const maxW = maxWaiters(counts.counters, counts.tables)
		const botIds = new Set(this.botNirvs.map(b => b.id))
		this.staffAssignments.clampToCaps(buildingId, maxC, maxW, botIds)
		const bot = this.botNirvs.find(b => b.id === botId)
		this.staffAssignments.setRole(buildingId, botId, role, maxC, maxW)
		if (!bot) return
		if (role === 'chef' || role === 'waiter') {
			this.farmingSystem.setFarmerAssigned(botId, false)
			this.stockSystem.setStockerAssigned(botId, false)
			this.restaurantSystem.releaseChairForBot(bot)
			if (role === 'chef') bot.enterChefIdle()
			else bot.enterWaiterIdle()
		} else if (role === 'none' && isRestaurantStaffState(bot.state)) {
			bot.abortRestaurantStaffDuty()
		}
	}
	getFarmWorkView(): FarmWorkView {
		return this.farmingSystem.getFarmWorkView()
	}
	setFarmerRole(botId: string, assigned: boolean): void {
		const bot = this.botNirvs.find(b => b.id === botId)
		if (assigned) {
			this.staffAssignments.clearBotEverywhere(botId)
			this.stockSystem.setStockerAssigned(botId, false)
			if (bot && isRestaurantStaffState(bot.state)) bot.abortRestaurantStaffDuty()
		}
		this.farmingSystem.setFarmerAssigned(botId, assigned)
	}
	getStockWorkView(): StockWorkView {
		return this.stockSystem.getStockWorkView()
	}
	setStockerRole(botId: string, assigned: boolean): void {
		const bot = this.botNirvs.find(b => b.id === botId)
		if (assigned) {
			this.staffAssignments.clearBotEverywhere(botId)
			this.farmingSystem.setFarmerAssigned(botId, false)
			if (bot && isRestaurantStaffState(bot.state)) bot.abortRestaurantStaffDuty()
		}
		this.stockSystem.setStockerAssigned(botId, assigned)
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
	getStagePerformers(stageId: string): BotNirv[] {
		return this.botNirvs.filter(b =>
			b.stageId === stageId &&
			(b.state === 'performing_on_stage' || b.state === 'walking_to_perform'),
		)
	}
	getStagePerformanceView(stageId: string): StagePerformanceView | null {
		return this.stageSystem.getPerformanceView(stageId)
	}
	stageAllowsBandForStage(stageId: string): boolean {
		const s = this.stages.find(x => x.id === stageId)
		return s ? !s.soloOnly : true
	}
	setStageAttraction(stageId: string, attraction: StageAttraction | null): boolean {
		const st = this.stages.find(s => s.id === stageId)
		if (attraction?.kind === 'band' && st?.soloOnly) return false
		if (attraction?.kind === 'solo') {
			const b = this.botNirvs.find(x => x.id === attraction.botId)
			if (!b || !isPerformerProfession(b.profession)) return false
		} else if (attraction?.kind === 'band') {
			const band = loadBands().find(x => x.id === attraction.bandId)
			if (!band || band.memberBotIds.length < 2) return false
		}
		this.stageSystem.setStageAttraction(stageId, attraction)
		// Sync spotlight positions whenever attraction changes
		if (st) {
			const performerCount = attraction ? this.getStagePerformers(stageId).length : 0
			this.concertSpotlights.syncStage(st, performerCount)
		}
		return true
	}
	getBandsForUI(): BandRecord[] {
		return loadBands()
	}
	formBandFromFirstTwoPerformers(): boolean {
		const perf = this.botNirvs.filter(b => isPerformerProfession(b.profession))
		if (perf.length < 2) return false
		const a = perf[0]!
		const b = perf[1]!
		const tags = [...new Set([...a.performerTags, ...b.performerTags])] as MusicTag[]
		addBand({
			id: crypto.randomUUID(),
			name: `${a.nirv.name} & ${b.nirv.name}`,
			memberBotIds: [a.id, b.id],
			tags,
		})
		return true
	}
	deleteBandById(id: string): void {
		removeBand(id)
	}
	getClockLabel(): string {
		return this.worldClock.getLabel()
	}
	getDayNightSystem(): import('../systems/DayNightSystem').DayNightSystem {
		return this.dayNightSystem
	}
	getConcertSpotlights(): import('../systems/ConcertSpotlightSystem').ConcertSpotlightSystem {
		return this.concertSpotlights
	}
	getLightSystem(): import('../systems/LightSystem').LightSystem {
		return this.lightSystem
	}
	getGroupActivitySystem(): import('../systems/GroupActivitySystem').GroupActivitySystem {
		return this.groupActivitySystem
	}
}
