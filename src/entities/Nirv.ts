import Phaser from 'phaser'
import { NirvBubbles } from './NirvBubbles'
import { NirvNeeds } from './NirvNeeds'
import { updateNirvAnimation } from './nirvAnimation'
import { getBedSleepWorldOffset } from './nirvSleepPose'

export type NirvVariant = 'm' | 'f' | 'f2' | 'f3'

export const NIRV_COLORS = [
  0xe8c547, // gold (player)
  0x4488ff, // blue
  0xff6644, // coral
  0x44dd88, // mint
  0xdd44aa, // pink
  0xff9933, // orange
  0x8866dd, // purple
  0x44cccc, // teal
]

export class Nirv {
  readonly sprite: Phaser.Physics.Arcade.Sprite
  readonly name: string
  readonly color: number
  readonly isPlayer: boolean
  private readonly needs = new NirvNeeds()
  private readonly knownNirvs = new Set<string>()
  private readonly variant: NirvVariant
  private lastDir = 'down'
  private isMoving = false
  private lyingDown = false
  private readonly bubbles: NirvBubbles
  private toiletExitPos: { x: number; y: number } | null = null

  constructor(
    scene: Phaser.Scene,
    name: string,
    colorIndex: number,
    x: number,
    y: number,
    isPlayer: boolean,
    variant: NirvVariant = 'm',
  ) {
    this.name = name
    this.color = NIRV_COLORS[colorIndex] ?? NIRV_COLORS[0]
    this.isPlayer = isPlayer
    this.variant = variant

    const textureKey = `${variant}_idle`
    this.sprite = scene.physics.add.sprite(x, y, textureKey, 16)
    this.sprite.setDepth(y)
    this.sprite.body!.setSize(20, 24)
    this.sprite.body!.setOffset(14, 20)
    this.bubbles = new NirvBubbles(scene, this.sprite)
  }

  get dehydrationRate(): number { return this.needs.dehydrationRate }
  get sleepyRate(): number { return this.needs.sleepyRate }
  get restThreshold(): number { return this.needs.restThreshold }
  get sleepRecharges(): number { return this.needs.sleepRecharges }
  get hungerStep(): number { return this.needs.hungerStep }
  get hungerThreshold(): number { return this.needs.hungerThreshold }
  get funDecayStep(): number { return this.needs.funDecayStep }
  get funThreshold(): number { return this.needs.funThreshold }
  get bladderIncreaseStep(): number { return this.needs.bladderIncreaseStep }
  get bladderLevelThreshold(): number { return this.needs.bladderLevelThreshold }
  get socialNeedIncrementStep(): number { return this.needs.socialNeedIncrementStep }
  getPosition(): { x: number; y: number } { return { x: this.sprite.x, y: this.sprite.y } }
  getHydrationLevel(): number { return this.needs.getHydrationLevel() }
  addHydration(amount: number): void { this.needs.addHydration(amount) }
  getSatiation(): number { return this.needs.getSatiation() }
  addSatiation(amount: number): void { this.needs.addSatiation(amount) }
  getRestLevel(): number { return this.needs.getRestLevel() }
  addRest(amount: number): void { this.needs.addRest(amount) }
  getFunLevel(): number { return this.needs.getFunLevel() }
  getFunThreshold(): number { return this.needs.funThreshold }
  addFun(amount: number): void { this.needs.addFun(amount) }
  getBladderLevel(): number { return this.needs.getBladderLevel() }
  getSocialNeed(): number { return this.needs.getSocialNeed() }
  relieveSocialNeed(amount: number): void { this.needs.relieveSocialNeed(amount) }
  knowsNirv(name: string): boolean { return this.knownNirvs.has(name) }
  getKnownNirvs(): string[] { return [...this.knownNirvs] }

  updateDepth(): void { this.sprite.setDepth(this.sprite.y) }
  applyMinuteDehydration(): void { this.needs.applyMinuteDehydration() }
  applyMinuteSatiation(): void { this.needs.applyMinuteSatiation() }
  applyMinuteRestDecay(): void { this.needs.applyMinuteRestDecay() }
  applyMinuteFunDecay(): void { this.needs.applyMinuteFunDecay() }
  applyMinuteBladder(): void { this.needs.applyMinuteBladder() }
  resetBladderAfterUse(): void { this.needs.resetBladderAfterUse() }
  applyMinuteSocialNeed(): void { this.needs.applyMinuteSocialNeed() }
  rememberKnownNirv(name: string): void { if (name !== this.name) this.knownNirvs.add(name) }
  showDrinkingBubble(): void { this.bubbles.showDrinkingBubble() }
  syncDrinkingBubblePosition(): void { this.bubbles.syncDrinkingBubblePosition() }
  hideDrinkingBubble(): void { this.bubbles.hideDrinkingBubble() }
  showSleepZzZ(): void { this.bubbles.showSleepZzZ() }
  syncSleepZzZPosition(): void { this.bubbles.syncSleepZzZPosition() }
  hideSleepZzZ(): void { this.bubbles.hideSleepZzZ() }
  showChatBubble(text: string): void { this.bubbles.showChatBubble(text) }
  syncChatBubblePosition(): void { this.bubbles.syncChatBubblePosition() }
  hideChatBubble(): void { this.bubbles.hideChatBubble() }

  updateAnimation(vx: number, vy: number): void {
    this.updateDepth()
    const next = updateNirvAnimation(
      this.sprite,
      this.variant,
      this.lyingDown,
      { isMoving: this.isMoving, lastDir: this.lastDir },
      vx,
      vy,
    )
    this.isMoving = next.isMoving
    this.lastDir = next.lastDir
  }

  enterToiletInterior(stationX: number, stationY: number): void {
    this.toiletExitPos = { x: this.sprite.x, y: this.sprite.y }
    this.sprite.setPosition(stationX, stationY)
    this.sprite.setDepth(stationY - 4)
    this.sprite.setVisible(false)
    this.hideDrinkingBubble()
    this.hideChatBubble()
  }

  /** Restore visibility and position after using toilet. */
  exitToilet(): void {
    if (this.toiletExitPos) {
      this.sprite.setPosition(this.toiletExitPos.x, this.toiletExitPos.y)
      this.toiletExitPos = null
    }
    this.sprite.setVisible(true)
    this.updateDepth()
  }

  setLyingDown(active: boolean): void {
    this.lyingDown = active
    if (active) {
      this.sprite.setRotation(Math.PI / 2)
      this.sprite.anims.stop()
    } else {
      this.sprite.setRotation(0)
    }
  }

  snapToBedSleepPose(bedX: number, bedY: number, bedRotation: 0 | 1): void {
    const o = getBedSleepWorldOffset(bedRotation)
    this.sprite.setPosition(bedX + o.dx, bedY + o.dy)
    this.setLyingDown(true)
  }
}
