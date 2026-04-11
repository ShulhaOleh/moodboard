// Abstract base class shared by all board objects — holds callbacks, lifecycle state, and selection logic.

import { BoardObject, PropertyField } from './BoardObject'

const BLOCK_SELECTOR =
    '.text-block, .image-block, .shape-block, .line-block, .path-block, .note-block'

export abstract class BaseBlock implements BoardObject {
    readonly el: HTMLElement
    onSelect: ((obj: BoardObject, e: MouseEvent) => void) | null = null
    onDeselect: (() => void) | null = null
    onChange: (() => void) | null = null
    onDragMove: ((dx: number, dy: number) => void) | null = null
    onDragStart: (() => void) | null = null
    onBeforePropertyChange: (() => void) | null = null
    onLayerChange: (() => void) | null = null
    getViewport: (() => { panX: number; panY: number; zoom: number }) | null = null
    onResize: (() => void) | null = null
    abstract readonly layerLabel: string
    visible = true
    locked = false
    name: string
    protected selected = false

    constructor(el: HTMLElement, name: string) {
        this.el = el
        this.name = name
        this.setupOutsideClickDeselect()
    }

    // Deselects when the user clicks outside this block.
    // Skips onDeselect when the click lands on another block — the incoming onSelect handles the panel.
    private setupOutsideClickDeselect() {
        document.addEventListener('mousedown', (e) => {
            if (!this.selected || this.el.contains(e.target as Node)) return
            const target = e.target as HTMLElement
            // Interacting with the SelectionBox (resize/rotate handles) must never deselect.
            if (target.closest('.selection-box')) return
            const hit = target.closest(BLOCK_SELECTOR)
            if (hit) {
                if (e.ctrlKey) return
                if (hit.classList.contains('is-selected')) return
                this.markDeselected()
            } else {
                this.deselect()
            }
        })
    }

    markSelected() {
        this.selected = true
        this.el.classList.add('is-selected')
        this.clearHandles()
    }

    markDeselected() {
        this.selected = false
        this.el.classList.remove('is-selected')
        this.clearHandles()
    }

    // Overridden by subclasses to remove drag/rotate/endpoint handles.
    protected clearHandles() {}

    protected deselect() {
        this.markDeselected()
        this.onDeselect?.()
    }

    setVisible(v: boolean) {
        this.visible = v
        this.el.style.display = v ? '' : 'none'
        this.onLayerChange?.()
    }

    setLocked(v: boolean) {
        this.locked = v
        this.el.style.pointerEvents = v ? 'none' : ''
        this.onLayerChange?.()
    }

    setName(name: string) {
        this.name = name
        this.onLayerChange?.()
        this.onChange?.()
    }

    destroy() {
        this.el.remove()
    }

    abstract getPosition(): { x: number; y: number }
    abstract getSize(): { width: number; height: number }
    abstract getRotation(): number
    abstract getWorldCorners(): [number, number][]
    abstract getAppearanceFields(): PropertyField[]
    abstract setAppearanceProperty(key: string, value: string | number): void
    abstract setPosition(x: number, y: number): void
    abstract setSize(width: number, height: number): void
    abstract setRotation(deg: number): void
}
