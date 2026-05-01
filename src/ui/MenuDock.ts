import Phaser from 'phaser'

export type MenuTab = 'home' | 'shop' | 'work' | 'social' | 'nirvs'

export const BAR_WIDTH = 660
export const BAR_HEIGHT = 50
const TAB_W = 120
const TAB_H = 38
const TAB_GAP = 8

export interface TabButton {
  bg: Phaser.GameObjects.Graphics
  label: Phaser.GameObjects.Text
  zone: Phaser.GameObjects.Zone
}

export function buildMenuDock(
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container,
  onTabClicked: (tab: MenuTab) => void,
): Map<MenuTab, TabButton> {
  const buttons = new Map<MenuTab, TabButton>()
  const barBg = scene.add.graphics()
  barBg.fillStyle(0x101727, 0.94)
  barBg.fillRoundedRect(-BAR_WIDTH / 2, -BAR_HEIGHT - 4, BAR_WIDTH, BAR_HEIGHT + 6, 10)
  barBg.lineStyle(1, 0x2f3a55, 0.8)
  barBg.strokeRoundedRect(-BAR_WIDTH / 2, -BAR_HEIGHT - 4, BAR_WIDTH, BAR_HEIGHT + 6, 10)
  parent.add(barBg)

  const tabs: { tab: MenuTab; label: string }[] = [
    { tab: 'home', label: 'Home' },
    { tab: 'shop', label: 'Shop' },
    { tab: 'work', label: 'Work' },
    { tab: 'social', label: 'Social' },
    { tab: 'nirvs', label: 'Nirvs' },
  ]
  const totalW = tabs.length * TAB_W + (tabs.length - 1) * TAB_GAP
  const startX = -totalW / 2
  tabs.forEach((t, i) => {
    const tx = startX + i * (TAB_W + TAB_GAP) + TAB_W / 2
    const ty = -BAR_HEIGHT / 2 - 2
    const bg = scene.add.graphics().setPosition(tx, ty)
    const label = scene.add.text(tx, ty, t.label, {
      fontSize: '13px',
      color: '#d9e2ff',
      fontStyle: 'bold',
    }).setOrigin(0.5)
    const zone = scene.add.zone(tx, ty, TAB_W, TAB_H).setInteractive({ useHandCursor: true })
    zone.on('pointerdown', () => onTabClicked(t.tab))
    parent.add([bg, label, zone])
    buttons.set(t.tab, { bg, label, zone })
  })
  return buttons
}

export function refreshMenuDock(buttons: Map<MenuTab, TabButton>, active: MenuTab): void {
  buttons.forEach((btn, tab) => {
    const selected = tab === active
    btn.bg.clear()
    btn.bg.fillStyle(selected ? 0x2e3b5e : 0x1b2338, selected ? 1 : 0.88)
    btn.bg.fillRoundedRect(-TAB_W / 2, -TAB_H / 2, TAB_W, TAB_H, 7)
    btn.bg.lineStyle(1, selected ? 0xf0c85a : 0x323d59, selected ? 0.95 : 0.75)
    btn.bg.strokeRoundedRect(-TAB_W / 2, -TAB_H / 2, TAB_W, TAB_H, 7)
    btn.label.setColor(selected ? '#ffe08a' : '#aeb8d4')
  })
}
