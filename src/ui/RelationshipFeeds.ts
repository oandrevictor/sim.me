import Phaser from 'phaser'
import type { BotNirv } from '../entities/BotNirv'
import type { RelationshipSystem } from '../systems/RelationshipSystem'
import { relationshipEventLine, relationshipInteractionLine } from './relationshipFeedLines'

export function renderRelationshipFeeds(params: {
  scene: Phaser.Scene
  content: Phaser.GameObjects.Container
  system: RelationshipSystem
  byId: Map<string, BotNirv>
  width: number
  height: number
  sectionHeight: number
  rowPaddingX: number
  eventLimit: number
  interactionLimit: number
}): void {
  const {
    scene,
    content,
    system,
    byId,
    width,
    height,
    sectionHeight,
    rowPaddingX,
    eventLimit,
    interactionLimit,
  } = params
  const sectionTop = -height - 6 + height - sectionHeight + 6
  const sectionWidth = width - 12
  const gap = 8
  const feedWidth = (sectionWidth - gap) / 2
  const leftX = -width / 2 + 6
  const linesMaxLength = 45

  renderFeed(scene, content, {
    x: leftX,
    y: sectionTop,
    width: feedWidth,
    height: sectionHeight - 8,
    title: 'Recent Relationship Events',
    empty: 'No milestone events yet.',
    lines: system.listRecentRelationshipEvents(eventLimit)
      .map(event => relationshipEventLine(event, byId, linesMaxLength)),
    rowPaddingX,
  })
  renderFeed(scene, content, {
    x: leftX + feedWidth + gap,
    y: sectionTop,
    width: feedWidth,
    height: sectionHeight - 8,
    title: 'Recent Interactions',
    empty: 'No interactions yet.',
    lines: system.listRecentInteractions(interactionLimit)
      .map(interaction => relationshipInteractionLine(interaction, byId, linesMaxLength)),
    rowPaddingX,
  })
}

function renderFeed(
  scene: Phaser.Scene,
  content: Phaser.GameObjects.Container,
  params: {
    x: number
    y: number
    width: number
    height: number
    title: string
    empty: string
    lines: string[]
    rowPaddingX: number
  },
): void {
  const bg = scene.add.graphics()
  bg.fillStyle(0x141b2b, 0.9)
  bg.fillRoundedRect(params.x, params.y, params.width, params.height, 6)
  content.add(bg)

  const heading = scene.add.text(params.x + params.rowPaddingX - 6, params.y + 8, params.title, {
    fontSize: '11px',
    color: '#aeb8d4',
    fontStyle: 'bold',
  })
  content.add(heading)

  if (params.lines.length === 0) {
    const empty = scene.add.text(params.x + params.rowPaddingX - 6, params.y + 30, params.empty, {
      fontSize: '10px',
      color: '#7682a0',
    })
    content.add(empty)
    return
  }

  params.lines.forEach((text, i) => {
    const line = scene.add.text(params.x + params.rowPaddingX - 6, params.y + 28 + i * 16, text, {
      fontSize: '10px',
      color: '#d9e2ff',
    })
    content.add(line)
  })
}
