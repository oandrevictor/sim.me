import Phaser from 'phaser'
import type { BotNirv } from '../entities/BotNirv'
import type { NirvInteraction, RelationshipEvent, RelationshipSystem, RelationshipStage } from '../systems/RelationshipSystem'
import { createPanelBackground } from './components/Panel'
import { relationshipEventLabel } from './relationshipEventLabels'

export const RELATIONSHIPS_PANEL_WIDTH = 480
export const RELATIONSHIPS_PANEL_HEIGHT = 360
const BAR_HEIGHT = 44
const ROW_HEIGHT = 30
const ROW_PADDING_X = 14
const HEADER_HEIGHT = 38
const EVENTS_SECTION_HEIGHT = 120
const EVENTS_VISIBLE_LIMIT = 6
const DETAILS_VISIBLE_LIMIT = 7
type SortMode = 'stage' | 'affinity' | 'recent'

const STAGE_LABEL: Record<RelationshipStage, string> = {
  acquaintance: 'Acquaintance',
  colleague: 'Colleague',
  friend: 'Friend',
  lover: 'Lover',
  dating: 'Dating',
  engaged: 'Engaged',
  married: 'Married',
}

const STAGE_COLOR: Record<RelationshipStage, string> = {
  acquaintance: '#9aa6c4',
  colleague: '#8ad0ff',
  friend: '#7be39a',
  lover: '#ff9ad6',
  dating: '#ff7fbf',
  engaged: '#ffb84d',
  married: '#ffd84d',
}

export class RelationshipsPanel {
  readonly container: Phaser.GameObjects.Container
  private content!: Phaser.GameObjects.Container
  private titleText!: Phaser.GameObjects.Text
  private emptyText!: Phaser.GameObjects.Text

  private getBots: () => readonly BotNirv[] = () => []
  private getRelationships: () => RelationshipSystem | null = () => null
  private selectedStages = new Set<RelationshipStage>(Object.keys(STAGE_LABEL) as RelationshipStage[])
  private sortMode: SortMode = 'stage'
  private selectedPair: { idA: string; idB: string } | null = null

  constructor(scene: Phaser.Scene) {
    this.container = scene.add.container(0, -BAR_HEIGHT - 8)
    this.container.setVisible(false)

    const w = RELATIONSHIPS_PANEL_WIDTH
    const h = RELATIONSHIPS_PANEL_HEIGHT
    const bg = createPanelBackground(scene, w, h, -w / 2, -h - 6)
    this.container.add(bg)

    this.titleText = scene.add.text(-w / 2 + ROW_PADDING_X, -h - 6 + 12, 'Relationships', {
      fontSize: '15px',
      color: '#ffe08a',
      fontStyle: 'bold',
    })
    this.container.add(this.titleText)

    this.emptyText = scene.add.text(0, -h / 2 - 6, 'No one has met anyone yet.', {
      fontSize: '12px',
      color: '#8893b1',
    }).setOrigin(0.5)
    this.container.add(this.emptyText)

    this.content = scene.add.container(0, 0)
    this.container.add(this.content)
  }

  setProviders(getBots: () => readonly BotNirv[], getRelationships: () => RelationshipSystem | null): void {
    this.getBots = getBots
    this.getRelationships = getRelationships
  }

  clearSelection(): void {
    this.selectedPair = null
  }

  refresh(): void {
    this.content.removeAll(true)
    const system = this.getRelationships()
    if (!system) { this.emptyText.setVisible(true); return }
    const bots = this.getBots()
    const byId = new Map(bots.map(b => [b.id, b]))

    const rows = system.listAll()
      .map(r => ({
        rel: r,
        derivedStage: system.getDerivedStage(r.idA, r.idB),
        a: byId.get(r.idA),
        b: byId.get(r.idB),
      }))
      .filter(row => row.a && row.b)
      .filter(row => this.selectedStages.has(row.derivedStage))
      .sort((x, y) => this.compareRows(x, y, system))

    if (rows.length === 0) { this.emptyText.setVisible(true); return }
    this.emptyText.setVisible(false)

    const scene = this.container.scene
    const w = RELATIONSHIPS_PANEL_WIDTH
    const h = RELATIONSHIPS_PANEL_HEIGHT
    this.renderControls(scene, w, h)
    const startY = -h - 6 + HEADER_HEIGHT
    const relationshipHeight = h - HEADER_HEIGHT - EVENTS_SECTION_HEIGHT - 14
    const maxRows = Math.floor(relationshipHeight / ROW_HEIGHT)
    const visible = rows.slice(0, maxRows)

    visible.forEach((row, i) => {
      const y = startY + i * ROW_HEIGHT + ROW_HEIGHT / 2
      const rowBg = scene.add.graphics()
      rowBg.fillStyle(i % 2 === 0 ? 0x1c2438 : 0x182033, 0.9)
      rowBg.fillRoundedRect(-w / 2 + 6, y - ROW_HEIGHT / 2 + 1, w - 12, ROW_HEIGHT - 2, 4)
      this.content.add(rowBg)

      const aColor = `#${row.a!.nirv.color.toString(16).padStart(6, '0')}`
      const bColor = `#${row.b!.nirv.color.toString(16).padStart(6, '0')}`

      const nameLabel = scene.add.text(-w / 2 + ROW_PADDING_X, y, row.a!.nirv.name, {
        fontSize: '12px', color: aColor, fontStyle: 'bold',
      }).setOrigin(0, 0.5)
      const xLabel = scene.add.text(nameLabel.x + nameLabel.width + 6, y, '×', {
        fontSize: '12px', color: '#8893b1',
      }).setOrigin(0, 0.5)
      const bLabel = scene.add.text(xLabel.x + xLabel.width + 6, y, row.b!.nirv.name, {
        fontSize: '12px', color: bColor, fontStyle: 'bold',
      }).setOrigin(0, 0.5)

      const stage = row.derivedStage
      const stageLabel = scene.add.text(w / 2 - ROW_PADDING_X, y, STAGE_LABEL[stage], {
        fontSize: '11px', color: STAGE_COLOR[stage], fontStyle: 'bold',
      }).setOrigin(1, 0.5)

      const meta = `aff ${Math.round(row.rel.affinity)} · flirts ${row.rel.flirtCount} · days ${row.rel.flirtDays.size}`
      const metaLabel = scene.add.text(stageLabel.x - stageLabel.width - 14, y, meta, {
        fontSize: '10px', color: '#7682a0',
      }).setOrigin(1, 0.5)

      this.content.add([nameLabel, xLabel, bLabel, stageLabel, metaLabel])
      const zone = scene.add.zone(0, y, w - 16, ROW_HEIGHT - 2).setInteractive({ useHandCursor: true })
      zone.on('pointerdown', () => { this.selectedPair = { idA: row.rel.idA, idB: row.rel.idB }; this.refresh() })
      this.content.add(zone)
    })

    if (rows.length > maxRows) {
      const more = scene.add.text(0, startY + maxRows * ROW_HEIGHT + 6, `+${rows.length - maxRows} more…`, {
        fontSize: '10px', color: '#7682a0',
      }).setOrigin(0.5, 0)
      this.content.add(more)
    }
    this.renderRecentEvents(system, byId)
    this.renderDetailsModal(system, byId)
  }

  private renderRecentEvents(system: RelationshipSystem, byId: Map<string, BotNirv>): void {
    const scene = this.container.scene
    const w = RELATIONSHIPS_PANEL_WIDTH
    const h = RELATIONSHIPS_PANEL_HEIGHT
    const sectionTop = -h - 6 + h - EVENTS_SECTION_HEIGHT + 6
    const sectionBg = scene.add.graphics()
    sectionBg.fillStyle(0x141b2b, 0.9)
    sectionBg.fillRoundedRect(-w / 2 + 6, sectionTop, w - 12, EVENTS_SECTION_HEIGHT - 8, 6)
    this.content.add(sectionBg)

    const heading = scene.add.text(-w / 2 + ROW_PADDING_X, sectionTop + 8, 'Recent Relationship Events', {
      fontSize: '11px',
      color: '#aeb8d4',
      fontStyle: 'bold',
    })
    this.content.add(heading)

    const events = system.listRecentRelationshipEvents(EVENTS_VISIBLE_LIMIT)
    if (events.length === 0) {
      const empty = scene.add.text(-w / 2 + ROW_PADDING_X, sectionTop + 30, 'No milestone events yet.', {
        fontSize: '10px',
        color: '#7682a0',
      })
      this.content.add(empty)
      return
    }
    events.forEach((event, i) => {
      const y = sectionTop + 28 + i * 14
      const line = scene.add.text(-w / 2 + ROW_PADDING_X, y, this.eventLine(event, byId), {
        fontSize: '10px',
        color: '#d9e2ff',
      })
      this.content.add(line)
    })
  }

  private eventLine(event: RelationshipEvent, byId: Map<string, BotNirv>): string {
    const a = byId.get(event.idA)?.nirv.name ?? event.idA
    const b = byId.get(event.idB)?.nirv.name ?? event.idB
    return `Day ${event.dayCount}: ${a} & ${b} ${relationshipEventLabel(event)}`
  }

  private renderControls(scene: Phaser.Scene, width: number, height: number): void {
    const y = -height - 6 + 28
    const sort = scene.add.text(width / 2 - 12, y, `Sort: ${this.sortMode}`, {
      fontSize: '10px', color: '#aeb8d4',
    }).setOrigin(1, 0.5)
    const sortZone = scene.add.zone(sort.x - 36, sort.y, 84, 14).setInteractive({ useHandCursor: true })
    sortZone.on('pointerdown', () => {
      this.sortMode = this.sortMode === 'stage' ? 'affinity' : this.sortMode === 'affinity' ? 'recent' : 'stage'
      this.refresh()
    })
    this.content.add([sort, sortZone])
    let x = -width / 2 + ROW_PADDING_X
    ;(['friend', 'dating', 'engaged', 'married'] as RelationshipStage[]).forEach(stage => {
      const selected = this.selectedStages.has(stage)
      const chip = scene.add.text(x, y, STAGE_LABEL[stage], {
        fontSize: '10px',
        color: selected ? STAGE_COLOR[stage] : '#6c7898',
      })
      const zone = scene.add.zone(chip.x + chip.width / 2, chip.y + 6, chip.width + 4, 14).setInteractive({ useHandCursor: true })
      zone.on('pointerdown', () => {
        if (selected) this.selectedStages.delete(stage)
        else this.selectedStages.add(stage)
        if (this.selectedStages.size === 0) this.selectedStages.add(stage)
        this.refresh()
      })
      this.content.add([chip, zone])
      x += chip.width + 8
    })
  }

  private compareRows(
    a: { rel: { idA: string; idB: string; affinity: number }; derivedStage: RelationshipStage },
    b: { rel: { idA: string; idB: string; affinity: number }; derivedStage: RelationshipStage },
    system: RelationshipSystem,
  ): number {
    if (this.sortMode === 'affinity') return b.rel.affinity - a.rel.affinity
    if (this.sortMode === 'recent') {
      const ar = system.listRecentInteractionsForPair(a.rel.idA, a.rel.idB, 1)[0]?.timestamp ?? 0
      const br = system.listRecentInteractionsForPair(b.rel.idA, b.rel.idB, 1)[0]?.timestamp ?? 0
      return br - ar
    }
    return stageRank(b.derivedStage) - stageRank(a.derivedStage)
  }

  private renderDetailsModal(system: RelationshipSystem, byId: Map<string, BotNirv>): void {
    if (!this.selectedPair) return
    const scene = this.container.scene
    const width = RELATIONSHIPS_PANEL_WIDTH
    const height = RELATIONSHIPS_PANEL_HEIGHT
    const idA = this.selectedPair.idA
    const idB = this.selectedPair.idB
    const rel = system.getRelationship(idA, idB)
    if (!rel) return
    const modal = scene.add.graphics()
    modal.fillStyle(0x0e1522, 0.95)
    modal.fillRoundedRect(-width / 2 + 26, -height + 46, width - 52, height - 94, 8)
    this.content.add(modal)
    const aName = byId.get(idA)?.nirv.name ?? idA
    const bName = byId.get(idB)?.nirv.name ?? idB
    const header = scene.add.text(-width / 2 + 36, -height + 56, `${aName} × ${bName}`, {
      fontSize: '12px',
      color: '#ffe08a',
      fontStyle: 'bold',
    })
    this.content.add(header)
    const close = scene.add.text(width / 2 - 38, -height + 56, 'Close', { fontSize: '10px', color: '#aeb8d4' })
      .setInteractive({ useHandCursor: true })
    close.on('pointerdown', () => { this.selectedPair = null; this.refresh() })
    this.content.add(close)
    const stage = system.getDerivedStage(idA, idB)
    this.content.add(scene.add.text(-width / 2 + 36, -height + 74, `Stage: ${STAGE_LABEL[stage]} · Affinity: ${Math.round(rel.affinity)}`, {
      fontSize: '10px', color: '#d9e2ff',
    }))
    let y = -height + 94
    const events = system.listEventsForPair(idA, idB).slice(0, DETAILS_VISIBLE_LIMIT)
    this.content.add(scene.add.text(-width / 2 + 36, y, 'Relationship History', { fontSize: '10px', color: '#aeb8d4' }))
    y += 14
    events.forEach(event => {
      this.content.add(scene.add.text(-width / 2 + 40, y, this.eventLine(event, byId), {
        fontSize: '10px', color: '#cfd9f6',
      }))
      y += 12
    })
    const interactions = system.listRecentInteractionsForPair(idA, idB, DETAILS_VISIBLE_LIMIT)
    y += 4
    this.content.add(scene.add.text(-width / 2 + 36, y, 'Recent Interactions', { fontSize: '10px', color: '#aeb8d4' }))
    y += 14
    interactions.forEach(interaction => {
      this.content.add(scene.add.text(-width / 2 + 40, y, this.interactionLine(interaction, byId), {
        fontSize: '10px', color: '#9fb0d8',
      }))
      y += 12
    })
  }

  private interactionLine(interaction: NirvInteraction, byId: Map<string, BotNirv>): string {
    const a = byId.get(interaction.idA)?.nirv.name ?? interaction.idA
    const b = byId.get(interaction.idB)?.nirv.name ?? interaction.idB
    return `Day ${interaction.dayCount}: ${a} & ${b} (${interaction.kind})`
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
