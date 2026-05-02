import Phaser from 'phaser'
import { BUILD_BAR_HEIGHT, BUILD_PANEL_HEIGHT, BUILD_PANEL_WIDTH } from './BuildPanel'
import { BAR_HEIGHT, BAR_WIDTH, type MenuTab } from './MenuDock'
import { SHOP_BAR_HEIGHT, SHOP_PANEL_HEIGHT, SHOP_PANEL_WIDTH } from './ShopPanelLayout'
import { WORK_PANEL_HEIGHT, WORK_PANEL_WIDTH } from './WorkPanel'
import { RELATIONSHIPS_PANEL_HEIGHT, RELATIONSHIPS_PANEL_WIDTH } from './RelationshipsPanel'
import { NIRVS_PANEL_HEIGHT, NIRVS_PANEL_WIDTH } from './NirvsPanel'

export function getMenuBarBounds(menuX: number, menuY: number): Phaser.Geom.Rectangle {
  return new Phaser.Geom.Rectangle(menuX - BAR_WIDTH / 2, menuY - BAR_HEIGHT, BAR_WIDTH, BAR_HEIGHT)
}

export function getMenuPanelBounds(
  activeTab: MenuTab,
  menuX: number,
  menuY: number,
): Phaser.Geom.Rectangle | null {
  const size = panelSize(activeTab)
  if (!size) return null
  return new Phaser.Geom.Rectangle(
    menuX - size.width / 2,
    menuY - panelBarHeight(activeTab) - size.height - 6,
    size.width,
    size.height,
  )
}

export function getInventoryDropBounds(
  activeTab: MenuTab,
  isInventoryMode: boolean,
  menuX: number,
  menuY: number,
): Phaser.Geom.Rectangle | null {
  if (activeTab !== 'shop' || !isInventoryMode) return null
  return getMenuPanelBounds(activeTab, menuX, menuY)
}

function panelSize(activeTab: MenuTab): { width: number; height: number } | null {
  if (activeTab === 'build') return { width: BUILD_PANEL_WIDTH, height: BUILD_PANEL_HEIGHT }
  if (activeTab === 'shop') return { width: SHOP_PANEL_WIDTH, height: SHOP_PANEL_HEIGHT }
  if (activeTab === 'work') return { width: WORK_PANEL_WIDTH, height: WORK_PANEL_HEIGHT }
  if (activeTab === 'social') return { width: RELATIONSHIPS_PANEL_WIDTH, height: RELATIONSHIPS_PANEL_HEIGHT }
  if (activeTab === 'nirvs') return { width: NIRVS_PANEL_WIDTH, height: NIRVS_PANEL_HEIGHT }
  return null
}

function panelBarHeight(activeTab: MenuTab): number {
  if (activeTab === 'build') return BUILD_BAR_HEIGHT
  if (activeTab === 'shop') return SHOP_BAR_HEIGHT
  return BAR_HEIGHT
}
