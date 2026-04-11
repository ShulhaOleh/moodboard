# moodboard

A moodboard editor that runs entirely in the browser with local persistence.

## Stack

- **TypeScript** — strict mode, no framework
- **TipTap** — rich text editing with per-character formatting
- **Dexie** — IndexedDB wrapper for local storage
- **Tailwind CSS** — utility-first styling
- **Vite** — dev server and bundler

## Shortcuts

| Key | Action |
|---|---|
| Double-click | Edit text / shape inline |
| Ctrl+Z | Undo |
| Ctrl+C / X / V | Copy / Cut / Paste |
| Delete / Backspace | Delete selection |
| E | Switch to Edit mode |
| R | Switch to Explore mode |
| P | Toggle pencil tool |
| F2 | Rename selected layer |
| Arrow keys | Move selection 1 px (hold to accelerate) |
| Scroll | Pan vertically |
| Shift+scroll | Pan horizontally |
| Ctrl+scroll | Zoom |
| Escape | Cancel stroke / deselect |

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server with HMR |
| `npm run build` | Type-check and build for production |
| `npm run start` | Build and open in browser |
| `npm run typecheck` | Type-check only, no emit |
| `npm run lint` | Lint source files |
| `npm run format` | Format source files |

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
