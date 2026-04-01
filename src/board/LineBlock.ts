// Draggable line and arrow block edited by dragging its two endpoints.
// Stored as absolute board coordinates (x1,y1) → (x2,y2); no rotation or bounding-box resize.
// Endpoint decorations (arrowheads, dots, etc.) are rendered via SVG markers.

import { BoardObject, PropertyField } from './BoardObject'

export type PointStyle =
    | 'none'
    | 'round'
    | 'square'
    | 'line-arrow'
    | 'triangle-arrow'
    | 'reversed-triangle'
    | 'circle-arrow'
    | 'diamond-arrow'

export interface LineBlockData {
    id: string
    x1: number
    y1: number
    x2: number
    y2: number
    stroke: string
    strokeWidth: number
    opacity: number
    startPoint: PointStyle
    endPoint: PointStyle
}

// Extra space around the bounding box so thick strokes and endpoint handles are never clipped.
const PADDING = 14

const POINT_STYLE_OPTIONS = [
    { value: 'none', label: 'None' },
    { value: 'round', label: 'Round' },
    { value: 'square', label: 'Square' },
    { value: 'line-arrow', label: 'Line arrow' },
    { value: 'triangle-arrow', label: 'Triangle arrow' },
    { value: 'reversed-triangle', label: 'Reversed triangle' },
    { value: 'circle-arrow', label: 'Circle arrow' },
    { value: 'diamond-arrow', label: 'Diamond arrow' },
]

export class LineBlock implements BoardObject {
    readonly el: HTMLElement
    onSelect: ((obj: BoardObject, e: MouseEvent) => void) | null = null
    onDeselect: (() => void) | null = null
    onChange: (() => void) | null = null
    onDragMove: ((dx: number, dy: number) => void) | null = null
    onDragStart: (() => void) | null = null
    onBeforePropertyChange: (() => void) | null = null
    onLayerChange: (() => void) | null = null
    readonly layerLabel = 'Line'
    visible = true
    locked = false
    private data: LineBlockData
    private svgEl: SVGSVGElement
    private defsEl: SVGDefsElement
    private hitEl: SVGPathElement
    private lineEl: SVGPathElement
    private handle1El: HTMLElement | null = null
    private handle2El: HTMLElement | null = null
    private selected = false

    constructor(container: HTMLElement, data: LineBlockData) {
        this.data = { ...data }

        this.el = document.createElement('div')
        this.el.className = 'line-block'

        this.svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        this.svgEl.setAttribute('width', '100%')
        this.svgEl.setAttribute('height', '100%')
        this.svgEl.style.overflow = 'visible'

        this.defsEl = document.createElementNS('http://www.w3.org/2000/svg', 'defs')
        this.svgEl.appendChild(this.defsEl)

        // Wide transparent path used as a click/drag target — thin lines are hard to hit.
        this.hitEl = document.createElementNS('http://www.w3.org/2000/svg', 'path')
        this.hitEl.setAttribute('fill', 'none')
        this.hitEl.setAttribute('stroke', 'transparent')
        this.hitEl.setAttribute('stroke-width', '16')
        this.hitEl.setAttribute('stroke-linecap', 'round')
        this.hitEl.style.cursor = 'grab'
        this.hitEl.style.pointerEvents = 'stroke'

        // Visual path — pointer events disabled so clicks fall through to hitEl.
        this.lineEl = document.createElementNS('http://www.w3.org/2000/svg', 'path')
        this.lineEl.setAttribute('fill', 'none')
        this.lineEl.setAttribute('stroke-linecap', 'butt')
        this.lineEl.setAttribute('stroke-linejoin', 'round')
        this.lineEl.style.pointerEvents = 'none'

        this.svgEl.append(this.hitEl, this.lineEl)
        this.el.appendChild(this.svgEl)

        this.applyLayout()
        this.applyAppearance()
        this.setupInteraction()
        container.appendChild(this.el)
    }

    // Returns element position and the SVG coordinates of each endpoint.
    private layout() {
        const { x1, y1, x2, y2 } = this.data
        const minX = Math.min(x1, x2)
        const minY = Math.min(y1, y2)
        const w = Math.abs(x2 - x1) + PADDING * 2
        const h = Math.abs(y2 - y1) + PADDING * 2
        return {
            left: minX - PADDING,
            top: minY - PADDING,
            w,
            h,
            sx1: x1 - minX + PADDING,
            sy1: y1 - minY + PADDING,
            sx2: x2 - minX + PADDING,
            sy2: y2 - minY + PADDING,
        }
    }

    private applyLayout() {
        const { left, top, w, h, sx1, sy1, sx2, sy2 } = this.layout()
        this.el.style.left = `${left}px`
        this.el.style.top = `${top}px`
        this.el.style.width = `${w}px`
        this.el.style.height = `${h}px`
        this.svgEl.setAttribute('viewBox', `0 0 ${w} ${h}`)

        const d = `M ${sx1} ${sy1} L ${sx2} ${sy2}`
        this.hitEl.setAttribute('d', d)
        this.lineEl.setAttribute('d', d)

        if (this.handle1El && this.handle2El) {
            this.handle1El.style.left = `${sx1}px`
            this.handle1El.style.top = `${sy1}px`
            this.handle2El.style.left = `${sx2}px`
            this.handle2El.style.top = `${sy2}px`
        }
    }

    // Builds an SVG marker for the given endpoint style.
    // All markers use markerUnits="strokeWidth" so they scale with the line thickness.
    // Cap-style markers (round, square) use markerWidth=1 to match the stroke width exactly.
    // Decorative markers use markerWidth=4 and are centered at the endpoint via refX=5.
    private buildMarker(
        id: string,
        style: PointStyle,
        color: string,
        isStart: boolean
    ): SVGMarkerElement {
        const ns = 'http://www.w3.org/2000/svg'
        const marker = document.createElementNS(ns, 'marker')
        marker.setAttribute('id', id)
        marker.setAttribute('viewBox', '0 0 10 10')
        marker.setAttribute('markerUnits', 'strokeWidth')
        marker.setAttribute('orient', 'auto')
        marker.setAttribute('refY', '5')

        let shape: SVGElement

        switch (style) {
            case 'round': {
                // Rounded linecap: a circle the same width as the stroke, centered at the endpoint.
                // Looks identical to stroke-linecap="round" but applies per-endpoint.
                marker.setAttribute('markerWidth', '1')
                marker.setAttribute('markerHeight', '1')
                marker.setAttribute('refX', '5')
                shape = document.createElementNS(ns, 'circle')
                shape.setAttribute('cx', '5')
                shape.setAttribute('cy', '5')
                shape.setAttribute('r', '5')
                shape.setAttribute('fill', color)
                break
            }
            case 'square': {
                // Square linecap: extends the line by half the stroke width at the endpoint.
                // Looks identical to stroke-linecap="square" but applies per-endpoint.
                marker.setAttribute('markerWidth', '1')
                marker.setAttribute('markerHeight', '1')
                marker.setAttribute('refX', '5')
                shape = document.createElementNS(ns, 'rect')
                shape.setAttribute('x', '0')
                shape.setAttribute('y', '0')
                shape.setAttribute('width', '10')
                shape.setAttribute('height', '10')
                shape.setAttribute('fill', color)
                break
            }
            case 'line-arrow': {
                // Open V centered at the endpoint — vertex points outward, branches extend inward.
                marker.setAttribute('markerWidth', '2')
                marker.setAttribute('markerHeight', '2')
                marker.setAttribute('refX', '5')
                shape = document.createElementNS(ns, 'path')
                shape.setAttribute('d', isStart ? 'M 9 1 L 1 5 L 9 9' : 'M 1 1 L 9 5 L 1 9')
                shape.setAttribute('fill', 'none')
                shape.setAttribute('stroke', color)
                shape.setAttribute('stroke-width', '3.5')
                shape.setAttribute('stroke-linejoin', 'round')
                shape.setAttribute('stroke-linecap', 'round')
                break
            }
            case 'triangle-arrow': {
                // Filled triangle centered at the endpoint — tip extends outward, base extends inward.
                marker.setAttribute('markerWidth', '2')
                marker.setAttribute('markerHeight', '2')
                marker.setAttribute('refX', '5')
                shape = document.createElementNS(ns, 'path')
                shape.setAttribute('d', isStart ? 'M 10 1 L 0 5 L 10 9 Z' : 'M 0 1 L 10 5 L 0 9 Z')
                shape.setAttribute('fill', color)
                break
            }
            case 'reversed-triangle': {
                // Reversed filled triangle centered at the endpoint — tip extends inward, base outward.
                marker.setAttribute('markerWidth', '2')
                marker.setAttribute('markerHeight', '2')
                marker.setAttribute('refX', '5')
                shape = document.createElementNS(ns, 'path')
                shape.setAttribute('d', isStart ? 'M 0 1 L 10 5 L 0 9 Z' : 'M 10 1 L 0 5 L 10 9 Z')
                shape.setAttribute('fill', color)
                break
            }
            case 'circle-arrow': {
                // Decorative circle centered at the endpoint.
                marker.setAttribute('markerWidth', '2.5')
                marker.setAttribute('markerHeight', '2.5')
                shape = document.createElementNS(ns, 'circle')
                shape.setAttribute('cx', '5')
                shape.setAttribute('cy', '5')
                shape.setAttribute('r', '5')
                shape.setAttribute('fill', color)
                marker.setAttribute('refX', '5')
                break
            }
            case 'diamond-arrow': {
                // Decorative diamond centered at the endpoint.
                marker.setAttribute('markerWidth', '2.5')
                marker.setAttribute('markerHeight', '2.5')
                shape = document.createElementNS(ns, 'path')
                shape.setAttribute('d', 'M 5 0 L 10 5 L 5 10 L 0 5 Z')
                shape.setAttribute('fill', color)
                marker.setAttribute('refX', '5')
                break
            }
            default:
                shape = document.createElementNS(ns, 'path')
        }

        marker.appendChild(shape)
        return marker
    }

    private applyAppearance() {
        const color = this.data.stroke || '#000'
        this.lineEl.setAttribute('stroke', color)
        this.lineEl.setAttribute('stroke-width', String(this.data.strokeWidth))
        this.el.style.opacity = String(this.data.opacity / 100)

        // Sanitize the id to produce a valid XML ID prefix (no leading digits/hyphens).
        const idPrefix = `lbm-${this.data.id.replace(/-/g, '_')}`

        this.defsEl.innerHTML = ''

        if (this.data.startPoint !== 'none') {
            const m = this.buildMarker(`${idPrefix}-s`, this.data.startPoint, color, true)
            this.defsEl.appendChild(m)
            this.lineEl.setAttribute('marker-start', `url(#${idPrefix}-s)`)
        } else {
            this.lineEl.removeAttribute('marker-start')
        }

        if (this.data.endPoint !== 'none') {
            const m = this.buildMarker(`${idPrefix}-e`, this.data.endPoint, color, false)
            this.defsEl.appendChild(m)
            this.lineEl.setAttribute('marker-end', `url(#${idPrefix}-e)`)
        } else {
            this.lineEl.removeAttribute('marker-end')
        }
    }

    private setupInteraction() {
        this.hitEl.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return
            if (this.locked) return
            if (!this.selected) {
                this.select(e as unknown as MouseEvent)
                return
            }
            this.startBodyDrag(e as unknown as MouseEvent)
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
        this.removeHandles()
    }

    markDeselected() {
        this.selected = false
        this.el.classList.remove('is-selected')
        this.removeHandles()
    }

    private deselect() {
        this.markDeselected()
        this.onDeselect?.()
    }

    private renderHandles() {
        this.removeHandles()
        const { sx1, sy1, sx2, sy2 } = this.layout()

        this.handle1El = this.makeHandle(sx1, sy1)
        this.handle2El = this.makeHandle(sx2, sy2)

        this.handle1El.addEventListener('mousedown', (e) => {
            e.stopPropagation()
            this.startEndpointDrag(e, 1)
        })
        this.handle2El.addEventListener('mousedown', (e) => {
            e.stopPropagation()
            this.startEndpointDrag(e, 2)
        })

        this.el.append(this.handle1El, this.handle2El)
    }

    private makeHandle(x: number, y: number): HTMLElement {
        const h = document.createElement('div')
        h.className = 'line-handle'
        h.style.left = `${x}px`
        h.style.top = `${y}px`
        return h
    }

    private removeHandles() {
        this.handle1El?.remove()
        this.handle2El?.remove()
        this.handle1El = null
        this.handle2El = null
    }

    private startBodyDrag(e: MouseEvent) {
        e.preventDefault()

        const startX = e.clientX
        const startY = e.clientY
        let dragging = false
        let prevX = startX,
            prevY = startY
        const onMoveWithDelta = (e: MouseEvent) => {
            if (!dragging) {
                if (Math.hypot(e.clientX - startX, e.clientY - startY) < 4) return
                dragging = true
                this.onDragStart?.()
            }
            const dx = e.clientX - prevX
            const dy = e.clientY - prevY
            prevX = e.clientX
            prevY = e.clientY
            this.data.x1 += dx
            this.data.y1 += dy
            this.data.x2 += dx
            this.data.y2 += dy
            this.applyLayout()
            this.onDragMove?.(dx, dy)
            this.onChange?.()
        }

        const onUp = () => {
            window.removeEventListener('mousemove', onMoveWithDelta)
            window.removeEventListener('mouseup', onUp)
        }

        window.addEventListener('mousemove', onMoveWithDelta)
        window.addEventListener('mouseup', onUp)
    }

    private startEndpointDrag(e: MouseEvent, point: 1 | 2) {
        e.preventDefault()
        this.onDragStart?.()

        const onMove = (e: MouseEvent) => {
            if (point === 1) {
                this.data.x1 += e.movementX
                this.data.y1 += e.movementY
            } else {
                this.data.x2 += e.movementX
                this.data.y2 += e.movementY
            }
            this.applyLayout()
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
        return {
            x: Math.min(this.data.x1, this.data.x2) - PADDING,
            y: Math.min(this.data.y1, this.data.y2) - PADDING,
        }
    }

    getSize() {
        return {
            width: Math.abs(this.data.x2 - this.data.x1) + PADDING * 2,
            height: Math.abs(this.data.y2 - this.data.y1) + PADDING * 2,
        }
    }

    getRotation() {
        return (
            (Math.atan2(this.data.y2 - this.data.y1, this.data.x2 - this.data.x1) * 180) / Math.PI
        )
    }

    setPosition(x: number, y: number) {
        this.onBeforePropertyChange?.()
        const curr = this.getPosition()
        const dx = x - curr.x
        const dy = y - curr.y
        this.data.x1 += dx
        this.data.y1 += dy
        this.data.x2 += dx
        this.data.y2 += dy
        this.applyLayout()
    }

    setSize(width: number, height: number) {
        this.onBeforePropertyChange?.()
        const cx = (this.data.x1 + this.data.x2) / 2
        const cy = (this.data.y1 + this.data.y2) / 2
        const innerW = Math.max(0, width - PADDING * 2)
        const innerH = Math.max(0, height - PADDING * 2)
        const sx = this.data.x2 >= this.data.x1 ? 1 : -1
        const sy = this.data.y2 >= this.data.y1 ? 1 : -1
        this.data.x1 = cx - (innerW / 2) * sx
        this.data.y1 = cy - (innerH / 2) * sy
        this.data.x2 = cx + (innerW / 2) * sx
        this.data.y2 = cy + (innerH / 2) * sy
        this.applyLayout()
        this.onChange?.()
    }

    setRotation(deg: number) {
        this.onBeforePropertyChange?.()
        const rad = (deg * Math.PI) / 180
        const cx = (this.data.x1 + this.data.x2) / 2
        const cy = (this.data.y1 + this.data.y2) / 2
        const len = Math.hypot(this.data.x2 - this.data.x1, this.data.y2 - this.data.y1) / 2
        this.data.x1 = cx - len * Math.cos(rad)
        this.data.y1 = cy - len * Math.sin(rad)
        this.data.x2 = cx + len * Math.cos(rad)
        this.data.y2 = cy + len * Math.sin(rad)
        this.applyLayout()
        this.onChange?.()
    }

    getAppearanceFields(): PropertyField[] {
        return [
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
                min: 1,
                max: 40,
                step: 1,
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
            { type: 'section', label: 'Endpoints' },
            {
                type: 'select',
                key: 'startPoint',
                label: 'Start point',
                value: this.data.startPoint,
                options: POINT_STYLE_OPTIONS,
            },
            {
                type: 'select',
                key: 'endPoint',
                label: 'End point',
                value: this.data.endPoint,
                options: POINT_STYLE_OPTIONS,
            },
        ]
    }

    setAppearanceProperty(key: string, value: string | number) {
        this.onBeforePropertyChange?.()
        if (key === 'stroke') {
            this.data.stroke = String(value)
            this.applyAppearance()
        }
        if (key === 'strokeWidth') {
            this.data.strokeWidth = Number(value)
            this.lineEl.setAttribute('stroke-width', String(this.data.strokeWidth))
        }
        if (key === 'opacity') {
            this.data.opacity = Number(value)
            this.el.style.opacity = String(this.data.opacity / 100)
        }
        if (key === 'startPoint') {
            this.data.startPoint = value as PointStyle
            this.applyAppearance()
        }
        if (key === 'endPoint') {
            this.data.endPoint = value as PointStyle
            this.applyAppearance()
        }
    }

    getData(): Readonly<LineBlockData> {
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

    destroy() {
        this.el.remove()
    }
}
