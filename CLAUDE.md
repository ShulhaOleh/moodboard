# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # dev server with HMR
npm run build        # type-check (tsc) then bundle (vite)
npm run start        # build then serve and open in browser
npm run lint         # ESLint
npm run format       # Prettier (writes in place)
npm run typecheck    # type-check only, no emit
```

There are no tests yet.

## Architecture

Vanilla TypeScript — no UI framework. Entry point is `src/main.ts`, which mounts into `#app` in `index.html`.

**Key dependencies:**
- **TipTap** (`@tiptap/core`, `starter-kit`, `extension-text-style`, `extension-color`, `extension-underline`, `extension-text-align`) — rich text editing inside text blocks. Content is stored as HTML strings.
- **Dexie** — IndexedDB wrapper for local persistence (not yet wired up).
- **Tailwind CSS v4** — integrated via `@tailwindcss/vite` plugin, imported in `src/style.css`.

**Rendering:** All board objects live in a single HTML `#overlay` div appended to `#app`. The overlay receives a CSS `transform: translate(panX, panY) scale(zoom)` for pan and zoom. Block positions are stored in board space (relative to the overlay origin at zoom=1), so new block placement in `main.ts` must account for both pan and zoom: `(clientX - panX) / zoom`. Scroll pans; Shift+scroll pans horizontally; Ctrl+scroll zooms. A zoom widget (slider + label) in the bottom-left mirrors the scroll-wheel zoom. Its `left` position is driven by `--layers-panel-offset` CSS variable, updated by `LayersPanel.updateOffset()` whenever the panel docks, undocks, collapses, or resizes.

**BoardObject interface** (`src/board/BoardObject.ts`): Every board object implements this. `PropertiesPanel` is fully generic — it calls `getAppearanceFields()` to discover what controls to render and `setAppearanceProperty()` to apply changes. Adding a new block type requires no changes to `PropertiesPanel`. `PropertyField` is a discriminated union; current types: `number`, `slider`, `color`, `font`, `select`, `text`, `section`. Optional flags: `omitCommonProps` hides Position/Size/Rotation fields; `hideDelete` hides the Delete button; `hideName` hides the name field — all three used by `CanvasBoard`. Beyond geometry and appearance, the interface also carries:
- `onDragStart` — fired once when a drag/resize/rotate gesture commits (threshold passed or handle pressed); used by `main.ts` to push a history snapshot.
- `onBeforePropertyChange` — fired before the first setter call per mouse interaction burst; `main.ts` uses a `propertyChangeActive` flag (reset on `mouseup`) to push exactly one history entry per property-panel drag.
- `onLayerChange` — fired when `visible`, `locked`, or `name` changes; `LayersPanel` uses it to update the row without rebuilding the list.
- `name` / `setName()` — user-editable display name, editable in `PropertiesPanel` and inline in `LayersPanel` (double-click or F2).
- `getWorldCorners()` — returns the world-space corner points of the block (4 rotated corners for standard blocks, 2 endpoints for `LineBlock`); used by `SelectionBox` to compute the group AABB.
- `layerLabel` — read-only type label (e.g. `'Rectangle'`, `'Line'`); used as the default `name` on construction.

**Block class hierarchy:** All blocks extend `BaseBlock` (abstract), which holds the seven callbacks, `visible`/`locked`/`name`/`el`, selection state, the outside-click deselect listener, and `setVisible`/`setLocked`/`setName`/`destroy`/`markSelected`/`markDeselected`. Bounding-box blocks (Text, Image, Shape) additionally extend `BoxBlock<D>` (abstract), which holds `data: D`, `applyPosition`/`applySize`/`applyTransform`, `startDrag`, `getPosition`/`getSize`/`getRotation`/`getWorldCorners`, and `setPosition`/`setSize`/`setRotation`. `LineBlock` extends `BaseBlock` directly because its spatial model (two absolute endpoints) doesn't fit the bounding-box pattern. Extension points on `BoxBlock`: `minResizeWidth`/`minResizeHeight` getters (overridden by `TextBlock` and `ShapeBlock`), `isEditing()` (overridden by `TextBlock` to block drag during TipTap session).

**Block types:** `TextBlock` (rich text via TipTap), `ImageBlock` (bitmap), `ShapeBlock` (SVG shapes: rectangle, ellipse, polygon, star), `LineBlock` (SVG line/arrow with draggable endpoints; position is stored as two absolute board coordinates `x1,y1→x2,y2` rather than a bounding box + rotation).

**Text editing flow:** Double-clicking a `TextBlock` mounts a TipTap `Editor` instance into the block's content element. A `TextFormatToolbar` (floating above the selection) appears on text selection and is destroyed when editing ends. The block temporarily resets its rotation to 0° during editing, restoring it on exit.

**Selection model:** Each block manages its own selection state and listens on `document` for outside clicks. `main.ts` owns a `selectedBlocks: Set<BoardObject>` and wires `onSelect`/`onDeselect` in `addBlock()`. Key rules:
- `onSelect` receives the `MouseEvent` — Ctrl+click adds to selection, plain click replaces it.
- When switching between blocks, the outgoing block skips `onDeselect` if Ctrl is held or the click is on another board object (guard: `.closest('.text-block, .image-block, .shape-block, .line-block')`).
- `markSelected()` / `markDeselected()` update visual state only (no callbacks) — used for multi-select and marquee.

**SelectionBox** (`src/ui/SelectionBox.ts`): Renders an AABB outline with four corner resize handles and a rotation handle. It is used for **both single and multi-block selection** — `setBlocks([block])` for a single non-`LineBlock`, `setBlocks([...blocks])` for a group. The only case it hides is zero blocks or a lone `LineBlock` (which uses its own draggable endpoint handles instead). Resize and rotate on individual blocks are handled entirely by `SelectionBox`; `BoxBlock` has no per-block handles. `SelectionBox.update()` must be called after any drag frame that moves a block so the outline tracks it — `main.ts` does this in `block.onDragMove`.

**Drag:** Each block fires `onDragMove(dx, dy)` on every drag frame. `main.ts` applies the same delta to all other blocks in `selectedBlocks`, keeping relative positions intact during grouped drag.

**History and clipboard** (`main.ts`): `BlockSnapshot` is a tagged union (`{ type: 'text'; data: TextBlockData } | ...`) covering all four block types. `pushHistory()` snapshots the current `blocks[]` before any mutating operation. `undo()` (Ctrl+Z) restores the previous snapshot. `copySelected()` (Ctrl+C/X) writes snapshots to `clipboard[]`. `paste()` (Ctrl+V) reconstructs blocks from snapshots with a small offset; `pasteCount` tracks repeated pastes to cascade the offset.

**Board modes** (`AddBar`): Two modes — `edit` (default) and `explore`. Mode is tracked in `main.ts`. In explore mode, `#app.explore-mode` CSS class disables pointer events on all blocks and the board mousedown handler pans the overlay instead of drawing a marquee.

**Marquee selection:** Dragging on empty board space in edit mode draws a `.marquee` div (`position: fixed`) and on mouseup selects all blocks whose `getBoundingClientRect()` intersects it. Capture the rect before calling `.remove()` — after removal it returns zeros.

**Layers panel** (`src/ui/LayersPanel.ts`): Left-docked panel listing all blocks in z-order (last `blocks[]` entry = frontmost = top row). Supports drag-to-reorder (HTML5 DnD), per-row visibility and lock toggles, and inline name editing (double-click or F2). Mirrors the dock/undock/collapse/resize behavior of `PropertiesPanel`. `onReorder` callback in `main.ts` splices `blocks[]` then calls `overlay.appendChild` on every block to re-sync DOM order. `refresh()` rebuilds all rows; `notifySelectionChanged()` only toggles `is-selected` classes. The panel uses `data-array-index` on each row to map between the reversed visual order and the actual array index.

**Font loading:** `src/lib/fonts.ts` exports a curated `FONTS` list and `loadFont(family)`, which lazily injects a Google Fonts `<link>` tag.

**Image storage:** `ImageBlockData.src` is a runtime URL (object URL from a Blob, or a static asset path). When Dexie persistence is wired up, store the Blob (`imageBlob` field) and recreate the object URL on load. Call `URL.revokeObjectURL` via `ImageBlock.destroy()` when removing a block whose src is a blob URL. Drag-and-drop of image files from the OS onto `#app` is handled in `main.ts` — drop position is converted from client coords using `(clientX - panX) / zoom`.

**Static assets:** Place images in `public/assets/`. Vite serves them at `/moodboard/assets/<filename>` (base path is `/moodboard/`).

**Module structure:**
```
src/
  board/
    extensions/       # custom TipTap extensions (FontSize, FontFamily)
    BoardObject.ts    # shared interface + PropertyField discriminated union
    BaseBlock.ts      # abstract base: callbacks, lifecycle, selection logic
    BoxBlock.ts       # abstract base for Text/Image/Shape: geometry, drag, AABB
    CanvasBoard.ts    # pseudo-object for canvas background (shown when nothing selected)
    TextBlock.ts      # rich-text block (extends BoxBlock)
    ImageBlock.ts     # bitmap block (extends BoxBlock)
    ShapeBlock.ts     # SVG shape block (extends BoxBlock)
    LineBlock.ts      # line/arrow block with two draggable endpoints (extends BaseBlock)
  ui/
    AddBar.ts             # top-center toolbar: mode picker dropdown + add buttons
    LayersPanel.ts        # left-docked layers list with reorder, visibility, lock, rename
    SelectionBox.ts       # AABB outline + 4-corner resize + rotate handles (single and multi)
    TextFormatToolbar.ts  # floating toolbar shown on text selection
    PropertiesPanel.ts    # right-docked side panel; generic over BoardObject
    ColorPicker.ts        # swatch + popover with color input and alpha slider
    FontPicker.ts         # searchable Google Fonts dropdown
  lib/
    fonts.ts          # font list + lazy Google Fonts loader
  main.ts             # board state: blocks[], selectedBlocks, history, clipboard, pan, mode
  style.css           # entry point — @imports Tailwind and all component stylesheets
  styles/
    tokens.css        # :root color variables
    base.css          # * reset + html/body
    board.css         # zoom widget, marquee, drag-over, explore-mode
    panel.css         # shared panel shell (header, drag handle, resize handles, buttons)
    board/
      line-block.css
      shape-block.css
      image-block.css
      text-block.css
    ui/
      add-bar.css
      properties-panel.css
      layers-panel.css
      text-format-toolbar.css
      color-picker.css
      font-picker.css
      selection-box.css
```

## Code Style

- 4-space indentation
- No semicolons
- TypeScript strict mode — `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns` are all errors
- Pre-commit hook (husky + lint-staged) runs Prettier then ESLint on staged `src/**/*.ts` files

## Comments

- Every file must start with a header comment describing the purpose of the file (not its contents).
- Write the minimum number of comments necessary — only when the intent isn't obvious from the code.
- Comments describe *what* and *why*, never *how*.
