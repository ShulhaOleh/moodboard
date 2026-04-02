// Pseudo board object representing the canvas itself, shown in the properties panel
// when no block is selected. Exposes the canvas background color as its only property.

import { BoardObject, PropertyField } from './BoardObject'

export class CanvasBoard implements BoardObject {
    readonly el = document.createElement('div')
    readonly omitCommonProps = true as const
    readonly hideDelete = true as const
    onSelect = null
    onDeselect = null
    onChange: (() => void) | null = null
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
        this.bg = '#ffffff'
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
    setPosition() {}
    setSize() {}
    setRotation() {}
    setVisible() {}
    setLocked() {}
    setName() {}
    markSelected() {}
    markDeselected() {}
    destroy() {}

    getAppearanceFields(): PropertyField[] {
        return [
            {
                type: 'color',
                key: 'background',
                label: 'Background',
                value: this.bg,
                clearable: true,
            },
        ]
    }

    setAppearanceProperty(key: string, value: string | number) {
        if (key === 'background') {
            this.bg = value as string
            this.appEl.style.backgroundColor = this.bg
            this.onChange?.()
        }
    }
}
