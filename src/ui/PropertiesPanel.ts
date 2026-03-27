// Fixed side panel that displays and edits properties of the selected board object.
// Common properties (position, size, rotation) are always shown.
// Appearance fields are rendered dynamically based on the object type.

import { BoardObject, PropertyField } from '../board/BoardObject'
import { loadFont } from '../lib/fonts'
import { FontPicker } from './FontPicker'
import { ColorPicker } from './ColorPicker'

export class PropertiesPanel {
    readonly el: HTMLElement
    private object: BoardObject | null = null
    private appearanceEl: HTMLElement
    private inputs: {
        x: HTMLInputElement
        y: HTMLInputElement
        width: HTMLInputElement
        height: HTMLInputElement
        rotation: HTMLInputElement
    }

    constructor(container: HTMLElement) {
        this.el = document.createElement('div')
        this.el.id = 'properties-panel'
        this.el.className = 'hidden'
        this.el.innerHTML = `
            <div class="prop-section">Position</div>
            <div class="prop-row">
                <label>X</label>
                <input type="number" id="prop-x" step="1" />
            </div>
            <div class="prop-row">
                <label>Y</label>
                <input type="number" id="prop-y" step="1" />
            </div>
            <div class="prop-section">Size</div>
            <div class="prop-row">
                <label>W</label>
                <input type="number" id="prop-width" min="1" step="1" />
            </div>
            <div class="prop-row">
                <label>H</label>
                <input type="number" id="prop-height" min="1" step="1" />
            </div>
            <div class="prop-section">Rotation</div>
            <div class="prop-row">
                <label>Angle</label>
                <input type="number" id="prop-rotation" step="1" />
                <span class="prop-unit">°</span>
            </div>
            <div id="prop-appearance"></div>
        `

        this.appearanceEl = this.el.querySelector('#prop-appearance') as HTMLElement
        this.inputs = {
            x: this.el.querySelector('#prop-x') as HTMLInputElement,
            y: this.el.querySelector('#prop-y') as HTMLInputElement,
            width: this.el.querySelector('#prop-width') as HTMLInputElement,
            height: this.el.querySelector('#prop-height') as HTMLInputElement,
            rotation: this.el.querySelector('#prop-rotation') as HTMLInputElement,
        }

        // stopPropagation prevents the board's "click outside → deselect" listener from firing.
        // Drag is only initiated when clicking the panel background, not its inputs.
        this.el.addEventListener('mousedown', (e) => {
            e.stopPropagation()
            if ((e.target as HTMLElement) !== this.el) return

            const startX = e.clientX - this.el.offsetLeft
            const startY = e.clientY - this.el.offsetTop

            const margin = 8
            const onMove = (e: MouseEvent) => {
                const maxX = window.innerWidth - this.el.offsetWidth - margin
                const maxY = window.innerHeight - this.el.offsetHeight - margin
                const x = Math.min(Math.max(margin, e.clientX - startX), maxX)
                const y = Math.min(Math.max(margin, e.clientY - startY), maxY)
                this.el.style.left = `${x}px`
                this.el.style.top = `${y}px`
            }

            const onUp = () => {
                window.removeEventListener('mousemove', onMove)
                window.removeEventListener('mouseup', onUp)
            }

            window.addEventListener('mousemove', onMove)
            window.addEventListener('mouseup', onUp)
        })

        container.appendChild(this.el)
        this.setupCommonEvents()
    }

    private setupCommonEvents() {
        const { x, y, width, height, rotation } = this.inputs

        x.addEventListener('input', () =>
            this.object?.setPosition(Number(x.value), Number(y.value))
        )
        y.addEventListener('input', () =>
            this.object?.setPosition(Number(x.value), Number(y.value))
        )
        width.addEventListener('input', () =>
            this.object?.setSize(Number(width.value), Number(height.value))
        )
        height.addEventListener('input', () =>
            this.object?.setSize(Number(width.value), Number(height.value))
        )
        rotation.addEventListener('input', () => this.object?.setRotation(Number(rotation.value)))
    }

    // Rebuilds the appearance section from scratch on each object selection,
    // since field types and count vary per object type.
    private renderAppearanceFields(fields: PropertyField[]) {
        this.appearanceEl.innerHTML = ''
        if (fields.length === 0) return

        const section = document.createElement('div')
        section.className = 'prop-section'
        section.textContent = 'Appearance'
        this.appearanceEl.appendChild(section)

        for (const field of fields) {
            const row = document.createElement('div')
            row.className = 'prop-row'

            const label = document.createElement('label')
            label.textContent = field.label
            row.appendChild(label)

            if (field.type === 'number') {
                const input = document.createElement('input')
                input.type = 'number'
                input.value = String(field.value)
                if (field.min !== undefined) input.min = String(field.min)
                if (field.max !== undefined) input.max = String(field.max)
                if (field.step !== undefined) input.step = String(field.step)
                input.addEventListener('input', () =>
                    this.object?.setAppearanceProperty(field.key, Number(input.value))
                )
                row.appendChild(input)
            }

            if (field.type === 'select') {
                const select = document.createElement('select')
                select.className = 'prop-select'
                for (const option of field.options) {
                    const opt = document.createElement('option')
                    opt.value = option.value
                    opt.textContent = option.label
                    if (option.value === field.value) opt.selected = true
                    select.appendChild(opt)
                }
                select.addEventListener('change', () => {
                    this.object?.setAppearanceProperty(field.key, select.value)
                })
                row.appendChild(select)
            }

            if (field.type === 'font') {
                const picker = new FontPicker(field.value, (family) => {
                    loadFont(family)
                    this.object?.setAppearanceProperty(field.key, family)
                })
                picker.el.classList.add('prop-font-picker')
                row.appendChild(picker.el)
            }

            if (field.type === 'color') {
                const picker = new ColorPicker(field.value, (color) => {
                    this.object?.setAppearanceProperty(field.key, color)
                })
                row.appendChild(picker.el)

                if (field.clearable) {
                    const clear = document.createElement('button')
                    clear.textContent = '✕'
                    clear.addEventListener('click', () => {
                        this.object?.setAppearanceProperty(field.key, 'transparent')
                        picker.setValue('transparent')
                    })
                    row.appendChild(clear)
                }
            }

            this.appearanceEl.appendChild(row)
        }
    }

    // Binds to a board object. Appearance fields are rebuilt for the new type,
    // then onChange keeps inputs in sync as the user drags or resizes.
    show(object: BoardObject) {
        this.object = object
        this.renderAppearanceFields(object.getAppearanceFields())
        this.sync()
        object.onChange = () => this.sync()
        this.el.classList.remove('hidden')
    }

    private sync() {
        if (!this.object) return
        const pos = this.object.getPosition()
        const size = this.object.getSize()

        this.inputs.x.value = String(Math.round(pos.x))
        this.inputs.y.value = String(Math.round(pos.y))
        this.inputs.width.value = String(Math.round(size.width))
        this.inputs.height.value = String(Math.round(size.height))
        this.inputs.rotation.value = String(Math.round(this.object.getRotation()))
    }

    hide() {
        if (this.object) this.object.onChange = null
        this.object = null
        this.el.classList.add('hidden')
    }
}
