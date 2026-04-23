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
    color: string
    fontFamily: string
    textAlign: string
    autoHeight?: boolean
    name?: string
}

export class TextBlock extends BoxBlock<TextBlockData> {
    readonly layerLabel = 'Text'
    private editing = false
    private contentEl: HTMLElement
    private editorInstance: Editor | null = null
    private resizeObserver: ResizeObserver

    protected override get minResizeWidth(): number {
        return 120
    }
    protected override get minResizeHeight(): number {
        return 40
    }

    get fixedHeight(): true | undefined {
        return this.data.autoHeight ? true : undefined
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
        this.applyTextAlign()
        this.el.style.color = this.data.color
        if (data.width) this.el.style.width = `${data.width}px`
        if (data.height && !data.autoHeight) this.el.style.height = `${data.height}px`
        this.renderContent()
        this.setupInteraction()

        this.resizeObserver = new ResizeObserver(() => this.onResize?.())
        if (this.data.autoHeight) this.resizeObserver.observe(this.el)

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
    }

    private applyFontFamily() {
        if (this.data.fontFamily) {
            loadFont(this.data.fontFamily)
            this.el.style.fontFamily = this.data.fontFamily
        }
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

        const notifyAppearance = () => this.onAppearanceChange?.()
        this.editorInstance.on('selectionUpdate', notifyAppearance)
        this.editorInstance.on('update', notifyAppearance)

        let finished = false
        const finish = () => {
            if (finished) return
            finished = true
            this.syncMarksToData()
            this.data.content = this.editorInstance!.getHTML()
            this.editorInstance!.destroy()
            this.editorInstance = null
            toolbar.destroy()
            this.editing = false
            this.data.rotation = savedRotation
            this.applyTransform()
            this.contentEl.innerHTML = ''
            this.renderContent()
            this.onAppearanceChange?.()
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

    // When the user has applied uniform marks (e.g. selected all → set color), promote
    // those values to the block-level data so the Properties Panel reflects them after editing.
    private syncMarksToData(): void {
        const { doc } = this.editorInstance!.state
        let color: string | null | undefined
        let fontFamily: string | null | undefined
        let fontSize: string | null | undefined
        let textAlign: string | null | undefined
        let colorMixed = false
        let familyMixed = false
        let sizeMixed = false
        let alignMixed = false

        doc.descendants((node) => {
            if (node.isText) {
                const ts = node.marks.find((m) => m.type.name === 'textStyle')
                const c = (ts?.attrs.color as string | undefined) ?? null
                const f = (ts?.attrs.fontFamily as string | undefined) ?? null
                const s = (ts?.attrs.fontSize as string | undefined) ?? null
                if (!colorMixed) {
                    if (color === undefined) color = c
                    else if (color !== c) colorMixed = true
                }
                if (!familyMixed) {
                    if (fontFamily === undefined) fontFamily = f
                    else if (fontFamily !== f) familyMixed = true
                }
                if (!sizeMixed) {
                    if (fontSize === undefined) fontSize = s
                    else if (fontSize !== s) sizeMixed = true
                }
            } else if (node.type.name === 'paragraph') {
                const a = (node.attrs.textAlign as string | undefined) ?? null
                if (!alignMixed) {
                    if (textAlign === undefined) textAlign = a
                    else if (textAlign !== a) alignMixed = true
                }
            }
        })

        if (!colorMixed && color) this.setColor(color)
        if (!familyMixed && fontFamily) this.setFontFamilyBlock(fontFamily)
        if (!sizeMixed && fontSize) {
            const n = parseInt(fontSize, 10)
            if (!isNaN(n)) this.setFontSize(n)
        }
        if (!alignMixed && textAlign) this.setTextAlign(textAlign)
    }

    override setSize(width: number, height: number) {
        if (this.data.autoHeight) {
            this.onBeforePropertyChange?.()
            this.data.width = Math.max(this.minResizeWidth, width)
            this.el.style.width = `${this.data.width}px`
            this.onChange?.()
        } else {
            super.setSize(width, height)
        }
    }

    setFontFamilyBlock(family: string) {
        this.data.fontFamily = family
        this.applyFontFamily()
    }

    setFontSize(size: number) {
        this.data.fontSize = size
        this.applyTypography()
    }

    setTextAlign(align: string) {
        this.data.textAlign = align
        this.applyTextAlign()
    }

    setColor(color: string) {
        this.data.color = color
        this.el.style.color = color
    }

    getAppearanceFields(): PropertyField[] {
        let fontFamily = this.data.fontFamily
        let fontSize = this.data.fontSize
        let color = this.data.color
        let textAlign = this.data.textAlign

        if (this.editorInstance) {
            const ts = this.editorInstance.getAttributes('textStyle')
            if (ts.fontFamily) fontFamily = ts.fontFamily as string
            if (ts.fontSize) {
                const n = parseInt(ts.fontSize as string, 10)
                if (!isNaN(n)) fontSize = n
            }
            if (ts.color) color = ts.color as string
            const pa = this.editorInstance.getAttributes('paragraph')
            if (pa.textAlign) textAlign = pa.textAlign as string
        }

        return [
            { type: 'font', key: 'fontFamily', label: 'Font', value: fontFamily },
            {
                type: 'number',
                key: 'fontSize',
                label: 'Font size',
                value: fontSize,
                min: 8,
                max: 120,
                step: 1,
            },
            {
                type: 'select',
                key: 'textAlign',
                label: 'Align',
                value: textAlign,
                options: [
                    { value: 'left', label: 'Left' },
                    { value: 'center', label: 'Center' },
                    { value: 'right', label: 'Right' },
                    { value: 'justify', label: 'Justify' },
                ],
            },
            { type: 'color', key: 'color', label: 'Color', value: color },
            {
                type: 'select',
                key: 'autoHeight',
                label: 'Height',
                value: this.data.autoHeight ? 'auto' : 'fixed',
                options: [
                    { value: 'auto', label: 'Auto' },
                    { value: 'fixed', label: 'Fixed' },
                ],
            },
        ]
    }

    setAppearanceProperty(key: string, value: string | number) {
        this.onBeforePropertyChange?.()
        if (key === 'fontFamily') this.setFontFamilyBlock(String(value))
        if (key === 'fontSize') this.setFontSize(Number(value))
        if (key === 'textAlign') this.setTextAlign(String(value))
        if (key === 'color') this.setColor(String(value))
        if (key === 'autoHeight') this.setAutoHeight(value === 'auto')
    }

    private setAutoHeight(auto: boolean) {
        if (auto === !!this.data.autoHeight) return
        if (auto) {
            this.data.autoHeight = true
            this.data.height = undefined
            this.el.style.height = ''
            this.resizeObserver.observe(this.el)
        } else {
            this.data.autoHeight = false
            this.data.height = this.el.offsetHeight
            this.el.style.height = `${this.data.height}px`
            this.resizeObserver.disconnect()
        }
        this.onChange?.()
        this.onResize?.()
    }

    override destroy() {
        this.resizeObserver.disconnect()
        this.editorInstance?.destroy()
        super.destroy()
    }

    getData(): Readonly<TextBlockData> {
        return { ...this.data }
    }
}
