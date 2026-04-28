import type { StageWorkBridge } from './WorkPanelStageSection'
import type { FarmWorkBridge } from './WorkPanelFarmSection'

export function emptyStageBridge(): StageWorkBridge {
  return {
    getPerformanceView: () => null,
    setStageAttraction: () => false,
    getBands: () => [],
    getPerformerBots: () => [],
    formBandFromFirstTwoPerformers: () => false,
    stageAllowsBand: () => true,
  }
}

export function emptyFarmBridge(): FarmWorkBridge {
  return {
    getFarmView: () => ({
      totalCrops: 0,
      cornCount: 0,
      farmerBotIds: [],
      bots: [],
      counts: { empty: 0, seeded: 0, early: 0, ready: 0 },
    }),
    setFarmerRole: () => {},
  }
}
