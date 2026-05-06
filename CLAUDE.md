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
- **Dexie** — IndexedDB wrapper for local persistence. Board state is saved under the key `'default'` and loaded on startup; `scheduleSave()` debounces writes (1500 ms), `flushSave()` fires synchronously on `visibilitychange`/`pagehide`/`beforeunload`. Schema is versioned via `SCHEMA_VERSION` in `src/lib/db.ts` (currently 5) — bump it and add a migration branch in `loadBoard()` in `main.ts` whenever `PersistedBlock` changes. `loadBoard()` currently accepts versions 1–5; add new accepted versions alongside the bump.
- **Tailwind CSS v4** — integrated via `@tailwindcss/vite` plugin, imported in `src/style.css`.
- **Lucide** — icon library. All UI icons are imported from `lucide` and serialised to SVG strings in `src/lib/icons.ts`; import named constants from there instead of writing inline SVG strings in components.

**Rendering:** All board objects live in a single HTML `#overlay` div appended to `#app`. The overlay receives a CSS `transform: translate(panX, panY) scale(zoom)` for pan and zoom. Block positions are stored in board space (relative to the overlay origin at zoom=1), so new block placement in `main.ts` must account for both pan and zoom: `(clientX - panX) / zoom`. Scroll pans; Shift+scroll pans horizontally; Ctrl+scroll zooms. A zoom widget in the bottom-left mirrors the scroll-wheel zoom — it has `−`/`+` buttons (click or hold to repeat with a 500 ms initial delay), a clickable percentage label that accepts direct numeric input (Enter/Escape to confirm/cancel), and a range slider. Its `left` position is driven by `--layers-panel-offset` CSS variable, updated by `LayersPanel.updateOffset()` whenever the panel docks, undocks, collapses, or resizes.

**Selection indicator constraint:** `#app` has `overflow: hidden`, which clips CSS `outline` and any `box-shadow` that bleeds outside the element's own bounds if the element sits at the viewport edge. Selection indicators on blocks must use `box-shadow: 0 0 0 1px` (not `outline`) and must not rely on anything rendering outside `#app`.

**BoardObject interface** (`src/board/BoardObject.ts`): Every board object implements this. `PropertiesPanel` is fully generic — it calls `getAppearanceFields()` to discover what controls to render and `setAppearanceProperty()` to apply changes. Adding a new block type requires no changes to `PropertiesPanel`. `PropertyField` is a discriminated union; current types: `number`, `slider`, `color`, `font`, `select`, `text`, `section`, `button`, `node`. The `text` type accepts `allowFilePick?: boolean`, which adds a browse button that calls the optional `setFileProperty?(key, file)` method on the block (used by `ImageBlock` to store the raw `File` as `imageBlob`). The `button` type triggers `setAppearanceProperty(key, '')` on click — used by `CanvasBoard` for board-level actions (export JSON, import, new board, load demo). The `node` type inserts a raw `HTMLElement` directly into the appearance area without wrapping it in a `prop-row`; an optional `onMount()` callback fires each time the panel re-shows the object — used by `CanvasBoard` to embed its self-contained PNG export widget (collapsible toggle → preview thumbnail, scale dropdown, export button). Optional flags: `omitCommonProps` hides Position/Size/Rotation fields; `hideDelete` hides the Delete button; `hideName` hides the name field — all three used by `CanvasBoard`. Beyond geometry and appearance, the interface also carries:
- `onDragStart` — fired once when a drag/resize/rotate gesture commits (threshold passed or handle pressed); used by `main.ts` to push a history snapshot.
- `onBeforePropertyChange` — fired before the first setter call per mouse interaction burst; `main.ts` uses a `propertyChangeActive` flag (reset on `mouseup`) to push exactly one history entry per property-panel drag.
- `onLayerChange` — fired when `visible`, `locked`, or `name` changes; `LayersPanel` uses it to update the row without rebuilding the list.
- `onAppearanceChange` — fired when appearance field values change without a full re-render (e.g. cursor moves inside a TipTap editor); `PropertiesPanel` uses it to update field controls in-place via a `fieldUpdaters` map without rebuilding the DOM.
- `name` / `setName()` — user-editable display name, editable in `PropertiesPanel` and inline in `LayersPanel` (double-click or F2).
- `getWorldCorners()` — returns the world-space corner points of the block (4 rotated corners for standard blocks, 2 endpoints for `LineBlock`); used by `SelectionBox` to compute the group AABB.
- `layerLabel` — read-only type label (e.g. `'Rectangle'`, `'Line'`); used as the default `name` on construction.

**Block class hierarchy:** All blocks extend `BaseBlock` (abstract), which holds the seven callbacks, `visible`/`locked`/`name`/`el`, selection state, the outside-click deselect listener, and `setVisible`/`setLocked`/`setName`/`destroy`/`markSelected`/`markDeselected`. Bounding-box blocks (Text, Image, Shape, Path) additionally extend `BoxBlock<D>` (abstract), which holds `data: D`, `applyPosition`/`applySize`/`applyTransform`, `startDrag`, `getPosition`/`getSize`/`getRotation`/`getWorldCorners`, and `setPosition`/`setSize`/`setRotation`. `LineBlock` extends `BaseBlock` directly because its spatial model (two absolute endpoints) doesn't fit the bounding-box pattern. Extension points on `BoxBlock`: `minResizeWidth`/`minResizeHeight` getters (overridden by `TextBlock`, `ShapeBlock`, and `PathBlock`), `isEditing()` (overridden by `TextBlock` to block drag during TipTap session).

**Block types:** `TextBlock` (pure floating rich text — no background, border, or shadow; only font/size/color/align properties), `ImageBlock` (bitmap), `ShapeBlock` (SVG shapes: rectangle, ellipse, polygon, star; supports optional inline text), `LineBlock` (SVG line/arrow with draggable endpoints; position is stored as two absolute board coordinates `x1,y1→x2,y2` rather than a bounding box + rotation), `PathBlock` (freehand pencil strokes; points stored in local space relative to bounding box origin; supports Catmull-Rom smoothing, width tapering rendered as a filled outline polygon, and start→end color gradients via SVG `<linearGradient>`). `PathBlock.setSize()` scales all local points proportionally so the stroke shape is preserved on resize. `NoteBlock` (sticky-note card with auto-height rich text; height is always driven by content via CSS, only width is user-resizable; supports three shape variants: `rectangle`, `dog-ear`, `stacked`). The `stacked` variant requires a sibling `stackBackEl` div inserted into the overlay *before* `this.el` — it cannot be a child because `z-index: -1` cannot go behind a parent's own background. After every layer reorder, `main.ts` calls `NoteBlock.syncLayerOrder()` on each note to re-insert `stackBackEl` at the correct position.

**Text editing flow:** Double-clicking a `TextBlock` or `ShapeBlock` starts a TipTap editing session. For `TextBlock`, TipTap mounts into the block's content element and a `TextFormatToolbar` (floating above the selection) appears on text selection; the block temporarily resets rotation to 0° during editing. For `ShapeBlock`, TipTap mounts into `textInnerEl` (a flex child of `textEl`, which is a flex column container positioned `inset: 0`); the flex `justifyContent` on `textEl` drives vertical alignment so that the rendered and editing states stay visually identical. Both destroy TipTap on blur. `ShapeBlock` fires `onTextEditChange` when editing starts/ends so `PropertiesPanel` can refresh the text section — the text section is hidden when the shape has no text and is not currently being edited. `TextBlock.getAppearanceFields()` reads live TipTap mark attributes (`textStyle.color`, `textStyle.fontFamily`, `textStyle.fontSize`, `paragraph.textAlign`) when the editor is active, so the Properties Panel reflects the formatting at the cursor/selection. On every `selectionUpdate` and `update` event, `onAppearanceChange` fires so the panel updates in-place. On edit exit, `syncMarksToData()` scans the ProseMirror document: if all text nodes share the same value for a given mark (color, font-family, font-size), that value is promoted to `data.*` and the inline marks are stripped via `chain().selectAll().unset*().run()` — making the block-level property the sole source of truth so subsequent Properties Panel changes apply to all text.

**Selection model:** Each block manages its own selection state and listens on `document` for outside clicks. `main.ts` owns a `selectedBlocks: Set<BoardObject>` and wires `onSelect`/`onDeselect` in `addBlock()`. Key rules:
- `onSelect` receives the `MouseEvent` — Ctrl+click adds to selection, plain click replaces it.
- When switching between blocks, the outgoing block skips `onDeselect` if Ctrl is held or the click is on another board object (guard: `.closest('.text-block, .image-block, .shape-block, .line-block')`).
- `markSelected()` / `markDeselected()` update visual state only (no callbacks) — used for multi-select and marquee.

**SelectionBox** (`src/ui/SelectionBox.ts`): Renders an AABB outline with four corner resize handles and a rotation handle. It is used for **both single and multi-block selection** — `setBlocks([block])` for a single non-`LineBlock`, `setBlocks([...blocks])` for a group. The only case it hides is zero blocks or a lone `LineBlock` (which uses its own draggable endpoint handles instead). Resize and rotate on individual blocks are handled entirely by `SelectionBox`; `BoxBlock` has no per-block handles. `SelectionBox.update()` must be called after any drag frame that moves a block so the outline tracks it — `main.ts` does this in `block.onDragMove`.

**Drag:** Each block fires `onDragMove(dx, dy)` on every drag frame. `main.ts` applies the same delta to all other blocks in `selectedBlocks`, keeping relative positions intact during grouped drag.

**Snap and alignment guides** (`src/snap/SnapEngine.ts`, `src/ui/GuideOverlay.ts`): `computeSnap(dragged, candidates, threshold)` is a pure function — no DOM, no side effects. It returns a snapped position and a `SnapGuide[]` list. Threshold is always `6 / zoom` board units (= 6 screen pixels at any zoom). `BoxBlock` exposes a `snapPosition: ((x, y) => {x, y}) | null` hook; `main.ts` injects a closure that calls `computeSnap` and forwards guides to `GuideOverlay.draw()`. Co-traveling selected blocks naturally receive the post-snap delta because `onDragMove(dx, dy)` propagates the already-corrected delta. `GuideOverlay.el` is appended to `#app` (not `#overlay`) as `position: fixed; inset: 0` so it is never subject to the overlay's CSS transform or stacking context; draw() converts board coordinates to screen coordinates via `panX + bx * zoom`. Guides clear on `mouseup` via `guideOverlay.clear()`.

**Groups** (`main.ts`, `src/lib/db.ts`): Groups are modelled as a `Map<string, GroupRecord>` (`{ id, name }`) in `main.ts`, not as a container block. Each block carries `groupId?: string` (a mutable field on `BaseBlock`; pseudo-objects `CanvasBoard` and `PencilTool` expose `readonly groupId = undefined`). `groupCounter` is a monotonically increasing integer used to name new groups (`Group 1`, `Group 2`, …) — it never decrements on ungroup or undo, so numbers never repeat. `groupSelected()` (Ctrl+G) assigns a fresh UUID to all selected blocks; `ungroupSelected()` (Ctrl+Shift+G) clears `groupId` and calls `cleanupEmptyGroups()`. Click-to-select behavior in `main.ts`: a plain click on a grouped block selects all unlocked-visible members first; a second click (when the group is already fully selected) drills into the individual block. `paste()` remaps group IDs via a `groupRemap` map so pasted groups form new parallel groups. Groups are persisted in `BoardRecord.groups?: GroupRecord[]` (schema v5) and cleared alongside blocks on new board / import / load-demo.

**History and clipboard** (`main.ts`): `BlockSnapshot` is a tagged union (`{ type: 'text'; data: TextBlockData } | ...`) covering all block types. `HistoryEntry = { blocks: BlockSnapshot[]; groups: GroupRecord[] }` — every history entry snapshots both blocks and the groups map together so undo/redo always restores a consistent state. `history` and `future` are parallel stacks of `HistoryEntry`. `pushHistory()` snapshots the current `blocks[]` and `groups` onto `history`, clears `future`, and calls `syncHistoryState()`. `undo()` moves the current state to `future` and pops from `history`. `redo()` moves the current state back to `history` and pops from `future`. Both stacks are cleared on new board, import, and load-demo. `syncHistoryState()` calls `addBar.setHistoryState(canUndo, canRedo)` to keep the toolbar undo/redo buttons in sync — it must be called after every mutation to `history` or `future`. `copySelected()` writes snapshots to `clipboard[]`. `paste()` reconstructs blocks from snapshots with a small offset; `pasteCount` tracks repeated pastes to cascade the offset. The keys for all these operations are user-configurable — see **Settings and keybindings** below.

Copy, cut, and paste are handled via the native DOM `copy`/`cut`/`paste` events rather than the `keydown` shortcuts array — this is required because `clipboardData` is only accessible in those events. When the user copies board objects, `BOARD_CLIPBOARD_SENTINEL` (`'\x00moodboard-blocks\x00'`) is written to the OS clipboard via `e.clipboardData.setData()` (synchronous, in the `copy`/`cut` event) and also via `navigator.clipboard.writeText()` as a backup for custom keybindings. The `paste` event handler checks for the sentinel first (→ paste blocks), then clipboard images (→ new `ImageBlock`), then plain text (→ new `TextBlock` via `plainTextToHtml()`). Calling `e.preventDefault()` in the keydown handler for these keys would suppress the DOM events entirely, which is why they are not in the `shortcuts` array.

**Board modes** (`AddBar`): Two modes — `edit` (default) and `explore`. Mode is tracked in `main.ts`. In explore mode, `#app.explore-mode` CSS class disables pointer events on all blocks and the board mousedown handler pans the overlay instead of drawing a marquee. In both modes, right-click drag (`button === 2`) and middle-click drag (`button === 1`) also pan — the `contextmenu` event is suppressed only when a right-drag actually moved past the 4 px threshold (`rightDragPanned` flag).

**Pencil tool** (`main.ts`, `AddBar`, `PencilTool`): Toggled by `setPencilActive()` — sets `pencilActive`, toggles `#app.pencil-mode` (crosshair cursor), shows `pencilTool` in the Properties Panel (deactivating restores `canvasBoard` when nothing is selected), and deactivates the eraser if it is active. `PencilTool` is a pseudo-object (same pattern as `CanvasBoard`) that owns pencil settings (`stroke`, `strokeEnd`, `strokeWidth`, `taper`, `smoothing`) and exposes them as `PropertyField`s; settings are persisted to `localStorage` under `moodboard-pencil` and survive page reloads. `main.ts` keeps a local `pencilSettings` variable synced via `pencilTool.onSettingsChange` and passes it to `PathBlock` on commit. Drawing uses a `requestAnimationFrame` loop: a "nib" position chases the real cursor with exponential decay (`PENCIL_ELASTIC = 0.25`), accumulates smoothed points, and updates a live SVG preview path. On mouseup, `commitDrawing()` runs RDP simplification (epsilon = `1.5 / zoom` board units), computes the bounding box, converts to local space, and creates a `PathBlock`.

**Eraser tool** (`main.ts`, `AddBar`): Toggled by `setEraserActive()` (Shift+E) — sets `eraserActive`, toggles `#app.eraser-mode` (hides cursor; shows `#eraser-cursor`, a 24 px circle following the mouse), and deactivates the pencil if it is active. Only `PathBlock`s are erasable. On mousedown the `eraserHeld` flag is set; on every mousemove while held, `eraseAt(cx, cy)` is called. Hit detection is geometric: bounding rect pre-check with a `ERASER_RADIUS = 16` px margin, then point proximity — each stored local-space point is transformed to screen coordinates via `(data.x + pt.x) * zoom + panX` and tested against the 16 px radius. `pointer-events: none` on all blocks in eraser mode means `elementsFromPoint` cannot be used. History is pushed lazily — `pushHistory()` is called only on the first deletion per drag session (`eraserHistoryPushed` flag, reset on mousedown).

**Marquee selection:** Dragging on empty board space in edit mode draws a `.marquee` div (`position: fixed`) and on mouseup selects all blocks whose `getBoundingClientRect()` intersects it. Capture the rect before calling `.remove()` — after removal it returns zeros.

**Layers panel** (`src/ui/LayersPanel.ts`): Left-docked panel listing all blocks in z-order (last `blocks[]` entry = frontmost = top row). Supports drag-to-reorder (HTML5 DnD), per-row visibility and lock toggles, and inline name editing (double-click or the rename shortcut). Mirrors the dock/undock/collapse/resize behavior of `PropertiesPanel`. `onReorder` callback in `main.ts` splices `blocks[]` then calls `overlay.appendChild` on every block to re-sync DOM order. `refresh()` rebuilds all rows; `notifySelectionChanged()` only toggles `is-selected` classes. The panel uses `data-array-index` on each row to map between the reversed visual order and the actual array index. The rename key is injected via `layersPanel.isRenameKey` from `main.ts` so it respects the user's configured binding. Grouped blocks render as a collapsible tree: `buildDisplayItems()` collects same-`groupId` blocks into `GroupItem` containers positioned at the z-order of their frontmost member; each group shows a chevron header with its own vis/lock/rename controls, and member rows are indented with CSS tree connectors (├ / └ via `::before`/`::after` pseudo-elements on `.layer-member-row`).

**Settings and keybindings** (`src/lib/settings.ts`, `src/lib/keybindings.ts`, `src/ui/SettingsPanel.ts`): User preferences live in `localStorage`. `UserSettings` (key `moodboard-settings`) holds `theme` (`'light' | 'dark' | 'system'`), `accent` (`AccentColor`), and `uiFont` (string). `applyTheme()` sets `data-theme` on `<html>`; `applyAccent()` sets `data-accent`; `applyUiFont()` sets `font-family` on `<html>`. Call `beginThemeTransition()` immediately before either `applyTheme` or `applyAccent` when the user triggers the change — it briefly adds a `theme-transition` class to `<html>` so CSS can animate color properties; do NOT call it on the initial startup apply (no animation on load). `KeybindingMap` (key `moodboard-keybindings`) maps each `ShortcutAction` to `ActionBindings = { primary: Keybinding; secondary: Keybinding | null }` — every action supports an optional second binding. `matchesAction(e, bindings)` checks both slots; `ctrl: true` accepts either Ctrl or Cmd. All board shortcut checks in `main.ts` use `matchesAction`; `LayersPanel.isRenameKey` is the one exception wired via a callback. `SettingsPanel` is a full-screen overlay with a Discord-style sidebar — `open()` registers a capture-phase Escape listener that intercepts before the board's handler. To add a new shortcut: add the action to `ShortcutAction`, `ACTION_LABELS`, and `DEFAULT_KEYBINDINGS` in `keybindings.ts`; add it to the `actions` array in `SettingsPanel.buildKeybindingsPage()`; use `matchesAction(e, keybindings.yourAction)` in `main.ts`. If the shortcut should be reflected in a UI hint (e.g. the mode dropdown), update `syncModeHints()` in `main.ts` and `AddBar.updateModeHints()` accordingly — `syncModeHints` is called on load and inside `onKeybindingsChange` so hints stay in sync when the user rebinds.

**Dialogs:** Never use native `alert()` or `confirm()`. Use `Dialog.alert(message)` and `Dialog.confirm(message, { confirmLabel?, destructive? })` from `src/ui/Dialog.ts` — both return Promises and render styled modal popups.

**Canvas background:** The checkerboard grid is always the base `background-image` of `#app` (not conditionally toggled). The canvas color is applied on top via the `--canvas-color` CSS custom property as the first `linear-gradient` layer — fully transparent by default, so the checkerboard shows through; a semi-transparent color blends over it correctly; a fully opaque color hides it entirely. `CanvasBoard.setBackground()` sets this property via `appEl.style.setProperty('--canvas-color', ...)`. There is no `canvas-transparent` class.

**Font loading:** `src/lib/fonts.ts` exports a curated `FONTS` list, `loadFont(family)` (lazily injects a Google Fonts `<link>` tag), and `fetchAllFonts()` (fetches the full ~1500-family catalogue from the Fontsource API at `https://api.fontsource.org/v1/fonts` — CORS-friendly, no key required — caches the result for the session, falls back to the curated list on failure). `FontPicker` calls `fetchAllFonts()` on first open and uses the result to power the search input; the curated list is shown by default when no query is typed.

**Image storage:** `ImageBlockData.src` is a runtime URL (object URL from a Blob, or a static asset path). `imageBlob?: Blob` holds the raw binary — stored in IndexedDB via structured clone and used to recreate `src` on load. Call `URL.revokeObjectURL` via `ImageBlock.destroy()` when removing a block whose src is a blob URL. Images enter the board either by drag-and-drop onto `#app` (drop position converted from client coords using `(clientX - panX) / zoom`) or by browsing via the Source field in `PropertiesPanel`. JSON export converts blobs to base64 data URLs so the file is fully self-contained; import decodes them back to `Blob`.

**Static assets:** Place images in `public/assets/`. Vite serves them at `/moodboard/assets/<filename>` (base path is `/moodboard/`).

**PNG export** (`src/export/`): `Exporter.exportToPng(blocks, background, scale)` renders the board to an `OffscreenCanvas` (falls back to `HTMLCanvasElement`) by traversing each visible block's data model — no DOM capture. Key implementation details:
- `applyBoxTransform` mirrors CSS `transform-origin: center`: `translate(cx,cy) → rotate → translate(-w/2,-h/2)`.
- `buildShapePath` constructs paths in block-local pixel space (0..w, 0..h), not the SVG 0-100 viewBox, so `ctx.lineWidth = strokeWidth` directly (no viewBox scale factor).
- Arrow marker scale: `markerScale = (strokeWidth × markerWidth) / 10`, matching the SVG `markerUnits="strokeWidth"` definitions in `LineBlock`.
- ImageBlock transparent regions: the boardBg overdraw inside the clip is only applied when a shadow was actually drawn (to erase the opaque shadow-source fill). Skipping it when there is no shadow preserves the block's transparent areas so underlying blocks remain visible.
- Font loading: `document.fonts.load("16px family")` is called explicitly per font family alongside `document.fonts.ready` — `document.fonts.ready` alone does not guarantee dynamically-injected Google Fonts `<link>` tags have resolved.
- `runFont()` omits "normal" style/weight tokens from the CSS font shorthand to avoid parser edge cases in some canvas implementations.
- `parseHtmlText` converts TipTap HTML into `StyledParagraph[]` (block elements → paragraphs, inline elements → styled runs) for `wrapRuns` / `renderParagraphs` to lay out. `wrapRuns` stores each token separately; `drawTextRun` must receive `{ ...seg.run, text: seg.text }` — passing `seg.run` directly would render the entire run string at every token position.
- `PathBlock` rendering: when `taper > 0`, `traceOutlineCanvas` builds a filled variable-width outline (sampled from the Catmull-Rom curve) instead of stroking the centerline. When `strokeEnd` differs from `stroke`, a `ctx.createLinearGradient` running from the first to the last point is used as the fill/stroke style.

**Module structure:**
```
src/
  board/
    extensions/       # custom TipTap extensions (FontSize, FontFamily)
    BoardObject.ts    # shared interface + PropertyField discriminated union
    BaseBlock.ts      # abstract base: callbacks, lifecycle, selection logic
    BoxBlock.ts       # abstract base for Text/Image/Shape: geometry, drag, AABB
    CanvasBoard.ts    # pseudo-object for canvas background (shown when nothing selected); owns the PNG export widget — call setRenderFn() once at startup to wire the render callback; the collapsible export section renders lazily on first open and re-renders on scale change
    PencilTool.ts     # pseudo-object for pencil settings (shown in Properties Panel when pencil is active); persists to localStorage
    TextBlock.ts      # rich-text block (extends BoxBlock)
    ImageBlock.ts     # bitmap block (extends BoxBlock)
    ShapeBlock.ts     # SVG shape block (extends BoxBlock)
    LineBlock.ts      # line/arrow block with two draggable endpoints (extends BaseBlock)
    PathBlock.ts      # freehand path block with smoothing, taper, gradient (extends BoxBlock)
    NoteBlock.ts      # sticky-note card with auto-height rich text and shape variants (extends BoxBlock)
    pathUtils.ts      # pure geometry: RDP, Catmull-Rom SVG/canvas, outline path builder
  ui/
    AddBar.ts             # top-center toolbar: mode/shape pickers, add buttons, pencil button, eraser button, undo/redo buttons
    LayersPanel.ts        # left-docked layers list with reorder, visibility, lock, rename
    SelectionBox.ts       # AABB outline + corner/side resize handles + rotate handle (single and multi)
    TextFormatToolbar.ts  # floating toolbar shown on text selection
    PropertiesPanel.ts    # right-docked side panel; generic over BoardObject
    ZoomWidget.ts         # zoom −/+ buttons, clickable % label, range slider; sync(zoom) for external updates
    ColorPicker.ts        # swatch + popover with color input and alpha slider
    FontPicker.ts         # searchable Google Fonts dropdown
    Dialog.ts             # styled alert/confirm modals; use instead of native alert/confirm
    GuideOverlay.ts       # fixed SVG overlay that draws alignment lines and spacing indicators
    SettingsPanel.ts      # full-screen settings overlay (appearance + keyboard shortcuts)
  snap/
    SnapEngine.ts     # pure snap computation: edge/center alignment + equal-spacing detection
  export/
    Exporter.ts       # scene-graph PNG renderer: OffscreenCanvas, per-block draw, text layout
    parseHtmlText.ts  # parses TipTap HTML into StyledParagraph[] for canvas text layout
  lib/
    fonts.ts          # font list + lazy Google Fonts loader
    icons.ts          # all UI icon SVG strings, serialised from Lucide at module load
    db.ts             # Dexie schema, PersistedBlock union, GroupRecord, SCHEMA_VERSION
    settings.ts       # UserSettings type, load/save, applyTheme — localStorage key moodboard-settings
    keybindings.ts    # KeybindingMap, ActionBindings, matchesAction, formatBinding — localStorage key moodboard-keybindings
  main.ts             # board state: blocks[], selectedBlocks, history, future, clipboard, pan, mode
  style.css           # entry point — @imports Tailwind and all component stylesheets
  styles/
    tokens.css        # :root color variables
    base.css          # * reset + html/body
    board.css         # marquee, drag-over, explore-mode, eraser-mode + #eraser-cursor
    panel.css         # shared panel shell (header, drag handle, resize handles, buttons)
    board/
      line-block.css
      shape-block.css
      image-block.css
      text-block.css
      path-block.css
      note-block.css
    ui/
      add-bar.css
      properties-panel.css
      layers-panel.css
      text-format-toolbar.css
      zoom-widget.css
      color-picker.css
      font-picker.css
      selection-box.css
      dialog.css
      settings-panel.css
```

## CI/CD

Two GitHub Actions workflows:
- **`ci.yml`** — runs on every PR targeting `main`: `typecheck` → `lint` → `prettier --check src`. Blocks merge if any step fails.
- **`deploy.yml`** — runs on push to `main`, skipping doc/config-only changes (`**.md`, `LICENSE`, `.husky/**`, `.vscode/**`, `.claude/**`, `.prettierrc`, `.prettierignore`): `check` → `build` → deploy to GitHub Pages. The `check` job mirrors `ci.yml` so a bad push cannot deploy.

Node version is pinned in `.nvmrc` (22); both workflows use `node-version-file: .nvmrc`. There is no `format:check` npm script — CI calls `npx prettier --check src` directly.

## Code Style

- 4-space indentation
- No semicolons
- TypeScript strict mode — `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns` are all errors
- Pre-commit hook (husky + lint-staged) runs Prettier then ESLint on staged `src/**/*.ts` files
- `no-console` is enforced — do not use `console.log/warn/error`

## Commit messages

Conventional Commits format is enforced by commitlint (`commit-msg` hook):

```
type(scope): subject
```

Allowed types (hard error if violated): `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.

Curated scopes (warning if unrecognised, not a hard block): `board`, `ui`, `snap`, `export`, `db`, `settings`, `fonts`, `style`, `ci`, `deps`, `claude`, `main`. Scope is optional.

## Comments

- Every file must start with a header comment describing the purpose of the file (not its contents).
- Write the minimum number of comments necessary — only when the intent isn't obvious from the code.
- Comments describe *what* and *why*, never *how*.
