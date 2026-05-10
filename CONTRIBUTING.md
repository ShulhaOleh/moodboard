# Contributing to Moodboard

Thank you for taking the time to contribute - every improvement, no matter how small, is appreciated.

## Getting started

**Requirements:** Node 22.

```bash
git clone https://github.com/ShulhaOleh/moodboard.git
cd moodboard
npm install
npm run dev
```

`npm install` also sets up the pre-commit hook via Husky — no extra step needed.

## Workflow

1. Fork the repository and create a branch from `main`.
2. Make your changes.
3. Run `npm run typecheck && npm run lint` to catch errors before committing.
4. Open a pull request against `main`.

## Commit messages

This project uses Conventional Commits. The format is:

```
type(scope): subject
```

Valid types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.

The commit-msg hook will reject commits that don't follow this format.

## Adding a translation

Locale files live in `src/translations/`. Each file is a flat JSON object where every key matches the canonical English file `en.json`.

1. Run `npm run translate ru` to create a pre-filled `src/translations/ru.json` with all keys marked `!!` where translation is needed.
2. Set the `"_name"` key to the language's native name (e.g. `"Русский"`).
3. Translate every value that starts with `!!` — when done, remove the `!!` prefix.
4. Run `npm run check-translations` to verify your file is complete.
5. Open a pull request. The app picks up the new file automatically; no code changes needed.

Use the locale code as the commit scope:

```
feat(ru): add Russian translation
```
