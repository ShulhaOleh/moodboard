// Freehand path block — stores a smoothed polyline as local-space points within a bounding box.
// Points are in local coordinates (0..width, 0..height); the bounding box is in board space.
// Extending BoxBlock gives rotation, snap, and SelectionBox resize for free.

import { PropertyField } from './BoardObject'
import { BoxBlock, type BoxBaseData } from './BoxBlock'
import { buildSvgPath, type Pt } from './pathUtils'

export interface PathBlockData extends BoxBaseData {
    width: number
    height: number
    // Simplified points in local space (board-pixel coords relative to bounding box origin).
    points: Pt[]
    stroke: string
    strokeWidth: number
    opacity: number
    // Catmull-Rom smoothing strength: 0 = polyline, 100 = maximally smooth.
    smoothing: number
}

export class PathBlock extends BoxBlock<PathBlockData> {
    readonly layerLabel = 'Path'
    private svgEl!: SVGSVGElement
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
        this.pathEl.setAttribute('fill', 'none')
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
        this.pathEl.setAttribute('stroke', this.data.stroke || '#000000')
        this.pathEl.setAttribute('stroke-width', String(this.data.strokeWidth))
        this.hitEl.setAttribute('stroke-width', String(Math.max(16, this.data.strokeWidth + 10)))
    }

    private renderPath() {
        const d = buildSvgPath(this.data.points, this.data.smoothing)
        this.hitEl.setAttribute('d', d)
        this.pathEl.setAttribute('d', d)
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
        ]
    }

    setAppearanceProperty(key: string, value: string | number) {
        this.onBeforePropertyChange?.()
        if (key === 'stroke') {
            this.data.stroke = String(value)
            this.pathEl.setAttribute('stroke', this.data.stroke || '#000000')
        } else if (key === 'strokeWidth') {
            this.data.strokeWidth = Number(value)
            this.pathEl.setAttribute('stroke-width', String(this.data.strokeWidth))
            this.hitEl.setAttribute(
                'stroke-width',
                String(Math.max(16, this.data.strokeWidth + 10))
            )
        } else if (key === 'opacity') {
            this.data.opacity = Number(value)
            this.el.style.opacity = String(this.data.opacity / 100)
        } else if (key === 'smoothing') {
            this.data.smoothing = Number(value)
            this.renderPath()
        }
        this.onChange?.()
    }

    getData(): Readonly<PathBlockData> {
        return { ...this.data, points: this.data.points.map((p) => ({ ...p })) }
    }
}
