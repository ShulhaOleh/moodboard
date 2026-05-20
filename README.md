# moodboard

A moodboard editor that runs entirely in the browser with local persistence.

> [!WARNING]
> Primarily developed and tested on Chrome-based browsers. Other browsers may work but are not guaranteed to behave correctly.

## Stack

- **TypeScript** — strict mode, no framework
- **TipTap** — rich text editing with per-character formatting
- **Dexie** — IndexedDB wrapper for local storage
- **Tailwind CSS** — utility-first styling
- **Lucide** — icon set
- **Vite** — dev server and bundler

## Shortcuts

| Key | Action |
|---|---|
| Double-click | Edit text / shape inline |
| Ctrl+Z | Undo |
| Ctrl+Y | Redo |
| Ctrl+C / X / V | Copy / Cut / Paste |
| Delete / Backspace | Delete selection |
| E | Switch to Edit mode |
| R | Switch to Explore mode |
| P | Toggle pencil tool |
| Shift+E | Toggle eraser tool |
| F2 | Rename selected layer |
| Arrow keys | Move selection 1 px (hold to accelerate) |
| Scroll | Pan vertically |
| Shift+scroll | Pan horizontally |
| Ctrl+scroll | Zoom |
| Escape | Cancel stroke / deselect |

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start dev server with HMR |
| `pnpm build` | Type-check and build for production |
| `pnpm start` | Build and open in browser |
| `pnpm typecheck` | Type-check only, no emit |
| `pnpm lint` | Lint source files |
| `pnpm format` | Format source files |
| `pnpm check-translations` | Verify all locale files are complete |
| `pnpm translate <code>` | Generate or sync a locale file |

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
