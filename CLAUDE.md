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
- **Fabric.js** — all canvas rendering and object interaction. The `Canvas` instance is the core of the app.
- **Dexie** — IndexedDB wrapper for persisting board data locally in the browser.
- **Tailwind CSS v4** — integrated via `@tailwindcss/vite` plugin, imported in `src/style.css`.

**Two-layer rendering:** The app uses two layers stacked in `#app`:
1. A Fabric.js `<canvas>` — for future non-text elements (images, shapes).
2. An HTML `#overlay` div — for text blocks (`src/board/TextBlock.ts`). Text blocks are HTML elements, not canvas objects, which enables native markdown rendering and text selection. The two layers share the same coordinate space.

This split means z-ordering between canvas objects and text blocks is not possible — text blocks always render above the canvas.

**Deployment:** Vite base path is set to `/moodboard/` — all asset URLs are relative to that.

**Module structure:**
```
src/
  board/     # board elements (TextBlock)
  canvas/    # fabric.js setup (not yet created)
  ui/        # toolbar, panels (not yet created)
  main.ts    # wiring only
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
