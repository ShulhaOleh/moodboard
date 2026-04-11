// Toolbar fixed at the top center of the screen for adding new board objects and switching modes.

import { ColorPicker } from './ColorPicker'

export type BoardMode = 'edit' | 'explore'

export type DrawableShape = 'rectangle' | 'line' | 'arrow' | 'ellipse' | 'polygon' | 'star'

export interface PencilSettings {
    stroke: string
    strokeEnd: string
    strokeWidth: number
    taper: number
    smoothing: number
}

const DEFAULT_PENCIL_SETTINGS: PencilSettings = {
    stroke: '#333333',
    strokeEnd: '',
    strokeWidth: 2,
    taper: 0,
    smoothing: 50,
}

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
        icon: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><rect x="3" y="5" width="14" height="10" rx="2"/></svg>`,
    },
    {
        shape: 'line',
        label: 'Line',
        icon: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><line x1="2" y1="10" x2="18" y2="10"/></svg>`,
    },
    {
        shape: 'arrow',
        label: 'Arrow',
        icon: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2,10 L15,10 M11,6 L15,10 L11,14"/></svg>`,
    },
    {
        shape: 'ellipse',
        label: 'Ellipse',
        icon: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6"><ellipse cx="10" cy="10" rx="7" ry="5"/></svg>`,
    },
    {
        shape: 'polygon',
        label: 'Polygon',
        icon: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><polygon points="10,2 18,7.5 15.5,17 4.5,17 2,7.5"/></svg>`,
    },
    {
        shape: 'star',
        label: 'Star',
        icon: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><polygon points="10,2 12.2,7.8 18.5,8.2 13.8,12.3 15.4,18.5 10,15.1 4.6,18.5 6.2,12.3 1.5,8.2 7.8,7.8"/></svg>`,
    },
]

const CHEVRON = `<svg class="mode-chevron" viewBox="0 0 10 6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 1l4 4 4-4"/></svg>`

export class AddBar {
    readonly el: HTMLElement
    onAddText: (() => void) | null = null
    onAddImage: (() => void) | null = null
    onAddNote: (() => void) | null = null
    onAddShape: ((shape: DrawableShape) => void) | null = null
    onModeChange: ((mode: BoardMode) => void) | null = null
    onTogglePencil: (() => void) | null = null
    onPencilSettingsChange: ((settings: PencilSettings) => void) | null = null
    onSettingsOpen: (() => void) | null = null

    private modeTriggerBtn: HTMLButtonElement
    private modeDropdownEl: HTMLElement
    private modeDropdownOpen = false
    private modeHintEls: Map<BoardMode, HTMLElement> = new Map()

    private shapeIconBtn: HTMLButtonElement
    private shapeChevronBtn: HTMLButtonElement
    private shapeDropdownEl: HTMLElement
    private shapeDropdownOpen = false
    private selectedShape: DrawableShape = 'rectangle'

    private pencilBtn: HTMLButtonElement
    private pencilOptionsEl: HTMLElement
    private pencilSettings: PencilSettings = { ...DEFAULT_PENCIL_SETTINGS }
    private strokePicker!: ColorPicker
    private strokeEndPicker!: ColorPicker
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
            const hintEl = document.createElement('span')
            hintEl.className = 'mode-option-hint'
            option.innerHTML = `${icon}<span>${label}</span>`
            option.appendChild(hintEl)
            this.modeHintEls.set(mode, hintEl)
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

        const noteBtn = this.makeButton(
            'Note',
            `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 4h12v9l-4 4H4z"/>
                <path d="M12 13v4l4-4h-4z" fill="currentColor" stroke="none" opacity="0.4"/>
                <line x1="7" y1="8" x2="13" y2="8"/>
                <line x1="7" y1="11" x2="11" y2="11"/>
            </svg>`
        )
        noteBtn.addEventListener('click', () => this.onAddNote?.())

        // ── Shape split-button ─────────────────────────────────────────────────
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
            })
            this.shapeDropdownEl.appendChild(option)
        }

        shapeSplitBtn.append(this.shapeIconBtn, this.shapeChevronBtn)
        shapePicker.append(shapeSplitBtn, this.shapeDropdownEl)

        // ── Pencil tool + options ──────────────────────────────────────────────
        const pencilDivider = document.createElement('div')
        pencilDivider.className = 'add-bar-divider'

        const pencilPicker = document.createElement('div')
        pencilPicker.className = 'mode-picker'

        this.pencilBtn = this.makeButton(
            'Pencil (P)',
            `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14.5 3.5a2.12 2.12 0 0 1 3 3L6 18l-4 1 1-4L14.5 3.5z"/>
            </svg>`
        )
        this.pencilBtn.addEventListener('click', () => this.onTogglePencil?.())

        this.pencilOptionsEl = this.buildPencilOptions()
        this.pencilOptionsEl.classList.add('hidden')
        pencilPicker.append(this.pencilBtn, this.pencilOptionsEl)

        this.addButtons = [
            textBtn,
            imageBtn,
            noteBtn,
            this.shapeIconBtn,
            this.shapeChevronBtn,
            this.pencilBtn,
        ]
        const settingsDivider = document.createElement('div')
        settingsDivider.className = 'add-bar-divider'

        const settingsBtn = this.makeButton(
            'Settings',
            `<svg viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M8.34 1.804A1 1 0 0 1 9.32 1h1.36a1 1 0 0 1 .98.804l.295 1.473c.497.144.971.342 1.419.588l1.213-.821a1 1 0 0 1 1.273.146l.961.96a1 1 0 0 1 .146 1.274l-.82 1.214c.247.448.445.921.588 1.419l1.473.294a1 1 0 0 1 .804.98v1.361a1 1 0 0 1-.804.98l-1.473.295a6.95 6.95 0 0 1-.588 1.419l.82 1.213a1 1 0 0 1-.146 1.274l-.96.96a1 1 0 0 1-1.274.146l-1.213-.82a6.95 6.95 0 0 1-1.419.588l-.294 1.473a1 1 0 0 1-.98.804H8.68a1 1 0 0 1-.98-.804l-.295-1.473a6.957 6.957 0 0 1-1.419-.588l-1.213.821a1 1 0 0 1-1.273-.146l-.961-.96a1 1 0 0 1-.146-1.274l.82-1.214a6.957 6.957 0 0 1-.588-1.419L1.804 11.3A1 1 0 0 1 1 10.32V8.96a1 1 0 0 1 .804-.98l1.473-.295c.144-.497.342-.971.588-1.419l-.82-1.213a1 1 0 0 1 .146-1.273l.96-.961a1 1 0 0 1 1.274-.146l1.213.82c.448-.247.921-.445 1.419-.588L8.34 1.804ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clip-rule="evenodd"/>
            </svg>`
        )
        settingsBtn.classList.add('settings-btn')
        settingsBtn.addEventListener('click', () => this.onSettingsOpen?.())

        this.el.append(
            textBtn,
            imageBtn,
            noteBtn,
            shapePicker,
            pencilDivider,
            pencilPicker,
            settingsDivider,
            settingsBtn
        )
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

    updateModeHints(hints: Partial<Record<BoardMode, string>>) {
        for (const [mode, text] of Object.entries(hints) as [BoardMode, string][]) {
            const el = this.modeHintEls.get(mode)
            if (el) el.textContent = text
        }
    }

    setPencilActive(active: boolean) {
        this.pencilBtn.classList.toggle('is-active', active)
        this.pencilOptionsEl.classList.toggle('hidden', !active)
    }

    getPencilSettings(): PencilSettings {
        return { ...this.pencilSettings }
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

    private buildPencilOptions(): HTMLElement {
        const panel = document.createElement('div')
        panel.className = 'pencil-options'

        // ── Stroke color ───────────────────────────────────────────────────────
        this.strokePicker = new ColorPicker(this.pencilSettings.stroke, (color) => {
            this.pencilSettings.stroke = color
            this.onPencilSettingsChange?.({ ...this.pencilSettings })
        })

        const strokeRow = this.makeOptionRow('Stroke', this.strokePicker.el)

        // ── Gradient end color ─────────────────────────────────────────────────
        this.strokeEndPicker = new ColorPicker(
            this.pencilSettings.strokeEnd || '#333333',
            (color) => {
                this.pencilSettings.strokeEnd = color
                this.onPencilSettingsChange?.({ ...this.pencilSettings })
            }
        )

        const clearGradBtn = document.createElement('button')
        clearGradBtn.className = 'pencil-clear-btn'
        clearGradBtn.title = 'Remove gradient'
        clearGradBtn.textContent = '✕'
        clearGradBtn.style.visibility = this.pencilSettings.strokeEnd ? '' : 'hidden'
        clearGradBtn.addEventListener('click', () => {
            this.pencilSettings.strokeEnd = ''
            clearGradBtn.style.visibility = 'hidden'
            this.onPencilSettingsChange?.({ ...this.pencilSettings })
        })

        // Show the clear button as soon as a gradient color is chosen.
        this.strokeEndPicker.el.addEventListener('mousedown', () => {
            if (!this.pencilSettings.strokeEnd) {
                this.pencilSettings.strokeEnd = this.pencilSettings.stroke
                this.strokeEndPicker.setValue(this.pencilSettings.stroke)
            }
            clearGradBtn.style.visibility = ''
        })

        const gradCell = document.createElement('div')
        gradCell.className = 'pencil-grad-cell'
        gradCell.append(this.strokeEndPicker.el, clearGradBtn)

        const gradRow = this.makeOptionRow('Gradient', gradCell)

        // ── Width ──────────────────────────────────────────────────────────────
        const widthInput = document.createElement('input')
        widthInput.type = 'number'
        widthInput.className = 'pencil-number-input'
        widthInput.min = '1'
        widthInput.max = '80'
        widthInput.value = String(this.pencilSettings.strokeWidth)
        widthInput.addEventListener('input', () => {
            const v = Math.max(1, Math.min(80, parseInt(widthInput.value) || 1))
            this.pencilSettings.strokeWidth = v
            this.onPencilSettingsChange?.({ ...this.pencilSettings })
        })
        widthInput.addEventListener('mousedown', (e) => e.stopPropagation())

        const widthRow = this.makeOptionRow('Width', widthInput)

        // ── Taper ──────────────────────────────────────────────────────────────
        const taperRow = this.makeSliderRow('Taper', this.pencilSettings.taper, (v) => {
            this.pencilSettings.taper = v
            this.onPencilSettingsChange?.({ ...this.pencilSettings })
        })

        // ── Smoothing ──────────────────────────────────────────────────────────
        const smoothingRow = this.makeSliderRow('Smooth', this.pencilSettings.smoothing, (v) => {
            this.pencilSettings.smoothing = v
            this.onPencilSettingsChange?.({ ...this.pencilSettings })
        })

        panel.append(strokeRow, gradRow, widthRow, taperRow, smoothingRow)
        return panel
    }

    private makeOptionRow(label: string, control: HTMLElement): HTMLElement {
        const row = document.createElement('div')
        row.className = 'pencil-option-row'
        const lbl = document.createElement('span')
        lbl.className = 'pencil-option-label'
        lbl.textContent = label
        row.append(lbl, control)
        return row
    }

    private makeSliderRow(
        label: string,
        initial: number,
        onChange: (v: number) => void
    ): HTMLElement {
        const slider = document.createElement('input')
        slider.type = 'range'
        slider.className = 'pencil-slider'
        slider.min = '0'
        slider.max = '100'
        slider.value = String(initial)
        slider.addEventListener('input', () => onChange(parseInt(slider.value)))
        slider.addEventListener('mousedown', (e) => e.stopPropagation())
        return this.makeOptionRow(label, slider)
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
