import Phaser from 'phaser'
import { CROP_SEEDS, cropSeedLabel, cropStageLabel, type CropStage } from '../data/crops'
import type { FarmWorkView } from '../systems/farmingTypes'
import type { StagePanelHitTarget } from './WorkPanelStageSection'
import {
  LEFT_X,
  addBotName,
  addMetricChipRows,
  addRolePill,
  addSectionLabel,
} from './components/WorkPanelControls'

export interface FarmWorkBridge {
  getFarmView(): FarmWorkView
  setFarmerRole(botId: string, assigned: boolean): void
}

export interface FarmPageControls {
  getPage: () => number
  setPage: (page: number) => void
}

const PAGE_SIZE = 5

export function addFarmWorkSection(
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container,
  bridge: FarmWorkBridge,
  hitTargets: StagePanelHitTarget[],
  pages: FarmPageControls,
  startY: number,
): number {
  const view = bridge.getFarmView()
  let y = addFarmMetrics(scene, parent, view, startY)
  addSectionLabel(scene, parent, LEFT_X, y, 'Farmers')
  y += 18
  return addFarmerRows(scene, parent, bridge, view, hitTargets, pages, y)
}

function addFarmMetrics(
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container,
  view: FarmWorkView,
  y: number,
): number {
  const cropChips: { label: string; color?: string }[] = CROP_SEEDS
    .filter(seed => (view.cropCounts[seed] ?? 0) > 0)
    .map(seed => ({ label: `${cropSeedLabel(seed)} ${view.cropCounts[seed]}`, color: '#f5d469' }))
  const chips = cropChips.length > 0 ? cropChips : [{ label: 'Food 0', color: '#f5d469' }]
  for (const stage of ['empty', 'seeded', 'early', 'ready'] as CropStage[]) {
    chips.push({ label: `${cropStageLabel(stage)} ${view.counts[stage]}` })
  }
  return addMetricChipRows(scene, parent, chips, y)
}

function addFarmerRows(
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container,
  bridge: FarmWorkBridge,
  view: FarmWorkView,
  hitTargets: StagePanelHitTarget[],
  pages: FarmPageControls,
  startY: number,
): number {
  const pageCount = Math.max(1, Math.ceil(view.bots.length / PAGE_SIZE))
  const page = Math.min(pages.getPage(), pageCount - 1)
  if (page !== pages.getPage()) pages.setPage(page)
  const bots = view.bots.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)
  const rowH = 25
  bots.forEach((bot, i) => {
    const y = startY + i * rowH
    const assigned = view.farmerBotIds.includes(bot.id)
    addBotName(scene, parent, bot, LEFT_X, y)
    let x = LEFT_X + 190
    x += addRolePill(scene, parent, hitTargets, x, y - 2, 'None', !assigned,
      () => bridge.setFarmerRole(bot.id, false)) + 6
    addRolePill(scene, parent, hitTargets, x, y - 2, 'Farmer', assigned,
      () => bridge.setFarmerRole(bot.id, true))
  })
  return addPager(scene, parent, hitTargets, pages, page, pageCount, startY + PAGE_SIZE * rowH + 2)
}

function addPager(
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container,
  hitTargets: StagePanelHitTarget[],
  pages: FarmPageControls,
  page: number,
  pageCount: number,
  y: number,
): number {
  if (pageCount <= 1) return y
  addRolePill(scene, parent, hitTargets, LEFT_X, y, 'Prev', false, () => pages.setPage(Math.max(0, page - 1)))
  parent.add(scene.add.text(LEFT_X + 58, y + 10, `${page + 1}/${pageCount}`, {
    fontSize: '10px',
    color: '#aeb8d4',
  }).setOrigin(0, 0.5))
  addRolePill(scene, parent, hitTargets, LEFT_X + 102, y, 'Next', false,
    () => pages.setPage(Math.min(pageCount - 1, page + 1)))
  return y + 24
}
