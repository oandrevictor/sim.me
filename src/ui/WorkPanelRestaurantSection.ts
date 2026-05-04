import Phaser from 'phaser'
import type { BotNirv } from '../entities/BotNirv'
import { getBotStatusColor, getBotStatusLabel } from './statusUtils'
import type { StagePanelHitTarget } from './WorkPanelStageSection'
import type { RestaurantStaffBridge, RestaurantStaffUiView } from './workPanelTypes'
import {
  LEFT_X,
  addBotName,
  addMetricChip,
  addRolePill,
  addSectionLabel,
} from './components/WorkPanelControls'

const PAGE_SIZE = 5

export interface RestaurantPageControls {
  getPage: () => number
  setPage: (page: number) => void
}

export function addRestaurantWorkSection(
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container,
  bridge: RestaurantStaffBridge | null,
  hitTargets: StagePanelHitTarget[],
  pages: RestaurantPageControls,
  startY: number,
): number {
  const view = bridge?.getStaffView() ?? null
  if (!view) return addEmpty(scene, parent, startY)
  let y = addMetrics(scene, parent, view, startY)
  addSectionLabel(scene, parent, LEFT_X, y, 'Staff')
  y += 18
  return addStaffRows(scene, parent, bridge!, view, hitTargets, pages, y)
}

function addMetrics(
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container,
  view: RestaurantStaffUiView,
  y: number,
): number {
  let x = LEFT_X
  x += addMetricChip(scene, parent, x, y, `Chefs ${view.chefIds.length}/${view.maxChefs}`, '#ffc887') + 6
  x += addMetricChip(scene, parent, x, y, `Waiters ${view.waiterIds.length}/${view.maxWaiters}`, '#a8c8ff') + 6
  x += addMetricChip(scene, parent, x, y, `Stoves ${view.stoves}`, '#d8e0f0') + 6
  addMetricChip(scene, parent, x, y, `Tables ${view.tables}`, '#d8e0f0')
  return y + 30
}

function addStaffRows(
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container,
  bridge: RestaurantStaffBridge,
  view: RestaurantStaffUiView,
  hitTargets: StagePanelHitTarget[],
  pages: RestaurantPageControls,
  startY: number,
): number {
  const pageCount = Math.max(1, Math.ceil(view.bots.length / PAGE_SIZE))
  const page = Math.min(pages.getPage(), pageCount - 1)
  if (page !== pages.getPage()) pages.setPage(page)
  const bots = view.bots.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)
  const rowH = 27
  bots.forEach((bot, i) => {
    const y = startY + i * rowH
    addBotName(scene, parent, bot, LEFT_X, y)
    const role = view.chefIds.includes(bot.id) ? 'chef' : view.waiterIds.includes(bot.id) ? 'waiter' : 'none'
    const chefDisabled = role !== 'chef' && view.chefIds.length >= view.maxChefs
    const waiterDisabled = role !== 'waiter' && view.waiterIds.length >= view.maxWaiters
    let x = LEFT_X + 180
    x += addRolePill(scene, parent, hitTargets, x, y - 2, 'None', role === 'none',
      () => bridge.setStaffRole(view.buildingId, bot.id, 'none')) + 6
    x += addRolePill(scene, parent, hitTargets, x, y - 2, 'Chef', role === 'chef',
      () => bridge.setStaffRole(view.buildingId, bot.id, 'chef'), chefDisabled) + 6
    addRolePill(scene, parent, hitTargets, x, y - 2, 'Wait', role === 'waiter',
      () => bridge.setStaffRole(view.buildingId, bot.id, 'waiter'), waiterDisabled)
  })
  return addPager(scene, parent, hitTargets, pages, page, pageCount, startY + PAGE_SIZE * rowH + 2)
}

function addPager(
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container,
  hitTargets: StagePanelHitTarget[],
  pages: RestaurantPageControls,
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

function addEmpty(scene: Phaser.Scene, parent: Phaser.GameObjects.Container, y: number): number {
  parent.add(scene.add.text(LEFT_X, y, 'Stand inside a restaurant to manage staff.', {
    fontSize: '12px',
    color: '#8f9ab8',
  }).setOrigin(0, 0))
  return y + 22
}

export function addCustomerList(
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container,
  bots: readonly BotNirv[],
  startY: number,
): void {
  addSectionLabel(scene, parent, LEFT_X, startY, 'Customers')
  const shown = bots.slice(0, 3)
  if (shown.length === 0) {
    parent.add(scene.add.text(LEFT_X, startY + 18, 'No customers right now', {
      fontSize: '11px',
      color: '#8f9ab8',
    }).setOrigin(0, 0))
    return
  }
  shown.forEach((bot, i) => {
    const y = startY + 18 + i * 22
    addBotName(scene, parent, bot, LEFT_X, y)
    parent.add(scene.add.text(LEFT_X + 176, y, getBotStatusLabel(bot.state), {
      fontSize: '10px',
      color: getBotStatusColor(bot.state),
    }).setOrigin(0, 0))
  })
}
