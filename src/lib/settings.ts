// User settings — persisted in localStorage as a flat JSON object.
// To add a new setting: extend UserSettings, add a default in DEFAULTS, done.

const STORAGE_KEY = 'moodboard-settings'

export interface UserSettings {
    theme: 'light' | 'dark' | 'system'
}

const DEFAULTS: UserSettings = {
    theme: 'system',
}

export function loadSettings(): UserSettings {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return { ...DEFAULTS }
        return { ...DEFAULTS, ...JSON.parse(raw) }
    } catch {
        return { ...DEFAULTS }
    }
}

export function saveSettings(settings: UserSettings): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

// Resolves the effective theme and applies it as data-theme on <html>.
// Call this once at startup and again whenever the user changes the setting.
export function applyTheme(theme: UserSettings['theme']): void {
    const dark =
        theme === 'dark' ||
        (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
}
