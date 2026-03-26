// Floating toolbar that appears on text selection inside a TipTap editor.
// Positioned above the selection using the browser's Selection API.

import { Editor } from '@tiptap/core'
import { loadFont } from '../lib/fonts'
import { FontPicker } from './FontPicker'

export class TextFormatToolbar {
    readonly el: HTMLElement
    private editor: Editor
    private _interacting = false
    private interactingTimer = 0
    private sizeInput!: HTMLInputElement
    private fontPicker!: FontPicker

    // True while the user is interacting with the toolbar (mousedown held or color picker open).
    // Used by the editor's blur handler to decide whether to exit edit mode.
    get isInteracting() {
        return this._interacting
    }

    constructor(editor: Editor) {
        this.editor = editor
        this.el = document.createElement('div')
        this.el.className = 'text-format-toolbar hidden'
        document.body.appendChild(this.el)

        // Set interacting flag on mousedown so the editor blur handler can detect toolbar use.
        // The flag resets after 300ms to cover native color picker dialogs that move focus
        // outside the browser.
        this.el.addEventListener('mousedown', () => {
            this._interacting = true
            clearTimeout(this.interactingTimer)
            this.interactingTimer = window.setTimeout(() => {
                this._interacting = false
                if (!this.editor.isFocused && !this.el.contains(document.activeElement)) this.hide()
            }, 300)
        })

        // Hide when focus leaves the toolbar entirely — covers the case where the
        // color picker closes and the user then clicks outside without returning to the editor.
        this.el.addEventListener('focusout', (e) => {
            const next = e.relatedTarget as Node | null
            if (!next || (!this.el.contains(next) && !this.editor.view.dom.contains(next))) {
                this.hide()
            }
        })

        this.buildUI()
        this.setupSelectionTracking()
    }

    private buildUI() {
        const bold = this.createButton('B', () => this.editor.chain().focus().toggleBold().run())
        bold.style.fontWeight = 'bold'

        const italic = this.createButton('I', () =>
            this.editor.chain().focus().toggleItalic().run()
        )
        italic.style.fontStyle = 'italic'

        const colorInput = document.createElement('input')
        colorInput.type = 'color'
        colorInput.title = 'Text color'
        colorInput.addEventListener('input', () =>
            this.editor.chain().setColor(colorInput.value).run()
        )

        this.sizeInput = document.createElement('input')
        this.sizeInput.type = 'number'
        this.sizeInput.min = '8'
        this.sizeInput.max = '120'
        this.sizeInput.placeholder = 'px'
        this.sizeInput.className = 'tf-size-input'
        this.sizeInput.addEventListener('change', () =>
            this.editor.chain().focus().setFontSize(`${this.sizeInput.value}px`).run()
        )
        this.sizeInput.addEventListener('blur', () => this.editor.commands.focus())

        this.fontPicker = new FontPicker('Inter', (family) => {
            loadFont(family)
            this.editor.chain().focus().setFontFamily(family).run()
        })

        this.el.append(this.fontPicker.el, bold, italic, colorInput, this.sizeInput)

        // Only prevent default on buttons — inputs need real focus to be usable
        this.el.addEventListener('mousedown', (e) => {
            if ((e.target as HTMLElement).tagName !== 'INPUT') e.preventDefault()
        })
    }

    private createButton(text: string, onClick: () => void): HTMLButtonElement {
        const btn = document.createElement('button')
        btn.className = 'tf-btn'
        btn.textContent = text
        btn.addEventListener('click', onClick)
        return btn
    }

    private setupSelectionTracking() {
        this.editor.on('selectionUpdate', ({ editor }) => {
            if (editor.state.selection.empty) {
                this.hide()
            } else {
                this.updatePosition()
                this.updateSizeInput()
                this.updateFontSelect()
                this.show()
            }
        })

        // Hide when editor loses focus, unless the user is interacting with the toolbar
        // (mousedown on toolbar sets isInteracting to delay this check).
        this.editor.on('blur', () => {
            if (!this._interacting) this.hide()
        })
    }

    // Reads the font-family of the current selection and syncs it to the font picker.
    private updateFontSelect() {
        const family = this.editor.getAttributes('textStyle').fontFamily as string | undefined
        if (family) this.fontPicker.setValue(family)
    }

    // Reads the font-size of the current selection and syncs it to the size input.
    // Prefers the explicit TextStyle mark value; falls back to computed style so the
    // field is never empty for text that inherits its size from the container.
    private updateSizeInput() {
        const raw = this.editor.getAttributes('textStyle').fontSize as string | undefined
        if (raw) {
            this.sizeInput.value = String(parseInt(raw, 10))
            return
        }

        const selection = window.getSelection()
        if (!selection || selection.rangeCount === 0) return
        const node = selection.getRangeAt(0).startContainer
        const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element)
        if (el) {
            const computed = window.getComputedStyle(el).fontSize
            this.sizeInput.value = computed ? String(Math.round(parseFloat(computed))) : ''
        }
    }

    // Positions the toolbar above the current browser selection bounding rect.
    private updatePosition() {
        const selection = window.getSelection()
        if (!selection || selection.rangeCount === 0) return

        const rect = selection.getRangeAt(0).getBoundingClientRect()
        this.el.style.left = `${rect.left + rect.width / 2}px`
        this.el.style.top = `${rect.top + window.scrollY}px`
        this.el.style.transform = 'translate(-50%, calc(-100% - 8px))'
    }

    private show() {
        this.el.classList.remove('hidden')
    }

    private hide() {
        this.el.classList.add('hidden')
    }

    destroy() {
        clearTimeout(this.interactingTimer)
        this.fontPicker.destroy()
        this.el.remove()
    }
}
