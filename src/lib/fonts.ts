// Curated Google Fonts list and on-demand font loader.

export interface FontOption {
    name: string
    family: string
}

export const FONTS: FontOption[] = [
    { name: 'Inter', family: 'Inter' },
    { name: 'Roboto', family: 'Roboto' },
    { name: 'Playfair Display', family: 'Playfair Display' },
    { name: 'Merriweather', family: 'Merriweather' },
    { name: 'Lora', family: 'Lora' },
    { name: 'Montserrat', family: 'Montserrat' },
    { name: 'Raleway', family: 'Raleway' },
    { name: 'Dancing Script', family: 'Dancing Script' },
    { name: 'Space Mono', family: 'Space Mono' },
    { name: 'Bebas Neue', family: 'Bebas Neue' },
]

const loaded = new Set<string>()

// Injects a Google Fonts stylesheet for the given family if not already loaded.
export function loadFont(family: string): void {
    if (loaded.has(family)) return
    loaded.add(family)
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}&display=swap`
    document.head.appendChild(link)
}

let allFontsCache: string[] | null = null
let allFontsFetch: Promise<string[]> | null = null

// Fetches the full font catalogue from the Fontsource API (CORS-friendly, no key needed).
// Falls back to the curated list on failure. Result is cached for the session.
export function fetchAllFonts(): Promise<string[]> {
    if (allFontsCache) return Promise.resolve(allFontsCache)
    if (allFontsFetch) return allFontsFetch
    allFontsFetch = fetch('https://api.fontsource.org/v1/fonts')
        .then((r) => r.json())
        .then((data: unknown) => {
            const items: unknown[] = Array.isArray(data)
                ? data
                : data && typeof data === 'object'
                  ? Object.values(data)
                  : []
            const families = items
                .map((f) =>
                    f && typeof f === 'object' && 'family' in f
                        ? String((f as { family: unknown }).family)
                        : ''
                )
                .filter(Boolean)
                .sort((a, b) => a.localeCompare(b))
            allFontsCache = [...new Set(families)]
            return allFontsCache
        })
        .catch(() => FONTS.map((f) => f.family))
    return allFontsFetch
}
