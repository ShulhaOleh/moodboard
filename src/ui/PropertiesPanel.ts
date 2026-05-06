// Fixed side panel that displays and edits properties of the selected board object.
// Common properties (position, size, rotation) are always shown.
// Appearance fields are rendered dynamically based on the object type.
// Multi-select: shows the intersection of all selected objects' fields; differing
// values display as "Mixed" and accept arithmetic expressions (+5, -10, *2, /3).

import { BoardObject, PropertyField } from '../board/BoardObject'
import { loadFont } from '../lib/fonts'
import { FontPicker } from './FontPicker'
import { ColorPicker } from './ColorPicker'
import { ICON_CONTRAST } from '../lib/icons'

// Evaluates an expression like "+5", "-10", "*2", "/3", or a plain number against
// a current value. Returns NaN when the input cannot be parsed.
function parseOpValue(raw: string, current: number): number {
    const s = raw.trim()
    if (/^[+\-*/]/.test(s)) {
        const operand = parseFloat(s.slice(1))
        if (isNaN(operand)) return NaN
        if (s[0] === '+') return current + operand
        if (s[0] === '-') return current - operand
        if (s[0] === '*') return current * operand
        if (s[0] === '/') return operand !== 0 ? current / operand : current
    }
    return parseFloat(s)
}

// Returns the intersection of appearance field keys across all sets, together with
// which keys carry different values (mixed) across the given objects.
function intersectAppearanceFields(fieldSets: PropertyField[][]): {
    fields: PropertyField[]
    mixed: Set<string>
} {
    if (fieldSets.length === 0) return { fields: [], mixed: new Set() }

    // Build key → values from the first set, then prune keys absent in any other set.
    const keyValues = new Map<string, (string | number)[]>()
    for (const f of fieldSets[0]) {
        if ('key' in f && 'value' in f)
            keyValues.set(f.key, [(f as { key: string; value: string | number }).value])
    }
    for (let i = 1; i < fieldSets.length; i++) {
        for (const key of [...keyValues.keys()]) {
            const match = fieldSets[i].find((f) => 'key' in f && f.key === key)
            if (!match) {
                keyValues.delete(key)
            } else if ('value' in match) {
                keyValues.get(key)!.push((match as { value: string | number }).value)
            }
        }
    }

    const mixed = new Set<string>()
    for (const [key, values] of keyValues) {
        if (!values.every((v) => v === values[0])) mixed.add(key)
    }

    // Re-walk the first set to preserve sections that precede included keys.
    const included = new Set(keyValues.keys())
    const fields: PropertyField[] = []
    let pendingSection: PropertyField | null = null
    for (const f of fieldSets[0]) {
        if (f.type === 'section') {
            pendingSection = f
        } else if ('key' in f && included.has(f.key)) {
            if (pendingSection) {
                fields.push(pendingSection)
                pendingSection = null
            }
            fields.push(f)
        }
    }
    return { fields, mixed }
}

export class PropertiesPanel {
    readonly el: HTMLElement
    onDelete: (() => void) | null = null
    object: BoardObject | null = null
    // Set when multiple blocks are selected simultaneously.
    private objects: BoardObject[] | null = null
    private multiOnChanges: ((() => void) | null)[] = []
    private multiCleanups: (() => void)[] = []
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
    private prevOnChange: (() => void) | null = null
    private fieldUpdaters: Map<string, (value: string | number) => void> = new Map()
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
            // Defer so the browser's mouseup cursor-placement fires first, then we
            // re-select — otherwise mouseup deselects what focus just selected.
            input.addEventListener('focus', () => setTimeout(() => input.select(), 0))
        }

        // Single-select live-update handlers — no-ops when this.object is null (multi mode).
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
            setTimeout(() => rotation.select(), 0)
        })
        rotation.addEventListener('blur', () => {
            // Single mode: reformat with degree suffix.
            if (!this.object) return
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
    private renderAppearanceFields(
        fields: PropertyField[],
        onApply: (key: string, value: string | number) => void
    ) {
        this.fieldUpdaters.clear()
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
                btn.addEventListener('click', () => onApply(field.key, ''))
                this.appearanceEl.appendChild(btn)
                continue
            }

            if (field.type === 'node') {
                this.appearanceEl.appendChild(field.node)
                field.onMount?.()
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
                    onApply(field.key, Number(slider.value))
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
                input.addEventListener('input', () => onApply(field.key, Number(input.value)))
                row.appendChild(input)
                this.wrapNumberInput(input)
                this.fieldUpdaters.set(field.key, (v) => {
                    if (document.activeElement !== input) input.value = String(v)
                })
            }

            if (field.type === 'text') {
                const input = document.createElement('input')
                input.type = 'text'
                input.className = 'prop-text-wide'
                input.value = field.value
                if (field.placeholder) input.placeholder = field.placeholder
                input.addEventListener('focus', () => input.select())
                input.addEventListener('change', () => onApply(field.key, input.value))
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
                            onApply(field.key, url)
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
                select.addEventListener('change', () => onApply(field.key, select.value))
                row.appendChild(select)
                this.fieldUpdaters.set(field.key, (v) => {
                    select.value = String(v)
                })
            }

            if (field.type === 'font') {
                const picker = new FontPicker(field.value, (family) => {
                    loadFont(family)
                    onApply(field.key, family)
                })
                picker.el.classList.add('prop-font-picker')
                row.appendChild(picker.el)
                this.fieldUpdaters.set(field.key, (v) => picker.setValue(String(v)))
            }

            if (field.type === 'color') {
                const picker = new ColorPicker(field.value, (color) => onApply(field.key, color))
                row.appendChild(picker.el)
                this.fieldUpdaters.set(field.key, (v) => picker.setValue(String(v)))

                if (field.themeDefault) {
                    const themeBtn = document.createElement('button')
                    themeBtn.className = 'prop-color-theme-btn'
                    themeBtn.title = 'Set to theme background'
                    themeBtn.innerHTML = ICON_CONTRAST
                    themeBtn.addEventListener('click', () => {
                        const color = getComputedStyle(document.documentElement)
                            .getPropertyValue('--color-surface')
                            .trim()
                        onApply(field.key, color)
                        picker.setValue(color)
                    })
                    row.appendChild(themeBtn)
                }

                if (field.clearable) {
                    const clear = document.createElement('button')
                    clear.className = 'prop-color-clear-btn'
                    clear.textContent = '✕'
                    clear.addEventListener('click', () => {
                        onApply(field.key, 'transparent')
                        picker.setValue('transparent')
                    })
                    row.appendChild(clear)
                }
            }

            this.appearanceEl.appendChild(row)
        }
    }

    // Renders appearance fields for a multi-select. Mixed fields accept arithmetic
    // expressions; absolute values apply uniformly to all selected objects.
    private renderMultiAppearanceFields(
        fields: PropertyField[],
        mixed: Set<string>,
        onApply: (key: string, raw: string | number) => void
    ) {
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

            // Button, text, and node fields are not meaningful for multi-select.
            if (field.type === 'button' || field.type === 'text' || field.type === 'node') continue

            const isMixed = 'key' in field && mixed.has(field.key)

            const row = document.createElement('div')
            row.className = isMixed ? 'prop-row is-mixed' : 'prop-row'

            const label = document.createElement('label')
            label.textContent = field.label
            row.appendChild(label)

            if (field.type === 'number') {
                const input = document.createElement('input')
                // Use text type so the browser accepts expression strings like "+5".
                input.type = 'text'
                input.inputMode = 'numeric'
                if (field.min !== undefined) input.dataset.min = String(field.min)
                if (field.max !== undefined) input.dataset.max = String(field.max)
                if (field.step !== undefined) input.dataset.step = String(field.step)
                input.value = isMixed ? 'Mixed' : String(field.value)
                input.addEventListener('focus', () => setTimeout(() => input.select(), 0))

                const commit = () => {
                    const raw = input.value.replace(/^Mixed/i, '').trim()
                    if (!raw) return
                    onApply(field.key, raw)
                    // Refresh the displayed value from the first object's updated field.
                    if (this.objects) {
                        const vals = this.objects.map((o) => {
                            const f = o
                                .getAppearanceFields()
                                .find((ff) => 'key' in ff && ff.key === field.key)
                            return f && 'value' in f ? (f as { value: number }).value : NaN
                        })
                        const allSame = vals.length > 0 && vals.every((v) => v === vals[0])
                        if (allSame && !isNaN(vals[0])) {
                            input.value = String(vals[0])
                            row.classList.remove('is-mixed')
                        } else {
                            input.value = 'Mixed'
                            row.classList.add('is-mixed')
                        }
                    }
                }
                input.addEventListener('change', commit)
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        commit()
                        input.blur()
                    }
                    if (e.key === 'Escape') {
                        input.value = isMixed ? 'Mixed' : String(field.value)
                        input.blur()
                    }
                })
                row.appendChild(input)
                this.wrapNumberInput(input)
            }

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
                readout.textContent = isMixed ? 'Mixed' : `${field.value}%`
                slider.addEventListener('input', () => {
                    readout.textContent = `${slider.value}%`
                    onApply(field.key, Number(slider.value))
                })
                row.appendChild(slider)
                row.appendChild(readout)
            }

            if (field.type === 'color') {
                const picker = new ColorPicker(field.value, (color) => onApply(field.key, color))
                if (isMixed) picker.el.classList.add('is-mixed')
                row.appendChild(picker.el)
                if (field.clearable) {
                    const clear = document.createElement('button')
                    clear.className = 'prop-color-clear-btn'
                    clear.textContent = '✕'
                    clear.addEventListener('click', () => {
                        onApply(field.key, 'transparent')
                        picker.setValue('transparent')
                    })
                    row.appendChild(clear)
                }
            }

            if (field.type === 'font') {
                const picker = new FontPicker(field.value, (family) => {
                    loadFont(family)
                    onApply(field.key, family)
                })
                picker.el.classList.add('prop-font-picker')
                if (isMixed) picker.el.classList.add('is-mixed')
                row.appendChild(picker.el)
            }

            if (field.type === 'select') {
                const select = document.createElement('select')
                select.className = 'prop-select'
                if (isMixed) {
                    const opt = document.createElement('option')
                    opt.value = ''
                    opt.textContent = 'Mixed'
                    opt.selected = true
                    select.appendChild(opt)
                }
                for (const option of field.options) {
                    const opt = document.createElement('option')
                    opt.value = option.value
                    opt.textContent = option.label
                    if (!isMixed && option.value === field.value) opt.selected = true
                    select.appendChild(opt)
                }
                select.addEventListener('change', () => {
                    if (select.value) onApply(field.key, select.value)
                })
                row.appendChild(select)
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

            let timeout: ReturnType<typeof setTimeout> | null = null
            let interval: ReturnType<typeof setInterval> | null = null

            btn.addEventListener('mousedown', (e) => {
                e.preventDefault()
                this.stepInput(input, dir)
                timeout = setTimeout(() => {
                    interval = setInterval(() => this.stepInput(input, dir), 80)
                }, 500)
            })

            const stop = () => {
                if (timeout !== null) {
                    clearTimeout(timeout)
                    timeout = null
                }
                if (interval !== null) {
                    clearInterval(interval)
                    interval = null
                }
            }
            btn.addEventListener('mouseup', stop)
            btn.addEventListener('mouseleave', stop)

            btns.appendChild(btn)
        }

        wrap.appendChild(btns)
    }

    private stepInput(input: HTMLInputElement, dir: 1 | -1): void {
        // Read step from attribute or data attribute (text inputs don't honour the step attribute).
        const step = parseFloat(input.step || input.dataset.step || '1') || 1
        const decimals = (step.toString().split('.')[1] ?? '').length

        if (input.value === 'Mixed') {
            // Mixed state: emit a relative operation so each object shifts by one step.
            input.value = dir === 1 ? `+${step.toFixed(decimals)}` : `-${step.toFixed(decimals)}`
            input.dispatchEvent(new Event('change', { bubbles: true }))
            // Let the change handler (commit / applyGeometryToAll) restore the value.
            return
        }

        const val = parseFloat(input.value) || 0
        let next = val + dir * step
        const min = input.min || input.dataset.min
        const max = input.max || input.dataset.max
        if (min !== '' && min !== undefined) next = Math.max(parseFloat(min), next)
        if (max !== '' && max !== undefined) next = Math.min(parseFloat(max), next)
        input.value = next.toFixed(decimals)
        input.dispatchEvent(new Event('input', { bubbles: true }))
        // Also fire change so multi-mode commit handlers pick it up.
        input.dispatchEvent(new Event('change', { bubbles: true }))
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

    // Updates each appearance field's displayed value in-place without rebuilding the DOM.
    // Called when onAppearanceChange fires (e.g. cursor moves inside a text editor).
    private refreshAppearanceValues() {
        if (!this.object) return
        for (const field of this.object.getAppearanceFields()) {
            if (field.type === 'section' || field.type === 'button' || field.type === 'node')
                continue
            this.fieldUpdaters.get(field.key)?.(field.value)
        }
    }

    // Binds to a single board object. Appearance fields are rebuilt for the new type,
    // then onChange keeps inputs in sync as the user drags or resizes.
    show(object: BoardObject) {
        this.cleanupMulti()
        // Restore the previous object's callbacks before rebinding.
        if (this.object) {
            this.object.onChange = this.prevOnChange
            this.object.onAppearanceChange = null
        }
        this.object = object
        this.commonPropsEl.style.display = object.omitCommonProps ? 'none' : ''
        this.deleteBtnEl.style.display = object.hideDelete ? 'none' : ''
        ;(this.inputs.height.closest('.prop-row') as HTMLElement).style.display = object.fixedHeight
            ? 'none'
            : ''
        this.renderAppearanceFields(object.getAppearanceFields(), (key, value) =>
            this.object?.setAppearanceProperty(key, value)
        )
        this.nameInputEl.value = object.name
        ;(this.nameInputEl.closest('.prop-name-row') as HTMLElement).style.display = object.hideName
            ? 'none'
            : ''
        this.sync()
        // Capture the current onChange in a local so the closure sees the value at
        // bind time, not at call time — this.prevOnChange is mutable and would cause
        // recursion if read from the closure after a subsequent show() call.
        const prevOnChange = object.onChange
        this.prevOnChange = prevOnChange
        object.onChange = () => {
            this.sync()
            prevOnChange?.()
        }
        object.onAppearanceChange = () => this.refreshAppearanceValues()
        this.el.classList.remove('hidden')
    }

    // Binds to multiple selected objects. Renders the field intersection with mixed
    // state for differing values. Arithmetic expressions (+5, -10, *2, /3) apply
    // relative to each object's current value; plain numbers set all to the same value.
    showMultiple(objects: BoardObject[]) {
        this.cleanupMulti()
        if (this.object) {
            this.object.onChange = this.prevOnChange
            this.prevOnChange = null
            this.object = null
        }
        this.objects = objects

        const { fields, mixed } = intersectAppearanceFields(
            objects.map((o) => o.getAppearanceFields())
        )
        this.renderMultiAppearanceFields(fields, mixed, (key, raw) =>
            this.applyAppearanceToAll(key, raw)
        )

        // Switch geometry inputs to text type so they can accept expression strings.
        for (const input of [this.inputs.x, this.inputs.y, this.inputs.width, this.inputs.height]) {
            input.type = 'text'
        }

        // Wire commit handlers for all five geometry inputs.
        const addGeo = (
            input: HTMLInputElement,
            key: 'x' | 'y' | 'width' | 'height' | 'rotation'
        ) => {
            // Guards against the change event firing after Enter-triggered blur,
            // which would apply the same operation a second time.
            let applying = false

            const onChange = () => {
                if (applying) return
                this.applyGeometryToAll(key, input.value)
            }
            const onKeydown = (e: KeyboardEvent) => {
                if (e.key === 'Enter') {
                    applying = true
                    this.applyGeometryToAll(key, input.value)
                    input.blur() // change fires here — blocked by flag
                    this.syncMultiple() // update now that input is no longer focused
                    applying = false
                }
                if (e.key === 'Escape') {
                    applying = true
                    input.blur()
                    this.syncMultiple()
                    applying = false
                }
            }
            input.addEventListener('change', onChange)
            input.addEventListener('keydown', onKeydown)
            this.multiCleanups.push(() => {
                input.removeEventListener('change', onChange)
                input.removeEventListener('keydown', onKeydown)
            })
        }
        addGeo(this.inputs.x, 'x')
        addGeo(this.inputs.y, 'y')
        addGeo(this.inputs.width, 'width')
        addGeo(this.inputs.height, 'height')
        addGeo(this.inputs.rotation, 'rotation')
        ;(this.nameInputEl.closest('.prop-name-row') as HTMLElement).style.display = 'none'
        this.commonPropsEl.style.display = ''
        // Hide H when every selected block has a fixed/auto height — changing it would be a no-op.
        ;(this.inputs.height.closest('.prop-row') as HTMLElement).style.display = objects.every(
            (o) => o.fixedHeight
        )
            ? 'none'
            : ''
        this.deleteBtnEl.style.display = ''

        // Chain onChange on every object so geometry inputs stay in sync during drag.
        this.multiOnChanges = objects.map((o) => o.onChange)
        objects.forEach((obj, i) => {
            obj.onChange = () => {
                this.syncMultiple()
                this.multiOnChanges[i]?.()
            }
        })

        this.syncMultiple()
        this.el.classList.remove('hidden')
    }

    // Removes multi-select bindings and restores geometry inputs to number type.
    private cleanupMulti() {
        if (this.objects) {
            this.objects.forEach((obj, i) => {
                obj.onChange = this.multiOnChanges[i] ?? null
            })
        }
        this.multiOnChanges = []
        this.multiCleanups.forEach((c) => c())
        this.multiCleanups = []
        for (const input of [this.inputs.x, this.inputs.y, this.inputs.width, this.inputs.height]) {
            input.type = 'number'
            input.value = ''
        }
        this.inputs.rotation.value = ''
        this.objects = null
    }

    private sync() {
        if (!this.object) return
        const pos = this.object.getPosition()
        const size = this.object.getSize()

        // Skip each field when focused — programmatically setting .value resets the cursor
        // position even when the value is unchanged, breaking mid-number editing.
        if (document.activeElement !== this.inputs.x)
            this.inputs.x.value = String(Math.round(pos.x))
        if (document.activeElement !== this.inputs.y)
            this.inputs.y.value = String(Math.round(pos.y))
        if (document.activeElement !== this.inputs.width)
            this.inputs.width.value = String(Math.round(size.width))
        if (document.activeElement !== this.inputs.height)
            this.inputs.height.value = String(Math.round(size.height))
        // Skip sync while the field is focused — the user is mid-edit without the suffix.
        if (document.activeElement !== this.inputs.rotation) {
            this.inputs.rotation.value = `${Math.round(this.object.getRotation())}°`
        }
        if (document.activeElement !== this.nameInputEl) {
            this.nameInputEl.value = this.object.name
        }
    }

    // Refreshes the geometry inputs for multi-select, showing the shared value or
    // a "Mixed" placeholder when blocks have differing values.
    // Pass force=true to update even when an input is focused — needed after a
    // spin-button step so the input doesn't retain a stale expression string.
    private syncMultiple(force = false) {
        if (!this.objects || this.objects.length === 0) return
        const positions = this.objects.map((o) => o.getPosition())
        const sizes = this.objects.map((o) => o.getSize())
        const rotations = this.objects.map((o) => o.getRotation())

        const setField = (input: HTMLInputElement, values: number[], suffix = '') => {
            if (!force && document.activeElement === input) return
            const allSame = values.every((v) => v === values[0])
            if (allSame) {
                input.value = suffix
                    ? `${Math.round(values[0])}${suffix}`
                    : String(Math.round(values[0]))
            } else {
                input.value = 'Mixed'
            }
        }

        setField(
            this.inputs.x,
            positions.map((p) => p.x)
        )
        setField(
            this.inputs.y,
            positions.map((p) => p.y)
        )
        setField(
            this.inputs.width,
            sizes.map((s) => s.width)
        )
        setField(
            this.inputs.height,
            sizes.map((s) => s.height)
        )
        setField(this.inputs.rotation, rotations, '°')
    }

    // Applies an expression or absolute value to a geometry property on all selected objects.
    private applyGeometryToAll(
        key: 'x' | 'y' | 'width' | 'height' | 'rotation',
        raw: string
    ): void {
        if (!this.objects) return
        const cleaned = raw
            .replace('°', '')
            .replace(/^Mixed/i, '')
            .trim()
        if (!cleaned) return

        for (const obj of this.objects) {
            const pos = obj.getPosition()
            const size = obj.getSize()
            const rot = obj.getRotation()
            const current =
                key === 'x'
                    ? pos.x
                    : key === 'y'
                      ? pos.y
                      : key === 'width'
                        ? size.width
                        : key === 'height'
                          ? size.height
                          : rot
            const next = parseOpValue(cleaned, current)
            if (isNaN(next)) continue

            if (key === 'x') obj.setPosition(next, pos.y)
            else if (key === 'y') obj.setPosition(pos.x, next)
            else if (key === 'width') obj.setSize(next, size.height)
            else if (key === 'height') {
                // Skip blocks with a fixed/auto height — their setSize ignores the height
                // parameter, so applying would be a no-op that leaves the display stale.
                if (!obj.fixedHeight) obj.setSize(size.width, next)
            } else obj.setRotation(next)
        }
        // Force-update inputs even when focused — spin-button clicks preserve focus but
        // the value must reflect the applied result, not the expression string (e.g. "+1").
        this.syncMultiple(true)
    }

    // Applies an expression or absolute value to an appearance property on all selected objects.
    // Expressions (+, -, *, /) are evaluated against each object's current value individually.
    private applyAppearanceToAll(key: string, raw: string | number): void {
        if (!this.objects) return
        const normalised = typeof raw === 'string' ? raw.replace(/^Mixed/i, '').trim() : raw
        for (const obj of this.objects) {
            if (typeof normalised === 'string' && /^[+\-*/]/.test(normalised)) {
                const field = obj.getAppearanceFields().find((f) => 'key' in f && f.key === key)
                if (field && (field.type === 'number' || field.type === 'slider')) {
                    let next = parseOpValue(normalised, field.value)
                    if (field.type === 'number') {
                        if (field.min !== undefined) next = Math.max(field.min, next)
                        if (field.max !== undefined) next = Math.min(field.max, next)
                    } else {
                        next = Math.max(field.min, Math.min(field.max, next))
                    }
                    if (!isNaN(next)) obj.setAppearanceProperty(key, next)
                }
            } else if (normalised !== '') {
                obj.setAppearanceProperty(key, normalised)
            }
        }
    }

    hide() {
        this.cleanupMulti()
        if (this.object) {
            this.object.onChange = this.prevOnChange
            this.object.onAppearanceChange = null
        }
        this.prevOnChange = null
        this.object = null
        this.el.classList.add('hidden')
    }
}
