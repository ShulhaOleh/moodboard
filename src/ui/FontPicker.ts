// Custom font picker dropdown with live search across the full Google Fonts catalogue.
// Shows the curated list by default; fetches all ~1500 families on first open for search.

import { FONTS, loadFont, fetchAllFonts } from '../lib/fonts'

const MAX_RESULTS = 30

export class FontPicker {
    readonly el: HTMLElement
    private trigger: HTMLElement
    private dropdown: HTMLElement
    private searchInput: HTMLInputElement
    private listEl: HTMLElement
    private currentFamily: string
    private onChange: (family: string) => void
    private open = false
    private allFonts: string[] | null = null
    private allFontsLoading = false

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

        this.searchInput = document.createElement('input')
        this.searchInput.type = 'text'
        this.searchInput.className = 'font-picker-search'
        this.searchInput.placeholder = 'Search fonts…'
        this.searchInput.addEventListener('input', () => this.renderList())
        this.searchInput.addEventListener('mousedown', (e) => e.stopPropagation())
        this.searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.close()
            e.stopPropagation()
        })

        this.listEl = document.createElement('div')
        this.listEl.className = 'font-picker-list'

        this.dropdown.append(this.searchInput, this.listEl)
        document.body.appendChild(this.dropdown)

        this.dropdown.addEventListener('mousedown', (e) => e.stopPropagation())
        this.dropdown.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true })

        this.el.appendChild(this.trigger)
        this.updateTrigger()

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
        this.dropdown.classList.remove('hidden')
        this.open = true
        this.searchInput.value = ''
        this.renderList()
        this.positionDropdown()
        this.searchInput.focus()
        this.startFetchAllFonts()
    }

    private startFetchAllFonts() {
        if (this.allFonts !== null || this.allFontsLoading) return
        this.allFontsLoading = true
        fetchAllFonts().then((families) => {
            this.allFonts = families
            this.allFontsLoading = false
            if (this.open && this.searchInput.value.trim()) this.renderList()
        })
    }

    private renderList() {
        this.listEl.innerHTML = ''
        const query = this.searchInput.value.trim().toLowerCase()

        if (!query) {
            this.renderItems(FONTS.map((f) => f.family))
            return
        }

        const source = this.allFonts ?? FONTS.map((f) => f.family)
        const matches = source.filter((f) => f.toLowerCase().includes(query)).slice(0, MAX_RESULTS)

        if (matches.length === 0) {
            const msg = document.createElement('div')
            msg.className = 'font-picker-empty'
            msg.textContent = 'No fonts found'
            this.listEl.appendChild(msg)
            return
        }

        this.renderItems(matches)
    }

    private renderItems(families: string[]) {
        for (const family of families) {
            const item = document.createElement('div')
            item.className = 'font-picker-item'
            if (family === this.currentFamily) item.classList.add('is-active')
            item.textContent = family
            item.style.fontFamily = family
            item.dataset.family = family
            item.addEventListener('mousedown', (e) => {
                e.preventDefault()
                this.select(family)
            })
            this.listEl.appendChild(item)
            loadFont(family)
        }
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
    }

    private scrollToSelected() {
        const active = this.listEl.querySelector('.font-picker-item.is-active')
        active?.scrollIntoView({ block: 'nearest' })
    }

    destroy() {
        this.dropdown.remove()
    }
}
