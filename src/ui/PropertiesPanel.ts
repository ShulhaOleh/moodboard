// Fixed side panel that displays and edits properties of the selected board object.
// Common properties (position, size, rotation) are always shown.
// Appearance fields are rendered dynamically based on the object type.

import { BoardObject, PropertyField } from '../board/BoardObject'
import { loadFont } from '../lib/fonts'
import { FontPicker } from './FontPicker'
import { ColorPicker } from './ColorPicker'

export class PropertiesPanel {
    readonly el: HTMLElement
    onDelete: (() => void) | null = null
    object: BoardObject | null = null
    private appearanceEl: HTMLElement
    private inputs: {
        x: HTMLInputElement
        y: HTMLInputElement
        width: HTMLInputElement
        height: HTMLInputElement
        rotation: HTMLInputElement
    }
    private docked = true
    private tabEl: HTMLElement
    private snapPreviewEl: HTMLElement

    constructor(container: HTMLElement) {
        this.el = document.createElement('div')
        this.el.id = 'properties-panel'
        this.el.className = 'hidden docked'
        this.el.innerHTML = `
            <div class="panel-header">
                <div class="panel-drag-handle"></div>
                <button class="panel-undock-btn" title="Pop out">↗</button>
            </div>
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
                <input type="text" inputmode="numeric" id="prop-rotation" />
            </div>
            <div id="prop-appearance"></div>
            <button id="prop-delete">Delete</button>
            <div class="panel-resize-left"></div>
            <div class="panel-resize-right"></div>
            <div class="panel-resize-top"></div>
            <div class="panel-resize-bottom"></div>
            <div class="panel-resize-tl"></div>
            <div class="panel-resize-tr"></div>
            <div class="panel-resize-br"></div>
            <div class="panel-resize-bl"></div>
        `

        this.appearanceEl = this.el.querySelector('#prop-appearance') as HTMLElement
        const deleteBtn = this.el.querySelector('#prop-delete') as HTMLButtonElement
        deleteBtn.addEventListener('click', () => this.onDelete?.())

        this.inputs = {
            x: this.el.querySelector('#prop-x') as HTMLInputElement,
            y: this.el.querySelector('#prop-y') as HTMLInputElement,
            width: this.el.querySelector('#prop-width') as HTMLInputElement,
            height: this.el.querySelector('#prop-height') as HTMLInputElement,
            rotation: this.el.querySelector('#prop-rotation') as HTMLInputElement,
        }

        // Prevent wheel events from reaching the board's pan/zoom handler while the
        // panel itself can still scroll.
        this.el.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true })

        // stopPropagation prevents the board's "click outside → deselect" listener from firing.
        this.el.addEventListener('mousedown', (e) => e.stopPropagation())

        const undockBtn = this.el.querySelector('.panel-undock-btn') as HTMLButtonElement
        undockBtn.addEventListener('click', () => {
            this.setDocked(false)
            this.el.style.left = ''
            this.el.style.top = ''
            this.el.style.right = ''
        })

        const handleEl = this.el.querySelector('.panel-drag-handle') as HTMLElement
        handleEl.addEventListener('mousedown', (e) => {
            if (this.docked) this.setDocked(false)

            // getBoundingClientRect gives viewport coords matching clientX/Y,
            // avoiding stale offsetLeft after a class/style change.
            const rect = this.el.getBoundingClientRect()
            this.el.style.left = `${rect.left}px`
            this.el.style.top = `${rect.top}px`
            this.el.style.right = 'auto'

            const cursorOffsetX = e.clientX - rect.left
            const cursorOffsetY = e.clientY - rect.top

            const margin = 8
            const snapThreshold = 60
            let inSnapZone = false
            const onMove = (e: MouseEvent) => {
                const maxX = window.innerWidth - this.el.offsetWidth - margin
                const maxY = window.innerHeight - this.el.offsetHeight - margin
                const x = Math.min(Math.max(margin, e.clientX - cursorOffsetX), maxX)
                const y = Math.min(Math.max(margin, e.clientY - cursorOffsetY), maxY)
                this.el.style.left = `${x}px`
                this.el.style.top = `${y}px`

                const entering = x + this.el.offsetWidth >= window.innerWidth - snapThreshold
                if (entering !== inSnapZone) {
                    inSnapZone = entering
                    if (inSnapZone) {
                        this.snapPreviewEl.style.width = `${this.el.offsetWidth}px`
                    }
                    this.snapPreviewEl.classList.toggle('hidden', !inSnapZone)
                }
            }

            const onUp = () => {
                window.removeEventListener('mousemove', onMove)
                window.removeEventListener('mouseup', onUp)
                this.snapPreviewEl.classList.add('hidden')
                if (inSnapZone) this.setDocked(true)
            }

            window.addEventListener('mousemove', onMove)
            window.addEventListener('mouseup', onUp)
        })

        // Right-edge tab — visible only when panel is floating, click re-docks.
        this.tabEl = document.createElement('div')
        this.tabEl.className = 'panel-dock-tab hidden'
        this.tabEl.title = 'Dock panel to right'
        this.tabEl.addEventListener('click', () => this.setDocked(true))
        this.tabEl.addEventListener('mousedown', (e) => e.stopPropagation())

        // Ghost preview of the docked position, shown while dragging near the right edge.
        this.snapPreviewEl = document.createElement('div')
        this.snapPreviewEl.className = 'panel-snap-preview hidden'

        container.appendChild(this.el)
        container.appendChild(this.tabEl)
        container.appendChild(this.snapPreviewEl)
        this.setupCommonEvents()
        this.setupResizeHandles()
    }

    private setupCommonEvents() {
        const { x, y, width, height, rotation } = this.inputs

        for (const input of [x, y, width, height]) {
            input.addEventListener('focus', () => input.select())
        }

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
        rotation.addEventListener('focus', () => {
            rotation.value = rotation.value.replace('°', '')
            rotation.select()
        })
        rotation.addEventListener('blur', () => {
            const val = parseFloat(rotation.value)
            rotation.value = isNaN(val) ? '0°' : `${Math.round(val)}°`
        })
        rotation.addEventListener('input', () => {
            const val = parseFloat(rotation.value.replace('°', ''))
            if (!isNaN(val)) this.object?.setRotation(val)
        })
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
            if (field.type === 'section') {
                const sec = document.createElement('div')
                sec.className = 'prop-section'
                sec.textContent = field.label
                this.appearanceEl.appendChild(sec)
                continue
            }

            const row = document.createElement('div')
            row.className = 'prop-row'

            const label = document.createElement('label')
            label.textContent = field.label
            row.appendChild(label)

            if (field.type === 'slider') {
                const slider = document.createElement('input')
                slider.type = 'range'
                slider.min = String(field.min)
                slider.max = String(field.max)
                slider.step = String(field.step ?? 1)
                slider.value = String(field.value)
                slider.className = 'color-picker-alpha-slider'
                const readout = document.createElement('span')
                readout.className = 'color-picker-alpha-label'
                readout.textContent = `${field.value}%`
                slider.addEventListener('input', () => {
                    readout.textContent = `${slider.value}%`
                    this.object?.setAppearanceProperty(field.key, Number(slider.value))
                })
                row.appendChild(slider)
                row.appendChild(readout)
            }

            if (field.type === 'number') {
                const input = document.createElement('input')
                input.type = 'number'
                input.value = String(field.value)
                if (field.min !== undefined) input.min = String(field.min)
                if (field.max !== undefined) input.max = String(field.max)
                if (field.step !== undefined) input.step = String(field.step)
                input.addEventListener('focus', () => input.select())
                input.addEventListener('input', () =>
                    this.object?.setAppearanceProperty(field.key, Number(input.value))
                )
                row.appendChild(input)
            }

            if (field.type === 'text') {
                const input = document.createElement('input')
                input.type = 'text'
                input.className = 'prop-text-wide'
                input.value = field.value
                if (field.placeholder) input.placeholder = field.placeholder
                input.addEventListener('focus', () => input.select())
                input.addEventListener('change', () =>
                    this.object?.setAppearanceProperty(field.key, input.value)
                )
                row.appendChild(input)

                if (field.allowFilePick) {
                    const fileInput = document.createElement('input')
                    fileInput.type = 'file'
                    fileInput.accept = 'image/*'
                    fileInput.className = 'hidden'
                    const browseBtn = document.createElement('button')
                    browseBtn.textContent = '…'
                    browseBtn.title = 'Browse file'
                    browseBtn.addEventListener('click', () => fileInput.click())
                    fileInput.addEventListener('change', () => {
                        const file = fileInput.files?.[0]
                        if (!file) return
                        const url = URL.createObjectURL(file)
                        input.value = url
                        this.object?.setAppearanceProperty(field.key, url)
                    })
                    row.appendChild(browseBtn)
                    row.appendChild(fileInput)
                }
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

    private setupResizeHandles() {
        const minW = 180
        const minH = 120

        const startLeftResize = (e: MouseEvent) => {
            e.stopPropagation()
            const startX = e.clientX
            const startW = this.el.offsetWidth
            const startLeft = this.el.getBoundingClientRect().left
            const onMove = (e: MouseEvent) => {
                const w = Math.max(minW, startW - (e.clientX - startX))
                this.el.style.width = `${w}px`
                if (!this.docked) {
                    this.el.style.left = `${startLeft + startW - w}px`
                    this.el.style.right = 'auto'
                }
            }
            const onUp = () => {
                window.removeEventListener('mousemove', onMove)
                window.removeEventListener('mouseup', onUp)
            }
            window.addEventListener('mousemove', onMove)
            window.addEventListener('mouseup', onUp)
        }

        const startRightResize = (e: MouseEvent) => {
            e.stopPropagation()
            const startX = e.clientX
            const startW = this.el.offsetWidth
            const onMove = (e: MouseEvent) => {
                const w = Math.max(minW, startW + (e.clientX - startX))
                this.el.style.width = `${w}px`
            }
            const onUp = () => {
                window.removeEventListener('mousemove', onMove)
                window.removeEventListener('mouseup', onUp)
            }
            window.addEventListener('mousemove', onMove)
            window.addEventListener('mouseup', onUp)
        }

        const startTopResize = (e: MouseEvent) => {
            e.stopPropagation()
            const startY = e.clientY
            const startH = this.el.offsetHeight
            const startTop = this.el.getBoundingClientRect().top
            const onMove = (e: MouseEvent) => {
                const h = Math.max(minH, startH - (e.clientY - startY))
                this.el.style.height = `${h}px`
                this.el.style.top = `${startTop + startH - h}px`
            }
            const onUp = () => {
                window.removeEventListener('mousemove', onMove)
                window.removeEventListener('mouseup', onUp)
            }
            window.addEventListener('mousemove', onMove)
            window.addEventListener('mouseup', onUp)
        }

        const startBottomResize = (e: MouseEvent) => {
            e.stopPropagation()
            const startY = e.clientY
            const startH = this.el.offsetHeight
            const onMove = (e: MouseEvent) => {
                const h = Math.max(minH, startH + (e.clientY - startY))
                this.el.style.height = `${h}px`
            }
            const onUp = () => {
                window.removeEventListener('mousemove', onMove)
                window.removeEventListener('mouseup', onUp)
            }
            window.addEventListener('mousemove', onMove)
            window.addEventListener('mouseup', onUp)
        }

        const wire = (sel: string, ...fns: Array<(e: MouseEvent) => void>) => {
            const el = this.el.querySelector(sel) as HTMLElement
            el.addEventListener('mousedown', (e) => fns.forEach((fn) => fn(e)))
        }

        wire('.panel-resize-left', startLeftResize)
        wire('.panel-resize-right', startRightResize)
        wire('.panel-resize-top', startTopResize)
        wire('.panel-resize-bottom', startBottomResize)
        wire('.panel-resize-tl', startLeftResize, startTopResize)
        wire('.panel-resize-tr', startRightResize, startTopResize)
        wire('.panel-resize-br', startRightResize, startBottomResize)
        wire('.panel-resize-bl', startLeftResize, startBottomResize)
    }

    private setDocked(docked: boolean) {
        this.docked = docked
        if (docked) {
            this.el.classList.add('docked')
            this.el.style.left = ''
            this.el.style.top = ''
            this.el.style.right = ''
            this.el.style.height = ''
            this.tabEl.classList.add('hidden')
        } else {
            this.el.classList.remove('docked')
            // Inline position is set by the drag handler immediately after this call.
            if (!this.el.classList.contains('hidden')) {
                this.tabEl.classList.remove('hidden')
            }
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
        if (!this.docked) this.tabEl.classList.remove('hidden')
    }

    private sync() {
        if (!this.object) return
        const pos = this.object.getPosition()
        const size = this.object.getSize()

        this.inputs.x.value = String(Math.round(pos.x))
        this.inputs.y.value = String(Math.round(pos.y))
        this.inputs.width.value = String(Math.round(size.width))
        this.inputs.height.value = String(Math.round(size.height))
        // Skip sync while the field is focused — the user is mid-edit without the suffix
        if (document.activeElement !== this.inputs.rotation) {
            this.inputs.rotation.value = `${Math.round(this.object.getRotation())}°`
        }
    }

    hide() {
        if (this.object) this.object.onChange = null
        this.object = null
        this.el.classList.add('hidden')
        this.tabEl.classList.add('hidden')
    }
}
