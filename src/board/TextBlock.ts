// Draggable, editable text block with rich text editing via TipTap.
// Content is stored as an HTML string and rendered directly into the content element.

import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { TextStyle } from '@tiptap/extension-text-style'
import { Color } from '@tiptap/extension-color'
import { FontSize } from './extensions/FontSize'
import { FontFamily } from './extensions/FontFamily'
import { loadFont } from '../lib/fonts'
import { TextFormatToolbar } from '../ui/TextFormatToolbar'
import { BoardObject, PropertyField } from './BoardObject'

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
    fontFamily: string
}

export class TextBlock implements BoardObject {
    readonly el: HTMLElement
    onSelect: ((obj: BoardObject) => void) | null = null
    onDeselect: (() => void) | null = null
    onChange: (() => void) | null = null
    private data: TextBlockData
    private editing = false
    private selected = false
    private contentEl: HTMLElement
    private handlesEl: HTMLElement | null = null
    private dragOffset = { x: 0, y: 0 }
    private editorInstance: Editor | null = null

    constructor(container: HTMLElement, data: TextBlockData) {
        this.data = { ...data }

        this.el = document.createElement('div')
        this.el.className = 'text-block'

        this.contentEl = document.createElement('div')
        this.contentEl.className = 'text-block-content'
        this.el.appendChild(this.contentEl)

        this.applyPosition()
        this.applyTransform()
        this.applyTypography()
        this.applyFontFamily()
        this.applyAppearance()
        if (data.width) this.el.style.width = `${data.width}px`
        if (data.height) this.el.style.height = `${data.height}px`
        this.renderContent()
        this.setupInteraction()

        container.appendChild(this.el)
    }

    private applyPosition() {
        this.el.style.left = `${this.data.x}px`
        this.el.style.top = `${this.data.y}px`
    }

    private applyTransform() {
        this.el.style.transform = `rotate(${this.data.rotation}deg)`
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
    }

    private renderContent() {
        this.contentEl.innerHTML = this.data.content
    }

    private setupInteraction() {
        this.el.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return
            if (this.editing) return
            if ((e.target as HTMLElement).closest('.tb-handles')) return
            if (!this.selected) {
                this.select()
                return // selecting click should not start a drag
            }
            this.startDrag(e)
        })

        // Deselect when clicking outside this block
        document.addEventListener('mousedown', (e) => {
            if (this.selected && !this.el.contains(e.target as Node)) {
                this.deselect()
            }
        })

        this.el.addEventListener('dblclick', (e) => {
            if ((e.target as HTMLElement).closest('.tb-handles')) return
            this.startEdit()
        })
    }

    getPosition() {
        return { x: this.data.x, y: this.data.y }
    }
    getSize() {
        return {
            width: this.data.width ?? this.el.offsetWidth,
            height: this.data.height ?? this.el.offsetHeight,
        }
    }
    getRotation() {
        return this.data.rotation
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
            { type: 'color', key: 'color', label: 'Color', value: this.data.color },
            {
                type: 'color',
                key: 'background',
                label: 'Background',
                value: this.data.background,
                clearable: true,
            },
        ]
    }

    setAppearanceProperty(key: string, value: string | number) {
        if (key === 'fontFamily') this.setFontFamilyBlock(String(value))
        if (key === 'fontSize') this.setFontSize(Number(value))
        if (key === 'color') this.setColor(String(value))
        if (key === 'background') this.setBackground(String(value))
    }

    private select() {
        this.selected = true
        this.el.classList.add('is-selected')
        this.onSelect?.(this)

        // Fix dimensions so the resize handle has something to work with
        if (!this.data.width) {
            this.data.width = this.el.getBoundingClientRect().width
            this.el.style.width = `${this.data.width}px`
        }
        if (!this.data.height) {
            this.data.height = this.el.getBoundingClientRect().height
            this.el.style.height = `${this.data.height}px`
        }

        this.renderHandles()
    }

    private deselect() {
        this.selected = false
        this.el.classList.remove('is-selected')
        this.handlesEl?.remove()
        this.handlesEl = null
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
                // Only commit to a drag after the mouse moves a few pixels,
                // so clicks and double-clicks never accidentally shift the block.
                if (Math.hypot(e.clientX - startX, e.clientY - startY) < 4) return
                dragging = true
                this.dragOffset.x = startX - this.data.x
                this.dragOffset.y = startY - this.data.y
            }
            this.data.x = e.clientX - this.dragOffset.x
            this.data.y = e.clientY - this.dragOffset.y
            this.applyPosition()
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

        const startX = e.clientX
        const startY = e.clientY
        const startW = this.data.width ?? this.el.offsetWidth
        const startH = this.data.height ?? this.el.offsetHeight
        const angle = (this.data.rotation * Math.PI) / 180

        const onMove = (e: MouseEvent) => {
            const dx = e.clientX - startX
            const dy = e.clientY - startY
            // Project mouse delta onto the element's local axes
            const localDx = dx * Math.cos(angle) + dy * Math.sin(angle)
            const localDy = -dx * Math.sin(angle) + dy * Math.cos(angle)
            this.data.width = Math.max(120, startW + localDx)
            this.data.height = Math.max(40, startH + localDy)
            this.el.style.width = `${this.data.width}px`
            this.el.style.height = `${this.data.height}px`
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

        const rect = this.el.getBoundingClientRect()
        const centerX = rect.left + rect.width / 2
        const centerY = rect.top + rect.height / 2

        const onMove = (e: MouseEvent) => {
            const angle = Math.atan2(e.clientY - centerY, e.clientX - centerX)
            // +90° offset so 0° points up (handle is above the block)
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

    // Temporarily resets rotation to 0 for comfortable editing, restores it on exit.
    private startEdit() {
        this.editing = true

        // Handles are useless (and their mousedown listeners have no editing guard)
        // while the TipTap editor is active, so hide them for the duration.
        this.handlesEl?.remove()
        this.handlesEl = null

        const savedRotation = this.data.rotation
        this.data.rotation = 0
        this.applyTransform()

        this.contentEl.innerHTML = ''
        this.editorInstance = new Editor({
            element: this.contentEl,
            extensions: [StarterKit, TextStyle, Color, FontSize, FontFamily],
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
            if (this.selected) this.renderHandles()
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

    setPosition(x: number, y: number) {
        this.data.x = x
        this.data.y = y
        this.applyPosition()
    }

    setSize(width: number, height: number) {
        this.data.width = Math.max(120, width)
        this.data.height = Math.max(40, height)
        this.el.style.width = `${this.data.width}px`
        this.el.style.height = `${this.data.height}px`
    }

    setRotation(deg: number) {
        this.data.rotation = deg
        this.applyTransform()
    }

    setColor(color: string) {
        this.data.color = color
        this.applyAppearance()
    }

    setBackground(bg: string) {
        this.data.background = bg
        this.applyAppearance()
    }

    // Returns a snapshot of the current block state for persistence.
    getData(): Readonly<TextBlockData> {
        return { ...this.data }
    }
}
