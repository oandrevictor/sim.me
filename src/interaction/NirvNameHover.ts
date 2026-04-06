import Phaser from 'phaser'
import { DEPTH_UI } from '../config/world'

export type NirvHoverSubject = {
  sprite: Phaser.GameObjects.Sprite
  name: string
  hydrationLevel: number
  restLevel: number
}

/** World-space name tag when the pointer is over a Nirv sprite */
export class NirvNameHover {
  private label: Phaser.GameObjects.Text

  constructor(scene: Phaser.Scene) {
    this.label = scene.add.text(0, 0, '', {
      fontSize: '13px',
      color: '#f0f0f5',
      backgroundColor: '#1e1e32e8',
      padding: { x: 8, y: 4 },
    })
    this.label.setOrigin(0.5, 1)
    this.label.setDepth(DEPTH_UI + 22)
    this.label.setVisible(false)
  }

  update(pointer: Phaser.Input.Pointer, subjects: NirvHoverSubject[], hide: boolean): void {
    if (hide) {
      this.label.setVisible(false)
      return
    }

    const wx = pointer.worldX
    const wy = pointer.worldY
    let best: NirvHoverSubject | null = null
    let bestD = Infinity

    for (const s of subjects) {
      const b = s.sprite.getBounds()
      if (!b.contains(wx, wy)) continue
      const d = Phaser.Math.Distance.Between(wx, wy, s.sprite.x, s.sprite.y)
      if (d < bestD) {
        bestD = d
        best = s
      }
    }

    if (!best) {
      this.label.setVisible(false)
      return
    }

    this.label.setText(
      `${best.name}\nWater: ${Math.round(best.hydrationLevel)}\nRest: ${Math.round(best.restLevel)}`,
    )
    this.label.setPosition(best.sprite.x, best.sprite.y - 44)
    this.label.setVisible(true)
  }
}
