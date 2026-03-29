// Toolbar fixed at the top center of the screen for adding new board objects and switching modes.

export type BoardMode = 'edit' | 'explore'

export type DrawableShape = 'rectangle' | 'line' | 'arrow' | 'ellipse' | 'polygon' | 'star'

const MODES: { mode: BoardMode; label: string; icon: string }[] = [
    {
        mode: 'edit',
        label: 'Edit',
        icon: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 3.5L15.5 10 10 11.8 7.5 17 5 3.5z"/>
        </svg>`,
    },
    {
        mode: 'explore',
        label: 'Explore',
        icon: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8 13V7m0 0V4a1 1 0 0 1 2 0v3m-2 0a1 1 0 0 0-2 0v2m4-2a1 1 0 0 1 2 0v2m0 0v1m0-1a1 1 0 0 1 2 0v4a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4v-2a1 1 0 0 1 2 0"/>
        </svg>`,
    },
]

const SHAPES: { shape: DrawableShape; label: string; icon: string }[] = [
    {
        shape: 'rectangle',
        label: 'Rectangle',
        icon: `<svg viewBox="0 0 20 20" fill="currentColor"><rect x="3" y="5" width="14" height="10" rx="2"/></svg>`,
    },
    {
        shape: 'line',
        label: 'Line',
        icon: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="2" y1="10" x2="18" y2="10"/></svg>`,
    },
    {
        shape: 'arrow',
        label: 'Arrow',
        icon: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2,10 L15,10 M11,6 L15,10 L11,14"/></svg>`,
    },
    {
        shape: 'ellipse',
        label: 'Ellipse',
        icon: `<svg viewBox="0 0 20 20" fill="currentColor"><ellipse cx="10" cy="10" rx="7" ry="5"/></svg>`,
    },
    {
        shape: 'polygon',
        label: 'Polygon',
        icon: `<svg viewBox="0 0 20 20" fill="currentColor"><polygon points="10,2 18,7.5 15.5,17 4.5,17 2,7.5"/></svg>`,
    },
    {
        shape: 'star',
        label: 'Star',
        icon: `<svg viewBox="0 0 20 20" fill="currentColor"><polygon points="10,2 12.2,7.8 18.5,8.2 13.8,12.3 15.4,18.5 10,15.1 4.6,18.5 6.2,12.3 1.5,8.2 7.8,7.8"/></svg>`,
    },
]

const CHEVRON = `<svg class="mode-chevron" viewBox="0 0 10 6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 1l4 4 4-4"/></svg>`

export class AddBar {
    readonly el: HTMLElement
    onAddText: (() => void) | null = null
    onAddImage: (() => void) | null = null
    onAddShape: ((shape: DrawableShape) => void) | null = null
    onModeChange: ((mode: BoardMode) => void) | null = null

    private modeTriggerBtn: HTMLButtonElement
    private modeDropdownEl: HTMLElement
    private modeDropdownOpen = false

    private shapeIconBtn: HTMLButtonElement
    private shapeChevronBtn: HTMLButtonElement
    private shapeDropdownEl: HTMLElement
    private shapeDropdownOpen = false
    private selectedShape: DrawableShape = 'rectangle'

    private addButtons: HTMLButtonElement[]

    constructor(container: HTMLElement) {
        this.el = document.createElement('div')
        this.el.id = 'add-bar'

        // ── Mode picker ────────────────────────────────────────────────────────
        const modePicker = document.createElement('div')
        modePicker.className = 'mode-picker'

        this.modeTriggerBtn = document.createElement('button')
        this.modeTriggerBtn.className = 'add-bar-btn mode-trigger'
        this.modeTriggerBtn.addEventListener('click', () => {
            this.modeDropdownOpen = !this.modeDropdownOpen
            this.modeDropdownEl.classList.toggle('hidden', !this.modeDropdownOpen)
            if (this.modeDropdownOpen) this.closeShapeDropdown()
        })

        this.modeDropdownEl = document.createElement('div')
        this.modeDropdownEl.className = 'mode-dropdown hidden'

        for (const { mode, label, icon } of MODES) {
            const option = document.createElement('button')
            option.className = 'mode-option'
            option.dataset.mode = mode
            option.innerHTML = `${icon}<span>${label}</span>`
            option.addEventListener('click', () => {
                this.setMode(mode)
                this.closeModeDropdown()
            })
            this.modeDropdownEl.appendChild(option)
        }

        modePicker.append(this.modeTriggerBtn, this.modeDropdownEl)
        this.el.appendChild(modePicker)

        const divider = document.createElement('div')
        divider.className = 'add-bar-divider'
        this.el.appendChild(divider)

        // ── Add buttons ────────────────────────────────────────────────────────
        const textBtn = this.makeButton(
            'Text',
            `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
                <path d="M4 5h12M10 5v10M7 15h6"/>
            </svg>`
        )
        textBtn.addEventListener('click', () => this.onAddText?.())

        const imageBtn = this.makeButton(
            'Image',
            `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="4" width="14" height="12" rx="2"/>
                <circle cx="7.5" cy="8.5" r="1.5"/>
                <path d="M3 14l4-4 3 3 2-2 5 5"/>
            </svg>`
        )
        imageBtn.addEventListener('click', () => this.onAddImage?.())

        // ── Shape split-button ─────────────────────────────────────────────────
        // Left part: icon — adds the current shape immediately.
        // Right part: chevron — opens the shape-type dropdown.
        const shapePicker = document.createElement('div')
        shapePicker.className = 'mode-picker'

        const shapeSplitBtn = document.createElement('div')
        shapeSplitBtn.className = 'shape-split-btn'

        this.shapeIconBtn = document.createElement('button')
        this.shapeIconBtn.className = 'shape-icon-btn'
        this.shapeIconBtn.addEventListener('click', () => {
            this.closeShapeDropdown()
            this.onAddShape?.(this.selectedShape)
        })

        this.shapeChevronBtn = document.createElement('button')
        this.shapeChevronBtn.className = 'shape-chevron-btn'
        this.shapeChevronBtn.innerHTML = CHEVRON
        this.shapeChevronBtn.title = 'Choose shape'
        this.shapeChevronBtn.addEventListener('click', () => {
            this.shapeDropdownOpen = !this.shapeDropdownOpen
            this.shapeDropdownEl.classList.toggle('hidden', !this.shapeDropdownOpen)
            if (this.shapeDropdownOpen) this.closeModeDropdown()
        })

        this.shapeDropdownEl = document.createElement('div')
        this.shapeDropdownEl.className = 'mode-dropdown hidden'

        for (const { shape, label, icon } of SHAPES) {
            const option = document.createElement('button')
            option.className = 'mode-option'
            option.dataset.shape = shape
            option.innerHTML = `${icon}<span>${label}</span>`
            option.addEventListener('click', () => {
                this.selectedShape = shape
                this.updateShapeTrigger()
                this.closeShapeDropdown()
                this.onAddShape?.(shape)
            })
            this.shapeDropdownEl.appendChild(option)
        }

        shapeSplitBtn.append(this.shapeIconBtn, this.shapeChevronBtn)
        shapePicker.append(shapeSplitBtn, this.shapeDropdownEl)

        this.addButtons = [textBtn, imageBtn, this.shapeIconBtn, this.shapeChevronBtn]
        this.el.append(textBtn, imageBtn, shapePicker)
        container.appendChild(this.el)

        document.addEventListener('mousedown', (e) => {
            if (!this.el.contains(e.target as Node)) {
                this.closeModeDropdown()
                this.closeShapeDropdown()
            }
        })

        this.setMode('edit')
        this.updateShapeTrigger()
    }

    setMode(mode: BoardMode) {
        const def = MODES.find((m) => m.mode === mode)!

        this.modeTriggerBtn.innerHTML = `${def.icon}${CHEVRON}`
        this.modeTriggerBtn.title = def.label
        this.modeTriggerBtn.classList.toggle('is-active', mode !== 'edit')

        this.modeDropdownEl.querySelectorAll('.mode-option').forEach((opt) => {
            opt.classList.toggle('is-active', (opt as HTMLElement).dataset.mode === mode)
        })

        this.addButtons.forEach((btn) => (btn.disabled = mode !== 'edit'))
        this.onModeChange?.(mode)
    }

    private updateShapeTrigger() {
        const def = SHAPES.find((s) => s.shape === this.selectedShape)!
        this.shapeIconBtn.innerHTML = def.icon
        this.shapeIconBtn.title = def.label

        this.shapeDropdownEl.querySelectorAll('.mode-option').forEach((opt) => {
            opt.classList.toggle(
                'is-active',
                (opt as HTMLElement).dataset.shape === this.selectedShape
            )
        })
    }

    private closeModeDropdown() {
        this.modeDropdownEl.classList.add('hidden')
        this.modeDropdownOpen = false
    }

    private closeShapeDropdown() {
        this.shapeDropdownEl.classList.add('hidden')
        this.shapeDropdownOpen = false
    }

    private makeButton(label: string, iconSvg: string): HTMLButtonElement {
        const btn = document.createElement('button')
        btn.className = 'add-bar-btn'
        btn.title = label
        btn.innerHTML = iconSvg
        return btn
    }
}
