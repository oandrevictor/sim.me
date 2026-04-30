import Phaser from 'phaser'
import type { BotNirv } from '../../entities/BotNirv'
import type { StagePanelHitTarget } from '../WorkPanelStageSection'
import type { WorkContext } from '../workPanelTypes'

export const PANEL_W = 560
export const PANEL_H = 292
export const LEFT_X = -PANEL_W / 2 + 18

export function addContextTabs(
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container,
  contexts: WorkContext[],
  active: WorkContext,
  hitTargets: StagePanelHitTarget[],
  setActive: (ctx: WorkContext) => void,
): number {
  let x = LEFT_X
  const y = -PANEL_H + 38
  for (const ctx of contexts) {
    const selected = ctx === active
    const w = ctx === 'restaurant' ? 92 : 68
    const bg = scene.add.graphics()
    bg.fillStyle(selected ? 0x34405e : 0x20263a, selected ? 0.95 : 0.8)
    bg.fillRoundedRect(x, y, w, 24, 5)
    bg.lineStyle(1, selected ? 0xf0c85a : 0x3a435c, selected ? 0.9 : 0.65)
    bg.strokeRoundedRect(x, y, w, 24, 5)
    const label = scene.add.text(x + w / 2, y + 12, tabLabel(ctx), {
      fontSize: '11px',
      color: selected ? '#ffe08a' : '#aeb8d4',
      fontStyle: 'bold',
    }).setOrigin(0.5)
    const zone = scene.add.zone(x + w / 2, y + 12, w, 24)
    parent.add([bg, label, zone])
    hitTargets.push({
      getBounds: () => zone.getBounds(),
      action: () => setActive(ctx),
    })
    x += w + 6
  }
  return y + 36
}

export function addMetricChip(
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container,
  x: number,
  y: number,
  label: string,
  color = '#d8e0f0',
): number {
  const text = scene.add.text(x + 10, y + 9, label, { fontSize: '10px', color }).setOrigin(0, 0.5)
  const w = Math.max(52, Math.ceil(text.width) + 20)
  const bg = scene.add.graphics()
  bg.fillStyle(0x20283c, 0.88)
  bg.fillRoundedRect(x, y, w, 18, 5)
  bg.lineStyle(1, 0x3a455f, 0.7)
  bg.strokeRoundedRect(x, y, w, 18, 5)
  parent.add([bg, text])
  return w
}

export function addSectionLabel(
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container,
  x: number,
  y: number,
  label: string,
): void {
  parent.add(scene.add.text(x, y, label, {
    fontSize: '11px',
    color: '#f0c85a',
    fontStyle: 'bold',
  }).setOrigin(0, 0))
}

export function addBotName(
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container,
  bot: BotNirv,
  x: number,
  y: number,
): void {
  const dot = scene.add.graphics()
  dot.fillStyle(bot.nirv.color)
  dot.fillCircle(x + 6, y + 8, 5)
  const name = scene.add.text(x + 18, y, bot.nirv.name, {
    fontSize: '11px',
    color: '#f2f4ff',
    fontStyle: 'bold',
  }).setOrigin(0, 0)
  parent.add([dot, name])
}

export function addRolePill(
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container,
  hitTargets: StagePanelHitTarget[],
  x: number,
  y: number,
  label: string,
  selected: boolean,
  action: () => void,
  disabled = false,
): number {
  const w = Math.max(44, label.length * 7 + 18)
  const bg = scene.add.graphics()
  bg.fillStyle(disabled ? 0x171d2c : selected ? 0x3d5f74 : 0x20283c, 0.95)
  bg.fillRoundedRect(x, y, w, 20, 5)
  bg.lineStyle(1, disabled ? 0x293248 : selected ? 0x77d2ff : 0x3a455f, disabled ? 0.55 : selected ? 0.95 : 0.75)
  bg.strokeRoundedRect(x, y, w, 20, 5)
  const text = scene.add.text(x + w / 2, y + 10, label, {
    fontSize: '10px',
    color: disabled ? '#58637a' : selected ? '#d8f4ff' : '#95a6c8',
    fontStyle: selected ? 'bold' : '',
  }).setOrigin(0.5)
  const zone = scene.add.zone(x + w / 2, y + 10, w, 20)
  parent.add([bg, text, zone])
  if (!disabled) hitTargets.push({ getBounds: () => zone.getBounds(), action })
  return w
}

function tabLabel(ctx: WorkContext): string {
  if (ctx === 'stage') return 'Stage'
  if (ctx === 'restaurant') return 'Restaurant'
  if (ctx === 'farm') return 'Farm'
  return 'Stock'
}
