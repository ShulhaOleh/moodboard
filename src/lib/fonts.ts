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
