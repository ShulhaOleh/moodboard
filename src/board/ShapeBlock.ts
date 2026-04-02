// Draggable, resizable, rotatable geometric shape block rendered as an inline SVG.

import { BoardObject, PropertyField } from './BoardObject'

export type ShapeType = 'rectangle' | 'ellipse' | 'polygon' | 'star'

export interface ShapeBlockData {
    id: string
    x: number
    y: number
    width: number
    height: number
    rotation: number
    shape: ShapeType
    fill: string
    stroke: string
    strokeWidth: number
    // Only applies to rectangle.
    borderRadius: number
    // Only applies to polygon — number of sides (3–12).
    sides: number
    // Only applies to star — number of points (3–12).
    starPoints: number
    opacity: number
    shadowColor: string
    shadowBlur: number
    shadowX: number
    shadowY: number
    name?: string
}

export class ShapeBlock implements BoardObject {
    readonly el: HTMLElement
    onSelect: ((obj: BoardObject, e: MouseEvent) => void) | null = null
    onDeselect: (() => void) | null = null
    onChange: (() => void) | null = null
    onDragMove: ((dx: number, dy: number) => void) | null = null
    onDragStart: (() => void) | null = null
    onBeforePropertyChange: (() => void) | null = null
    onLayerChange: (() => void) | null = null
    visible = true
    locked = false
    name: string
    get layerLabel(): string {
        const names: Record<string, string> = {
            rectangle: 'Rectangle',
            ellipse: 'Ellipse',
            polygon: 'Polygon',
            star: 'Star',
        }
        return names[this.data.shape] ?? 'Shape'
    }
    private data: ShapeBlockData
    private svgEl: SVGSVGElement
    private shapeEl: SVGElement
    private handlesEl: HTMLElement | null = null
    private selected = false
    private dragOffset = { x: 0, y: 0 }

    constructor(container: HTMLElement, data: ShapeBlockData) {
        this.data = { ...data }
        this.name = data.name ?? this.layerLabel

        this.el = document.createElement('div')
        this.el.className = 'shape-block'

        this.svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        this.svgEl.setAttribute('width', '100%')
        this.svgEl.setAttribute('height', '100%')
        this.svgEl.setAttribute('viewBox', '0 0 100 100')
        this.svgEl.setAttribute('preserveAspectRatio', 'none')
        this.svgEl.style.overflow = 'visible'

        this.shapeEl = this.createShapeEl(this.data.shape)
        this.svgEl.appendChild(this.shapeEl)
        this.el.appendChild(this.svgEl)

        this.applyPosition()
        this.applySize()
        this.applyTransform()
        this.applyAppearance()

        this.setupInteraction()
        container.appendChild(this.el)
    }

    private createShapeEl(shape: ShapeType): SVGElement {
        let el: SVGElement

        switch (shape) {
            case 'rectangle': {
                const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
                rect.setAttribute('x', '0')
                rect.setAttribute('y', '0')
                rect.setAttribute('width', '100')
                rect.setAttribute('height', '100')
                el = rect
                break
            }
            case 'ellipse': {
                const ellipse = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse')
                ellipse.setAttribute('cx', '50')
                ellipse.setAttribute('cy', '50')
                ellipse.setAttribute('rx', '50')
                ellipse.setAttribute('ry', '50')
                el = ellipse
                break
            }
            case 'polygon': {
                const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon')
                polygon.setAttribute('points', this.computePolygonPoints(this.data.sides))
                el = polygon
                break
            }
            case 'star': {
                const star = document.createElementNS('http://www.w3.org/2000/svg', 'polygon')
                star.setAttribute('points', this.computeStarPoints(this.data.starPoints))
                el = star
                break
            }
        }

        // Keeps stroke width constant in screen pixels regardless of SVG scaling.
        el.setAttribute('vector-effect', 'non-scaling-stroke')
        return el
    }

    // Computes points for a regular N-sided polygon inscribed in a circle.
    private computePolygonPoints(sides: number): string {
        const pts: string[] = []
        for (let i = 0; i < sides; i++) {
            const angle = (i * 2 * Math.PI) / sides - Math.PI / 2
            pts.push(`${50 + 48 * Math.cos(angle)},${50 + 48 * Math.sin(angle)}`)
        }
        return pts.join(' ')
    }

    // Computes points for an N-pointed star with a fixed inner-radius ratio.
    private computeStarPoints(points: number): string {
        const pts: string[] = []
        const outerR = 48
        const innerR = outerR * 0.4
        for (let i = 0; i < points * 2; i++) {
            const angle = (i * Math.PI) / points - Math.PI / 2
            const r = i % 2 === 0 ? outerR : innerR
            pts.push(`${50 + r * Math.cos(angle)},${50 + r * Math.sin(angle)}`)
        }
        return pts.join(' ')
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
        this.shapeEl.setAttribute('fill', this.data.fill || 'none')
        this.shapeEl.setAttribute('stroke', this.data.stroke || 'none')
        this.shapeEl.setAttribute('stroke-width', String(this.data.strokeWidth))

        if (this.data.shape === 'rectangle') {
            this.shapeEl.setAttribute('rx', String(this.data.borderRadius))
        }
        if (this.data.shape === 'polygon') {
            this.shapeEl.setAttribute('points', this.computePolygonPoints(this.data.sides))
        }
        if (this.data.shape === 'star') {
            this.shapeEl.setAttribute('points', this.computeStarPoints(this.data.starPoints))
        }

        this.el.style.opacity = String(this.data.opacity / 100)
        this.el.style.filter = this.data.shadowColor
            ? `drop-shadow(${this.data.shadowX}px ${this.data.shadowY}px ${this.data.shadowBlur}px ${this.data.shadowColor})`
            : 'none'
    }

    private rebuildShape() {
        this.shapeEl.remove()
        this.shapeEl = this.createShapeEl(this.data.shape)
        this.svgEl.appendChild(this.shapeEl)
        this.applyAppearance()
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

        document.addEventListener('mousedown', (e) => {
            if (!this.selected || this.el.contains(e.target as Node)) return
            const target = e.target as HTMLElement
            if (target.closest('.text-block, .image-block, .shape-block, .line-block')) {
                if (e.ctrlKey) return
                this.markDeselected()
            } else {
                this.deselect()
            }
        })
    }

    private select(e: MouseEvent) {
        this.selected = true
        this.el.classList.add('is-selected')
        this.onSelect?.(this, e)
        this.renderHandles()
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

        handles.append(resizeHandle, rotateHandle)
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
            this.data.width = Math.max(20, startW + localDx)
            this.data.height = Math.max(20, startH + localDy)
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

    getAppearanceFields(): PropertyField[] {
        const fields: PropertyField[] = [
            {
                type: 'select',
                key: 'shape',
                label: 'Shape',
                value: this.data.shape,
                options: [
                    { value: 'rectangle', label: 'Rectangle' },
                    { value: 'ellipse', label: 'Ellipse' },
                    { value: 'polygon', label: 'Polygon' },
                    { value: 'star', label: 'Star' },
                ],
            },
            { type: 'color', key: 'fill', label: 'Fill', value: this.data.fill, clearable: true },
        ]

        fields.push(
            {
                type: 'color',
                key: 'stroke',
                label: 'Stroke',
                value: this.data.stroke,
                clearable: true,
            },
            {
                type: 'number',
                key: 'strokeWidth',
                label: 'Stroke W',
                value: this.data.strokeWidth,
                min: 0,
                max: 40,
                step: 1,
            }
        )

        if (this.data.shape === 'rectangle') {
            fields.push({
                type: 'number',
                key: 'borderRadius',
                label: 'Radius',
                value: this.data.borderRadius,
                min: 0,
                max: 50,
                step: 1,
            })
        }
        if (this.data.shape === 'polygon') {
            fields.push({
                type: 'number',
                key: 'sides',
                label: 'Sides',
                value: this.data.sides,
                min: 3,
                max: 12,
                step: 1,
            })
        }
        if (this.data.shape === 'star') {
            fields.push({
                type: 'number',
                key: 'starPoints',
                label: 'Points',
                value: this.data.starPoints,
                min: 3,
                max: 12,
                step: 1,
            })
        }

        fields.push(
            {
                type: 'slider',
                key: 'opacity',
                label: 'Opacity',
                value: this.data.opacity,
                min: 0,
                max: 100,
                step: 1,
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
            }
        )

        return fields
    }

    setAppearanceProperty(key: string, value: string | number) {
        this.onBeforePropertyChange?.()
        if (key === 'shape') {
            this.data.shape = value as ShapeType
            this.rebuildShape()
        }
        if (key === 'fill') {
            this.data.fill = String(value)
            this.shapeEl.setAttribute('fill', this.data.fill || 'none')
        }
        if (key === 'stroke') {
            this.data.stroke = String(value)
            this.shapeEl.setAttribute('stroke', this.data.stroke || 'none')
        }
        if (key === 'strokeWidth') {
            this.data.strokeWidth = Number(value)
            this.shapeEl.setAttribute('stroke-width', String(this.data.strokeWidth))
        }
        if (key === 'borderRadius') {
            this.data.borderRadius = Number(value)
            if (this.data.shape === 'rectangle') {
                this.shapeEl.setAttribute('rx', String(this.data.borderRadius))
            }
        }
        if (key === 'sides') {
            this.data.sides = Number(value)
            this.shapeEl.setAttribute('points', this.computePolygonPoints(this.data.sides))
        }
        if (key === 'starPoints') {
            this.data.starPoints = Number(value)
            this.shapeEl.setAttribute('points', this.computeStarPoints(this.data.starPoints))
        }
        if (key === 'opacity') {
            this.data.opacity = Number(value)
            this.el.style.opacity = String(this.data.opacity / 100)
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
        this.data.width = Math.max(20, width)
        this.data.height = Math.max(20, height)
        this.applySize()
    }

    setRotation(deg: number) {
        this.onBeforePropertyChange?.()
        this.data.rotation = deg
        this.applyTransform()
    }

    getData(): Readonly<ShapeBlockData> {
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

    destroy() {
        this.el.remove()
    }
}
