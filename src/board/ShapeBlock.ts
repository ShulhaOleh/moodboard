// Draggable, resizable, rotatable geometric shape block rendered as an inline SVG.

import { PropertyField } from './BoardObject'
import { BoxBlock } from './BoxBlock'

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

export class ShapeBlock extends BoxBlock<ShapeBlockData> {
    private svgEl: SVGSVGElement
    private shapeEl: SVGElement

    protected override get minResizeWidth(): number {
        return 20
    }
    protected override get minResizeHeight(): number {
        return 20
    }

    get layerLabel(): string {
        const names: Record<string, string> = {
            rectangle: 'Rectangle',
            ellipse: 'Ellipse',
            polygon: 'Polygon',
            star: 'Star',
        }
        return names[this.data.shape] ?? 'Shape'
    }

    constructor(container: HTMLElement, data: ShapeBlockData) {
        const el = document.createElement('div')
        el.className = 'shape-block'
        super(el, data.shape.charAt(0).toUpperCase() + data.shape.slice(1), data)

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
            },
        ]

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

    getData(): Readonly<ShapeBlockData> {
        return { ...this.data }
    }
}
