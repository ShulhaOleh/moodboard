// Freehand path block — stores a smoothed polyline as local-space points within a bounding box.
// Points are in local coordinates (0..width, 0..height); the bounding box is in board space.
// Extending BoxBlock gives rotation, snap, and SelectionBox resize for free.
// Supports optional gradient (stroke → strokeEnd) and width tapering at start/end.

import { PropertyField } from './BoardObject'
import { BoxBlock, type BoxBaseData } from './BoxBlock'
import { buildSvgPath, buildOutlinePath, type Pt } from './pathUtils'

export interface PathBlockData extends BoxBaseData {
    width: number
    height: number
    // Simplified points in local space (board-pixel coords relative to bounding box origin).
    points: Pt[]
    stroke: string
    // When set and different from stroke, a gradient is drawn from stroke to strokeEnd.
    strokeEnd?: string
    strokeWidth: number
    // 0 = no taper (uniform width); 1-100 = tapers toward 0 at both endpoints.
    taper?: number
    opacity: number
    // Catmull-Rom smoothing strength: 0 = polyline, 100 = maximally smooth.
    smoothing: number
}

export class PathBlock extends BoxBlock<PathBlockData> {
    readonly layerLabel = 'Path'
    private svgEl!: SVGSVGElement
    private defsEl!: SVGDefsElement
    private gradEl!: SVGLinearGradientElement
    private gradStop1!: SVGStopElement
    private gradStop2!: SVGStopElement
    private hitEl!: SVGPathElement
    private pathEl!: SVGPathElement

    constructor(container: HTMLElement, data: PathBlockData) {
        const el = document.createElement('div')
        el.className = 'path-block'
        super(el, 'Path', data)

        const ns = 'http://www.w3.org/2000/svg'
        this.svgEl = document.createElementNS(ns, 'svg')
        this.svgEl.setAttribute('width', '100%')
        this.svgEl.setAttribute('height', '100%')
        this.svgEl.style.overflow = 'visible'
        this.svgEl.style.pointerEvents = 'none'

        // Gradient definition — hidden until a second color is set.
        this.defsEl = document.createElementNS(ns, 'defs')
        this.gradEl = document.createElementNS(ns, 'linearGradient')
        this.gradEl.id = `path-grad-${data.id}`
        this.gradStop1 = document.createElementNS(ns, 'stop')
        this.gradStop2 = document.createElementNS(ns, 'stop')
        this.gradEl.append(this.gradStop1, this.gradStop2)
        this.defsEl.appendChild(this.gradEl)
        this.svgEl.appendChild(this.defsEl)

        // Wide transparent path for hit-testing — thin strokes are otherwise hard to click.
        this.hitEl = document.createElementNS(ns, 'path')
        this.hitEl.setAttribute('fill', 'none')
        this.hitEl.setAttribute('stroke', 'transparent')
        this.hitEl.setAttribute('stroke-linecap', 'round')
        this.hitEl.setAttribute('stroke-linejoin', 'round')
        this.hitEl.style.pointerEvents = 'stroke'
        this.hitEl.style.cursor = 'grab'

        // Visual path — pointer events disabled so all clicks fall through to hitEl.
        this.pathEl = document.createElementNS(ns, 'path')
        this.pathEl.setAttribute('stroke-linecap', 'round')
        this.pathEl.setAttribute('stroke-linejoin', 'round')
        this.pathEl.style.pointerEvents = 'none'

        this.svgEl.append(this.hitEl, this.pathEl)
        this.el.appendChild(this.svgEl)

        this.applyPosition()
        this.applySize()
        this.applyTransform()
        this.applyAppearance()
        this.renderPath()
        this.setupInteraction()
        container.appendChild(this.el)
    }

    protected override get minResizeWidth() {
        return 4
    }
    protected override get minResizeHeight() {
        return 4
    }

    protected override applySize() {
        super.applySize()
        this.svgEl?.setAttribute('viewBox', `0 0 ${this.data.width} ${this.data.height}`)
    }

    override setSize(width: number, height: number) {
        const oldW = this.data.width
        const oldH = this.data.height
        super.setSize(width, height)
        const newW = this.data.width!
        const newH = this.data.height!
        // Scale all points proportionally so the path shape is preserved.
        if (oldW > 0 && oldH > 0) {
            const sx = newW / oldW
            const sy = newH / oldH
            this.data.points = this.data.points.map((p) => ({ x: p.x * sx, y: p.y * sy }))
        }
        this.renderPath()
    }

    private applyAppearance() {
        this.el.style.opacity = String(this.data.opacity / 100)

        const stroke = this.data.stroke || '#000000'
        const strokeEnd = this.data.strokeEnd
        const hasGradient = !!strokeEnd && strokeEnd !== stroke
        const hasTaper = (this.data.taper ?? 0) > 0

        if (hasGradient) {
            this.updateGradientCoords()
            this.gradStop1.setAttribute('offset', '0%')
            this.gradStop1.setAttribute('stop-color', stroke)
            this.gradStop2.setAttribute('offset', '100%')
            this.gradStop2.setAttribute('stop-color', strokeEnd!)
        }

        const paint = hasGradient ? `url(#${this.gradEl.id})` : stroke

        if (hasTaper) {
            // Filled outline path — no stroke on pathEl.
            this.pathEl.setAttribute('fill', paint)
            this.pathEl.setAttribute('stroke', 'none')
            this.pathEl.removeAttribute('stroke-width')
        } else {
            this.pathEl.setAttribute('fill', 'none')
            this.pathEl.setAttribute('stroke', paint)
            this.pathEl.setAttribute('stroke-width', String(this.data.strokeWidth))
        }

        this.hitEl.setAttribute('stroke-width', String(Math.max(16, this.data.strokeWidth + 10)))
    }

    // Updates the gradient x1/y1/x2/y2 coordinates to match the first→last point direction.
    private updateGradientCoords() {
        const pts = this.data.points
        const x1 = pts.length > 0 ? pts[0].x : 0
        const y1 = pts.length > 0 ? pts[0].y : 0
        const x2 = pts.length > 1 ? pts[pts.length - 1].x : this.data.width
        const y2 = pts.length > 1 ? pts[pts.length - 1].y : 0
        this.gradEl.setAttribute('gradientUnits', 'userSpaceOnUse')
        this.gradEl.setAttribute('x1', String(x1))
        this.gradEl.setAttribute('y1', String(y1))
        this.gradEl.setAttribute('x2', String(x2))
        this.gradEl.setAttribute('y2', String(y2))
    }

    private renderPath() {
        const taper = this.data.taper ?? 0
        const hasTaper = taper > 0
        if (hasTaper) {
            const sw = this.data.strokeWidth
            const taperFrac = taper / 100
            const getHalfWidth = (t: number) => {
                // Width profile: tapers from 0 at endpoints toward full width in the middle.
                const factor = 1 - taperFrac + taperFrac * Math.sin(t * Math.PI)
                return (sw / 2) * Math.max(0, factor)
            }
            this.pathEl.setAttribute(
                'd',
                buildOutlinePath(this.data.points, this.data.smoothing, getHalfWidth)
            )
            // Hit element always uses the center-line path so clicks anywhere near the stroke register.
            this.hitEl.setAttribute('d', buildSvgPath(this.data.points, this.data.smoothing))
        } else {
            const d = buildSvgPath(this.data.points, this.data.smoothing)
            this.pathEl.setAttribute('d', d)
            this.hitEl.setAttribute('d', d)
        }
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
                type: 'color',
                key: 'strokeEnd',
                label: 'Stroke end',
                value: this.data.strokeEnd ?? '',
                clearable: true,
            },
            {
                type: 'number',
                key: 'strokeWidth',
                label: 'Stroke W',
                value: this.data.strokeWidth,
                min: 1,
                max: 80,
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
            { type: 'section', label: 'Path' },
            {
                type: 'slider',
                key: 'smoothing',
                label: 'Smoothing',
                value: this.data.smoothing,
                min: 0,
                max: 100,
                step: 1,
            },
            {
                type: 'slider',
                key: 'taper',
                label: 'Taper',
                value: this.data.taper ?? 0,
                min: 0,
                max: 100,
                step: 1,
            },
        ]
    }

    setAppearanceProperty(key: string, value: string | number) {
        this.onBeforePropertyChange?.()
        if (key === 'stroke') {
            this.data.stroke = String(value)
            this.applyAppearance()
        } else if (key === 'strokeEnd') {
            this.data.strokeEnd =
                value === '' || value === 'transparent' ? undefined : String(value)
            this.applyAppearance()
        } else if (key === 'strokeWidth') {
            this.data.strokeWidth = Number(value)
            this.applyAppearance()
            this.renderPath()
        } else if (key === 'opacity') {
            this.data.opacity = Number(value)
            this.el.style.opacity = String(this.data.opacity / 100)
        } else if (key === 'smoothing') {
            this.data.smoothing = Number(value)
            this.renderPath()
        } else if (key === 'taper') {
            this.data.taper = Number(value)
            this.applyAppearance()
            this.renderPath()
        }
        this.onChange?.()
    }

    getData(): Readonly<PathBlockData> {
        return { ...this.data, points: this.data.points.map((p) => ({ ...p })) }
    }
}
