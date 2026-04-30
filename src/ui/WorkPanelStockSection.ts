import Phaser from 'phaser'
import type { StockWorkView } from '../systems/foodStockTypes'
import type { StagePanelHitTarget } from './WorkPanelStageSection'
import {
  LEFT_X,
  addBotName,
  addMetricChip,
  addRolePill,
  addSectionLabel,
} from './components/WorkPanelControls'

export interface StockWorkBridge {
  getStockView(): StockWorkView
  setStockerRole(botId: string, assigned: boolean): void
}

export interface StockPageControls {
  getPage: () => number
  setPage: (page: number) => void
}

const PAGE_SIZE = 5

export function addStockWorkSection(
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container,
  bridge: StockWorkBridge,
  hitTargets: StagePanelHitTarget[],
  pages: StockPageControls,
  startY: number,
): number {
  const view = bridge.getStockView()
  let y = addStockMetrics(scene, parent, view, startY)
  addSectionLabel(scene, parent, LEFT_X, y, 'Stockers')
  y += 18
  return addStockerRows(scene, parent, bridge, view, hitTargets, pages, y)
}

function addStockMetrics(
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container,
  view: StockWorkView,
  y: number,
): number {
  let x = LEFT_X
  x += addMetricChip(scene, parent, x, y, `Corn ${view.cornCount}`, '#f5d469') + 6
  for (const group of stockGroups(view)) {
    x += addMetricChip(scene, parent, x, y, `${group.label} ${group.stock}/${group.max}`) + 6
  }
  return y + 30
}

function addStockerRows(
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container,
  bridge: StockWorkBridge,
  view: StockWorkView,
  hitTargets: StagePanelHitTarget[],
  pages: StockPageControls,
  startY: number,
): number {
  const pageCount = Math.max(1, Math.ceil(view.bots.length / PAGE_SIZE))
  const page = Math.min(pages.getPage(), pageCount - 1)
  if (page !== pages.getPage()) pages.setPage(page)
  const bots = view.bots.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)
  bots.forEach((bot, i) => {
    const y = startY + i * 25
    const assigned = view.stockerBotIds.includes(bot.id)
    addBotName(scene, parent, bot, LEFT_X, y)
    let x = LEFT_X + 190
    x += addRolePill(scene, parent, hitTargets, x, y - 2, 'None', !assigned,
      () => bridge.setStockerRole(bot.id, false)) + 6
    addRolePill(scene, parent, hitTargets, x, y - 2, 'Stocker', assigned,
      () => bridge.setStockerRole(bot.id, true))
  })
  return addPager(scene, parent, hitTargets, pages, page, pageCount, startY + PAGE_SIZE * 25 + 2)
}

function addPager(
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container,
  hitTargets: StagePanelHitTarget[],
  pages: StockPageControls,
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

function stockGroups(view: StockWorkView): { label: string; stock: number; max: number }[] {
  const groups = new Map<string, { label: string; stock: number; max: number }>()
  for (const station of view.stations) {
    const group = groups.get(station.type) ?? { label: station.label, stock: 0, max: 0 }
    group.stock += station.stock
    group.max += station.maxStock
    groups.set(station.type, group)
  }
  return [...groups.values()]
}
