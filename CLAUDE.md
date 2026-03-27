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
- **Fabric.js** — canvas layer present but currently unused; all board objects live in the HTML overlay.
- **Dexie** — IndexedDB wrapper for local persistence (not yet wired up).
- **Tailwind CSS v4** — integrated via `@tailwindcss/vite` plugin, imported in `src/style.css`.

**Two-layer rendering:** The app uses two layers stacked in `#app`:
1. A Fabric.js `<canvas>` — unused, reserved for future work.
2. An HTML `#overlay` div — hosts all board objects (`TextBlock`, `ImageBlock`). Using HTML elements enables native rich text and avoids canvas serialization.

Z-ordering between canvas objects and HTML overlay objects is not possible — the overlay always renders above the canvas.

**BoardObject interface** (`src/board/BoardObject.ts`): Every board object implements this. `PropertiesPanel` is fully generic — it calls `getAppearanceFields()` to discover what controls to render and `setAppearanceProperty()` to apply changes. Adding a new block type requires no changes to `PropertiesPanel`. `PropertyField` is a discriminated union; current types: `number`, `slider`, `color`, `font`, `select`.

**Text editing flow:** Double-clicking a `TextBlock` mounts a TipTap `Editor` instance into the block's content element. A `TextFormatToolbar` (floating above the selection) appears on text selection and is destroyed when editing ends. The block temporarily resets its rotation to 0° during editing, restoring it on exit.

**Selection model:** Each block manages its own selection state and listens on `document` for outside clicks. When switching between blocks, the outgoing block must not fire `onDeselect` (which hides the panel) if the click target is another board object — the incoming `onSelect` owns the panel update. Both `TextBlock` and `ImageBlock` implement this guard using `.closest('.text-block, .image-block')`.

**Font loading:** `src/lib/fonts.ts` exports a curated `FONTS` list and `loadFont(family)`, which lazily injects a Google Fonts `<link>` tag. Fonts are loaded on demand both from the properties panel and the inline toolbar.

**Image storage:** `ImageBlockData.src` is a runtime URL (object URL from a Blob, or a static asset path). When Dexie persistence is wired up, store the Blob and recreate the object URL on load. Call `URL.revokeObjectURL` via `ImageBlock.destroy()` when removing a block whose src is a blob URL.

**Static assets:** Place images in `public/assets/`. Vite serves them at `/moodboard/assets/<filename>` (base path is `/moodboard/`).

**Module structure:**
```
src/
  board/
    extensions/       # custom TipTap extensions (FontSize, FontFamily)
    BoardObject.ts    # shared interface + PropertyField discriminated union
    TextBlock.ts      # draggable, resizable, rotatable rich-text block
    ImageBlock.ts     # draggable, resizable, rotatable image block
  ui/
    TextFormatToolbar.ts  # floating toolbar shown on text selection
    PropertiesPanel.ts    # fixed side panel; generic over BoardObject
    ColorPicker.ts        # swatch + popover with color input and alpha slider
    FontPicker.ts         # searchable Google Fonts dropdown
  lib/
    fonts.ts          # font list + lazy Google Fonts loader
  main.ts             # wiring only — no logic
  style.css           # all styles (Tailwind + component styles)
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
