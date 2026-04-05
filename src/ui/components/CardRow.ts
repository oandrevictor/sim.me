import Phaser from 'phaser'
import type { BotNirv } from '../../entities/BotNirv'
import { getBotStatusLabel, getBotStatusColor } from '../statusUtils'

/**
 * Renders a single bot row: [color dot] [name] [status dot + text]
 * All objects are added to `container`.
 */
export function addBotRow(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  bot: BotNirv,
  x: number,
  y: number,
): void {
  const dot = scene.add.graphics()
  dot.fillStyle(bot.nirv.color)
  dot.fillCircle(x + 8, y + 8, 6)
  dot.lineStyle(1, 0x333355)
  dot.strokeCircle(x + 8, y + 8, 6)

  const name = scene.add.text(x + 22, y, bot.nirv.name, {
    fontSize: '12px',
    color: '#ffffff',
    fontStyle: 'bold',
  })

  const statusText = getBotStatusLabel(bot.state)
  const statusColor = getBotStatusColor(bot.state)

  const status = scene.add.text(x + 120, y, statusText, {
    fontSize: '11px',
    color: statusColor,
  })

  const statusDot = scene.add.graphics()
  statusDot.fillStyle(Phaser.Display.Color.HexStringToColor(statusColor).color)
  statusDot.fillCircle(x + 112, y + 7, 3)

  container.add([dot, name, status, statusDot])
}
