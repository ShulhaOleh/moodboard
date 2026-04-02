// Draggable, resizable, rotatable image block rendered in the HTML overlay.

import { BoardObject, PropertyField } from './BoardObject'

export interface ImageBlockData {
    id: string
    x: number
    y: number
    width: number
    height: number
    rotation: number
    // Runtime src — an object URL (from a Blob) or a static asset URL.
    // When persisting to Dexie, store the Blob separately and recreate this on load.
    src: string
    objectFit: 'cover' | 'contain' | 'fill'
    opacity: number
    borderRadius: number
    background: string
    shadowColor: string
    shadowBlur: number
    shadowX: number
    shadowY: number
    // Kept for future Dexie persistence — recreate src via URL.createObjectURL on load.
    imageBlob?: Blob
    name?: string
}

export class ImageBlock implements BoardObject {
    readonly el: HTMLElement
    onSelect: ((obj: BoardObject, e: MouseEvent) => void) | null = null
    onDeselect: (() => void) | null = null
    onChange: (() => void) | null = null
    onDragMove: ((dx: number, dy: number) => void) | null = null
    onDragStart: (() => void) | null = null
    onBeforePropertyChange: (() => void) | null = null
    onLayerChange: (() => void) | null = null
    readonly layerLabel = 'Image'
    visible = true
    locked = false
    name: string
    private data: ImageBlockData
    private imgEl: HTMLImageElement
    private innerEl: HTMLElement
    private handlesEl: HTMLElement | null = null
    private selected = false
    private dragOffset = { x: 0, y: 0 }

    constructor(container: HTMLElement, data: ImageBlockData) {
        this.data = { ...data }
        this.name = data.name ?? 'Image'

        this.el = document.createElement('div')
        this.el.className = 'image-block'

        // Inner wrapper clips the image to the border radius without clipping the
        // selection handles, which extend outside the block bounds.
        this.innerEl = document.createElement('div')
        this.innerEl.className = 'image-block-inner'

        this.imgEl = document.createElement('img')
        this.imgEl.draggable = false
        this.innerEl.appendChild(this.imgEl)
        this.el.appendChild(this.innerEl)

        this.applyPosition()
        this.applySize()
        this.applyTransform()
        this.applyAppearance()

        this.setupInteraction()
        container.appendChild(this.el)
    }

    private applyPosition() {
        this.el.style.left = `${this.data.x}px`
        this.el.style.top = `${this.data.y}px`
    }

    private applySize() {
        this.el.style.width = `${this.data.width}px`
        this.el.style.height = `${this.data.height}px`
    }

    private applyTransform() {
        this.el.style.transform = `rotate(${this.data.rotation}deg)`
    }

    private applyAppearance() {
        if (this.data.src) {
            this.imgEl.src = this.data.src
            this.imgEl.style.display = ''
            this.innerEl.classList.remove('image-block-empty')
        } else {
            this.imgEl.src = ''
            this.imgEl.style.display = 'none'
            this.innerEl.classList.add('image-block-empty')
        }
        this.imgEl.style.objectFit = this.data.objectFit
        this.el.style.opacity = String(this.data.opacity / 100)
        this.el.style.borderRadius = `${this.data.borderRadius}px`
        this.innerEl.style.borderRadius = `${this.data.borderRadius}px`
        this.innerEl.style.background = this.data.background
        this.el.style.boxShadow = this.data.shadowColor
            ? `${this.data.shadowX}px ${this.data.shadowY}px ${this.data.shadowBlur}px ${this.data.shadowColor}`
            : 'none'
    }

    private setupInteraction() {
        this.el.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return
            if (this.locked) return
            if ((e.target as HTMLElement).closest('.tb-handles')) return
            if (!this.selected) {
                this.select(e)
                return
            }
            this.startDrag(e)
        })

        // Deselect when clicking outside this block.
        // If the click lands on another board object, skip onDeselect — the incoming
        // onSelect will update the panel, so firing onDeselect here would hide it.
        document.addEventListener('mousedown', (e) => {
            if (!this.selected || this.el.contains(e.target as Node)) return
            const target = e.target as HTMLElement
            const hit = target.closest('.text-block, .image-block, .shape-block, .line-block')
            if (hit) {
                if (e.ctrlKey) return
                if (hit.classList.contains('is-selected')) return
                this.markDeselected()
            } else {
                this.deselect()
            }
        })
    }

    private select(e: MouseEvent) {
        this.selected = true
        this.el.classList.add('is-selected')
        this.renderHandles()
        this.onSelect?.(this, e)
    }

    markSelected() {
        this.selected = true
        this.el.classList.add('is-selected')
        this.handlesEl?.remove()
        this.handlesEl = null
    }

    markDeselected() {
        this.selected = false
        this.el.classList.remove('is-selected')
        this.handlesEl?.remove()
        this.handlesEl = null
    }

    private deselect() {
        this.markDeselected()
        this.onDeselect?.()
    }

    private renderHandles() {
        this.handlesEl?.remove()

        const handles = document.createElement('div')
        handles.className = 'tb-handles'

        const resizeHandle = document.createElement('div')
        resizeHandle.className = 'tb-resize'
        resizeHandle.addEventListener('mousedown', (e) => this.startResize(e))

        const rotateHandle = document.createElement('div')
        rotateHandle.className = 'tb-rotate'
        rotateHandle.addEventListener('mousedown', (e) => this.startRotate(e))

        handles.appendChild(resizeHandle)
        handles.appendChild(rotateHandle)
        this.el.appendChild(handles)
        this.handlesEl = handles
    }

    private startDrag(e: MouseEvent) {
        e.preventDefault()

        const startX = e.clientX
        const startY = e.clientY
        let dragging = false

        const onMove = (e: MouseEvent) => {
            if (!dragging) {
                if (Math.hypot(e.clientX - startX, e.clientY - startY) < 4) return
                dragging = true
                this.onDragStart?.()
                this.dragOffset.x = startX - this.data.x
                this.dragOffset.y = startY - this.data.y
            }
            const newX = e.clientX - this.dragOffset.x
            const newY = e.clientY - this.dragOffset.y
            const dx = newX - this.data.x
            const dy = newY - this.data.y
            this.data.x = newX
            this.data.y = newY
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

    private startResize(e: MouseEvent) {
        e.preventDefault()
        e.stopPropagation()
        this.onDragStart?.()

        const startX = e.clientX
        const startY = e.clientY
        const startW = this.data.width
        const startH = this.data.height
        const angle = (this.data.rotation * Math.PI) / 180

        const onMove = (e: MouseEvent) => {
            const dx = e.clientX - startX
            const dy = e.clientY - startY
            const localDx = dx * Math.cos(angle) + dy * Math.sin(angle)
            const localDy = -dx * Math.sin(angle) + dy * Math.cos(angle)
            this.data.width = Math.max(40, startW + localDx)
            this.data.height = Math.max(40, startH + localDy)
            this.applySize()
            this.onChange?.()
        }

        const onUp = () => {
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
        }

        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
    }

    private startRotate(e: MouseEvent) {
        e.preventDefault()
        e.stopPropagation()
        this.onDragStart?.()

        const rect = this.el.getBoundingClientRect()
        const centerX = rect.left + rect.width / 2
        const centerY = rect.top + rect.height / 2

        const onMove = (e: MouseEvent) => {
            const angle = Math.atan2(e.clientY - centerY, e.clientX - centerX)
            this.data.rotation = (angle * 180) / Math.PI + 90
            this.applyTransform()
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
        return { width: this.data.width, height: this.data.height }
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

    getAppearanceFields(): PropertyField[] {
        return [
            {
                type: 'text',
                key: 'src',
                label: 'Source',
                value: this.data.src,
                placeholder: '/path/to/image.jpg',
                allowFilePick: true,
            },
            {
                type: 'select',
                key: 'objectFit',
                label: 'Fit',
                value: this.data.objectFit,
                options: [
                    { value: 'cover', label: 'Cover' },
                    { value: 'contain', label: 'Contain' },
                    { value: 'fill', label: 'Fill' },
                ],
            },
            {
                type: 'slider',
                key: 'opacity',
                label: 'Opacity',
                value: this.data.opacity,
                min: 0,
                max: 100,
                step: 1,
            },
            {
                type: 'number',
                key: 'borderRadius',
                label: 'Radius',
                value: this.data.borderRadius,
                min: 0,
                max: 500,
                step: 1,
            },
            {
                type: 'color',
                key: 'background',
                label: 'Background',
                value: this.data.background,
                clearable: true,
            },
            { type: 'section', label: 'Shadow' },
            {
                type: 'color',
                key: 'shadowColor',
                label: 'Color',
                value: this.data.shadowColor,
                clearable: true,
            },
            {
                type: 'number',
                key: 'shadowX',
                label: 'Shadow X',
                value: this.data.shadowX,
                min: -100,
                max: 100,
                step: 1,
            },
            {
                type: 'number',
                key: 'shadowY',
                label: 'Shadow Y',
                value: this.data.shadowY,
                min: -100,
                max: 100,
                step: 1,
            },
            {
                type: 'slider',
                key: 'shadowBlur',
                label: 'Shadow blur',
                value: this.data.shadowBlur,
                min: 0,
                max: 80,
                step: 1,
            },
        ]
    }

    setAppearanceProperty(key: string, value: string | number) {
        this.onBeforePropertyChange?.()
        if (key === 'src') {
            if (this.data.src.startsWith('blob:')) URL.revokeObjectURL(this.data.src)
            this.data.src = String(value)
            this.applyAppearance()
        }
        if (key === 'objectFit') {
            this.data.objectFit = value as ImageBlockData['objectFit']
            this.imgEl.style.objectFit = this.data.objectFit
        }
        if (key === 'opacity') {
            this.data.opacity = Number(value)
            this.el.style.opacity = String(this.data.opacity / 100)
        }
        if (key === 'borderRadius') {
            this.data.borderRadius = Number(value)
            this.el.style.borderRadius = `${this.data.borderRadius}px`
            this.innerEl.style.borderRadius = `${this.data.borderRadius}px`
        }
        if (key === 'background') {
            this.data.background = String(value)
            this.innerEl.style.background = this.data.background
        }
        if (key === 'shadowColor') {
            this.data.shadowColor = String(value)
            this.applyAppearance()
        }
        if (key === 'shadowX') {
            this.data.shadowX = Number(value)
            this.applyAppearance()
        }
        if (key === 'shadowY') {
            this.data.shadowY = Number(value)
            this.applyAppearance()
        }
        if (key === 'shadowBlur') {
            this.data.shadowBlur = Number(value)
            this.applyAppearance()
        }
    }

    setPosition(x: number, y: number) {
        this.onBeforePropertyChange?.()
        this.data.x = x
        this.data.y = y
        this.applyPosition()
    }

    setSize(width: number, height: number) {
        this.onBeforePropertyChange?.()
        this.data.width = Math.max(40, width)
        this.data.height = Math.max(40, height)
        this.applySize()
    }

    setRotation(deg: number) {
        this.onBeforePropertyChange?.()
        this.data.rotation = deg
        this.applyTransform()
    }

    getData(): Readonly<ImageBlockData> {
        return { ...this.data }
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

    // Must be called when removing the block if src is an object URL, to free memory.
    destroy() {
        if (this.data.src.startsWith('blob:')) {
            URL.revokeObjectURL(this.data.src)
        }
        this.el.remove()
    }
}
