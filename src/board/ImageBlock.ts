// Draggable, resizable, rotatable image block rendered in the HTML overlay.

import { PropertyField } from './BoardObject'
import { BoxBlock } from './BoxBlock'

export interface ImageBlockData {
    id: string
    x: number
    y: number
    width: number
    height: number
    rotation: number
    // Runtime src — an object URL (from a Blob) or a static asset URL.
    // When persisting to Dexie, store the Blob separately and recreate this on load.
    src: string
    objectFit: 'cover' | 'contain' | 'fill'
    opacity: number
    borderRadius: number
    background: string
    shadowColor: string
    shadowBlur: number
    shadowX: number
    shadowY: number
    // Kept for future Dexie persistence — recreate src via URL.createObjectURL on load.
    imageBlob?: Blob
    name?: string
    groupId?: string
}

export class ImageBlock extends BoxBlock<ImageBlockData> {
    readonly layerLabel = 'Image'
    private imgEl: HTMLImageElement
    private innerEl: HTMLElement

    constructor(container: HTMLElement, data: ImageBlockData) {
        const el = document.createElement('div')
        el.className = 'image-block'
        super(el, 'Image', data)

        // Inner wrapper clips the image to the border radius without clipping the
        // selection handles, which extend outside the block bounds.
        this.innerEl = document.createElement('div')
        this.innerEl.className = 'image-block-inner'

        this.imgEl = document.createElement('img')
        this.imgEl.draggable = false
        this.innerEl.appendChild(this.imgEl)
        this.el.appendChild(this.innerEl)

        this.applyPosition()
        this.applySize()
        this.applyTransform()
        this.applyAppearance()

        this.setupInteraction()
        container.appendChild(this.el)
    }

    private applyAppearance() {
        if (this.data.src) {
            this.imgEl.src = this.data.src
            this.imgEl.style.display = ''
            this.innerEl.classList.remove('image-block-empty')
        } else {
            this.imgEl.src = ''
            this.imgEl.style.display = 'none'
            this.innerEl.classList.add('image-block-empty')
        }
        this.imgEl.style.objectFit = this.data.objectFit
        this.el.style.opacity = String(this.data.opacity / 100)
        this.el.style.borderRadius = `${this.data.borderRadius}px`
        this.innerEl.style.borderRadius = `${this.data.borderRadius}px`
        this.innerEl.style.background = this.data.background
        this.el.style.boxShadow = this.data.shadowColor
            ? `${this.data.shadowX}px ${this.data.shadowY}px ${this.data.shadowBlur}px ${this.data.shadowColor}`
            : 'none'
    }

    getAppearanceFields(): PropertyField[] {
        return [
            {
                type: 'text',
                key: 'src',
                label: 'Source',
                value: this.data.src,
                placeholder: '/path/to/image.jpg',
                allowFilePick: true,
            },
            {
                type: 'select',
                key: 'objectFit',
                label: 'Fit',
                value: this.data.objectFit,
                options: [
                    { value: 'cover', label: 'Cover' },
                    { value: 'contain', label: 'Contain' },
                    { value: 'fill', label: 'Fill' },
                ],
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
                max: 500,
                step: 1,
            },
            {
                type: 'color',
                key: 'background',
                label: 'Background',
                value: this.data.background,
                clearable: true,
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
        if (key === 'src') {
            if (this.data.src.startsWith('blob:')) URL.revokeObjectURL(this.data.src)
            this.data.src = String(value)
            this.applyAppearance()
        }
        if (key === 'objectFit') {
            this.data.objectFit = value as ImageBlockData['objectFit']
            this.imgEl.style.objectFit = this.data.objectFit
        }
        if (key === 'opacity') {
            this.data.opacity = Number(value)
            this.el.style.opacity = String(this.data.opacity / 100)
        }
        if (key === 'borderRadius') {
            this.data.borderRadius = Number(value)
            this.el.style.borderRadius = `${this.data.borderRadius}px`
            this.innerEl.style.borderRadius = `${this.data.borderRadius}px`
        }
        if (key === 'background') {
            this.data.background = String(value)
            this.innerEl.style.background = this.data.background
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

    setFileProperty(key: string, file: File) {
        if (key !== 'src') return
        this.onBeforePropertyChange?.()
        if (this.data.src.startsWith('blob:')) URL.revokeObjectURL(this.data.src)
        this.data.imageBlob = file
        this.data.src = URL.createObjectURL(file)
        this.applyAppearance()
    }

    getData(): Readonly<ImageBlockData> {
        return { ...this.data, groupId: this.groupId }
    }

    // Must be called when removing the block if src is an object URL, to free memory.
    override destroy() {
        if (this.data.src.startsWith('blob:')) {
            URL.revokeObjectURL(this.data.src)
        }
        super.destroy()
    }
}
