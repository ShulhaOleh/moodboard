// Sticky-note block: colored card with auto-height rich text content.
// Height is always driven by content; only width is user-resizable.

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

export type NoteShape = 'rectangle' | 'dog-ear' | 'stacked'

export interface NoteBlockData {
    id: string
    x: number
    y: number
    width: number
    rotation: number
    content: string
    color: string
    fontSize: number
    fontFamily: string
    opacity: number
    borderRadius: number
    shadowColor: string
    shadowBlur: number
    shadowX: number
    shadowY: number
    shape: NoteShape
    name?: string
}

export const NOTE_FOLD_SIZE = 28

export class NoteBlock extends BoxBlock<NoteBlockData> {
    readonly layerLabel = 'Note'
    readonly fixedHeight = true as const
    private editing = false
    private contentEl: HTMLElement
    private foldEl: HTMLElement
    // Sibling element in the overlay — renders behind this.el to create the stacked-paper look.
    private stackBackEl: HTMLElement
    private container: HTMLElement
    private editorInstance: Editor | null = null
    private resizeObserver: ResizeObserver

    protected override get minResizeWidth(): number {
        return 120
    }

    constructor(container: HTMLElement, data: NoteBlockData) {
        const el = document.createElement('div')
        el.className = 'note-block'
        super(el, 'Note', data)

        this.container = container

        if (!this.data.fontFamily) this.data.fontFamily = 'Inter'
        if (!this.data.shape) this.data.shape = 'rectangle'
        if (this.data.borderRadius === undefined) this.data.borderRadius = 6

        // stackBackEl is a sibling in the overlay inserted before this.el so it paints behind it.
        // A child element with z-index: -1 cannot go behind a parent's own background, so sibling
        // is the only correct approach.
        this.stackBackEl = document.createElement('div')
        this.stackBackEl.className = 'note-stack-back'
        container.appendChild(this.stackBackEl)

        this.foldEl = document.createElement('div')
        this.foldEl.className = 'note-fold'
        this.el.appendChild(this.foldEl)

        this.contentEl = document.createElement('div')
        this.contentEl.className = 'note-block-content'
        this.el.appendChild(this.contentEl)

        this.applyPosition()
        this.applySize()
        this.applyTransform()
        this.applyShape()
        this.applyAppearance()
        this.renderContent()

        // Notify main.ts to update the selection box whenever the note's height changes,
        // and keep the back card in sync with the new height.
        this.resizeObserver = new ResizeObserver(() => {
            this.syncStackBack()
            this.onResize?.()
        })
        this.resizeObserver.observe(this.el)

        this.el.addEventListener('dblclick', (e) => {
            if ((e.target as HTMLElement).closest('.tb-handles')) return
            this.startEdit()
        })
        this.setupInteraction()

        container.appendChild(this.el)
    }

    protected override isEditing(): boolean {
        return this.editing
    }

    protected override applyPosition() {
        super.applyPosition()
        this.syncStackBack()
    }

    protected override applyTransform() {
        super.applyTransform()
        this.syncStackBack()
    }

    // Only set width — height is driven by content via CSS.
    protected override applySize() {
        this.el.style.width = `${this.data.width}px`
        this.syncStackBack()
    }

    // Re-inserts stackBackEl immediately before this.el so it stays behind after a layer reorder.
    syncLayerOrder() {
        this.container.insertBefore(this.stackBackEl, this.el)
    }

    private syncStackBack() {
        if (this.data.shape !== 'stacked') {
            this.stackBackEl.style.display = 'none'
            return
        }
        const { x, y, width, rotation } = this.data
        const height = this.el.offsetHeight
        this.stackBackEl.style.display = 'block'
        this.stackBackEl.style.left = `${x}px`
        this.stackBackEl.style.top = `${y}px`
        this.stackBackEl.style.width = `${width}px`
        this.stackBackEl.style.height = `${height}px`
        this.stackBackEl.style.borderRadius = `${this.data.borderRadius ?? 6}px`
        // Mirror the main card's left/top so both share the same rotation origin (50% 50%).
        // translate(8px, 6px) then shifts in local (post-rotation) space so the back card
        // peeks consistently from the bottom-right at any rotation angle.
        this.stackBackEl.style.transform = `rotate(${rotation}deg) translate(8px, 6px)`
        this.stackBackEl.style.background = this.data.color
        this.stackBackEl.style.opacity = String(this.data.opacity / 100)
    }

    // Return the live DOM height so SelectionBox and snap always have accurate dimensions.
    override getSize(): { width: number; height: number } {
        return { width: this.data.width, height: this.el.offsetHeight }
    }

    // Ignore height — it is auto-sized by content.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    override setSize(width: number, _height: number) {
        this.onBeforePropertyChange?.()
        this.data.width = Math.max(this.minResizeWidth, width)
        this.el.style.width = `${this.data.width}px`
        this.syncStackBack()
        this.onChange?.()
    }

    private applyShape() {
        this.el.classList.remove('shape-dog-ear', 'shape-stacked')
        if (this.data.shape !== 'rectangle') this.el.classList.add(`shape-${this.data.shape}`)
        this.foldEl.style.display = this.data.shape === 'dog-ear' ? 'block' : 'none'
        const r = this.data.borderRadius ?? 6
        // Dog-ear: only round the bottom corners — top-left is the sharp folded-paper corner.
        this.el.style.borderRadius = this.data.shape === 'dog-ear' ? `0 0 ${r}px ${r}px` : `${r}px`
    }

    private applyAppearance() {
        this.el.style.background = this.data.color
        this.el.style.color = contrastColor(this.data.color)
        this.el.style.fontSize = `${this.data.fontSize}px`
        this.el.style.opacity = String(this.data.opacity / 100)
        if (this.data.fontFamily) {
            loadFont(this.data.fontFamily)
            this.el.style.fontFamily = this.data.fontFamily
        }

        // Dog-ear: clip-path clips box-shadow, so use filter: drop-shadow instead.
        if (this.data.shape === 'dog-ear') {
            this.el.style.boxShadow = ''
            const userDropShadow = this.data.shadowColor
                ? ` drop-shadow(${this.data.shadowX}px ${this.data.shadowY}px ${this.data.shadowBlur}px ${this.data.shadowColor})`
                : ''
            this.el.style.filter =
                'drop-shadow(0 2px 8px rgba(0,0,0,0.12)) drop-shadow(0 1px 3px rgba(0,0,0,0.08))' +
                userDropShadow
        } else {
            this.el.style.filter = ''
            this.el.style.boxShadow = this.data.shadowColor
                ? `${this.data.shadowX}px ${this.data.shadowY}px ${this.data.shadowBlur}px ${this.data.shadowColor}`
                : ''
        }

        this.syncStackBack()
    }

    private renderContent() {
        this.contentEl.innerHTML = this.data.content
        const tmp = document.createElement('div')
        tmp.innerHTML = this.data.content
        this.contentEl.classList.toggle('is-empty', (tmp.textContent ?? '').trim() === '')
    }

    startEdit() {
        this.editing = true
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
            this.contentEl.innerHTML = ''
            this.renderContent()
            this.onChange?.()
        }

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

    getAppearanceFields(): PropertyField[] {
        return [
            { type: 'color', key: 'color', label: 'Color', value: this.data.color },
            { type: 'font', key: 'fontFamily', label: 'Font', value: this.data.fontFamily },
            {
                type: 'number',
                key: 'fontSize',
                label: 'Font size',
                value: this.data.fontSize,
                min: 8,
                max: 72,
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
            {
                type: 'number',
                key: 'borderRadius',
                label: 'Radius',
                value: this.data.borderRadius,
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
            },
        ]
    }

    setAppearanceProperty(key: string, value: string | number) {
        this.onBeforePropertyChange?.()
        if (key === 'color') {
            this.data.color = String(value)
            this.el.style.background = this.data.color
            this.el.style.color = contrastColor(this.data.color)
        }
        if (key === 'fontFamily') {
            this.data.fontFamily = String(value)
            if (this.data.fontFamily) {
                loadFont(this.data.fontFamily)
                this.el.style.fontFamily = this.data.fontFamily
            }
        }
        if (key === 'fontSize') {
            this.data.fontSize = Number(value)
            this.el.style.fontSize = `${this.data.fontSize}px`
        }
        if (key === 'opacity') {
            this.data.opacity = Number(value)
            this.el.style.opacity = String(this.data.opacity / 100)
        }
        if (key === 'borderRadius') {
            this.data.borderRadius = Number(value)
            this.applyShape()
            this.syncStackBack()
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
        this.onChange?.()
    }

    getData(): Readonly<NoteBlockData> {
        return { ...this.data }
    }

    override destroy() {
        this.resizeObserver.disconnect()
        this.editorInstance?.destroy()
        this.stackBackEl.remove()
        super.destroy()
    }
}

// Returns black or white based on background luminance for readable text contrast.
export function contrastColor(hex: string): string {
    if (!hex || !hex.startsWith('#') || hex.length < 7) return '#1e1e2e'
    const r = parseInt(hex.slice(1, 3), 16) / 255
    const g = parseInt(hex.slice(3, 5), 16) / 255
    const b = parseInt(hex.slice(5, 7), 16) / 255
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
    return luminance > 0.45 ? '#1e1e2e' : '#f8f8f2'
}
