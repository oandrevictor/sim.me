// @ts-nocheck
import { applyNirvSeparation } from '../entities/nirvSeparation'
import { buildNirvHoverSubjects } from '../interaction/buildNirvHoverSubjects'
import { tickWorldNeeds } from '../systems/tickWorldNeeds'

function installMethods(target: any, source: any): void {
	for (const name of Object.getOwnPropertyNames(source.prototype)) {
		if (name === 'constructor') continue
		Object.defineProperty(target.prototype, name, Object.getOwnPropertyDescriptor(source.prototype, name)!)
	}
}

export function installGameSceneLoop(target: any): void { installMethods(target, GameSceneLoopMethods) }

class GameSceneLoopMethods {
	update(_time: number, delta: number): void {
		this.hydrationSystem.updatePlayerDrinking(delta)
		const gameMinutes = this.worldClock.update(delta)
		for (let i = 0; i < gameMinutes; i++) {
			tickWorldNeeds(this.playerNirv, this.botNirvs, this.sleepSystem.isPlayerSleeping())
			this.sleepSystem.tickRestMinute()
		}
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
	}
}
