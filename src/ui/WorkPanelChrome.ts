import Phaser from 'phaser'
import { PANEL_H, PANEL_W } from './components/WorkPanelControls'

export interface WorkPanelChrome {
  content: Phaser.GameObjects.Container
  disabledText: Phaser.GameObjects.Text
  titleText: Phaser.GameObjects.Text
}

export function buildWorkPanelChrome(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
): WorkPanelChrome {
  const bg = scene.add.graphics()
  bg.fillStyle(0x151b2b, 0.94)
  bg.fillRoundedRect(-PANEL_W / 2, -PANEL_H, PANEL_W, PANEL_H, 8)
  bg.lineStyle(1, 0x3a455f, 0.8)
  bg.strokeRoundedRect(-PANEL_W / 2, -PANEL_H, PANEL_W, PANEL_H, 8)

  const titleText = scene.add.text(0, -PANEL_H + 20, 'Work', {
    fontSize: '14px',
    color: '#f0c85a',
    fontStyle: 'bold',
  }).setOrigin(0.5)

  const disabledText = scene.add.text(0, -PANEL_H / 2, 'Enter a workplace to manage jobs', {
    fontSize: '12px',
    color: '#8792ad',
  }).setOrigin(0.5)

  const content = scene.add.container(0, 0)
  container.add([bg, titleText, disabledText, content])
  return { content, disabledText, titleText }
}
