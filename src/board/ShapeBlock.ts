// Draggable, resizable, rotatable geometric shape block rendered as an inline SVG.
// Supports optional inline text editing via TipTap, activated by double-click.

import { t } from '../translations'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import TextAlign from '@tiptap/extension-text-align'
import { Underline } from '@tiptap/extension-underline'
import { FontSize } from './extensions/FontSize'
import { FontFamily } from './extensions/FontFamily'
import { loadFont } from '../lib/fonts'
import { TextFormatToolbar } from '../ui/TextFormatToolbar'
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
    // Text overlay
    text: string
    textColor: string
    fontSize: number
    fontFamily: string
    textAlign: string
    textVerticalAlign: 'top' | 'middle' | 'bottom'
    textPadding: number
    name?: string
    groupId?: string
}

export class ShapeBlock extends BoxBlock<ShapeBlockData> {
    private svgEl: SVGSVGElement
    private shapeEl: SVGElement
    private textEl: HTMLElement
    // Single flex child inside textEl — keeps rendered and edited content vertically aligned.
    private textInnerEl: HTMLElement
    private editing = false
    private editorInstance: Editor | null = null
    // Fired when text editing starts or ends — main.ts uses this to refresh the properties panel.
    onTextEditChange: (() => void) | null = null

    protected override get minResizeWidth(): number {
        return 20
    }
    protected override get minResizeHeight(): number {
        return 20
    }

    get layerLabel(): string {
        const keys: Record<
            string,
            'shape.rectangle' | 'shape.ellipse' | 'shape.polygon' | 'shape.star'
        > = {
            rectangle: 'shape.rectangle',
            ellipse: 'shape.ellipse',
            polygon: 'shape.polygon',
            star: 'shape.star',
        }
        return keys[this.data.shape] ? t(keys[this.data.shape]) : 'Shape'
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

        this.textEl = document.createElement('div')
        this.textEl.className = 'shape-text-content'
        this.textInnerEl = document.createElement('div')
        this.textEl.appendChild(this.textInnerEl)
        this.el.appendChild(this.textEl)

        this.applyPosition()
        this.applySize()
        this.applyTransform()
        this.applyAppearance()
        this.applyTextStyle()
        this.renderText()

        this.setupInteraction()

        this.el.addEventListener('dblclick', (e) => {
            if ((e.target as HTMLElement).closest('.sb-handle')) return
            this.startEdit()
        })

        container.appendChild(this.el)
    }

    protected override isEditing(): boolean {
        return this.editing
    }

    // Activates TipTap inline editing. Called on double-click or programmatically
    // (e.g. immediately after creating a text-preset shape from the Add Bar).
    startEdit() {
        if (this.editing) return
        this.editing = true
        this.el.classList.add('is-text-editing')
        this.onTextEditChange?.()

        const savedRotation = this.data.rotation
        this.data.rotation = 0
        this.applyTransform()

        this.textInnerEl.innerHTML = ''

        this.editorInstance = new Editor({
            element: this.textInnerEl,
            extensions: [
                StarterKit,
                TextStyle,
                Color,
                FontSize,
                FontFamily,
                TextAlign.configure({ types: ['heading', 'paragraph'] }),
                Underline,
            ],
            content: this.data.text,
            autofocus: true,
        })

        const toolbar = new TextFormatToolbar(this.editorInstance)

        let finished = false
        const finish = () => {
            if (finished) return
            finished = true
            const html = this.editorInstance!.getHTML()
            const tmp = document.createElement('div')
            tmp.innerHTML = html
            // Treat whitespace-only TipTap output (e.g. "<p></p>") as no text.
            this.data.text = tmp.textContent?.trim() ? html : ''
            this.editorInstance!.destroy()
            this.editorInstance = null
            toolbar.destroy()
            this.editing = false
            this.el.classList.remove('is-text-editing')
            this.data.rotation = savedRotation
            this.applyTransform()
            this.textInnerEl.innerHTML = ''
            this.renderText()
            this.onTextEditChange?.()
        }

        // Defer finish so focus has time to settle — the toolbar's inputs and native color
        // picker both cause editor blur but should not exit edit mode.
        this.editorInstance.on('blur', () => {
            setTimeout(() => {
                if (this.editorInstance?.isFocused) return
                if (toolbar.isInteracting) return
                if (toolbar.el.contains(document.activeElement)) return
                finish()
            }, 100)
        })

        this.editorInstance.view.dom.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.key === 'Escape') this.editorInstance?.commands.blur()
        })
    }

    private applyTextStyle() {
        this.textEl.style.color = this.data.textColor
        this.textEl.style.fontSize = `${this.data.fontSize}px`
        this.textEl.style.textAlign = this.data.textAlign
        this.textEl.style.padding = `${this.data.textPadding}px`
        const justify = {
            top: 'flex-start',
            middle: 'center',
            bottom: 'flex-end',
        }[this.data.textVerticalAlign]
        this.textEl.style.justifyContent = justify
        if (this.data.fontFamily) {
            loadFont(this.data.fontFamily)
            this.textEl.style.fontFamily = this.data.fontFamily
        }
    }

    private renderText() {
        this.textInnerEl.innerHTML = this.data.text
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

    getAppearanceFields(): PropertyField[] {
        const fields: PropertyField[] = [
            {
                type: 'color',
                key: 'fill',
                label: t('field.fill'),
                value: this.data.fill,
                clearable: true,
            },
            {
                type: 'color',
                key: 'stroke',
                label: t('field.stroke'),
                value: this.data.stroke,
                clearable: true,
            },
            {
                type: 'number',
                key: 'strokeWidth',
                label: t('field.strokeW'),
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
                label: t('field.radius'),
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
                label: t('field.sides'),
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
                label: t('field.points'),
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
                label: t('field.opacity'),
                value: this.data.opacity,
                min: 0,
                max: 100,
                step: 1,
            },
            { type: 'section', label: t('field.shadow') },
            {
                type: 'color',
                key: 'shadowColor',
                label: t('field.color'),
                value: this.data.shadowColor,
                clearable: true,
            },
            {
                type: 'number',
                key: 'shadowX',
                label: t('field.shadowX'),
                value: this.data.shadowX,
                min: -100,
                max: 100,
                step: 1,
            },
            {
                type: 'number',
                key: 'shadowY',
                label: t('field.shadowY'),
                value: this.data.shadowY,
                min: -100,
                max: 100,
                step: 1,
            },
            {
                type: 'slider',
                key: 'shadowBlur',
                label: t('field.shadowBlur'),
                value: this.data.shadowBlur,
                min: 0,
                max: 80,
                step: 1,
            }
        )

        if (this.data.text.trim() || this.editing)
            fields.push(
                { type: 'section', label: t('field.text') },
                {
                    type: 'font',
                    key: 'fontFamily',
                    label: t('field.font'),
                    value: this.data.fontFamily,
                },
                {
                    type: 'number',
                    key: 'fontSize',
                    label: t('field.fontSize'),
                    value: this.data.fontSize,
                    min: 8,
                    max: 120,
                    step: 1,
                },
                {
                    type: 'select',
                    key: 'textAlign',
                    label: t('field.alignH'),
                    value: this.data.textAlign,
                    options: [
                        { value: 'left', label: t('option.left') },
                        { value: 'center', label: t('option.center') },
                        { value: 'right', label: t('option.right') },
                        { value: 'justify', label: t('option.justify') },
                    ],
                },
                {
                    type: 'select',
                    key: 'textVerticalAlign',
                    label: t('field.alignV'),
                    value: this.data.textVerticalAlign,
                    options: [
                        { value: 'top', label: t('option.top') },
                        { value: 'middle', label: t('option.middle') },
                        { value: 'bottom', label: t('option.bottom') },
                    ],
                },
                {
                    type: 'color',
                    key: 'textColor',
                    label: t('field.textColor'),
                    value: this.data.textColor,
                },
                {
                    type: 'number',
                    key: 'textPadding',
                    label: t('field.padding'),
                    value: this.data.textPadding,
                    min: 0,
                    max: 100,
                    step: 1,
                }
            )

        return fields
    }

    setAppearanceProperty(key: string, value: string | number) {
        this.onBeforePropertyChange?.()
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
        if (key === 'textColor') {
            this.data.textColor = String(value)
            this.applyTextStyle()
        }
        if (key === 'fontSize') {
            this.data.fontSize = Number(value)
            this.applyTextStyle()
        }
        if (key === 'fontFamily') {
            this.data.fontFamily = String(value)
            this.applyTextStyle()
        }
        if (key === 'textAlign') {
            this.data.textAlign = String(value)
            this.applyTextStyle()
        }
        if (key === 'textVerticalAlign') {
            this.data.textVerticalAlign = value as 'top' | 'middle' | 'bottom'
            this.applyTextStyle()
        }
        if (key === 'textPadding') {
            this.data.textPadding = Number(value)
            this.applyTextStyle()
        }
    }

    override destroy() {
        this.editorInstance?.destroy()
        super.destroy()
    }

    getData(): Readonly<ShapeBlockData> {
        return { ...this.data, groupId: this.groupId }
    }
}
