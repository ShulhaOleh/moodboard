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
    private commonPropsEl: HTMLElement
    private deleteBtnEl: HTMLButtonElement
    private inputs: {
        x: HTMLInputElement
        y: HTMLInputElement
        width: HTMLInputElement
        height: HTMLInputElement
        rotation: HTMLInputElement
    }
    private nameInputEl: HTMLInputElement
    private docked = true
    private snapPreviewEl: HTMLElement
    private expandBtnEl: HTMLElement

    constructor(container: HTMLElement) {
        this.el = document.createElement('div')
        this.el.id = 'properties-panel'
        this.el.className = 'hidden docked'
        this.el.innerHTML = `
            <div class="panel-header">
                <div class="panel-drag-handle"></div>
                <button class="panel-undock-btn" title="Pop out">↗</button>
                <span class="layers-title">Properties</span>
                <button class="panel-collapse-btn" title="Hide panel">›</button>
            </div>
            <div class="panel-content">
                <div class="prop-name-row">
                    <input type="text" id="prop-name" placeholder="Name" />
                </div>
                <div class="panel-common-props">
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
                </div>
                <div id="prop-appearance"></div>
                <button id="prop-delete">Delete</button>
            </div>
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
        this.commonPropsEl = this.el.querySelector('.panel-common-props') as HTMLElement
        this.deleteBtnEl = this.el.querySelector('#prop-delete') as HTMLButtonElement
        this.nameInputEl = this.el.querySelector('#prop-name') as HTMLInputElement
        this.deleteBtnEl.addEventListener('click', () => this.onDelete?.())

        this.inputs = {
            x: this.el.querySelector('#prop-x') as HTMLInputElement,
            y: this.el.querySelector('#prop-y') as HTMLInputElement,
            width: this.el.querySelector('#prop-width') as HTMLInputElement,
            height: this.el.querySelector('#prop-height') as HTMLInputElement,
            rotation: this.el.querySelector('#prop-rotation') as HTMLInputElement,
        }

        this.wrapNumberInput(this.inputs.x)
        this.wrapNumberInput(this.inputs.y)
        this.wrapNumberInput(this.inputs.width)
        this.wrapNumberInput(this.inputs.height)

        // Prevent wheel events from reaching the board's pan/zoom handler while the
        // panel itself can still scroll.
        this.el.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true })

        // stopPropagation prevents the board's "click outside → deselect" listener from firing.
        this.el.addEventListener('mousedown', (e) => e.stopPropagation())

        const undockBtn = this.el.querySelector('.panel-undock-btn') as HTMLButtonElement
        undockBtn.addEventListener('click', () => {
            this.setDocked(false)
        })

        const handleEl = this.el.querySelector('.panel-drag-handle') as HTMLElement
        handleEl.addEventListener('mousedown', (e) => {
            this.el.classList.add('panel-no-transition')
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
                    this.snapPreviewEl.classList.toggle('is-visible', inSnapZone)
                }
            }

            const onUp = () => {
                window.removeEventListener('mousemove', onMove)
                window.removeEventListener('mouseup', onUp)
                this.snapPreviewEl.classList.remove('is-visible')
                // Remove no-transition before setDocked so the snap plays the FLIP animation.
                this.el.classList.remove('panel-no-transition')
                if (inSnapZone) this.setDocked(true)
            }

            window.addEventListener('mousemove', onMove)
            window.addEventListener('mouseup', onUp)
        })

        const collapseBtn = this.el.querySelector('.panel-collapse-btn') as HTMLButtonElement
        collapseBtn.addEventListener('click', () => this.setCollapsed(true))

        // Mirror of the collapse button, fixed at the same screen position.
        // Visible only when the panel is docked and collapsed, so there is always
        // a button at that location regardless of panel state.
        this.expandBtnEl = document.createElement('button')
        this.expandBtnEl.className = 'panel-expand-btn hidden'
        this.expandBtnEl.title = 'Show panel'
        this.expandBtnEl.textContent = '‹'
        this.expandBtnEl.addEventListener('click', () => this.setCollapsed(false))
        this.expandBtnEl.addEventListener('mousedown', (e) => e.stopPropagation())

        // Ghost preview of the docked position, shown while dragging near the right edge.
        this.snapPreviewEl = document.createElement('div')
        this.snapPreviewEl.className = 'panel-snap-preview'

        container.appendChild(this.el)
        container.appendChild(this.expandBtnEl)
        container.appendChild(this.snapPreviewEl)
        this.setupCommonEvents()
        this.setupResizeHandles()
    }

    private setupCommonEvents() {
        const { x, y, width, height, rotation } = this.inputs

        this.nameInputEl.addEventListener('focus', () => this.nameInputEl.select())
        this.nameInputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.nameInputEl.blur()
            if (e.key === 'Escape') {
                this.nameInputEl.value = this.object?.name ?? ''
                this.nameInputEl.blur()
            }
        })
        this.nameInputEl.addEventListener('change', () => {
            const val = this.nameInputEl.value.trim()
            if (this.object) this.object.setName(val || this.object.name)
        })

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

            if (field.type === 'button') {
                const btn = document.createElement('button')
                btn.className = field.destructive
                    ? 'prop-action-btn is-destructive'
                    : 'prop-action-btn'
                btn.textContent = field.label
                btn.addEventListener('click', () =>
                    this.object?.setAppearanceProperty(field.key, '')
                )
                this.appearanceEl.appendChild(btn)
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
                this.wrapNumberInput(input)
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
                    browseBtn.className = 'prop-browse-btn'
                    browseBtn.textContent = '…'
                    browseBtn.title = 'Browse file'
                    browseBtn.addEventListener('click', () => fileInput.click())
                    fileInput.addEventListener('change', () => {
                        const file = fileInput.files?.[0]
                        if (!file) return
                        if (this.object?.setFileProperty) {
                            input.value = file.name
                            this.object.setFileProperty(field.key, file)
                        } else {
                            const url = URL.createObjectURL(file)
                            input.value = url
                            this.object?.setAppearanceProperty(field.key, url)
                        }
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

                if (field.themeDefault) {
                    const themeBtn = document.createElement('button')
                    themeBtn.className = 'prop-color-theme-btn'
                    themeBtn.title = 'Set to theme background'
                    themeBtn.innerHTML = `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2Zm0 1.5A4.5 4.5 0 0 1 8 12V3.5Z"/></svg>`
                    themeBtn.addEventListener('click', () => {
                        const color = getComputedStyle(document.documentElement)
                            .getPropertyValue('--color-surface')
                            .trim()
                        this.object?.setAppearanceProperty(field.key, color)
                        picker.setValue(color)
                    })
                    row.appendChild(themeBtn)
                }

                if (field.clearable) {
                    const clear = document.createElement('button')
                    clear.className = 'prop-color-clear-btn'
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

    private wrapNumberInput(input: HTMLInputElement): void {
        const wrap = document.createElement('div')
        wrap.className = 'number-input-wrap'
        input.parentNode!.insertBefore(wrap, input)
        wrap.appendChild(input)

        const btns = document.createElement('div')
        btns.className = 'number-spin-btns'

        for (const dir of [1, -1] as const) {
            const btn = document.createElement('button')
            btn.className = 'number-spin-btn'
            btn.tabIndex = -1
            btn.textContent = dir === 1 ? '▴' : '▾'
            btn.addEventListener('mousedown', (e) => {
                e.preventDefault()
                this.stepInput(input, dir)
            })
            btns.appendChild(btn)
        }

        wrap.appendChild(btns)
    }

    private stepInput(input: HTMLInputElement, dir: 1 | -1): void {
        const step = parseFloat(input.step) || 1
        const val = parseFloat(input.value) || 0
        let next = val + dir * step
        if (input.min !== '') next = Math.max(parseFloat(input.min), next)
        if (input.max !== '') next = Math.min(parseFloat(input.max), next)
        const decimals = (step.toString().split('.')[1] ?? '').length
        input.value = next.toFixed(decimals)
        input.dispatchEvent(new Event('input', { bubbles: true }))
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
        // FLIP animation: record current visual rect before applying the state change.
        const animating =
            !this.el.classList.contains('panel-no-transition') &&
            !this.el.classList.contains('hidden')
        const first = animating ? this.el.getBoundingClientRect() : null

        this.docked = docked
        if (docked) {
            this.el.classList.add('docked')
            this.el.classList.remove('docked-collapsed')
            this.el.style.left = ''
            this.el.style.top = ''
            this.el.style.right = ''
            this.el.style.height = ''
            this.expandBtnEl.classList.add('hidden')
        } else {
            this.el.classList.remove('docked', 'docked-collapsed')
            this.expandBtnEl.classList.add('hidden')
            // Clear any inline position so CSS default (top/right 16px) takes over;
            // the drag handler will override with explicit px coords immediately after.
            this.el.style.left = ''
            this.el.style.top = ''
            this.el.style.right = ''
        }

        if (!first) return
        const last = this.el.getBoundingClientRect()
        if (last.width === 0 || last.height === 0) return

        const dx = first.left - last.left
        const dy = first.top - last.top
        const scaleX = first.width / last.width
        const scaleY = first.height / last.height

        // When undocking, resize handles that were hidden by .docked suddenly appear.
        // Keep them invisible until the FLIP animation finishes so they don't flash in.
        let hiddenHandles: HTMLElement[] = []
        if (!docked) {
            hiddenHandles = Array.from(
                this.el.querySelectorAll<HTMLElement>(
                    '.panel-resize-top, .panel-resize-tl, .panel-resize-tr, ' +
                        '.panel-resize-right, .panel-resize-bottom, .panel-resize-br, .panel-resize-bl'
                )
            )
            hiddenHandles.forEach((h) => (h.style.visibility = 'hidden'))
        }

        // Apply the inverted transform so it visually starts at the old position/size.
        this.el.classList.add('panel-no-transition')
        this.el.style.transformOrigin = '0 0'
        this.el.style.transform = `translate(${dx}px, ${dy}px) scaleX(${scaleX}) scaleY(${scaleY})`
        void this.el.offsetHeight // force reflow to commit the starting state

        // Animate to the natural (new) position.
        this.el.classList.remove('panel-no-transition')
        this.el.style.transform = ''

        if (hiddenHandles.length > 0) {
            this.el.addEventListener(
                'transitionend',
                () => hiddenHandles.forEach((h) => (h.style.visibility = '')),
                { once: true }
            )
        }
    }

    private setCollapsed(collapsed: boolean) {
        this.el.classList.toggle('docked-collapsed', collapsed)
        this.expandBtnEl.classList.toggle('hidden', !collapsed)
    }

    // Binds to a board object. Appearance fields are rebuilt for the new type,
    // then onChange keeps inputs in sync as the user drags or resizes.
    show(object: BoardObject) {
        this.object = object
        this.commonPropsEl.style.display = object.omitCommonProps ? 'none' : ''
        this.deleteBtnEl.style.display = object.hideDelete ? 'none' : ''
        ;(this.inputs.height.closest('.prop-row') as HTMLElement).style.display = object.fixedHeight
            ? 'none'
            : ''
        this.renderAppearanceFields(object.getAppearanceFields())
        this.nameInputEl.value = object.name
        ;(this.nameInputEl.closest('.prop-name-row') as HTMLElement).style.display = object.hideName
            ? 'none'
            : ''
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
        // Skip sync while the field is focused — the user is mid-edit without the suffix
        if (document.activeElement !== this.inputs.rotation) {
            this.inputs.rotation.value = `${Math.round(this.object.getRotation())}°`
        }
        if (document.activeElement !== this.nameInputEl) {
            this.nameInputEl.value = this.object.name
        }
    }

    hide() {
        if (this.object) this.object.onChange = null
        this.object = null
        this.el.classList.add('hidden')
    }
}
