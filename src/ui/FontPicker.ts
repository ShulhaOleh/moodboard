// Custom font picker dropdown that previews each font in its own typeface.
// Uses a div-based dropdown since native <option> elements can't be font-styled cross-browser.

import { FONTS, loadFont } from '../lib/fonts'

export class FontPicker {
    readonly el: HTMLElement
    private trigger: HTMLElement
    private dropdown: HTMLElement
    private currentFamily: string
    private onChange: (family: string) => void
    private open = false
    private fontsLoaded = false

    constructor(initialFamily: string, onChange: (family: string) => void) {
        this.currentFamily = initialFamily
        this.onChange = onChange

        this.el = document.createElement('div')
        this.el.className = 'font-picker'

        this.trigger = document.createElement('div')
        this.trigger.className = 'font-picker-trigger'
        this.trigger.addEventListener('mousedown', (e) => {
            e.preventDefault()
            e.stopPropagation()
            this.toggle()
        })

        this.dropdown = document.createElement('div')
        this.dropdown.className = 'font-picker-dropdown hidden'

        for (const font of FONTS) {
            const item = document.createElement('div')
            item.className = 'font-picker-item'
            item.textContent = font.name
            item.style.fontFamily = font.family
            item.dataset.family = font.family
            item.addEventListener('mousedown', (e) => {
                e.preventDefault()
                this.select(font.family)
            })
            this.dropdown.appendChild(item)
        }

        // Append dropdown to body so it escapes any transformed ancestor's containing block
        this.el.appendChild(this.trigger)
        document.body.appendChild(this.dropdown)

        this.updateTrigger()

        // Close on outside click
        document.addEventListener('mousedown', (e) => {
            if (
                this.open &&
                !this.el.contains(e.target as Node) &&
                !this.dropdown.contains(e.target as Node)
            )
                this.close()
        })
    }

    setValue(family: string) {
        this.currentFamily = family
        this.updateTrigger()
    }

    private toggle() {
        if (this.open) {
            this.close()
        } else {
            this.openDropdown()
        }
    }

    private openDropdown() {
        if (!this.fontsLoaded) {
            for (const font of FONTS) {
                loadFont(font.family)
            }
            this.fontsLoaded = true
        }
        this.dropdown.classList.remove('hidden')
        this.open = true
        this.positionDropdown()
        this.scrollToSelected()
    }

    private positionDropdown() {
        const rect = this.trigger.getBoundingClientRect()
        this.dropdown.style.top = `${rect.bottom + 4}px`
        this.dropdown.style.left = `${rect.left}px`
        this.dropdown.style.minWidth = `${rect.width}px`
    }

    private close() {
        this.dropdown.classList.add('hidden')
        this.open = false
    }

    private select(family: string) {
        this.currentFamily = family
        this.updateTrigger()
        this.close()
        loadFont(family)
        this.onChange(family)
    }

    private updateTrigger() {
        this.trigger.textContent = this.currentFamily
        this.trigger.style.fontFamily = this.currentFamily

        // Highlight the active item in the dropdown
        for (const item of this.dropdown.querySelectorAll<HTMLElement>('.font-picker-item')) {
            item.classList.toggle('is-active', item.dataset.family === this.currentFamily)
        }
    }

    private scrollToSelected() {
        const active = this.dropdown.querySelector('.font-picker-item.is-active')
        active?.scrollIntoView({ block: 'nearest' })
    }

    destroy() {
        this.dropdown.remove()
    }
}
