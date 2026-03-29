// Color picker with alpha support.
// Shows a colored swatch that opens a body-appended popover with a color input and alpha slider.

type ColorChangeCallback = (color: string) => void
interface RGBA {
    r: number
    g: number
    b: number
    a: number
}

function parseColor(value: string): RGBA {
    const m = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/)
    if (m) return { r: +m[1], g: +m[2], b: +m[3], a: m[4] !== undefined ? +m[4] : 1 }
    if (value === 'transparent' || value === '') return { r: 0, g: 0, b: 0, a: 0 }
    if (value.startsWith('#')) {
        let h = value.slice(1)
        if (h.length === 3)
            h = h
                .split('')
                .map((c) => c + c)
                .join('')
        const n = parseInt(h, 16)
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 }
    }
    return { r: 0, g: 0, b: 0, a: 1 }
}

function toHex(r: number, g: number, b: number): string {
    return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')
}

function toRgba(r: number, g: number, b: number, a: number): string {
    return a === 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${a})`
}

export class ColorPicker {
    readonly el: HTMLElement
    // Exposed so callers (e.g. TextFormatToolbar) can track interaction with the popover
    readonly popoverEl: HTMLElement
    private swatch: HTMLElement
    private colorInput: HTMLInputElement
    private alphaSlider: HTMLInputElement
    private alphaLabel: HTMLElement
    private rgba: RGBA
    private open = false
    private onChange: ColorChangeCallback

    constructor(initialValue: string, onChange: ColorChangeCallback) {
        this.onChange = onChange
        this.rgba = parseColor(initialValue)

        this.el = document.createElement('div')
        this.el.className = 'color-picker'

        this.swatch = document.createElement('div')
        this.swatch.className = 'color-picker-swatch'
        this.swatch.addEventListener('mousedown', (e) => {
            e.preventDefault()
            if (this.open) {
                this.closePopover()
            } else {
                this.openPopover()
            }
        })

        this.popoverEl = document.createElement('div')
        this.popoverEl.className = 'color-picker-popover hidden'

        this.colorInput = document.createElement('input')
        this.colorInput.type = 'color'
        this.colorInput.className = 'color-picker-color-input'
        this.colorInput.addEventListener('input', () => {
            const { r, g, b } = parseColor(this.colorInput.value)
            this.rgba = { r, g, b, a: this.rgba.a }
            this.emitChange()
        })

        this.alphaSlider = document.createElement('input')
        this.alphaSlider.type = 'range'
        this.alphaSlider.min = '0'
        this.alphaSlider.max = '100'
        this.alphaSlider.className = 'color-picker-alpha-slider'
        this.alphaSlider.addEventListener('input', () => {
            this.rgba = { ...this.rgba, a: parseInt(this.alphaSlider.value) / 100 }
            this.emitChange()
        })

        this.alphaLabel = document.createElement('span')
        this.alphaLabel.className = 'color-picker-alpha-label'

        this.popoverEl.append(this.colorInput, this.alphaSlider, this.alphaLabel)
        document.body.appendChild(this.popoverEl)

        // Prevent clicks inside the popover from bubbling to document, which would
        // trigger board objects' "click outside → deselect" handlers.
        this.popoverEl.addEventListener('mousedown', (e) => e.stopPropagation())
        this.el.appendChild(this.swatch)

        document.addEventListener('mousedown', (e) => {
            if (
                this.open &&
                !this.el.contains(e.target as Node) &&
                !this.popoverEl.contains(e.target as Node)
            )
                this.closePopover()
        })

        this.syncUI()
    }

    setValue(value: string) {
        this.rgba = parseColor(value)
        this.syncUI()
    }

    private openPopover() {
        this.popoverEl.classList.remove('hidden')
        this.open = true
        this.positionPopover()
    }

    private closePopover() {
        this.popoverEl.classList.add('hidden')
        this.open = false
    }

    private positionPopover() {
        const rect = this.swatch.getBoundingClientRect()
        this.popoverEl.style.top = `${rect.bottom + 4}px`
        this.popoverEl.style.left = `${rect.left}px`
    }

    private emitChange() {
        this.syncUI()
        this.onChange(toRgba(this.rgba.r, this.rgba.g, this.rgba.b, this.rgba.a))
    }

    private syncUI() {
        const { r, g, b, a } = this.rgba
        this.colorInput.value = toHex(r, g, b)
        this.alphaSlider.value = String(Math.round(a * 100))
        this.alphaLabel.textContent = `${Math.round(a * 100)}%`
        // CSS custom property drives the swatch color; checkerboard is defined in CSS
        this.swatch.style.setProperty('--swatch-color', toRgba(r, g, b, a))
    }

    destroy() {
        this.popoverEl.remove()
    }
}
