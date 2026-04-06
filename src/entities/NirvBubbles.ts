import Phaser from 'phaser'
import { DEPTH_UI } from '../config/world'

type ChatBubble = {
  bg: Phaser.GameObjects.Graphics
  text: Phaser.GameObjects.Text
}

/** Renders floating Nirv bubbles without interfering with other overlays. */
export class NirvBubbles {
  private drinkBubbleGfx: Phaser.GameObjects.Graphics | null = null
  private sleepZText: Phaser.GameObjects.Text | null = null
  private chatBubble: ChatBubble | null = null

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly sprite: Phaser.Physics.Arcade.Sprite,
  ) {}

  showDrinkingBubble(): void {
    if (!this.drinkBubbleGfx) {
      this.drinkBubbleGfx = this.scene.add.graphics().setDepth(DEPTH_UI + 5)
    }
    this.drawDrinkingBubble()
  }

  syncDrinkingBubblePosition(): void {
    if (this.drinkBubbleGfx) this.drawDrinkingBubble()
  }

  hideDrinkingBubble(): void {
    this.drinkBubbleGfx?.destroy()
    this.drinkBubbleGfx = null
  }

  showSleepZzZ(): void {
    if (!this.sleepZText) {
      this.sleepZText = this.scene.add.text(0, 0, 'Z z Z', {
        fontSize: '11px',
        color: '#333333',
        fontStyle: 'bold',
      }).setOrigin(0.5).setDepth(DEPTH_UI + 6)
    }
    this.syncSleepZzZPosition()
    this.sleepZText.setVisible(true)
  }

  syncSleepZzZPosition(): void {
    this.sleepZText?.setPosition(this.sprite.x, this.sprite.y - 36)
  }

  hideSleepZzZ(): void {
    this.sleepZText?.destroy()
    this.sleepZText = null
  }

  showChatBubble(text: string): void {
    if (!this.chatBubble) {
      this.chatBubble = {
        bg: this.scene.add.graphics().setDepth(DEPTH_UI + 8),
        text: this.scene.add.text(0, 0, text, {
          fontSize: '11px',
          color: '#1b1b28',
          fontStyle: 'bold',
        }).setOrigin(0.5, 0).setDepth(DEPTH_UI + 9),
      }
    }
    this.chatBubble.text.setText(text)
    this.drawChatBubble()
  }

  syncChatBubblePosition(): void {
    if (this.chatBubble) this.drawChatBubble()
  }

  hideChatBubble(): void {
    this.chatBubble?.bg.destroy()
    this.chatBubble?.text.destroy()
    this.chatBubble = null
  }

  private drawDrinkingBubble(): void {
    if (!this.drinkBubbleGfx) return
    const gfx = this.drinkBubbleGfx
    const bx = this.sprite.x
    const by = this.sprite.y - 28
    gfx.clear()
    gfx.fillStyle(0xffffff, 0.9)
    gfx.fillRoundedRect(bx - 14, by - 10, 28, 16, 4)
    gfx.fillStyle(0x88ccff)
    gfx.fillRect(bx - 4, by - 8, 8, 10)
    gfx.lineStyle(1, 0x5599bb)
    gfx.strokeRect(bx - 4, by - 8, 8, 10)
    gfx.fillStyle(0xffffff, 0.9)
    gfx.fillTriangle(bx - 3, by + 6, bx + 3, by + 6, bx, by + 10)
  }

  private drawChatBubble(): void {
    if (!this.chatBubble) return
    const { bg, text } = this.chatBubble
    const paddingX = 8
    const paddingY = 4
    const width = text.width + paddingX * 2
    const height = text.height + paddingY * 2
    const bx = this.sprite.x
    const top = this.sprite.y - 62 - height
    text.setPosition(bx, top + paddingY)
    bg.clear()
    bg.fillStyle(0xfff8dc, 0.95)
    bg.fillRoundedRect(bx - width / 2, top, width, height, 6)
    bg.fillTriangle(bx - 4, top + height, bx + 4, top + height, bx, top + height + 6)
    bg.lineStyle(1, 0x7a6a48, 0.9)
    bg.strokeRoundedRect(bx - width / 2, top, width, height, 6)
  }
}
