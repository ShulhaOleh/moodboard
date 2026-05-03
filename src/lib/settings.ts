// User settings — persisted in localStorage as a flat JSON object.
// To add a new setting: extend UserSettings, add a default in DEFAULTS, done.

const STORAGE_KEY = 'moodboard-settings'

export type AccentColor = 'purple' | 'blue' | 'teal' | 'green' | 'orange' | 'pink'

export interface UserSettings {
    theme: 'light' | 'dark' | 'system'
    accent: AccentColor
    uiFont: string
}

const DEFAULTS: UserSettings = {
    theme: 'system',
    accent: 'purple',
    uiFont: 'Inter',
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

// Applies the UI font by setting font-family on <html>. Empty string restores the system default.
export function applyUiFont(font: string): void {
    document.documentElement.style.fontFamily = font || ''
}

// Temporarily adds 'theme-transition' to <html> so CSS can animate color changes.
// Call immediately before applyTheme / applyAccent; the class is removed after 300 ms.
export function beginThemeTransition(): void {
    document.documentElement.classList.add('theme-transition')
    setTimeout(() => document.documentElement.classList.remove('theme-transition'), 300)
}

// Sets data-accent on <html> to activate the chosen accent palette.
// Purple is the default (defined in :root), so its attribute is removed to keep the DOM clean.
export function applyAccent(accent: AccentColor): void {
    if (accent === 'purple') {
        document.documentElement.removeAttribute('data-accent')
    } else {
        document.documentElement.setAttribute('data-accent', accent)
    }
}
