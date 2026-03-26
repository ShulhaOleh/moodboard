// Draggable, editable text block with markdown rendering for the board overlay.

import { marked } from 'marked'

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
}

export class TextBlock {
    readonly el: HTMLElement
    private data: TextBlockData
    private editing = false
    private selected = false
    private contentEl: HTMLElement
    private handlesEl: HTMLElement | null = null
    private dragOffset = { x: 0, y: 0 }

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
        if (data.width) this.el.style.width = `${data.width}px`
        if (data.height) this.el.style.height = `${data.height}px`
        this.renderMarkdown()
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

    private renderMarkdown() {
        this.contentEl.innerHTML = marked.parse(this.data.content) as string
    }

    private setupInteraction() {
        this.el.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return
            if (this.editing) return
            if ((e.target as HTMLElement).closest('.tb-handles')) return
            if (!this.selected) this.select()
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

    private select() {
        this.selected = true
        this.el.classList.add('is-selected')

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

        this.dragOffset.x = e.clientX - this.data.x
        this.dragOffset.y = e.clientY - this.data.y

        const onMove = (e: MouseEvent) => {
            this.data.x = e.clientX - this.dragOffset.x
            this.data.y = e.clientY - this.dragOffset.y
            this.applyPosition()
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
        }

        const onUp = () => {
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
        }

        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
    }

    private startEdit() {
        this.editing = true

        const savedRotation = this.data.rotation
        this.data.rotation = 0
        this.applyTransform()

        const textarea = document.createElement('textarea')
        textarea.value = this.data.content
        textarea.className = 'text-block-editor'
        textarea.style.fontSize = 'inherit'

        this.contentEl.innerHTML = ''
        this.contentEl.appendChild(textarea)
        textarea.focus()
        textarea.select()

        const finish = () => {
            this.data.content = textarea.value
            this.editing = false
            this.data.rotation = savedRotation
            this.applyTransform()
            this.renderMarkdown()
        }

        textarea.addEventListener('blur', finish)
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') textarea.blur()
        })
    }

    setFontSize(size: number) {
        this.data.fontSize = size
        this.applyTypography()
    }

    setPadding(px: number) {
        this.data.padding = px
        this.applyTypography()
    }

    getData(): Readonly<TextBlockData> {
        return { ...this.data }
    }
}
