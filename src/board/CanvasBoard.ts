// Pseudo board object representing the canvas itself, shown in the properties panel
// when no block is selected. Exposes the canvas background color and a collapsible
// PNG export section (toggle header → preview thumbnail, scale dropdown, export button).

import { BoardObject, PropertyField } from './BoardObject'

function parseAlpha(color: string): number {
    const m = color.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\s*\)/)
    return m ? parseFloat(m[1]) : 1
}

export class CanvasBoard implements BoardObject {
    readonly el = document.createElement('div')
    readonly omitCommonProps = true as const
    readonly hideDelete = true as const
    onSelect = null
    onDeselect = null
    onChange: (() => void) | null = null
    onNewBoard: (() => void) | null = null
    onLoadDemo: (() => void) | null = null
    onExport: (() => void) | null = null
    onExportPng: ((url: string) => void) | null = null
    onImport: (() => void) | null = null
    onDragMove = null
    onDragStart = null
    onBeforePropertyChange = null
    getViewport = null
    onResize = null
    onLayerChange = null
    onAppearanceChange = null
    readonly layerLabel = 'Canvas'
    readonly hideName = true as const
    name = 'Canvas'
    visible = true
    locked = false

    private bg: string
    private renderFn: ((scale: number) => Promise<Blob>) | null = null
    private renderGeneration = 0
    private previewUrl = ''
    private currentScale = 1

    private exportSectionEl: HTMLElement
    private exportPreviewImg!: HTMLImageElement
    private exportMetaEl!: HTMLElement
    private exportScaleTrigger!: HTMLButtonElement
    private exportBtn!: HTMLButtonElement

    constructor(private readonly appEl: HTMLElement) {
        this.bg = ''
        this.exportSectionEl = this.buildExportSection()
    }

    private buildExportSection(): HTMLElement {
        const section = document.createElement('div')
        section.className = 'export-section'

        // Toggle header — looks like a prop-section but is clickable
        const toggle = document.createElement('button')
        toggle.className = 'export-section-toggle'
        toggle.innerHTML = `<span>Export PNG</span><span class="export-section-chevron">▾</span>`

        // Collapsible body — outer div is the grid container that animates row height;
        // inner div holds the actual content so overflow: hidden doesn't clip the flex gap.
        const body = document.createElement('div')
        body.className = 'export-section-body'

        const inner = document.createElement('div')
        inner.className = 'export-section-body-inner'

        let isOpen = false
        toggle.addEventListener('click', () => {
            isOpen = !isOpen
            toggle.classList.toggle('is-open', isOpen)
            body.classList.toggle('is-open', isOpen)
            if (isOpen) void this.renderPreview()
        })

        // Preview frame
        const frame = document.createElement('div')
        frame.className = 'export-preview-frame'

        this.exportPreviewImg = document.createElement('img')
        this.exportPreviewImg.className = 'export-preview-img'
        this.exportPreviewImg.alt = ''
        frame.appendChild(this.exportPreviewImg)
        inner.appendChild(frame)

        this.exportMetaEl = document.createElement('p')
        this.exportMetaEl.className = 'export-preview-meta'
        inner.appendChild(this.exportMetaEl)

        // Scale row
        const controlsRow = document.createElement('div')
        controlsRow.className = 'export-controls-row'

        const scaleLabel = document.createElement('label')
        scaleLabel.textContent = 'Scale'
        scaleLabel.className = 'export-scale-label'

        const dropdown = document.createElement('div')
        dropdown.className = 'scale-dropdown'

        this.exportScaleTrigger = document.createElement('button')
        this.exportScaleTrigger.className = 'scale-dropdown-trigger'
        this.exportScaleTrigger.innerHTML = `<span>${this.currentScale}×</span><span class="scale-dropdown-chevron">▾</span>`

        const menu = document.createElement('div')
        menu.className = 'scale-dropdown-menu'

        const closeMenu = () => {
            menu.classList.remove('is-open')
            document.removeEventListener('mousedown', onOutside)
        }
        const onOutside = (e: MouseEvent) => {
            if (!dropdown.contains(e.target as Node)) closeMenu()
        }

        for (const s of [1, 2, 3]) {
            const opt = document.createElement('button')
            opt.className =
                'scale-dropdown-option' + (s === this.currentScale ? ' is-selected' : '')
            opt.textContent = `${s}×`
            opt.addEventListener('mousedown', (e) => e.preventDefault())
            opt.addEventListener('click', () => {
                this.currentScale = s
                this.exportScaleTrigger.querySelector('span')!.textContent = `${s}×`
                menu.querySelectorAll('.scale-dropdown-option').forEach((o, i) =>
                    o.classList.toggle('is-selected', i + 1 === s)
                )
                closeMenu()
                void this.renderPreview()
            })
            menu.appendChild(opt)
        }

        this.exportScaleTrigger.addEventListener('click', () => {
            const open = menu.classList.toggle('is-open')
            if (open) document.addEventListener('mousedown', onOutside)
            else document.removeEventListener('mousedown', onOutside)
        })

        dropdown.appendChild(this.exportScaleTrigger)
        dropdown.appendChild(menu)
        controlsRow.appendChild(scaleLabel)
        controlsRow.appendChild(dropdown)
        inner.appendChild(controlsRow)

        // Export button
        this.exportBtn = document.createElement('button')
        this.exportBtn.className = 'prop-action-btn export-png-btn'
        this.exportBtn.textContent = 'Export PNG'
        this.exportBtn.disabled = true
        this.exportBtn.addEventListener('click', () => {
            if (this.previewUrl) this.onExportPng?.(this.previewUrl)
        })
        inner.appendChild(this.exportBtn)

        body.appendChild(inner)
        section.appendChild(toggle)
        section.appendChild(body)
        return section
    }

    setRenderFn(fn: (scale: number) => Promise<Blob>) {
        this.renderFn = fn
    }

    private async renderPreview() {
        if (!this.renderFn) return
        const scale = this.currentScale
        const gen = ++this.renderGeneration

        this.exportMetaEl.textContent = 'Rendering…'
        this.exportPreviewImg.classList.add('is-loading')
        this.exportBtn.disabled = true

        try {
            const blob = await this.renderFn(scale)
            if (gen !== this.renderGeneration) return

            if (this.previewUrl) URL.revokeObjectURL(this.previewUrl)
            this.previewUrl = URL.createObjectURL(blob)
            this.exportPreviewImg.src = this.previewUrl
            this.exportPreviewImg.onload = () => {
                if (gen !== this.renderGeneration) return
                const img = this.exportPreviewImg
                this.exportMetaEl.textContent = `${img.naturalWidth} × ${img.naturalHeight} px`
                img.classList.remove('is-loading')
                this.exportBtn.disabled = false
            }
        } catch {
            if (gen !== this.renderGeneration) return
            this.exportMetaEl.textContent = 'Render failed.'
            this.exportPreviewImg.classList.remove('is-loading')
        }
    }

    getPosition() {
        return { x: 0, y: 0 }
    }
    getSize() {
        return { width: 0, height: 0 }
    }
    getRotation() {
        return 0
    }
    getWorldCorners(): [number, number][] {
        return []
    }
    setPosition() {}
    setSize() {}
    setRotation() {}
    setVisible() {}
    setLocked() {}
    setName() {}
    markSelected() {}
    markDeselected() {}
    destroy() {
        if (this.previewUrl) URL.revokeObjectURL(this.previewUrl)
    }

    getBackground(): string {
        return this.bg
    }

    setBackground(bg: string) {
        const transparent = !bg || bg === 'transparent' || parseAlpha(bg) === 0
        this.bg = transparent ? '' : bg
        this.appEl.style.setProperty('--canvas-color', this.bg || 'transparent')
    }

    getAppearanceFields(): PropertyField[] {
        return [
            {
                type: 'color',
                key: 'background',
                label: 'Background',
                value: this.bg,
                themeDefault: true,
                clearable: true,
            },
            { type: 'section', label: 'Board' },
            { type: 'button', key: 'export', label: 'Export JSON' },
            { type: 'button', key: 'import', label: 'Import JSON' },
            { type: 'button', key: 'loadDemo', label: 'Load demo' },
            { type: 'button', key: 'newBoard', label: 'New board', destructive: true },
            { type: 'node', key: 'exportSection', node: this.exportSectionEl },
        ]
    }

    setAppearanceProperty(key: string, value: string | number) {
        if (key === 'background') {
            this.setBackground(value as string)
            this.onChange?.()
        }
        if (key === 'newBoard') this.onNewBoard?.()
        if (key === 'loadDemo') this.onLoadDemo?.()
        if (key === 'export') this.onExport?.()
        if (key === 'import') this.onImport?.()
    }
}
