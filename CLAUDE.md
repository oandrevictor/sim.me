# CLAUDE.md — sim.me Development Guidelines

## File Size Limits

- **Hard limit: 200 lines per file.** If a file exceeds this, stop and split it before continuing.
- **Soft limit: 150 lines.** Above this, ask: "does this file have more than one responsibility?"
- No exceptions for scenes, UI classes, or systems — they must be split too.

## Single Responsibility

Every file should answer "what is this for?" in one sentence.

- ❌ `GameScene.ts` handles input + spawning + interactions + food + systems + bots
- ✅ `PlayerInput.ts` handles player keyboard/mouse input and walk targets
- ✅ `FoodInteractionHandler.ts` handles stove, trash, plate pick-up and placement

If you can't describe a file in one sentence, extract until you can.

## How to Split Large Files

### GameScene.ts (currently 915 lines — split into these)

| New File | Responsibility |
|----------|----------------|
| `scenes/GameScene.ts` | Scene lifecycle only: preload, create, update orchestration |
| `input/PlayerInput.ts` | WASD/arrow keys, click-to-walk, zoom |
| `interaction/InteractionManager.ts` | Interactable highlight, proximity detection |
| `interaction/FoodHandler.ts` | Carry indicator, plate pickup, food placement on tables |
| `world/ObjectSpawner.ts` | `spawnObject()` and all type-specific registration |
| `world/BuildingPlacer.ts` | `placeBuilding()`, `blockBuildingCells()` |
| `world/StagePlacer.ts` | `placeStage()`, stage pickup in shop mode |

### MenuUI.ts (currently 743 lines — split into these)

| New File | Responsibility |
|----------|----------------|
| `ui/MenuUI.ts` | Tab bar, panel visibility switching, public API |
| `ui/ShopPanel.ts` | Shop category tabs, item/building/stage cards |
| `ui/InventoryPanel.ts` | Inventory grid rendering and refresh |
| `ui/WorkPanel.ts` | Work tab: restaurant customers + stage audience |
| `ui/components/CardRow.ts` | Reusable: swatch + name + status row (used in WorkPanel) |
| `ui/components/ItemCard.ts` | Reusable: icon + label + hover card (used in ShopPanel) |

### PlacementManager.ts (currently 351 lines)

| New File | Responsibility |
|----------|----------------|
| `placement/PlacementManager.ts` | Mode orchestration, input binding, callbacks |
| `placement/GhostFactory.ts` | Creates ghost Graphics/Sprites for each placement type |

## Reusable Components to Extract

These patterns appear in multiple files and must not be copy-pasted again.

### `ui/components/CardRow.ts`
Used by: `WorkPanel`, `StoreUI`, `BuildingTypeUI`, `RecipeSelectUI`
```ts
// Renders: [color dot] [name] [status text + dot]
// Handles: pointerover/pointerout hover state
createCardRow(scene, container, { x, y, color, name, status, statusColor })
```

### `ui/components/Panel.ts`
Used by: `StoreUI`, `BuildingTypeUI`, `RecipeSelectUI`, `WorkPanel`
```ts
// Renders: overlay + dark rounded rect + title
createPanel(scene, { width, height, title, titleColor })
```

### `ui/statusUtils.ts`
Used by: `WorkPanel`, any future status display
```ts
getBotStatusLabel(state: BotState): string
getBotStatusColor(state: BotState): string
```

### `placement/GhostFactory.ts`
Used by: `PlacementManager`
```ts
createObjectGhost(scene, type, rotation): Phaser.GameObjects.Sprite
createBuildingGhost(scene): Phaser.GameObjects.Graphics
createStageGhost(scene, rotation): Phaser.GameObjects.Graphics
```

## Code Patterns to Follow

### No graphics redraw on hover — use alpha/tint instead
```ts
// ❌ Don't redraw graphics on every pointerover
zone.on('pointerover', () => { bg.clear(); bg.fillStyle(0x3a3a5e, 0.9); ... })

// ✅ Pre-render two states and swap, or tint a sprite
zone.on('pointerover', () => bg.setAlpha(0.9))
zone.on('pointerout', () => bg.setAlpha(0.7))
```

### Extract repeated drawing logic into functions
```ts
// ❌ Don't copy isometric geometry into multiple files
const hw = gw * TILE_W / 2
const hh = gh * TILE_H / 2
gfx.moveTo(0, -hh); gfx.lineTo(hw, 0) ...

// ✅ Extract to a helper
drawIsoFootprint(gfx, gw, gh, fillColor, lineColor)
```

### Keep switch statements small — extract label/color maps
```ts
// ❌ Don't put label/color switches directly in UI classes
private getStatusLabel(state: string): string { switch(state) { ... } }

// ✅ Put in ui/statusUtils.ts and import
import { getBotStatusLabel, getBotStatusColor } from '../ui/statusUtils'
```

### One system = one file
```ts
// ✅ RestaurantSystem, StageSystem, CookingSystem are good examples
// ❌ Don't add new logic to GameScene — create a new System instead
```

## Project Structure Reference

```
src/
├── config/          # World constants only
├── data/            # Static data (recipes, etc.)
├── entities/        # Game objects: Nirv, BotNirv, Building, Stage
├── input/           # Player input handler
├── interaction/     # Interactable objects, food handling
├── objects/         # Object type registry
├── pathfinding/     # A* only
├── placement/       # Placement modes + ghost factory
├── scenes/          # Scene orchestration only (thin)
├── storage/         # localStorage utilities
├── systems/         # Game systems: Restaurant, Stage, Cooking
├── ui/
│   ├── components/  # Reusable UI primitives (Panel, CardRow, ItemCard)
│   └── *.ts         # Panels and menus
├── utils/           # Pure math utilities (isoGrid)
└── world/           # Object/building/stage spawning and placement
```

## Before Adding New Features

1. **Check if a utility already exists** — look in `utils/`, `ui/components/`, `systems/` before writing new code.
2. **If touching a file >150 lines**, extract at least one responsibility before adding more.
3. **If copy-pasting more than 3 lines**, extract a shared function first.
4. **New NPC behaviors** go in `BotNirv.ts` state machine or a dedicated behavior file — not in `GameScene`.
5. **New UI panels** go in `ui/` as their own file, using `ui/components/Panel.ts` and `ui/components/CardRow.ts`.
6. **New world structures** (like Stage) follow the pattern: `entities/`, `storage/`, `systems/`, wired in `world/`.
