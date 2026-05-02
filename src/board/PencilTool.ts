// Pseudo board object for the pencil tool, shown in the properties panel when the pencil is active.

import { BoardObject, PropertyField } from './BoardObject'

export interface PencilSettings {
    stroke: string
    strokeEnd: string
    strokeWidth: number
    taper: number
    smoothing: number
}

const DEFAULT_SETTINGS: PencilSettings = {
    stroke: '#333333',
    strokeEnd: '',
    strokeWidth: 2,
    taper: 0,
    smoothing: 50,
}

const STORAGE_KEY = 'moodboard-pencil'

function loadSettings(): PencilSettings {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return { ...DEFAULT_SETTINGS }
        return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
    } catch {
        return { ...DEFAULT_SETTINGS }
    }
}

function saveSettings(s: PencilSettings) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
}

export class PencilTool implements BoardObject {
    readonly el = document.createElement('div')
    readonly omitCommonProps = true as const
    readonly hideDelete = true as const
    readonly hideName = true as const
    onChange = null
    onSelect = null
    onDeselect = null
    onDragMove = null
    onDragStart = null
    onBeforePropertyChange = null
    getViewport = null
    onResize = null
    onLayerChange = null
    onAppearanceChange = null
    readonly layerLabel = 'Pencil'
    name = 'Pencil'
    visible = true
    locked = false

    onSettingsChange: ((settings: PencilSettings) => void) | null = null

    private settings: PencilSettings = loadSettings()

    getSettings(): PencilSettings {
        return { ...this.settings }
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

    getAppearanceFields(): PropertyField[] {
        return [
            { type: 'section', label: 'Pencil' },
            { type: 'color', key: 'stroke', label: 'Stroke', value: this.settings.stroke },
            {
                type: 'color',
                key: 'strokeEnd',
                label: 'Gradient',
                value: this.settings.strokeEnd,
                clearable: true,
            },
            {
                type: 'number',
                key: 'strokeWidth',
                label: 'Width',
                value: this.settings.strokeWidth,
                min: 1,
                max: 80,
            },
            {
                type: 'slider',
                key: 'taper',
                label: 'Taper',
                value: this.settings.taper,
                min: 0,
                max: 100,
            },
            {
                type: 'slider',
                key: 'smoothing',
                label: 'Smooth',
                value: this.settings.smoothing,
                min: 0,
                max: 100,
            },
        ]
    }

    setAppearanceProperty(key: string, value: string | number) {
        const s = { ...this.settings }
        if (key === 'stroke') s.stroke = value as string
        else if (key === 'strokeEnd')
            s.strokeEnd = value === 'transparent' || value === '' ? '' : (value as string)
        else if (key === 'strokeWidth') s.strokeWidth = Math.max(1, Math.min(80, value as number))
        else if (key === 'taper') s.taper = value as number
        else if (key === 'smoothing') s.smoothing = value as number
        else return
        this.settings = s
        saveSettings(s)
        this.onSettingsChange?.(this.getSettings())
    }
}
