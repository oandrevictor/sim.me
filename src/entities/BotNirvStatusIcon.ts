// @ts-nocheck
import Phaser from 'phaser'
import { gridToScreen, screenToGrid } from '../utils/isoGrid'
import { rollLeaveEarly } from '../systems/stageAffinity'
import { DEPTH_UI } from '../config/world'
import { EARLY_LEAVE_CHECK_INTERVAL_MS } from '../systems/stagePerformanceRuntime'
import { fruitSlotWorldPosition } from '../systems/fruitCrateLayout'
import { isFarmerState, isHouseState, isRestaurantStaffState, isStockerState } from './botStates'

const FUN_WATCH_TICK_MS = 10_000
const FUN_GAIN_MATCH = 10
const FUN_GAIN_NO_MATCH = 5
const BOT_SPEED = 120
const ARRIVAL_THRESHOLD = 24
const CHAIR_ARRIVAL_THRESHOLD = 32

function installMethods(target: any, source: any): void {
  for (const name of Object.getOwnPropertyNames(source.prototype)) {
    if (name === 'constructor') continue
    Object.defineProperty(target.prototype, name, Object.getOwnPropertyDescriptor(source.prototype, name)!)
  }
}

export function installBotNirvStatusIcon(target: any): void { installMethods(target, BotNirvStatusIconMethods) }

class BotNirvStatusIconMethods {
  private showStatusIcon(): void {
    if (this.statusIcon) return
    const gfx = this.scene.add.graphics()
    gfx.setDepth(DEPTH_UI + 5)
    this.statusIcon = gfx
    this.drawStatusIcon()
  }

  private drawStatusIcon(): void {
    if (!this.statusIcon) return
    const sprite = this.nirv.sprite
    const gfx = this.statusIcon
    gfx.clear()

    const bx = sprite.x
    const by = sprite.y - 28

    if (this._state !== 'sleeping') {
      this.sleepZText?.setVisible(false)
    }

    const bubbleW = this._state === 'sleeping' ? 46 : 28
    gfx.fillStyle(0xffffff, 0.9)
    gfx.fillRoundedRect(bx - bubbleW / 2, by - 10, bubbleW, 16, 4)

    if (this._state === 'eating') {
      // Food colored circle
      gfx.fillStyle(this.eatingColor)
      gfx.fillCircle(bx, by - 2, 5)
      gfx.lineStyle(1, 0x666666)
      gfx.strokeCircle(bx, by - 2, 5)
    } else if (this._state === 'drinking_water') {
      gfx.fillStyle(0x88ccff)
      gfx.fillRect(bx - 4, by - 8, 8, 10)
      gfx.lineStyle(1, 0x5599bb)
      gfx.strokeRect(bx - 4, by - 8, 8, 10)
    } else if (this._state === 'snack_interact') {
      const pulse = 0.75 + 0.25 * Math.sin(this.snackBubblePhase / 180)
      gfx.fillStyle(0x8b6914, pulse)
      gfx.fillRoundedRect(bx - 8, by - 8, 16, 12, 2)
      gfx.lineStyle(1, 0x5c4a26, pulse)
      gfx.strokeRoundedRect(bx - 8, by - 8, 16, 12, 2)
      gfx.fillStyle(0x333333, pulse)
      gfx.fillRect(bx - 5, by - 4, 10, 2)
    } else if (this._state === 'snack_eat' || this._state === 'fruit_eat') {
      const pulse = 0.85 + 0.15 * Math.sin(this.snackBubblePhase / 220)
      gfx.fillStyle(this.eatingColor, pulse)
      gfx.fillCircle(bx, by - 2, 5)
      gfx.lineStyle(1, 0x666666, pulse)
      gfx.strokeCircle(bx, by - 2, 5)
    } else if (this._state === 'fruit_interact') {
      const pulse = 0.75 + 0.25 * Math.sin(this.snackBubblePhase / 180)
      gfx.fillStyle(0x5a8c3a, pulse)
      gfx.fillRoundedRect(bx - 9, by - 8, 18, 12, 2)
      gfx.lineStyle(1, 0x3a5c2a, pulse)
      gfx.strokeRoundedRect(bx - 9, by - 8, 18, 12, 2)
    } else if (this._state === 'stocker_restocking') {
      const pulse = 0.78 + 0.22 * Math.sin(this.snackBubblePhase / 180)
      gfx.fillStyle(0x4f9f73, pulse)
      gfx.fillRoundedRect(bx - 9, by - 7, 18, 11, 2)
      gfx.lineStyle(1, 0x2f6b4f, pulse)
      gfx.strokeRoundedRect(bx - 9, by - 7, 18, 11, 2)
      gfx.fillStyle(0xf5d469, pulse)
      gfx.fillCircle(bx - 4, by - 2, 3)
      gfx.fillCircle(bx + 1, by - 5, 3)
      gfx.fillCircle(bx + 5, by - 1, 3)
    } else if (this._state === 'sleeping') {
      if (!this.sleepZText) {
        this.sleepZText = this.scene.add.text(bx, by - 4, 'Z z Z', {
          fontSize: '11px',
          color: '#333333',
          fontStyle: 'bold',
        }).setOrigin(0.5).setDepth(DEPTH_UI + 6)
      }
      this.sleepZText.setPosition(bx, by - 4)
      this.sleepZText.setVisible(true)
    } else {
      // Three dots "..." for awaiting service
      gfx.fillStyle(0x333333)
      gfx.fillCircle(bx - 6, by - 2, 2)
      gfx.fillCircle(bx, by - 2, 2)
      gfx.fillCircle(bx + 6, by - 2, 2)
    }

    // Small triangle pointer
    gfx.fillStyle(0xffffff, 0.9)
    gfx.fillTriangle(bx - 3, by + 6, bx + 3, by + 6, bx, by + 10)
  }

  private updateStatusIconPosition(): void {
    if (!this.statusIcon) return
    this.drawStatusIcon()
  }

  private hideStatusIcon(): void {
    if (this.statusIcon) {
      this.statusIcon.destroy()
      this.statusIcon = null
    }
    if (this.sleepZText) {
      this.sleepZText.destroy()
      this.sleepZText = null
    }
  }


}
