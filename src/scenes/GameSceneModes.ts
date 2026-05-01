// @ts-nocheck
function installMethods(target: any, source: any): void {
	for (const name of Object.getOwnPropertyNames(source.prototype)) {
		if (name === 'constructor') continue
		Object.defineProperty(target.prototype, name, Object.getOwnPropertyDescriptor(source.prototype, name)!)
	}
}

export function installGameSceneModes(target: any): void { installMethods(target, GameSceneModesMethods) }

class GameSceneModesMethods {
	private setBuildModePaused(paused: boolean): void {
		if (this.isBuildModePaused === paused) return
		this.isBuildModePaused = paused
		if (paused) {
			this.playerInput?.clearWalkTarget()
			this.cameras.main.stopFollow()
			this.physics.world.pause()
			this.stopBuildModeActors()
		} else {
			this.physics.world.resume()
			if (this.playerNirv?.sprite) {
				this.cameras.main.startFollow(this.playerNirv.sprite, true, 0.08, 0.08)
			}
		}
	}

	private stopBuildModeActors(): void {
		this.playerNirv?.sprite?.setVelocity(0, 0)
		this.playerNirv?.updateAnimation(0, 0)
		for (const bot of this.botNirvs ?? []) {
			bot.nirv.sprite.setVelocity(0, 0)
			bot.nirv.updateAnimation(0, 0)
		}
	}
}
