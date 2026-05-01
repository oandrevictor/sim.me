
// @ts-nocheck
import * as Phaser from 'phaser';

/* START OF COMPILED CODE */

/* START-USER-IMPORTS */
import { MenuUI } from '../ui/MenuUI'
import type { StageWorkBridge } from '../ui/WorkPanelStageSection'
import type GameScene from './GameScene'
/* END-USER-IMPORTS */

export default class UIScene extends Phaser.Scene {

	constructor() {
		super("UIScene");

		/* START-USER-CTR-CODE */
		/* END-USER-CTR-CODE */
	}

	editorCreate(): void {

		this.events.emit("scene-awake");
	}

	/* START-USER-CODE */

	menuUI!: MenuUI
	private helpText!: Phaser.GameObjects.Text
	private clockText!: Phaser.GameObjects.Text
	private gameScene!: GameScene

	create(): void {
		this.editorCreate()
		const gameScene = this.scene.get('GameScene') as GameScene
		this.gameScene = gameScene

		this.scene.moveAbove('GameScene')

		this.menuUI = new MenuUI(this, gameScene.events)
		this.positionUI()

		const stageBridge: StageWorkBridge = {
			getPerformanceView: id => gameScene.getStagePerformanceView(id),
			setStageAttraction: (id, a) => gameScene.setStageAttraction(id, a),
			getBands: () => gameScene.getBandsForUI(),
			getPerformerBots: () => gameScene.getPerformerBotsForUI(),
			formBandFromFirstTwoPerformers: () => gameScene.formBandFromFirstTwoPerformers(),
			stageAllowsBand: id => gameScene.stageAllowsBandForStage(id),
		}

		const restaurantStaffBridge = {
			getStaffView: () => gameScene.getRestaurantStaffUiView(),
			setStaffRole: (buildingId: string, botId: string, role: 'none' | 'chef' | 'waiter') =>
				gameScene.setRestaurantStaffRole(buildingId, botId, role),
		}

		const farmBridge = {
			getFarmView: () => gameScene.getFarmWorkView(),
			setFarmerRole: (botId: string, assigned: boolean) => gameScene.setFarmerRole(botId, assigned),
		}

		const stockBridge = {
			getStockView: () => gameScene.getStockWorkView(),
			setStockerRole: (botId: string, assigned: boolean) => gameScene.setStockerRole(botId, assigned),
		}

		this.menuUI.setProviders(
			() => gameScene.getBotNirvs(),
			() => gameScene.isPlayerInsideRestaurant(),
			() => gameScene.getPlayerStage(),
			(stageId) => gameScene.getStageWatchers(stageId),
			(stageId) => gameScene.getStagePerformers(stageId),
			stageBridge,
			restaurantStaffBridge,
			farmBridge,
			stockBridge,
		)

		this.helpText = this.add.text(10, 10, 'Move: WASD / Arrows  |  Shop: place & move objects  |  R: rotate  |  ESC to cancel', {
			fontSize: '12px',
			color: '#ffffff',
		})
		this.helpText.setAlpha(0.6)
		this.clockText = this.add.text(this.scale.width - 12, 10, gameScene.getClockLabel(), {
			fontSize: '18px',
			color: '#ffffff',
			fontStyle: 'bold',
			backgroundColor: 'rgba(20,20,32,0.72)',
			padding: { x: 8, y: 4 },
		}).setOrigin(1, 0)

		this.scale.on('resize', () => this.positionUI())
	}

	update(): void {
		this.menuUI.updateWorkPanel()
		this.clockText.setText(this.gameScene.getClockLabel())
	}

	private positionUI(): void {
		this.menuUI.setPosition(
			this.scale.width / 2,
			this.scale.height,
		)
		this.clockText?.setPosition(this.scale.width - 12, 10)
	}

	/* END-USER-CODE */
}

/* END OF COMPILED CODE */
