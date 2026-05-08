// Translation module — auto-discovers locale JSON files and provides a typed t() lookup.
// Adding a new language requires only dropping a new <code>.json file in src/translations/.

import en from './translations/en.json'

export type TranslationKey = keyof typeof en

// Each module is the parsed JSON object (the default export of the JSON file).
const all = import.meta.glob<Record<string, string>>('./translations/*.json', {
    eager: true,
    import: 'default',
})

let current: Record<string, string> = en as Record<string, string>
const listeners = new Set<() => void>()

export function t(key: TranslationKey): string {
    return current[key] ?? (en as Record<string, string>)[key] ?? key
}

export function onLocaleChange(fn: () => void): void {
    listeners.add(fn)
}

export function setLocale(code: string): void {
    const match = all[`./translations/${code}.json`]
    current = match
        ? { ...(en as Record<string, string>), ...match }
        : (en as Record<string, string>)
    localStorage.setItem('moodboard-locale', code)
    listeners.forEach((fn) => fn())
}

export function loadSavedLocale(): void {
    const saved = localStorage.getItem('moodboard-locale')
    if (saved && saved !== 'en') setLocale(saved)
}

export function getCurrentLocale(): string {
    return localStorage.getItem('moodboard-locale') ?? 'en'
}

// Returns [{code, name}] for every locale file found, sorted with 'en' first.
// Each JSON file may declare its own display name via the "_name" key.
export function getLocales(): { code: string; name: string }[] {
    return Object.keys(all)
        .map((path) => {
            const code = path.slice('./translations/'.length, -5) // './translations/en.json' → 'en'
            const name = (all[path] as Record<string, string>)['_name'] ?? code
            return { code, name }
        })
        .sort((a, b) => (a.code === 'en' ? -1 : b.code === 'en' ? 1 : a.name.localeCompare(b.name)))
}
