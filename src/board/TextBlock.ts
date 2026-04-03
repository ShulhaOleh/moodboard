// Draggable, editable text block with rich text editing via TipTap.
// Content is stored as an HTML string and rendered directly into the content element.

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

export interface TextBlockData {
    id: string
    x: number
    y: number
    width?: number
    height?: number
    rotation: number
    content: string
    fontSize: number
    padding: number
    color: string
    background: string
    borderRadius: number
    fontFamily: string
    textAlign: string
    shadowColor: string
    shadowBlur: number
    shadowX: number
    shadowY: number
    name?: string
}

export class TextBlock extends BoxBlock<TextBlockData> {
    readonly layerLabel = 'Text'
    private editing = false
    private contentEl: HTMLElement
    private editorInstance: Editor | null = null

    protected override get minResizeWidth(): number {
        return 120
    }
    protected override get minResizeHeight(): number {
        return 40
    }

    constructor(container: HTMLElement, data: TextBlockData) {
        const el = document.createElement('div')
        el.className = 'text-block'
        super(el, 'Text', data)

        this.contentEl = document.createElement('div')
        this.contentEl.className = 'text-block-content'
        this.el.appendChild(this.contentEl)

        this.applyPosition()
        this.applyTransform()
        this.applyTypography()
        this.applyFontFamily()
        this.applyAppearance()
        this.applyTextAlign()
        if (data.width) this.el.style.width = `${data.width}px`
        if (data.height) this.el.style.height = `${data.height}px`
        this.renderContent()
        this.setupInteraction()

        this.el.addEventListener('dblclick', (e) => {
            if ((e.target as HTMLElement).closest('.tb-handles')) return
            this.startEdit()
        })

        container.appendChild(this.el)
    }

    protected override isEditing(): boolean {
        return this.editing
    }

    private applyTypography() {
        this.el.style.fontSize = `${this.data.fontSize}px`
        this.el.style.padding = `${this.data.padding}px`
    }

    private applyFontFamily() {
        if (this.data.fontFamily) {
            loadFont(this.data.fontFamily)
            this.el.style.fontFamily = this.data.fontFamily
        }
    }

    private applyAppearance() {
        this.el.style.color = this.data.color
        this.el.style.background = this.data.background
        this.el.style.borderRadius = `${this.data.borderRadius}px`
        this.el.style.boxShadow = this.data.shadowColor
            ? `${this.data.shadowX}px ${this.data.shadowY}px ${this.data.shadowBlur}px ${this.data.shadowColor}`
            : 'none'
    }

    private applyTextAlign() {
        this.el.style.textAlign = this.data.textAlign
    }

    private renderContent() {
        this.contentEl.innerHTML = this.data.content
        this.updateEmptyState()
    }

    private updateEmptyState() {
        const tmp = document.createElement('div')
        tmp.innerHTML = this.data.content
        const isEmpty = tmp.textContent?.trim() === ''
        this.contentEl.classList.toggle('is-empty', isEmpty)
    }

    // Temporarily resets rotation to 0 for comfortable editing, restores it on exit.
    private startEdit() {
        this.editing = true

        const savedRotation = this.data.rotation
        this.data.rotation = 0
        this.applyTransform()

        this.contentEl.innerHTML = ''
        this.contentEl.classList.remove('is-empty')
        this.editorInstance = new Editor({
            element: this.contentEl,
            extensions: [
                StarterKit,
                TextStyle,
                Color,
                FontSize,
                FontFamily,
                TextAlign.configure({ types: ['heading', 'paragraph'] }),
                Underline,
            ],
            content: this.data.content,
            autofocus: true,
        })

        const toolbar = new TextFormatToolbar(this.editorInstance)

        let finished = false
        const finish = () => {
            if (finished) return
            finished = true
            this.data.content = this.editorInstance!.getHTML()
            this.editorInstance!.destroy()
            this.editorInstance = null
            toolbar.destroy()
            this.editing = false
            this.data.rotation = savedRotation
            this.applyTransform()
            this.contentEl.innerHTML = ''
            this.renderContent()
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

    setFontFamilyBlock(family: string) {
        this.data.fontFamily = family
        this.applyFontFamily()
    }

    setFontSize(size: number) {
        this.data.fontSize = size
        this.applyTypography()
    }

    setPadding(px: number) {
        this.data.padding = px
        this.applyTypography()
    }

    setTextAlign(align: string) {
        this.data.textAlign = align
        this.applyTextAlign()
    }

    setColor(color: string) {
        this.data.color = color
        this.applyAppearance()
    }

    setBackground(bg: string) {
        this.data.background = bg
        this.applyAppearance()
    }

    getAppearanceFields(): PropertyField[] {
        return [
            { type: 'font', key: 'fontFamily', label: 'Font', value: this.data.fontFamily },
            {
                type: 'number',
                key: 'fontSize',
                label: 'Font size',
                value: this.data.fontSize,
                min: 8,
                max: 120,
                step: 1,
            },
            {
                type: 'select',
                key: 'textAlign',
                label: 'Align',
                value: this.data.textAlign,
                options: [
                    { value: 'left', label: 'Left' },
                    { value: 'center', label: 'Center' },
                    { value: 'right', label: 'Right' },
                    { value: 'justify', label: 'Justify' },
                ],
            },
            { type: 'color', key: 'color', label: 'Color', value: this.data.color },
            {
                type: 'color',
                key: 'background',
                label: 'Background',
                value: this.data.background,
                clearable: true,
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
        if (key === 'fontFamily') this.setFontFamilyBlock(String(value))
        if (key === 'fontSize') this.setFontSize(Number(value))
        if (key === 'textAlign') this.setTextAlign(String(value))
        if (key === 'color') this.setColor(String(value))
        if (key === 'background') this.setBackground(String(value))
        if (key === 'borderRadius') {
            this.data.borderRadius = Number(value)
            this.applyAppearance()
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

    override destroy() {
        this.editorInstance?.destroy()
        super.destroy()
    }

    getData(): Readonly<TextBlockData> {
        return { ...this.data }
    }
}
