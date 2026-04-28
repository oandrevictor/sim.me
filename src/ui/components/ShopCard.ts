import Phaser from 'phaser'
import { getFramedObjectDisplaySize, type ObjectType } from '../../objects/objectTypes'
import { SHOP_CARD_SIZE } from '../ShopPanelLayout'

export interface ShopCardChrome {
  bg: Phaser.GameObjects.Graphics
  hover: Phaser.GameObjects.Graphics
  zone: Phaser.GameObjects.Zone
}

export interface ShopIconItem {
  type: ObjectType
  textureKey: string
  frame?: number
  previewColor: number
}

export function createShopCardChrome(scene: Phaser.Scene, cx: number, cy: number): ShopCardChrome {
  const bg = scene.add.graphics()
  bg.fillStyle(0x20283c, 0.88)
  bg.fillRoundedRect(cx - SHOP_CARD_SIZE / 2, cy - SHOP_CARD_SIZE / 2, SHOP_CARD_SIZE, SHOP_CARD_SIZE, 6)
  bg.lineStyle(1, 0x3a455f, 0.65)
  bg.strokeRoundedRect(cx - SHOP_CARD_SIZE / 2, cy - SHOP_CARD_SIZE / 2, SHOP_CARD_SIZE, SHOP_CARD_SIZE, 6)

  const hover = scene.add.graphics()
  hover.lineStyle(1, 0xf0c85a, 0.85)
  hover.strokeRoundedRect(cx - SHOP_CARD_SIZE / 2, cy - SHOP_CARD_SIZE / 2, SHOP_CARD_SIZE, SHOP_CARD_SIZE, 6)
  hover.setVisible(false)

  const zone = scene.add.zone(cx, cy, SHOP_CARD_SIZE, SHOP_CARD_SIZE)
  zone.setInteractive({ useHandCursor: true })
  zone.on('pointerover', () => {
    bg.setAlpha(1)
    hover.setVisible(true)
  })
  zone.on('pointerout', () => {
    bg.setAlpha(0.88)
    hover.setVisible(false)
  })
  return { bg, hover, zone }
}

export function createShopItemIcon(
  scene: Phaser.Scene,
  item: ShopIconItem,
  cx: number,
  cy: number,
): Phaser.GameObjects.Sprite | Phaser.GameObjects.Graphics {
  if ((item.type as string) === '__stage_solo' && item.textureKey && scene.textures.exists(item.textureKey)) {
    const sprite = scene.add.sprite(cx, cy - 4, item.textureKey)
    sprite.setDisplaySize(40, 40)
    return sprite
  }
  if (item.textureKey && scene.textures.exists(item.textureKey)) {
    const sprite = scene.add.sprite(cx, cy - 6, item.textureKey, item.frame ?? 0)
    const { w, h } = getFramedObjectDisplaySize(item.type, 1.1)
    sprite.setDisplaySize(w, h)
    return sprite
  }
  if ((item.type as string) === '__stage') return createStagePreview(scene, cx, cy)
  return createFallbackPreview(scene, item.previewColor, cx, cy)
}

function createStagePreview(scene: Phaser.Scene, cx: number, cy: number): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics()
  g.fillStyle(0x1a1a2e); g.fillRect(cx - 14, cy - 8, 28, 16)
  g.lineStyle(1, 0xffd700); g.strokeRect(cx - 14, cy - 8, 28, 16)
  g.fillStyle(0x2d2d4a); g.fillRect(cx - 11, cy - 5, 22, 10)
  const lights = [0xff6644, 0x44aaff, 0xff6644, 0x44aaff]
  for (let i = 0; i < 4; i++) { g.fillStyle(lights[i]); g.fillCircle(cx - 9 + i * 6, cy - 5, 2) }
  return g
}

function createFallbackPreview(scene: Phaser.Scene, color: number, cx: number, cy: number): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics()
  g.fillStyle(color); g.fillRect(cx - 12, cy - 14, 24, 20)
  g.lineStyle(1, 0x4a3d28); g.strokeRect(cx - 12, cy - 14, 24, 20)
  g.fillStyle(0x8b7355); g.fillRect(cx - 4, cy + 2, 8, 4)
  return g
}
