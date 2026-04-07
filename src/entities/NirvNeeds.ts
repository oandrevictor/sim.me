import { HYDRATION_START, sampleDehydrationRate } from './nirvHydration'
import { SATIATION_START, sampleHungerStep, sampleHungerThreshold } from './nirvHunger'
import { FUN_LEVEL_START, sampleFunDecayStep, sampleFunThreshold } from './nirvFun'
import {
  REST_START,
  REST_DECAY_MIN,
  REST_DECAY_MAX,
  sampleSleepRecharges,
  sampleSleepyRate,
  sampleRestThreshold,
} from './nirvSleep'
import {
  BLADDER_START,
  sampleBladderIncreaseStep,
  sampleBladderThreshold,
} from './nirvBladder'
import { SOCIAL_NEED_START, sampleSocialNeedIncrementStep } from './nirvSocial'

/** Holds all per-Nirv need values and their minute-based progression rules. */
export class NirvNeeds {
  readonly dehydrationRate = sampleDehydrationRate()
  readonly sleepyRate = sampleSleepyRate()
  readonly restThreshold = sampleRestThreshold()
  readonly sleepRecharges = sampleSleepRecharges()
  readonly hungerStep = sampleHungerStep()
  readonly hungerThreshold = sampleHungerThreshold()
  readonly funDecayStep = sampleFunDecayStep()
  readonly funThreshold = sampleFunThreshold()
  readonly bladderIncreaseStep = sampleBladderIncreaseStep()
  readonly bladderLevelThreshold = sampleBladderThreshold()
  readonly socialNeedIncrementStep = sampleSocialNeedIncrementStep()
  private hydrationLevel = HYDRATION_START
  private restLevel = REST_START
  private satiation = SATIATION_START
  private funLevel = FUN_LEVEL_START
  private bladderLevel = BLADDER_START
  private socialNeed = SOCIAL_NEED_START

  getHydrationLevel(): number { return this.hydrationLevel }
  applyMinuteDehydration(): void {
    this.hydrationLevel = Math.max(0, this.hydrationLevel - this.dehydrationRate * 100)
  }
  addHydration(amount: number): void {
    this.hydrationLevel = Math.min(100, this.hydrationLevel + amount)
  }

  getSatiation(): number { return this.satiation }
  applyMinuteSatiation(): void {
    this.satiation = Math.max(0, this.satiation - this.hungerStep)
  }
  addSatiation(amount: number): void {
    this.satiation = Math.min(100, this.satiation + amount)
  }

  getRestLevel(): number { return this.restLevel }
  applyMinuteRestDecay(): void {
    const raw = this.restLevel * this.sleepyRate
    const decrease = Math.max(REST_DECAY_MIN, Math.min(REST_DECAY_MAX, this.restLevel - raw))
    this.restLevel = Math.max(0, this.restLevel - decrease)
  }
  addRest(amount: number): void {
    this.restLevel = Math.min(100, this.restLevel + amount)
  }

  getFunLevel(): number { return this.funLevel }
  applyMinuteFunDecay(): void {
    this.funLevel = Math.max(0, this.funLevel - this.funDecayStep)
  }
  addFun(amount: number): void {
    this.funLevel = Math.min(100, this.funLevel + amount)
  }

  getBladderLevel(): number { return this.bladderLevel }
  applyMinuteBladder(): void {
    this.bladderLevel = Math.min(100, this.bladderLevel + this.bladderIncreaseStep)
  }
  resetBladderAfterUse(): void {
    this.bladderLevel = 0
  }

  getSocialNeed(): number { return this.socialNeed }
  applyMinuteSocialNeed(): void {
    this.socialNeed = Math.min(100, this.socialNeed + this.socialNeedIncrementStep)
  }
  relieveSocialNeed(amount: number): void {
    this.socialNeed = Math.max(0, this.socialNeed - amount)
  }
}
