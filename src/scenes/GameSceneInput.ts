// @ts-nocheck
import { snapToIsoGrid } from '../utils/isoGrid'
import { tryStationsAtPointer } from '../world/stationWorldClick'
import { actorInsideObjectBuilding } from '../world/buildingInteractionAccess'

function installMethods(target: any, source: any): void {
	for (const name of Object.getOwnPropertyNames(source.prototype)) {
		if (name === 'constructor') continue
		Object.defineProperty(target.prototype, name, Object.getOwnPropertyDescriptor(source.prototype, name)!)
	}
}

export function installGameSceneInput(target: any): void { installMethods(target, GameSceneInputMethods) }

class GameSceneInputMethods {
	private onWorldClicked(pointer: Phaser.Input.Pointer): void {
		if (!this.menuUI || !this.placementManager) return
		if (this.menuUI.isBuildMode()) return
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
}
