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

**Deployment:** Vite base path is set to `/moodboard/` — all asset URLs are relative to that.

**Intended module structure** (not yet implemented, planned):
```
src/
  canvas/    # fabric.js setup, tools, rendering
  board/     # board state, persistence (Dexie)
  ui/        # toolbar, panels, DOM interactions
  store.ts   # app state
  main.ts    # wiring only
```

## Code Style

- 4-space indentation
- No semicolons
- TypeScript strict mode — `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns` are all errors
- Pre-commit hook (husky + lint-staged) runs Prettier then ESLint on staged `src/**/*.ts` files
