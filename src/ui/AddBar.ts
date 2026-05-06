// Toolbar fixed at the top center of the screen for adding new board objects and switching modes.

import { type NoteShape } from '../board/NoteBlock'
import {
    ICON_EDIT_MODE,
    ICON_EXPLORE_MODE,
    ICON_SHAPE_RECT,
    ICON_SHAPE_LINE,
    ICON_SHAPE_ARROW,
    ICON_SHAPE_ELLIPSE,
    ICON_SHAPE_POLYGON,
    ICON_SHAPE_STAR,
    ICON_NOTE_PLAIN,
    ICON_NOTE_DOGEAR,
    ICON_NOTE_STACKED,
    ICON_CHEVRON_DOWN,
    ICON_UNDO,
    ICON_REDO,
    ICON_TEXT,
    ICON_IMAGE,
    ICON_PENCIL,
    ICON_ERASER,
    ICON_SETTINGS,
} from '../lib/icons'

export type BoardMode = 'edit' | 'explore'

export type DrawableShape = 'rectangle' | 'line' | 'arrow' | 'ellipse' | 'polygon' | 'star'

const MODES: { mode: BoardMode; label: string; icon: string }[] = [
    { mode: 'edit', label: 'Edit', icon: ICON_EDIT_MODE },
    { mode: 'explore', label: 'Explore', icon: ICON_EXPLORE_MODE },
]

const SHAPES: { shape: DrawableShape; label: string; icon: string }[] = [
    { shape: 'rectangle', label: 'Rectangle', icon: ICON_SHAPE_RECT },
    { shape: 'line', label: 'Line', icon: ICON_SHAPE_LINE },
    { shape: 'arrow', label: 'Arrow', icon: ICON_SHAPE_ARROW },
    { shape: 'ellipse', label: 'Ellipse', icon: ICON_SHAPE_ELLIPSE },
    { shape: 'polygon', label: 'Polygon', icon: ICON_SHAPE_POLYGON },
    { shape: 'star', label: 'Star', icon: ICON_SHAPE_STAR },
]

const NOTE_SHAPES: { shape: NoteShape; label: string; icon: string }[] = [
    { shape: 'rectangle', label: 'Plain', icon: ICON_NOTE_PLAIN },
    { shape: 'dog-ear', label: 'Dog-ear', icon: ICON_NOTE_DOGEAR },
    { shape: 'stacked', label: 'Stacked', icon: ICON_NOTE_STACKED },
]

export class AddBar {
    readonly el: HTMLElement
    onAddText: (() => void) | null = null
    onAddImage: (() => void) | null = null
    onAddNote: ((shape: NoteShape) => void) | null = null
    onAddShape: ((shape: DrawableShape) => void) | null = null
    onModeChange: ((mode: BoardMode) => void) | null = null
    onUndo: (() => void) | null = null
    onRedo: (() => void) | null = null
    onTogglePencil: (() => void) | null = null
    onToggleEraser: (() => void) | null = null
    onSettingsOpen: (() => void) | null = null

    private modeTriggerBtn: HTMLButtonElement
    private modeDropdownEl: HTMLElement
    private modeDropdownOpen = false
    private modeHintEls: Map<BoardMode, HTMLElement> = new Map()

    private noteIconBtn: HTMLButtonElement
    private noteChevronBtn: HTMLButtonElement
    private noteDropdownEl: HTMLElement
    private noteDropdownOpen = false
    private selectedNoteShape: NoteShape = 'rectangle'

    private shapeIconBtn: HTMLButtonElement
    private shapeChevronBtn: HTMLButtonElement
    private shapeDropdownEl: HTMLElement
    private shapeDropdownOpen = false
    private selectedShape: DrawableShape = 'rectangle'

    private undoBtn: HTMLButtonElement
    private redoBtn: HTMLButtonElement
    private pencilBtn: HTMLButtonElement
    private eraserBtn: HTMLButtonElement
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

        // ── Undo / Redo ────────────────────────────────────────────────────────
        this.undoBtn = this.makeButton('Undo (Ctrl+Z)', ICON_UNDO)
        this.undoBtn.disabled = true
        this.undoBtn.addEventListener('click', () => this.onUndo?.())

        this.redoBtn = this.makeButton('Redo (Ctrl+Y)', ICON_REDO)
        this.redoBtn.disabled = true
        this.redoBtn.addEventListener('click', () => this.onRedo?.())

        const undoRedoDivider = document.createElement('div')
        undoRedoDivider.className = 'add-bar-divider'

        // ── Add buttons ────────────────────────────────────────────────────────
        const textBtn = this.makeButton('Text', ICON_TEXT)
        textBtn.addEventListener('click', () => this.onAddText?.())

        const imageBtn = this.makeButton('Image', ICON_IMAGE)
        imageBtn.addEventListener('click', () => this.onAddImage?.())

        // ── Note split-button ──────────────────────────────────────────────────
        const notePicker = document.createElement('div')
        notePicker.className = 'mode-picker'

        const noteSplitBtn = document.createElement('div')
        noteSplitBtn.className = 'shape-split-btn'

        this.noteIconBtn = document.createElement('button')
        this.noteIconBtn.className = 'shape-icon-btn'
        this.noteIconBtn.addEventListener('click', () => {
            this.closeNoteDropdown()
            this.onAddNote?.(this.selectedNoteShape)
        })

        this.noteChevronBtn = document.createElement('button')
        this.noteChevronBtn.className = 'shape-chevron-btn'
        this.noteChevronBtn.innerHTML = ICON_CHEVRON_DOWN
        this.noteChevronBtn.title = 'Choose note style'
        this.noteChevronBtn.addEventListener('click', () => {
            this.noteDropdownOpen = !this.noteDropdownOpen
            this.noteDropdownEl.classList.toggle('hidden', !this.noteDropdownOpen)
            if (this.noteDropdownOpen) {
                this.closeModeDropdown()
                this.closeShapeDropdown()
            }
        })

        this.noteDropdownEl = document.createElement('div')
        this.noteDropdownEl.className = 'mode-dropdown hidden'

        for (const { shape, label, icon } of NOTE_SHAPES) {
            const option = document.createElement('button')
            option.className = 'mode-option'
            option.dataset.noteShape = shape
            option.innerHTML = `${icon}<span>${label}</span>`
            option.addEventListener('click', () => {
                this.selectedNoteShape = shape
                this.updateNoteTrigger()
                this.closeNoteDropdown()
            })
            this.noteDropdownEl.appendChild(option)
        }

        noteSplitBtn.append(this.noteIconBtn, this.noteChevronBtn)
        notePicker.append(noteSplitBtn, this.noteDropdownEl)

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
        this.shapeChevronBtn.innerHTML = ICON_CHEVRON_DOWN
        this.shapeChevronBtn.title = 'Choose shape'
        this.shapeChevronBtn.addEventListener('click', () => {
            this.shapeDropdownOpen = !this.shapeDropdownOpen
            this.shapeDropdownEl.classList.toggle('hidden', !this.shapeDropdownOpen)
            if (this.shapeDropdownOpen) {
                this.closeModeDropdown()
                this.closeNoteDropdown()
            }
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

        // ── Pencil / Eraser tools ──────────────────────────────────────────────
        const pencilDivider = document.createElement('div')
        pencilDivider.className = 'add-bar-divider'

        this.pencilBtn = this.makeButton('Pencil (P)', ICON_PENCIL)
        this.pencilBtn.addEventListener('click', () => this.onTogglePencil?.())

        this.eraserBtn = this.makeButton('Eraser (Shift+E)', ICON_ERASER)
        this.eraserBtn.addEventListener('click', () => this.onToggleEraser?.())

        this.addButtons = [
            textBtn,
            imageBtn,
            this.noteIconBtn,
            this.noteChevronBtn,
            this.shapeIconBtn,
            this.shapeChevronBtn,
            this.pencilBtn,
            this.eraserBtn,
        ]
        const settingsDivider = document.createElement('div')
        settingsDivider.className = 'add-bar-divider'

        const settingsBtn = this.makeButton('Settings', ICON_SETTINGS)
        settingsBtn.classList.add('settings-btn')
        settingsBtn.addEventListener('click', () => this.onSettingsOpen?.())

        this.el.append(
            this.undoBtn,
            this.redoBtn,
            undoRedoDivider,
            textBtn,
            imageBtn,
            notePicker,
            shapePicker,
            pencilDivider,
            this.pencilBtn,
            this.eraserBtn,
            settingsDivider,
            settingsBtn
        )
        container.appendChild(this.el)

        document.addEventListener('mousedown', (e) => {
            if (!this.el.contains(e.target as Node)) {
                this.closeModeDropdown()
                this.closeNoteDropdown()
                this.closeShapeDropdown()
            }
        })

        this.setMode('edit')
        this.updateNoteTrigger()
        this.updateShapeTrigger()
    }

    setHistoryState(canUndo: boolean, canRedo: boolean) {
        this.undoBtn.disabled = !canUndo
        this.redoBtn.disabled = !canRedo
    }

    updateModeHints(hints: Partial<Record<BoardMode, string>>) {
        for (const [mode, text] of Object.entries(hints) as [BoardMode, string][]) {
            const el = this.modeHintEls.get(mode)
            if (el) el.textContent = text
        }
    }

    setPencilActive(active: boolean) {
        this.pencilBtn.classList.toggle('is-active', active)
    }

    setEraserActive(active: boolean) {
        this.eraserBtn.classList.toggle('is-active', active)
    }

    setMode(mode: BoardMode) {
        const def = MODES.find((m) => m.mode === mode)!

        this.modeTriggerBtn.innerHTML = `${def.icon}${ICON_CHEVRON_DOWN}`
        this.modeTriggerBtn.title = def.label
        this.modeTriggerBtn.classList.toggle('is-active', mode !== 'edit')

        this.modeDropdownEl.querySelectorAll('.mode-option').forEach((opt) => {
            opt.classList.toggle('is-active', (opt as HTMLElement).dataset.mode === mode)
        })

        this.addButtons.forEach((btn) => (btn.disabled = mode !== 'edit'))
        this.onModeChange?.(mode)
    }

    private updateNoteTrigger() {
        const def = NOTE_SHAPES.find((s) => s.shape === this.selectedNoteShape)!
        this.noteIconBtn.innerHTML = def.icon
        this.noteIconBtn.title = def.label

        this.noteDropdownEl.querySelectorAll('.mode-option').forEach((opt) => {
            opt.classList.toggle(
                'is-active',
                (opt as HTMLElement).dataset.noteShape === this.selectedNoteShape
            )
        })
    }

    private closeNoteDropdown() {
        this.noteDropdownEl.classList.add('hidden')
        this.noteDropdownOpen = false
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
