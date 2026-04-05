import Phaser from 'phaser'
import type { StageAttraction } from '../storage/stagePersistence'
import type { BandRecord } from '../storage/bandPersistence'
import type { StagePerformanceView } from '../systems/stagePerformanceTypes'

/** Bridge from GameScene — keeps Work UI thin */
export interface StageWorkBridge {
  getPerformanceView(stageId: string): StagePerformanceView | null
  setStageAttraction(stageId: string, a: StageAttraction | null): boolean
  getBands(): BandRecord[]
  getPerformerBots(): { id: string; label: string }[]
  formBandFromFirstTwoPerformers(): boolean
  /** False on solo-only stages (sprite deck) — hide band line-up controls. */
  stageAllowsBand(stageId: string): boolean
}

export interface StagePickCounters {
  getSoloIndex: () => number
  bumpSolo: () => void
  getBandIndex: () => number
  bumpBand: () => void
}

const PANEL_W = 520

/** Manual hit targets (GameScene) — Phaser often skips UIScene IO when GameScene captures input first */
export interface StagePanelHitTarget {
  getBounds: () => Phaser.Geom.Rectangle
  action: () => void
}

export function addStageWorkSection(
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container,
  panelH: number,
  stageId: string,
  bridge: StageWorkBridge,
  picks: StagePickCounters,
  hitTargets: StagePanelHitTarget[],
): number {
  const view = bridge.getPerformanceView(stageId)
  if (!view) return -panelH + 42

  let y = -panelH + 34
  const performers = bridge.getPerformerBots()
  const bands = bridge.getBands()

  const fmtTime = (ms: number) => {
    const sec = Math.max(0, Math.ceil(ms / 1000))
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${m}:${String(s).padStart(2, '0')}`
  }

  const att = view.attraction
  let attrLabel = 'none'
  if (att?.kind === 'solo') {
    attrLabel = `solo (${performers.find(p => p.id === att.botId)?.label ?? '?'})`
  } else if (att?.kind === 'band') {
    attrLabel = `band (${bands.find(b => b.id === att.bandId)?.name ?? '?'})`
  }

  const allowsBand = bridge.stageAllowsBand(stageId)
  const statStr = view.attraction
    ? `This cycle: ${view.currentUnique} unique • max ${view.maxConcurrent} at once • ${fmtTime(view.cycleRemainingMs)} left`
    : allowsBand
      ? 'No line-up — bots will not gather here until you assign solo or band.'
      : 'No line-up — assign a solo act (this stage holds one performer).'

  parent.add(scene.add.text(-PANEL_W / 2 + 14, y, statStr, {
    fontSize: '11px', color: '#aabbaa',
  }).setOrigin(0, 0))
  y += 20

  parent.add(scene.add.text(-PANEL_W / 2 + 14, y, `Line-up: ${attrLabel}`, {
    fontSize: '11px', color: '#ccccdd',
  }).setOrigin(0, 0))
  y += 18

  const hTake = view.history.slice(-3)
  for (const h of hTake) {
    parent.add(scene.add.text(-PANEL_W / 2 + 14, y,
      `Past #${h.cycleIndex + 1}: ${h.totalUniqueWatchers} watched, peak ${h.maxConcurrent}`,
      { fontSize: '10px', color: '#666688' },
    ).setOrigin(0, 0))
    y += 15
  }
  y += 4

  let bx = -PANEL_W / 2 + 14
  const addBtn = (label: string, onClick: () => void) => {
    const t = scene.add.text(bx, y, label, { fontSize: '11px', color: '#88ccff' }).setOrigin(0, 0)
    parent.add(t)
    const hitW = Math.max(88, Math.ceil(t.width) + 20)
    const hitH = Math.max(26, Math.ceil(t.height) + 12)
    hitTargets.push({
      getBounds: () => {
        const b = t.getBounds()
        return new Phaser.Geom.Rectangle(b.x, b.y, hitW, hitH)
      },
      action: onClick,
    })
    bx += hitW + 8
  }

  if (performers.length > 0) {
    addBtn('[Solo ▶]', () => {
      const i = picks.getSoloIndex() % performers.length
      bridge.setStageAttraction(stageId, { kind: 'solo', botId: performers[i]!.id })
      picks.bumpSolo()
    })
  }
  if (bands.length > 0 && allowsBand) {
    addBtn('[Band ▶]', () => {
      const i = picks.getBandIndex() % bands.length
      bridge.setStageAttraction(stageId, { kind: 'band', bandId: bands[i]!.id })
      picks.bumpBand()
    })
  }
  addBtn('[Clear]', () => { bridge.setStageAttraction(stageId, null) })
  if (allowsBand) {
    addBtn('[Form band]', () => { bridge.formBandFromFirstTwoPerformers() })
  }

  const hintY = y + 30
  if (allowsBand && performers.length < 2) {
    parent.add(scene.add.text(-PANEL_W / 2 + 14, hintY,
      'Form band needs at least 2 performer bots (singer / musician / performer).',
      { fontSize: '10px', color: '#886644' },
    ).setOrigin(0, 0))
  }

  return allowsBand && performers.length < 2 ? hintY + 36 : y + 22
}
