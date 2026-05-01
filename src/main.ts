import Phaser from "phaser";
import GameScene from "./scenes/GameScene";
import UIScene from "./scenes/UIScene";
import Preload from "./scenes/Preload";
import { hydrateSaveCache } from "./storage/saveCache";
import { SaveStore } from "./storage/SaveStore";

class Boot extends Phaser.Scene {

    constructor() {
        super("Boot");
    }

    preload() {

        this.load.pack("pack", "assets/preload-asset-pack.json");
    }

    create() {

       this.scene.start("Preload");
    }
}

window.addEventListener('load', async function () {

	await hydrateSaveCache();

	const game = new Phaser.Game({
		width: window.innerWidth,
		height: window.innerHeight,
		backgroundColor: "#2f2f2f",
		parent: "game-container",
		scale: {
			mode: Phaser.Scale.ScaleModes.RESIZE,
			autoCenter: Phaser.Scale.Center.NO_CENTER
		},
		physics: {
			default: 'arcade',
			arcade: { debug: false }
		},
		scene: [Boot, Preload, GameScene, UIScene]
	});

	game.scene.start("Boot");
});

// Best-effort flush of pending writes when the tab is hidden or unloaded.
window.addEventListener('visibilitychange', () => {
	if (document.visibilityState === 'hidden') {
		void SaveStore.flush();
	}
});
window.addEventListener('beforeunload', () => {
	void SaveStore.flush();
});
