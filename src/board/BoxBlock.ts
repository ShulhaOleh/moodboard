// Abstract base for bounding-box blocks (Text, Image, Shape) — position, size, rotation, and drag gestures.
// Resize and rotate handles are provided by SelectionBox, not by the individual block.

import { BaseBlock } from './BaseBlock'

export interface BoxBaseData {
    id: string
    x: number
    y: number
    width?: number
    height?: number
    rotation: number
    name?: string
}

export abstract class BoxBlock<D extends BoxBaseData> extends BaseBlock {
    protected data: D
    protected readonly dragOffset = { x: 0, y: 0 }
    // Injected by main.ts to apply snap corrections during drag.
    // Called each frame with the raw proposed position; returns the snapped position.
    public snapPosition: ((x: number, y: number) => { x: number; y: number }) | null = null

    protected get minResizeWidth(): number {
        return 40
    }
    protected get minResizeHeight(): number {
        return 40
    }

    constructor(el: HTMLElement, defaultName: string, data: D) {
        super(el, data.name ?? defaultName)
        this.data = { ...data } as D
    }

    protected applyPosition() {
        this.el.style.left = `${this.data.x}px`
        this.el.style.top = `${this.data.y}px`
    }

    protected applySize() {
        if (this.data.width !== undefined) this.el.style.width = `${this.data.width}px`
        if (this.data.height !== undefined) this.el.style.height = `${this.data.height}px`
    }

    protected applyTransform() {
        this.el.style.transform = `rotate(${this.data.rotation}deg)`
    }

    protected select(e: MouseEvent) {
        this.selected = true
        this.el.classList.add('is-selected')
        this.onSelect?.(this, e)
    }

    // Wire up the block's primary mousedown — call this at the end of the subclass constructor.
    protected setupInteraction() {
        this.el.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return
            if (this.locked) return
            if (this.isEditing()) return
            if (!this.selected) {
                this.select(e)
                return
            }
            this.startDrag(e)
        })
    }

    // Override in subclasses that have an inline editor (e.g. TextBlock) to block drag while editing.
    protected isEditing(): boolean {
        return false
    }

    protected startDrag(e: MouseEvent) {
        e.preventDefault()
        const startX = e.clientX
        const startY = e.clientY
        let dragging = false

        const onMove = (e: MouseEvent) => {
            if (!dragging) {
                if (Math.hypot(e.clientX - startX, e.clientY - startY) < 4) return
                dragging = true
                this.onDragStart?.()
                const { panX, panY, zoom } = this.getViewport!()
                this.dragOffset.x = (startX - panX) / zoom - this.data.x
                this.dragOffset.y = (startY - panY) / zoom - this.data.y
            }
            const { panX, panY, zoom } = this.getViewport!()
            const rawX = (e.clientX - panX) / zoom - this.dragOffset.x
            const rawY = (e.clientY - panY) / zoom - this.dragOffset.y
            // dragOffset always tracks the raw mouse position so snap can't drift the offset.
            const snapped = this.snapPosition ? this.snapPosition(rawX, rawY) : { x: rawX, y: rawY }
            const dx = snapped.x - this.data.x
            const dy = snapped.y - this.data.y
            this.data.x = snapped.x
            this.data.y = snapped.y
            this.applyPosition()
            this.onDragMove?.(dx, dy)
            this.onChange?.()
        }

        const onUp = () => {
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
        }

        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
    }

    getPosition() {
        return { x: this.data.x, y: this.data.y }
    }

    getSize() {
        return {
            width: this.data.width ?? this.el.offsetWidth,
            height: this.data.height ?? this.el.offsetHeight,
        }
    }

    getRotation() {
        return this.data.rotation
    }

    getWorldCorners(): [number, number][] {
        const { x, y } = this.getPosition()
        const { width: w, height: h } = this.getSize()
        const rad = this.data.rotation * (Math.PI / 180)
        const cx = x + w / 2
        const cy = y + h / 2
        const cos = Math.cos(rad)
        const sin = Math.sin(rad)
        const hw = w / 2
        const hh = h / 2
        return [
            [cx - hw * cos + hh * sin, cy - hw * sin - hh * cos],
            [cx + hw * cos + hh * sin, cy + hw * sin - hh * cos],
            [cx + hw * cos - hh * sin, cy + hw * sin + hh * cos],
            [cx - hw * cos - hh * sin, cy - hw * sin + hh * cos],
        ]
    }

    setPosition(x: number, y: number) {
        this.onBeforePropertyChange?.()
        this.data.x = x
        this.data.y = y
        this.applyPosition()
        this.onChange?.()
    }

    setSize(width: number, height: number) {
        this.onBeforePropertyChange?.()
        this.data.width = Math.max(this.minResizeWidth, width)
        this.data.height = Math.max(this.minResizeHeight, height)
        this.applySize()
        this.onChange?.()
    }

    setRotation(deg: number) {
        this.onBeforePropertyChange?.()
        this.data.rotation = deg
        this.applyTransform()
        this.onChange?.()
    }
}
