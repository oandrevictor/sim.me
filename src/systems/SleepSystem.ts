import Phaser from 'phaser'
import { TILE_W } from '../utils/isoGrid'
import { isHouseState, isWorkJobState, type BotNirv } from '../entities/BotNirv'
import type { Nirv } from '../entities/Nirv'
import { CRITICAL_REST_THRESHOLD } from '../entities/nirvSleep'
import { CRITICAL_HYDRATION_THRESHOLD } from '../entities/nirvHydration'
import type { RestaurantSystem } from './RestaurantSystem'

const CHECK_INTERVAL_MS = 2000
const STATION_REACH_PX = 32

type PlayerBedPhase = 'awake' | 'walking' | 'sleeping'

interface BedStation {
  sprite: Phaser.GameObjects.Sprite
  x: number
  y: number
  /** Placement rotation 0 = left texture, 1 = right (mirrors sleep offset). */
  rotation: 0 | 1
  occupant: BotNirv | null
  /** Player walking to this bed or sleeping here (reserves bed for bots). */
  playerOccupant: boolean
}

export class SleepSystem {
  private beds: BedStation[] = []
  private bots: BotNirv[]
  private restaurant: RestaurantSystem
  private getPlayer: () => Nirv
  private assignAccum = 0
  private playerPhase: PlayerBedPhase = 'awake'
  private playerTargetBed: BedStation | null = null
  private schedule: import('./ScheduleSystem').ScheduleSystem | null = null

  setSchedule(s: import('./ScheduleSystem').ScheduleSystem): void { this.schedule = s }

  constructor(
    bots: BotNirv[],
    restaurant: RestaurantSystem,
    getPlayer: () => Nirv,
    private readonly canBotUseStation: (bot: BotNirv, x: number, y: number) => boolean = () => true,
    private readonly canPlayerUseStation: (x: number, y: number) => boolean = () => true,
    private readonly canBotInteractWithStation: (bot: BotNirv, x: number, y: number) => boolean = () => true,
    private readonly canPlayerInteractWithStation: (x: number, y: number) => boolean = () => true,
  ) {
    this.bots = bots
    this.restaurant = restaurant
    this.getPlayer = getPlayer
  }

  isPlayerSleeping(): boolean {
    return this.playerPhase === 'sleeping'
  }

  /** Stand up (e.g. before drinking) without changing rest. */
  wakePlayerFromBed(): void {
    if (this.playerPhase !== 'sleeping') return
    this.finishPlayerSleep()
  }

  /** Cancel reserved bed when player moves manually (keyboard). */
  cancelPlayerWalkToBed(): void {
    if (this.playerPhase !== 'walking' || !this.playerTargetBed) return
    this.playerTargetBed.playerOccupant = false
    this.playerTargetBed = null
    this.playerPhase = 'awake'
  }

  tryInteractBed(
    bedSprite: Phaser.GameObjects.Sprite,
    bedX: number,
    bedY: number,
    playerNirv: Nirv,
    playerSprite: Phaser.Physics.Arcade.Sprite,
    setWalkTarget: (tx: number, ty: number) => void,
  ): void {
    if (this.playerPhase !== 'awake') return
    if (!this.canPlayerUseStation(bedX, bedY)) return
    // Manual tap: allow sleep whenever not fully rested (bots still use threshold in tryAssignSleepyBots).
    if (playerNirv.getRestLevel() >= 100) return

    const bed = this.beds.find(b => b.sprite === bedSprite)
    if (!bed || bed.occupant || bed.playerOccupant) return

    const dist = Phaser.Math.Distance.Between(playerSprite.x, playerSprite.y, bedX, bedY)
    if (dist > STATION_REACH_PX) {
      setWalkTarget(bedX, bedY)
      this.playerTargetBed = bed
      this.playerPhase = 'walking'
      bed.playerOccupant = true
    } else {
      if (!this.canPlayerInteractWithStation(bedX, bedY)) return
      this.startPlayerSleepAtBed(bed)
    }
  }

  registerBed(sprite: Phaser.GameObjects.Sprite, x: number, y: number, rotation = 0): void {
    const rot = (Math.round(rotation) % 2) as 0 | 1
    this.beds.push({ sprite, x, y, rotation: rot, occupant: null, playerOccupant: false })
  }

  unregisterBed(sprite: Phaser.GameObjects.Sprite): void {
    const idx = this.beds.findIndex(b => b.sprite === sprite)
    if (idx === -1) return
    const st = this.beds[idx]
    if (st.occupant) {
      st.occupant.cancelSleep()
      st.occupant = null
    }
    if (st.playerOccupant) this.clearPlayerBedState(st)
    this.beds.splice(idx, 1)
  }

  private clearPlayerBedState(st: BedStation): void {
    if (this.playerPhase === 'walking' && this.playerTargetBed === st) {
      this.playerTargetBed = null
      this.playerPhase = 'awake'
    }
    if (this.playerPhase === 'sleeping') {
      const p = this.getPlayer()
      p.setLyingDown(false)
      p.hideSleepZzZ()
      this.playerPhase = 'awake'
    }
    st.playerOccupant = false
  }

  tickRestMinute(): void {
    for (const st of this.beds) {
      const bot = st.occupant
      if (!bot || bot.state !== 'sleeping') continue
      bot.nirv.addRest(bot.nirv.sleepRecharges)
    }
    if (this.playerPhase === 'sleeping') {
      const p = this.getPlayer()
      p.addRest(p.sleepRecharges)
    }
  }

  updateBeds(delta: number): void {
    this.updatePlayerWalkToBed()
    this.repairBedOccupants()
    this.checkArrivals()
    this.releaseFinishedSleeping()
    this.releasePlayerWhenRested()

    this.assignAccum += delta
    if (this.assignAccum < CHECK_INTERVAL_MS) return
    this.assignAccum = 0
    this.tryAssignSleepyBots()
  }

  syncPlayerSleepLabel(): void {
    if (this.playerPhase === 'sleeping') this.getPlayer().syncSleepZzZPosition()
  }

  private updatePlayerWalkToBed(): void {
    if (this.playerPhase !== 'walking' || !this.playerTargetBed) return
    const p = this.getPlayer().sprite
    const bed = this.playerTargetBed
    const d = Phaser.Math.Distance.Between(p.x, p.y, bed.x, bed.y)
    if (d < STATION_REACH_PX && this.canPlayerInteractWithStation(bed.x, bed.y)) this.startPlayerSleepAtBed(bed)
  }

  private startPlayerSleepAtBed(bed: BedStation): void {
    bed.playerOccupant = true
    this.playerPhase = 'sleeping'
    this.playerTargetBed = null
    const p = this.getPlayer()
    p.snapToBedSleepPose(bed.x, bed.y, bed.rotation)
    p.showSleepZzZ()
  }

  private releasePlayerWhenRested(): void {
    if (this.playerPhase !== 'sleeping') return
    if (this.getPlayer().getRestLevel() < 100) return
    this.finishPlayerSleep()
  }

  private finishPlayerSleep(): void {
    const p = this.getPlayer()
    p.setLyingDown(false)
    p.hideSleepZzZ()
    for (const st of this.beds) {
      if (st.playerOccupant) {
        st.playerOccupant = false
        break
      }
    }
    this.playerPhase = 'awake'
  }

  private repairBedOccupants(): void {
    for (const st of this.beds) {
      if (!st.occupant) continue
      const b = st.occupant
      if (b.state !== 'walking_to_bed' && b.state !== 'sleeping') st.occupant = null
    }
  }

  private checkArrivals(): void {
    for (const st of this.beds) {
      if (!st.occupant) continue
      const bot = st.occupant
      if (bot.state !== 'walking_to_bed') continue
      if (!this.canBotInteractWithStation(bot, st.x, st.y)) continue
      const d = Phaser.Math.Distance.Between(bot.nirv.sprite.x, bot.nirv.sprite.y, st.x, st.y)
      if (d < STATION_REACH_PX) bot.arriveAtBed(st.x, st.y, st.rotation)
    }
  }

  private releaseFinishedSleeping(): void {
    for (const st of this.beds) {
      if (!st.occupant) continue
      const bot = st.occupant
      if (bot.state !== 'sleeping') continue
      if (bot.nirv.getRestLevel() < 100) continue
      bot.finishSleeping()
      st.occupant = null
    }
  }

  private findBedForBot(bot: BotNirv): BedStation | null {
    for (const st of this.beds) {
      if (st.occupant === bot) return st
    }
    return null
  }

  private tryAssignSleepyBots(): void {
    if (this.beds.length === 0) return

    for (const bot of this.bots) {
      const r = bot.nirv.getRestLevel()
      const sleepWindow = this.schedule?.isSleepWindow(bot) ?? false
      const effectiveThreshold = sleepWindow ? Math.max(bot.nirv.restThreshold, 80) : bot.nirv.restThreshold
      if (r > effectiveThreshold) continue
      if (this.findBedForBot(bot)) continue

      const stBot = bot.state
      if (stBot === 'walking_to_bed' || stBot === 'sleeping') continue
      if (stBot === 'walking_to_perform' || stBot === 'performing_on_stage') continue
      if (stBot === 'drinking_water') continue

      if (bot.nirv.getHydrationLevel() <= CRITICAL_HYDRATION_THRESHOLD) continue
      const bladder = bot.nirv.getBladderLevel()
      const bt = bot.nirv.bladderLevelThreshold
      if (bladder <= 0 || bladder <= bt - 10) continue

      const critical = r <= CRITICAL_REST_THRESHOLD
      if (!critical) {
        if (stBot !== 'walking' && stBot !== 'waiting' && stBot !== 'inside_house' && stBot !== 'walking_into_house') continue
      } else {
        bot.cancelSatiationQueue()
        this.restaurant.releaseChairForBot(bot)
        if (stBot === 'watching_stage') bot.leaveStage()
        else if (stBot === 'walking_to_stage') bot.abortStageApproach()
        else if (stBot === 'walking_to_chair') bot.abortWalkingToChair()
        else if (stBot === 'seated' || stBot === 'awaiting_service' || stBot === 'eating') bot.interruptSeatForHydration()
        else if (
          stBot === 'walking_to_water' ||
          stBot === 'walking_to_water_queue' ||
          stBot === 'waiting_at_water_queue'
        ) bot.cancelWaterQueue()
        else if (
          stBot === 'walking_to_toilet' ||
          stBot === 'walking_to_toilet_queue' ||
          stBot === 'waiting_at_toilet_queue' ||
          stBot === 'using_toilet'
        ) bot.cancelToiletQueue()
        else if (isHouseState(stBot) && stBot !== 'inside_house' && stBot !== 'walking_into_house') bot.cancelHouseFlow()
        else if (isWorkJobState(stBot)) bot.abortWorkDuty()
      }

      let best: BedStation | null = null
      let bestD = Infinity
      for (const st of this.beds) {
        if (st.occupant || st.playerOccupant) continue
        if (!this.canBotUseStation(bot, st.x, st.y)) continue
        const d = Phaser.Math.Distance.Between(bot.nirv.sprite.x, bot.nirv.sprite.y, st.x, st.y)
        if (d < TILE_W * 15 && d < bestD) {
          bestD = d
          best = st
        }
      }
      if (!best) continue

      best.occupant = bot
      bot.redirectToBed(best.x, best.y)
    }
  }
}
