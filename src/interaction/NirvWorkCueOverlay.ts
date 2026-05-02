import Phaser from 'phaser'
import type { BotNirv } from '../entities/BotNirv'
import {
  getActiveWorkRole,
  getWorkRoleInfo,
  type BotWorkRole,
} from '../entities/botWorkRoles'
import { DEPTH_UI } from '../config/world'

interface Cue {
  container: Phaser.GameObjects.Container
  bg: Phaser.GameObjects.Graphics
  label: Phaser.GameObjects.Text
  role: BotWorkRole | null
}

const BADGE_W = 30
const BADGE_H = 16

/** Maintains cached world-space profession badges above bot Nirvs. */
export class NirvWorkCueOverlay {
  private readonly cues = new Map<string, Cue>()

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly getAssignedRole: (bot: BotNirv) => BotWorkRole | null,
  ) {}

  update(
    bots: readonly BotNirv[],
    hoveredBotId: string | null,
    hideHoverAssigned: boolean,
  ): void {
    const live = new Set<string>()
    for (const bot of bots) {
      live.add(bot.id)
      this.updateBotCue(bot, hoveredBotId, hideHoverAssigned)
    }
    for (const [botId, cue] of this.cues) {
      if (live.has(botId)) continue
      cue.container.destroy(true)
      this.cues.delete(botId)
    }
  }

  private updateBotCue(
    bot: BotNirv,
    hoveredBotId: string | null,
    hideHoverAssigned: boolean,
  ): void {
    const activeRole = getActiveWorkRole(bot)
    const assignedRole = !hideHoverAssigned && hoveredBotId === bot.id
      ? this.getAssignedRole(bot)
      : null
    const role = activeRole ?? assignedRole
    const cue = this.ensureCue(bot.id)
    const visible = role !== null && bot.nirv.sprite.visible

    cue.container.setVisible(visible)
    if (!visible || !role) return
    if (cue.role !== role) this.drawCue(cue, role)

    cue.container.setAlpha(activeRole ? 1 : 0.82)
    cue.container.setPosition(bot.nirv.sprite.x, bot.nirv.sprite.y - 34)
    cue.container.setDepth(DEPTH_UI + 18)
  }

  private ensureCue(botId: string): Cue {
    const current = this.cues.get(botId)
    if (current) return current

    const bg = this.scene.add.graphics()
    const label = this.scene.add.text(0, 0, '', {
      fontSize: '10px',
      color: '#111827',
      fontStyle: 'bold',
    }).setOrigin(0.5)
    const container = this.scene.add.container(0, 0, [bg, label])
    container.setVisible(false)
    const cue = { container, bg, label, role: null }
    this.cues.set(botId, cue)
    return cue
  }

  private drawCue(cue: Cue, role: BotWorkRole): void {
    const info = getWorkRoleInfo(role)
    cue.role = role
    cue.bg.clear()
    cue.bg.fillStyle(info.color, 0.94)
    cue.bg.fillRoundedRect(-BADGE_W / 2, -BADGE_H / 2, BADGE_W, BADGE_H, 4)
    cue.bg.fillTriangle(-4, BADGE_H / 2 - 1, 4, BADGE_H / 2 - 1, 0, BADGE_H / 2 + 5)
    cue.bg.lineStyle(1, 0x111827, 0.75)
    cue.bg.strokeRoundedRect(-BADGE_W / 2, -BADGE_H / 2, BADGE_W, BADGE_H, 4)
    cue.label.setText(info.shortLabel)
  }
}
