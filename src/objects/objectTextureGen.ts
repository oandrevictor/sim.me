import Phaser from 'phaser'
import { OBJECT_SIZE } from './objectTypes'

export function generateObjectTextures(scene: Phaser.Scene): void {
  // Obstacle: solid dark grey square
  const obstacleGfx = scene.make.graphics({ x: 0, y: 0 })
  obstacleGfx.fillStyle(0x555555)
  obstacleGfx.fillRect(0, 0, OBJECT_SIZE, OBJECT_SIZE)
  obstacleGfx.lineStyle(2, 0x333333)
  obstacleGfx.strokeRect(1, 1, OBJECT_SIZE - 2, OBJECT_SIZE - 2)
  obstacleGfx.generateTexture('obj_obstacle', OBJECT_SIZE, OBJECT_SIZE)
  obstacleGfx.destroy()

  // Interactable inactive: muted blue square with lighter inner highlight
  const interactableGfx = scene.make.graphics({ x: 0, y: 0 })
  interactableGfx.fillStyle(0x2255aa)
  interactableGfx.fillRect(0, 0, OBJECT_SIZE, OBJECT_SIZE)
  interactableGfx.fillStyle(0x4477cc)
  interactableGfx.fillRect(4, 4, OBJECT_SIZE - 8, OBJECT_SIZE - 8)
  interactableGfx.generateTexture('obj_interactable', OBJECT_SIZE, OBJECT_SIZE)
  interactableGfx.destroy()

  // Interactable active: amber/gold with bright inner highlight and white border
  const interactableActiveGfx = scene.make.graphics({ x: 0, y: 0 })
  interactableActiveGfx.fillStyle(0xffaa00)
  interactableActiveGfx.fillRect(0, 0, OBJECT_SIZE, OBJECT_SIZE)
  interactableActiveGfx.fillStyle(0xffdd44)
  interactableActiveGfx.fillRect(4, 4, OBJECT_SIZE - 8, OBJECT_SIZE - 8)
  interactableActiveGfx.lineStyle(2, 0xffffff)
  interactableActiveGfx.strokeRect(1, 1, OBJECT_SIZE - 2, OBJECT_SIZE - 2)
  interactableActiveGfx.generateTexture('obj_interactable_active', OBJECT_SIZE, OBJECT_SIZE)
  interactableActiveGfx.destroy()

  // Background/decoration: muted green rounded rect
  const backgroundGfx = scene.make.graphics({ x: 0, y: 0 })
  backgroundGfx.fillStyle(0x8aab7a)
  backgroundGfx.fillRoundedRect(0, 0, OBJECT_SIZE, OBJECT_SIZE, 8)
  backgroundGfx.generateTexture('obj_background', OBJECT_SIZE, OBJECT_SIZE)
  backgroundGfx.destroy()

  // Sign: brown post with tan sign board
  const signGfx = scene.make.graphics({ x: 0, y: 0 })
  signGfx.fillStyle(0x5a3e1b)
  signGfx.fillRect(13, 14, 6, 18)
  signGfx.fillStyle(0xd4c4a0)
  signGfx.fillRect(2, 2, 28, 14)
  signGfx.lineStyle(1, 0x3a2a10)
  signGfx.strokeRect(2, 2, 28, 14)
  signGfx.generateTexture('obj_sign', OBJECT_SIZE, OBJECT_SIZE)
  signGfx.destroy()

  // Counter: light brown surface
  const counterGfx = scene.make.graphics({ x: 0, y: 0 })
  counterGfx.fillStyle(0x9b8b6b)
  counterGfx.fillRect(0, 0, OBJECT_SIZE, OBJECT_SIZE)
  counterGfx.fillStyle(0xb0a080)
  counterGfx.fillRect(2, 2, OBJECT_SIZE - 4, OBJECT_SIZE - 4)
  counterGfx.lineStyle(1, 0x7a6b4b)
  counterGfx.strokeRect(1, 1, OBJECT_SIZE - 2, OBJECT_SIZE - 2)
  counterGfx.generateTexture('obj_counter', OBJECT_SIZE, OBJECT_SIZE)
  counterGfx.destroy()

  // Food plate: small white circle (fits on table slots)
  const plateGfx = scene.make.graphics({ x: 0, y: 0 })
  plateGfx.fillStyle(0xffffff)
  plateGfx.fillCircle(16, 16, 6)
  plateGfx.lineStyle(1, 0xbbbbbb)
  plateGfx.strokeCircle(16, 16, 6)
  plateGfx.fillStyle(0xdddddd)
  plateGfx.fillCircle(16, 16, 3)
  plateGfx.generateTexture('obj_food_plate', OBJECT_SIZE, OBJECT_SIZE)
  plateGfx.destroy()

  // Trash: dark bin with open top
  const trashGfx = scene.make.graphics({ x: 0, y: 0 })
  trashGfx.fillStyle(0x4a5a4a)
  trashGfx.fillRect(6, 8, 20, 22)
  trashGfx.lineStyle(1, 0x333a33)
  trashGfx.strokeRect(6, 8, 20, 22)
  trashGfx.fillStyle(0x3a4a3a)
  trashGfx.fillRect(4, 6, 24, 4)
  trashGfx.fillStyle(0x2a2a2a)
  trashGfx.fillRect(8, 10, 16, 4)
  trashGfx.generateTexture('obj_trash', OBJECT_SIZE, OBJECT_SIZE)
  trashGfx.destroy()

  // Path: compact shop/ghost texture; the placed tile is rendered by FloorTileLayer.
  const pathGfx = scene.make.graphics({ x: 0, y: 0 })
  pathGfx.fillStyle(0xb88245)
  pathGfx.fillRect(0, 0, OBJECT_SIZE, OBJECT_SIZE)
  pathGfx.lineStyle(2, 0x7a4f2a)
  pathGfx.strokeRect(1, 1, OBJECT_SIZE - 2, OBJECT_SIZE - 2)
  pathGfx.generateTexture('obj_path', OBJECT_SIZE, OBJECT_SIZE)
  pathGfx.destroy()

  // TV: flat-screen panel with blue-gray screen, dark bezel, thin stand + base
  const tvGfx = scene.make.graphics({ x: 0, y: 0 })
  // Outer bezel
  tvGfx.fillStyle(0x1a1a2a)
  tvGfx.fillRoundedRect(0, 2, 32, 22, 3)
  // Screen (blue-gray, slightly inset)
  tvGfx.fillStyle(0x2a3f5f)
  tvGfx.fillRect(3, 5, 26, 16)
  // Screen subtle highlight strip (top of screen)
  tvGfx.fillStyle(0x4466aa, 0.6)
  tvGfx.fillRect(3, 5, 26, 3)
  // Screen glow dot (simulates power light)
  tvGfx.fillStyle(0x00ffcc)
  tvGfx.fillRect(29, 22, 2, 2)
  // Stand (thin vertical neck)
  tvGfx.fillStyle(0x222233)
  tvGfx.fillRect(14, 24, 4, 5)
  // Base
  tvGfx.fillStyle(0x2a2a3a)
  tvGfx.fillRect(8, 29, 16, 3)
  tvGfx.generateTexture('tv', OBJECT_SIZE, OBJECT_SIZE)
  tvGfx.destroy()

  // Lamp post: iron pole with warm amber lantern head
  const lampGfx = scene.make.graphics({ x: 0, y: 0 })
  // pole
  lampGfx.fillStyle(0x2a2a3a)
  lampGfx.fillRect(14, 10, 4, 20)
  // base
  lampGfx.fillStyle(0x1e1e2e)
  lampGfx.fillRect(10, 28, 12, 4)
  // lantern body
  lampGfx.fillStyle(0x222233)
  lampGfx.fillRect(10, 4, 12, 10)
  // lantern glow (warm amber)
  lampGfx.fillStyle(0xffd966, 0.9)
  lampGfx.fillRect(12, 6, 8, 6)
  // lantern top cap
  lampGfx.fillStyle(0x1e1e2e)
  lampGfx.fillRect(10, 2, 12, 4)
  lampGfx.generateTexture('lamp_post', OBJECT_SIZE, OBJECT_SIZE)
  lampGfx.destroy()

  // Ghost: white semi-transparent square (tinted at runtime per type)
  const ghostGfx = scene.make.graphics({ x: 0, y: 0 })
  ghostGfx.fillStyle(0xffffff, 0.45)
  ghostGfx.fillRect(0, 0, OBJECT_SIZE, OBJECT_SIZE)
  ghostGfx.generateTexture('obj_ghost', OBJECT_SIZE, OBJECT_SIZE)
  ghostGfx.destroy()
}
