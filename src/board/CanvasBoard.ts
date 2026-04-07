// Pseudo board object representing the canvas itself, shown in the properties panel
// when no block is selected. Exposes the canvas background color as its only property.

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
    onExportPng: (() => void) | null = null
    onImport: (() => void) | null = null
    onDragMove = null
    onDragStart = null
    onBeforePropertyChange = null
    onLayerChange = null
    readonly layerLabel = 'Canvas'
    readonly hideName = true as const
    name = 'Canvas'
    visible = true
    locked = false

    private bg: string

    constructor(private readonly appEl: HTMLElement) {
        this.bg = ''
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
    destroy() {}

    getBackground(): string {
        return this.bg
    }

    setBackground(bg: string) {
        const transparent = !bg || bg === 'transparent' || parseAlpha(bg) === 0
        this.bg = transparent ? '' : bg
        this.appEl.style.backgroundColor = this.bg
        this.appEl.classList.toggle('canvas-transparent', transparent)
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
            { type: 'button', key: 'exportPng', label: 'Export PNG' },
            { type: 'button', key: 'import', label: 'Import JSON' },
            { type: 'button', key: 'loadDemo', label: 'Load demo' },
            { type: 'button', key: 'newBoard', label: 'New board', destructive: true },
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
        if (key === 'exportPng') this.onExportPng?.()
        if (key === 'import') this.onImport?.()
    }
}
