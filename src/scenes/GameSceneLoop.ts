// @ts-nocheck
import { applyNirvSeparation } from '../entities/nirvSeparation'
import { buildNirvHoverSubjects } from '../interaction/buildNirvHoverSubjects'
import { tickWorldNeeds } from '../systems/tickWorldNeeds'
import { GRID_COLS, GRID_ROWS, WORLD_OFFSET_X, WORLD_OFFSET_Y } from '../config/world'
import { TILE_W, TILE_H } from '../utils/isoGrid'
function installMethods(target: any, source: any): void {
	for (const name of Object.getOwnPropertyNames(source.prototype)) {
		if (name === 'constructor') continue
		Object.defineProperty(target.prototype, name, Object.getOwnPropertyDescriptor(source.prototype, name)!)
	}
}

export function installGameSceneLoop(target: any): void { installMethods(target, GameSceneLoopMethods) }

class GameSceneLoopMethods {
	update(_time: number, delta: number): void {
		if (this.isBuildModePaused) {
			this.stopBuildModeActors()
			this.playerInput?.updateBuildCamera(delta)
			return
		}
		this.hydrationSystem.updatePlayerDrinking(delta)
		const gameMinutes = this.worldClock.update(delta)
		for (let i = 0; i < gameMinutes; i++) {
			tickWorldNeeds(this.playerNirv, this.botNirvs, this.sleepSystem.isPlayerSleeping())
			this.sleepSystem.tickRestMinute()
		}
		this.dayNightSystem.update(this.worldClock.getMinuteOfDay(), delta)
		this.lightSystem.update(delta, this.dayNightSystem.getCurrentPhase())
		this.groupActivitySystem.update(delta, this.dayNightSystem.getCurrentPhase())
		const player = this.playerNirv.sprite
		let vx = 0
		let vy = 0
		let hasInput = false
		let arrivedAtTarget = false
		if (this.sleepSystem.isPlayerSleeping()) {
			this.playerNirv.hideDrinkingBubble()
			player.setVelocity(0, 0)
			this.playerNirv.updateAnimation(0, 0)
			this.sleepSystem.syncPlayerSleepLabel()
		} else if (this.hydrationSystem.isPlayerDrinking()) {
			player.setVelocity(0, 0)
			this.playerNirv.updateAnimation(0, 0)
			this.playerNirv.showDrinkingBubble()
			this.playerNirv.syncDrinkingBubblePosition()
		} else if (this.bladderSystem.isPlayerUsingToilet()) {
			player.setVelocity(0, 0)
			this.playerNirv.updateAnimation(0, 0)
		} else {
			this.playerNirv.hideDrinkingBubble()
			const result = this.playerInput.update(player)
			hasInput = result.hasInput
			arrivedAtTarget = result.arrivedAtTarget
			vx = result.vx
			vy = result.vy
			player.setVelocity(vx, vy)
			this.playerNirv.updateAnimation(player.body!.velocity.x, player.body!.velocity.y)
		}
		if (hasInput) {
			this.foodHandler.clearPending()
			this.farmingSystem.clearPlayerPending()
			this.sleepSystem.cancelPlayerWalkToBed()
		}
		if (arrivedAtTarget) {
			this.foodHandler.handlePendingInteractions()
		}
		this.interactionManager.update(player)
		for (const bot of this.botNirvs) bot.update(delta)
		applyNirvSeparation(
			this.botNirvs,
			this.playerNirv,
			(a, b, dist) => this.relationshipSystem?.registerCrowdingPair(a, b, dist),
		)
		this.hydrationSystem.updateStations(delta)
		this.hungerSystem.updateStations(delta)
		this.bladderSystem.updateStations(delta)
		this.sleepSystem.updateBeds(delta)
		this.farmingSystem.update(delta)
		this.stockSystem.update(delta)
		this.houseSystem.update(delta)
		this.cookingSystem.update(delta)
		this.staffCoordinator.update()
		this.restaurantSystem.update(delta)
		this.restaurantSystem.cleanupUnseated()
		this.stageSystem.update(delta)
		// Spotlights: collect stages with an active performance
		const activeStageIds = new Set(
			this.stages
				.filter(s => this.stageSystem.getStageAttraction(s.id) !== null)
				.map(s => s.id),
		)
		this.concertSpotlights.update(
			delta,
			this.dayNightSystem.getCurrentPhase(),
			this.stages,
			activeStageIds,
		)
		const currentDay = this.worldClock.getDayCount()
		if ((this.lastRelationshipDecayDay ?? -1) !== currentDay) {
			this.lastRelationshipDecayDay = currentDay
			this.relationshipSystem?.tickDailyDecay(currentDay)
		}
		this.foodHandler.updateCarryIndicator()
		this.relationshipsRefreshAccum = (this.relationshipsRefreshAccum ?? 0) + delta
		if (this.relationshipsRefreshAccum >= 1000) {
			this.relationshipsRefreshAccum = 0
			this.menuUI?.refreshRelationshipsPanel?.()
			this.menuUI?.refreshNirvsPanel?.()
		}
		const ptr = this.input.activePointer
		const hideNameHover =
			(this.menuUI?.isPointerOverUI(ptr) ?? false) ||
			(this.placementManager?.isActive() ?? false)
		const stockHoverActive = this.objectStockHover.update(
			ptr,
			this.hungerSystem.getFoodStockStations(),
			hideNameHover,
		)
		this.nirvNameHover.update(
			ptr,
			buildNirvHoverSubjects(this.playerNirv, this.botNirvs),
			hideNameHover || stockHoverActive,
		)
		if (this.menuUI?.isShopMode() && !this.placementManager?.isActive()) {
			this.interactionManager.updateShopCursor(
				this, this.spawnerState.placedSprites,
				(wx, wy) => this.stagePlacer.isOverStage(wx, wy),
			)
		} else {
			this.game.canvas.style.cursor = ''
		}

		if (this.menuUI?.isPhysicsMode()) {
			this.physicsDebugGraphics.clear()
			this.pathfinder.debugDraw(this.physicsDebugGraphics)

			this.physicsDebugGraphics.lineStyle(1, 0xffffff, 0.3)
			for (let x = 0; x <= GRID_COLS; x++) {
				const px = x * TILE_W + WORLD_OFFSET_X
				this.physicsDebugGraphics.lineBetween(px, WORLD_OFFSET_Y, px, GRID_ROWS * TILE_H + WORLD_OFFSET_Y)
			}
			for (let y = 0; y <= GRID_ROWS; y++) {
				const py = y * TILE_H + WORLD_OFFSET_Y
				this.physicsDebugGraphics.lineBetween(WORLD_OFFSET_X, py, GRID_COLS * TILE_W + WORLD_OFFSET_X, py)
			}
			
			this.physicsDebugGraphics.lineStyle(2, 0x00ff00, 0.8)
			this.physicsDebugGraphics.fillStyle(0x00ff00, 0.2)
			this.obstacleGroup.getChildren().forEach((child: any) => {
				const body = child.body
				if (body) {
					this.physicsDebugGraphics.fillRect(body.x, body.y, body.width, body.height)
					this.physicsDebugGraphics.strokeRect(body.x, body.y, body.width, body.height)
				}
			})

			this.physicsDebugGraphics.lineStyle(2, 0x00ffff, 0.8)
			this.physicsDebugGraphics.fillStyle(0x00ffff, 0.2)
			this.nirvGroup.getChildren().forEach((child: any) => {
				const body = child.body
				if (body) {
					this.physicsDebugGraphics.fillRect(body.x, body.y, body.width, body.height)
					this.physicsDebugGraphics.strokeRect(body.x, body.y, body.width, body.height)
				}
			})
		} else {
			this.physicsDebugGraphics.clear()
		}
	}
}
