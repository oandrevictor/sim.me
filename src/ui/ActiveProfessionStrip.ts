import Phaser from 'phaser'
import type { BotNirv } from '../entities/BotNirv'
import {
  BOT_WORK_ROLE_ORDER,
  getActiveWorkRole,
  getWorkRoleInfo,
  type BotWorkRole,
} from '../entities/botWorkRoles'
import { DEPTH_UI } from '../config/world'

const BADGE_H = 18
const GAP = 5

interface RoleCount {
  role: BotWorkRole
  count: number
}

/** Top-right compact summary of active work roles. */
export class ActiveProfessionStrip {
  private readonly container: Phaser.GameObjects.Container
  private signature = ''

  constructor(private readonly scene: Phaser.Scene) {
    this.container = scene.add.container(0, 0).setDepth(DEPTH_UI + 30)
    this.container.setVisible(false)
  }

  setPosition(x: number, y: number): void {
    this.container.setPosition(x, y)
  }

  refresh(bots: readonly BotNirv[]): void {
    const counts = this.collectCounts(bots)
    const signature = counts.map(entry => `${entry.role}:${entry.count}`).join('|')
    if (signature === this.signature) return
    this.signature = signature
    this.container.removeAll(true)
    this.container.setVisible(counts.length > 0)
    if (counts.length === 0) return

    const widths = counts.map(entry => this.badgeWidth(entry))
    const totalW = widths.reduce((sum, w) => sum + w, 0) + GAP * (widths.length - 1)
    let x = -totalW
    counts.forEach((entry, i) => {
      this.addBadge(entry, x, widths[i]!)
      x += widths[i]! + GAP
    })
  }

  private collectCounts(bots: readonly BotNirv[]): RoleCount[] {
    const counts = new Map<BotWorkRole, number>()
    for (const bot of bots) {
      const role = getActiveWorkRole(bot)
      if (!role) continue
      counts.set(role, (counts.get(role) ?? 0) + 1)
    }
    return BOT_WORK_ROLE_ORDER
      .map(role => ({ role, count: counts.get(role) ?? 0 }))
      .filter(entry => entry.count > 0)
  }

  private badgeWidth(entry: RoleCount): number {
    return entry.count > 9 ? 48 : 40
  }

  private addBadge(entry: RoleCount, x: number, width: number): void {
    const info = getWorkRoleInfo(entry.role)
    const bg = this.scene.add.graphics()
    bg.fillStyle(0x111827, 0.78)
    bg.fillRoundedRect(x, 0, width, BADGE_H, 5)
    bg.lineStyle(1, info.color, 0.95)
    bg.strokeRoundedRect(x, 0, width, BADGE_H, 5)

    const label = this.scene.add.text(x + width / 2, BADGE_H / 2, `${info.shortLabel} ${entry.count}`, {
      fontSize: '10px',
      color: '#f6f7fb',
      fontStyle: 'bold',
    }).setOrigin(0.5)

    this.container.add([bg, label])
  }
}
