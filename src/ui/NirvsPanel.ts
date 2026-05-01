import Phaser from 'phaser'
import type { BotNirv } from '../entities/BotNirv'
import type { Building } from '../entities/Building'
import type { Nirv } from '../entities/Nirv'
import type { RelationshipEvent, RelationshipSystem, RelationshipStage } from '../systems/RelationshipSystem'
import { createPanelBackground } from './components/Panel'
import { getBotStatusColor, getBotStatusLabel } from './statusUtils'
import { relationshipEventLabel } from './relationshipEventLabels'

export const NIRVS_PANEL_WIDTH = 600
export const NIRVS_PANEL_HEIGHT = 380
const BAR_HEIGHT = 44

const LIST_W = 220
const ROW_H = 26
const HEADER_H = 38
const PAD_X = 12

const STAGE_LABEL: Record<RelationshipStage, string> = {
  acquaintance: 'Acquaintance',
  colleague: 'Colleague',
  friend: 'Friend',
  lover: 'Lover',
  dating: 'Dating',
  engaged: 'Engaged',
  married: 'Married',
}

interface NirvEntry {
  id: string
  name: string
  color: number
  bot: BotNirv | null
  isPlayer: boolean
}

export class NirvsPanel {
  readonly container: Phaser.GameObjects.Container
  private listLayer!: Phaser.GameObjects.Container
  private detailLayer!: Phaser.GameObjects.Container
  private selectedId: string | null = null

  private getBots: () => readonly BotNirv[] = () => []
  private getPlayer: () => Nirv | null = () => null
  private getBuildings: () => readonly Building[] = () => []
  private getRelationships: () => RelationshipSystem | null = () => null

  constructor(scene: Phaser.Scene) {
    this.container = scene.add.container(0, -BAR_HEIGHT - 8)
    this.container.setVisible(false)

    const w = NIRVS_PANEL_WIDTH
    const h = NIRVS_PANEL_HEIGHT
    const bg = createPanelBackground(scene, w, h, -w / 2, -h - 6)
    this.container.add(bg)

    const title = scene.add.text(-w / 2 + PAD_X, -h - 6 + 12, 'Nirvs', {
      fontSize: '15px', color: '#ffe08a', fontStyle: 'bold',
    })
    this.container.add(title)

    const divider = scene.add.graphics()
    divider.lineStyle(1, 0x2f3a55, 0.8)
    divider.lineBetween(-w / 2 + LIST_W, -h - 6 + HEADER_H, -w / 2 + LIST_W, -h - 6 + h - 8)
    this.container.add(divider)

    this.listLayer = scene.add.container(0, 0)
    this.detailLayer = scene.add.container(0, 0)
    this.container.add([this.listLayer, this.detailLayer])
  }

  setProviders(
    getPlayer: () => Nirv | null,
    getBots: () => readonly BotNirv[],
    getBuildings: () => readonly Building[],
    getRelationships: () => RelationshipSystem | null,
  ): void {
    this.getPlayer = getPlayer
    this.getBots = getBots
    this.getBuildings = getBuildings
    this.getRelationships = getRelationships
  }

  refresh(): void {
    this.listLayer.removeAll(true)
    this.detailLayer.removeAll(true)
    const entries = this.collectEntries()
    if (entries.length === 0) return
    if (!this.selectedId || !entries.some(e => e.id === this.selectedId)) {
      this.selectedId = entries[0]!.id
    }
    this.renderList(entries)
    const selected = entries.find(e => e.id === this.selectedId) ?? null
    if (selected) this.renderDetail(selected)
  }

  private collectEntries(): NirvEntry[] {
    const entries: NirvEntry[] = []
    const player = this.getPlayer()
    if (player) entries.push({ id: 'player', name: player.name, color: player.color, bot: null, isPlayer: true })
    for (const b of this.getBots()) entries.push({ id: b.id, name: b.nirv.name, color: b.nirv.color, bot: b, isPlayer: false })
    return entries
  }

  private renderList(entries: NirvEntry[]): void {
    const scene = this.container.scene
    const w = NIRVS_PANEL_WIDTH
    const h = NIRVS_PANEL_HEIGHT
    const startX = -w / 2 + 6
    const startY = -h - 6 + HEADER_H + 4
    const maxRows = Math.floor((h - HEADER_H - 12) / ROW_H)
    const visible = entries.slice(0, maxRows)

    visible.forEach((entry, i) => {
      const y = startY + i * ROW_H
      const selected = entry.id === this.selectedId
      const bg = scene.add.graphics()
      bg.fillStyle(selected ? 0x2e3b5e : (i % 2 === 0 ? 0x1c2438 : 0x182033), 0.95)
      bg.fillRoundedRect(startX, y, LIST_W - 12, ROW_H - 2, 4)
      this.listLayer.add(bg)

      const dot = scene.add.graphics()
      dot.fillStyle(entry.color, 1).fillCircle(startX + 12, y + ROW_H / 2 - 1, 5)
      this.listLayer.add(dot)

      const label = scene.add.text(startX + 24, y + ROW_H / 2, entry.name, {
        fontSize: '12px',
        color: selected ? '#ffe08a' : '#d9e2ff',
        fontStyle: selected ? 'bold' : 'normal',
      }).setOrigin(0, 0.5)
      this.listLayer.add(label)

      if (entry.isPlayer) {
        const tag = scene.add.text(startX + LIST_W - 28, y + ROW_H / 2, 'you', {
          fontSize: '9px', color: '#8893b1',
        }).setOrigin(1, 0.5)
        this.listLayer.add(tag)
      }

      const zone = scene.add.zone(startX + (LIST_W - 12) / 2, y + ROW_H / 2, LIST_W - 12, ROW_H - 2).setInteractive({ useHandCursor: true })
      zone.on('pointerdown', () => {
        this.selectedId = entry.id
        this.refresh()
      })
      this.listLayer.add(zone)
    })

    if (entries.length > maxRows) {
      const more = scene.add.text(startX + (LIST_W - 12) / 2, startY + maxRows * ROW_H + 4,
        `+${entries.length - maxRows} more…`, { fontSize: '10px', color: '#7682a0' }).setOrigin(0.5, 0)
      this.listLayer.add(more)
    }
  }

  private renderDetail(entry: NirvEntry): void {
    const scene = this.container.scene
    const w = NIRVS_PANEL_WIDTH
    const h = NIRVS_PANEL_HEIGHT
    const baseX = -w / 2 + LIST_W + PAD_X
    let y = -h - 6 + HEADER_H + 4

    const nameColor = `#${entry.color.toString(16).padStart(6, '0')}`
    const nameText = scene.add.text(baseX, y, entry.name, {
      fontSize: '16px', color: nameColor, fontStyle: 'bold',
    })
    this.detailLayer.add(nameText)
    y += 22

    const profession = entry.bot?.profession ?? (entry.isPlayer ? '—' : 'none')
    this.detailLayer.add(this.kvLine(scene, baseX, y, 'Job', profession))
    y += 18

    const status = entry.bot ? getBotStatusLabel(entry.bot.state) : (entry.isPlayer ? 'idle' : '—')
    const statusColor = entry.bot ? getBotStatusColor(entry.bot.state) : '#8893b1'
    this.detailLayer.add(this.kvLine(scene, baseX, y, 'Status', status, statusColor))
    y += 18

    const home = this.findHome(entry.id)
    this.detailLayer.add(this.kvLine(scene, baseX, y, 'Home', home))
    y += 22

    const summary = this.buildSummary(entry.id)
    this.detailLayer.add(this.kvLine(scene, baseX, y, 'Closest friend', summary.closestFriend))
    y += 18
    this.detailLayer.add(this.kvLine(scene, baseX, y, 'Partner', summary.partner))
    y += 18
    this.detailLayer.add(this.kvLine(scene, baseX, y, 'Household', summary.household))
    y += 18
    this.detailLayer.add(this.kvLine(scene, baseX, y, 'Recently with', summary.recentlyWith))
    y += 22

    const heading = scene.add.text(baseX, y, 'Top Relationships', {
      fontSize: '12px', color: '#aeb8d4', fontStyle: 'bold',
    })
    this.detailLayer.add(heading)
    y += 18

    const rels = this.collectRelationshipsFor(entry.id)
    if (rels.length === 0) {
      const none = scene.add.text(baseX, y, 'No relationships yet.', {
        fontSize: '11px', color: '#7682a0',
      })
      this.detailLayer.add(none)
      return
    }

    const detailW = w - LIST_W - PAD_X * 2
    const maxRelRows = Math.floor((h - 6 - (y - (-h - 6))) / 30) - 1
    rels.slice(0, Math.max(0, maxRelRows)).forEach(r => {
      const line = scene.add.text(baseX, y, `• ${r.otherName}`, {
        fontSize: '11px', color: `#${r.otherColor.toString(16).padStart(6, '0')}`,
      })
      this.detailLayer.add(line)
      const stageLabel = scene.add.text(baseX + detailW - 4, y, STAGE_LABEL[r.stage], {
        fontSize: '11px', color: '#ffd84d',
      }).setOrigin(1, 0)
      this.detailLayer.add(stageLabel)
      y += 14
      const recent = r.events[0]
      const eventText = recent
        ? `  ${relationshipEventLabel(recent)} (day ${recent.dayCount})${r.events.length > 1 ? ` · ${r.events.length} events` : ''}`
        : '  no milestone events yet'
      this.detailLayer.add(scene.add.text(baseX, y, eventText, {
        fontSize: '10px', color: '#8893b1',
      }))
      y += 16
    })

    if (rels.length > maxRelRows) {
      this.detailLayer.add(scene.add.text(baseX, y, `+${rels.length - maxRelRows} more…`, {
        fontSize: '10px', color: '#7682a0',
      }))
    }
  }

  private kvLine(
    scene: Phaser.Scene, x: number, y: number, key: string, value: string, valueColor = '#d9e2ff',
  ): Phaser.GameObjects.Container {
    const c = scene.add.container(x, y)
    c.add(scene.add.text(0, 0, `${key}:`, { fontSize: '11px', color: '#8893b1' }))
    c.add(scene.add.text(56, 0, value, { fontSize: '11px', color: valueColor, fontStyle: 'bold' }))
    return c
  }

  private findHome(entryId: string): string {
    if (entryId === 'player') return '—'
    const home = this.getBuildings().find(b => b.type === 'house' && b.ownerBotIds.includes(entryId))
    if (!home) return 'no home'
    const otherCount = home.ownerBotIds.length - 1
    return otherCount > 0 ? `house (shared with ${otherCount})` : 'house'
  }

  private collectRelationshipsFor(entryId: string): {
    otherId: string
    otherName: string
    otherColor: number
    stage: RelationshipStage
    events: RelationshipEvent[]
  }[] {
    const system = this.getRelationships()
    if (!system || entryId === 'player') return []
    const bots = this.getBots()
    const byId = new Map(bots.map(b => [b.id, b]))
    return system.listAll()
      .filter(r => r.idA === entryId || r.idB === entryId)
      .map(r => {
        const otherId = r.idA === entryId ? r.idB : r.idA
        const other = byId.get(otherId)
        if (!other) return null
        return {
          otherId,
          otherName: other.nirv.name,
          otherColor: other.nirv.color,
          stage: system.getDerivedStage(r.idA, r.idB),
          events: system.listEventsForPair(r.idA, r.idB),
        }
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .sort((a, b) => {
        const stageDelta = stageRank(b.stage) - stageRank(a.stage)
        if (stageDelta !== 0) return stageDelta
        const aRecent = a.events[0]?.timestamp ?? 0
        const bRecent = b.events[0]?.timestamp ?? 0
        return bRecent - aRecent
      })
  }

  private buildSummary(entryId: string): {
    closestFriend: string
    partner: string
    household: string
    recentlyWith: string
  } {
    if (entryId === 'player') {
      return { closestFriend: '—', partner: '—', household: '—', recentlyWith: '—' }
    }
    const rels = this.collectRelationshipsFor(entryId)
    const closestFriend = rels.find(r => r.stage === 'friend' || r.stage === 'lover' || r.stage === 'dating')?.otherName ?? 'none'
    const partner = rels.find(r => r.stage === 'lover' || r.stage === 'dating' || r.stage === 'engaged' || r.stage === 'married')?.otherName ?? 'none'
    const home = this.findHome(entryId)
    const interactions = this.getRelationships()?.listRecentInteractionsForNirv(entryId, 1) ?? []
    const recentId = interactions[0]
      ? (interactions[0]!.idA === entryId ? interactions[0]!.idB : interactions[0]!.idA)
      : null
    const recentName = rels.find(r => r.otherId === recentId)?.otherName ?? 'none'
    return {
      closestFriend,
      partner,
      household: home,
      recentlyWith: recentName,
    }
  }
}

function stageRank(stage: RelationshipStage): number {
  switch (stage) {
    case 'married': return 7
    case 'engaged': return 6
    case 'dating': return 5
    case 'lover': return 4
    case 'friend': return 3
    case 'colleague': return 2
    case 'acquaintance': return 1
  }
}
