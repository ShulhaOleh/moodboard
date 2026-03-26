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
- **TipTap** (`@tiptap/core`, `starter-kit`, `extension-text-style`, `extension-color`) — rich text editing inside text blocks. Content is stored as HTML strings.
- **Fabric.js** — canvas layer, reserved for future non-text elements (images, shapes).
- **Dexie** — IndexedDB wrapper for local persistence (not yet wired up).
- **Tailwind CSS v4** — integrated via `@tailwindcss/vite` plugin, imported in `src/style.css`.

**Two-layer rendering:** The app uses two layers stacked in `#app`:
1. A Fabric.js `<canvas>` — for future non-text elements.
2. An HTML `#overlay` div — for text blocks (`src/board/TextBlock.ts`). Text blocks are HTML elements, not canvas objects, enabling native rich text editing and selection. The two layers share the same coordinate space.

Z-ordering between canvas objects and text blocks is not possible — text blocks always render above the canvas.

**Text editing flow:** Double-clicking a `TextBlock` mounts a TipTap `Editor` instance into the block's content element. A `TextFormatToolbar` (floating above the selection) appears on text selection and is destroyed when editing ends. The block temporarily resets its rotation to 0° during editing, restoring it on exit.

**Deployment:** Vite base path is set to `/moodboard/` — all asset URLs are relative to that.

**Module structure:**
```
src/
  board/
    extensions/  # custom TipTap extensions (FontSize)
    TextBlock.ts # draggable, resizable, rotatable rich-text block
    BoardObject.ts # interface all board objects implement
  ui/
    TextFormatToolbar.ts # floating bold/italic/color/size toolbar
    PropertiesPanel.ts   # fixed side panel for position/size/rotation/appearance
  main.ts        # wiring only
  style.css      # all styles
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
