// Layers panel — shows all board objects in z-order with drag-to-reorder, visibility and lock toggles.
// Docks to the left edge of the viewport. Behavior mirrors PropertiesPanel (same dock/undock/collapse/resize).

import { BoardObject } from '../board/BoardObject'

const SVG_ATTRS = `viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"`

const ICON_EYE = `<svg ${SVG_ATTRS}>
    <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"/>
    <circle cx="8" cy="8" r="2"/>
</svg>`

const ICON_EYE_OFF = `<svg ${SVG_ATTRS}>
    <path d="M2 2l12 12M6.7 6.7A3 3 0 0 0 8 11a3 3 0 0 0 2.3-1.3"/>
    <path d="M9.9 3.3C9.3 3.1 8.7 3 8 3 3.5 3 1 8 1 8s.7 1.4 2 2.7"/>
    <path d="M14.5 10A13 13 0 0 0 15 8s-2.5-5-7-5"/>
</svg>`

const ICON_LOCK_CLOSED = `<svg ${SVG_ATTRS}>
    <rect x="3" y="7" width="10" height="7" rx="1.5"/>
    <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/>
</svg>`

const ICON_LOCK_OPEN = `<svg ${SVG_ATTRS}>
    <rect x="3" y="7" width="10" height="7" rx="1.5"/>
    <path d="M5.5 7V5a2.5 2.5 0 0 1 4.95-.5"/>
</svg>`

export class LayersPanel {
    readonly el: HTMLElement
    // Called when a layer row is clicked — main.ts performs the actual selection.
    onSelectBlock: ((block: BoardObject) => void) | null = null
    // Called when the user reorders rows via drag-and-drop.
    onReorder: ((fromIdx: number, targetIdx: number, edge: 'top' | 'bottom') => void) | null = null

    // Called whenever the panel docks or undocks — main.ts uses it to reposition overlapping widgets.
    onDockChange: ((docked: boolean) => void) | null = null
    private docked = true
    private listEl: HTMLUListElement
    private expandBtnEl: HTMLButtonElement
    private snapPreviewEl: HTMLElement
    private cachedBlocks: BoardObject[] = []
    private dragSrcIdx: number | null = null
    private container: HTMLElement

    constructor(container: HTMLElement) {
        this.container = container
        this.el = document.createElement('div')
        this.el.id = 'layers-panel'
        this.el.className = 'docked'
        this.el.innerHTML = `
            <div class="panel-header">
                <button class="panel-collapse-btn" title="Hide panel">‹</button>
                <span class="layers-title">Layers</span>
                <button class="panel-undock-btn" title="Pop out">↗</button>
                <div class="panel-drag-handle"></div>
            </div>
            <div class="panel-content">
                <ul class="layers-list"></ul>
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

        this.listEl = this.el.querySelector('.layers-list') as HTMLUListElement

        // Prevent wheel from reaching the board pan/zoom handler.
        this.el.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true })
        // Prevent board's "click outside → deselect" from firing.
        this.el.addEventListener('mousedown', (e) => e.stopPropagation())

        const undockBtn = this.el.querySelector('.panel-undock-btn') as HTMLButtonElement
        undockBtn.addEventListener('click', () => this.setDocked(false))

        const handleEl = this.el.querySelector('.panel-drag-handle') as HTMLElement
        handleEl.addEventListener('mousedown', (e) => {
            this.el.classList.add('panel-no-transition')
            if (this.docked) this.setDocked(false)

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

                // Snap zone: near the left edge of the viewport.
                const entering = x <= snapThreshold
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
                this.el.classList.remove('panel-no-transition')
                if (inSnapZone) this.setDocked(true)
            }

            window.addEventListener('mousemove', onMove)
            window.addEventListener('mouseup', onUp)
        })

        const collapseBtn = this.el.querySelector('.panel-collapse-btn') as HTMLButtonElement
        collapseBtn.addEventListener('click', () => this.setCollapsed(true))

        // Expand button — visible only when docked and collapsed.
        this.expandBtnEl = document.createElement('button')
        this.expandBtnEl.className = 'layers-expand-btn hidden'
        this.expandBtnEl.title = 'Show layers'
        this.expandBtnEl.textContent = '›'
        this.expandBtnEl.addEventListener('click', () => this.setCollapsed(false))
        this.expandBtnEl.addEventListener('mousedown', (e) => e.stopPropagation())

        // Ghost preview of the docked position, shown while dragging near the left edge.
        this.snapPreviewEl = document.createElement('div')
        this.snapPreviewEl.className = 'layers-snap-preview'

        container.appendChild(this.el)
        container.appendChild(this.expandBtnEl)
        container.appendChild(this.snapPreviewEl)
        this.setupResizeHandles()
        requestAnimationFrame(() => this.updateOffset())
    }

    // Rebuilds the full layer list. Call after any structural change (add, remove, reorder, undo).
    refresh(blocks: BoardObject[], selectedBlocks: Set<BoardObject>) {
        // Disconnect old onLayerChange callbacks before discarding the rows.
        for (const b of this.cachedBlocks) b.onLayerChange = null
        this.cachedBlocks = [...blocks]
        this.listEl.innerHTML = ''
        // Render top-to-bottom as front-to-back (last array element = frontmost).
        for (let i = blocks.length - 1; i >= 0; i--) {
            this.listEl.appendChild(this.buildRow(blocks[i], i, selectedBlocks))
        }
    }

    // Lightweight selection sync — toggles the is-selected class without rebuilding rows.
    notifySelectionChanged(selectedBlocks: Set<BoardObject>) {
        const rows = this.listEl.querySelectorAll<HTMLElement>('.layer-row')
        rows.forEach((row) => {
            const idx = Number(row.dataset.arrayIndex)
            const block = this.cachedBlocks[idx]
            if (block) row.classList.toggle('is-selected', selectedBlocks.has(block))
        })
    }

    private buildRow(
        block: BoardObject,
        arrayIndex: number,
        selectedBlocks: Set<BoardObject>
    ): HTMLLIElement {
        const row = document.createElement('li')
        row.className = 'layer-row'
        row.draggable = true
        row.dataset.arrayIndex = String(arrayIndex)
        if (selectedBlocks.has(block)) row.classList.add('is-selected')
        if (!block.visible) row.classList.add('is-hidden')
        if (block.locked) row.classList.add('is-locked')

        const grip = document.createElement('span')
        grip.className = 'layer-grip'
        grip.textContent = '⠿'
        grip.title = 'Drag to reorder'

        const label = document.createElement('span')
        label.className = 'layer-label'
        label.textContent = block.layerLabel

        const visBtn = document.createElement('button')
        visBtn.className = 'layer-vis-btn'
        visBtn.title = 'Toggle visibility'
        visBtn.innerHTML = block.visible ? ICON_EYE : ICON_EYE_OFF
        visBtn.addEventListener('click', (e) => {
            e.stopPropagation()
            block.setVisible(!block.visible)
        })

        const lockBtn = document.createElement('button')
        lockBtn.className = 'layer-lock-btn'
        lockBtn.title = 'Toggle lock'
        lockBtn.innerHTML = block.locked ? ICON_LOCK_CLOSED : ICON_LOCK_OPEN
        lockBtn.addEventListener('click', (e) => {
            e.stopPropagation()
            block.setLocked(!block.locked)
        })

        row.append(grip, label, visBtn, lockBtn)

        // Keep row in sync when visibility/lock changes without a full refresh.
        block.onLayerChange = () => {
            row.classList.toggle('is-hidden', !block.visible)
            row.classList.toggle('is-locked', block.locked)
            visBtn.innerHTML = block.visible ? ICON_EYE : ICON_EYE_OFF
            lockBtn.innerHTML = block.locked ? ICON_LOCK_CLOSED : ICON_LOCK_OPEN
        }

        // Selecting a layer row.
        row.addEventListener('mousedown', (e) => {
            if ((e.target as HTMLElement).closest('.layer-vis-btn, .layer-lock-btn')) return
            if (block.locked) return
            this.onSelectBlock?.(block)
        })

        // Drag-to-reorder using HTML5 DnD.
        row.addEventListener('dragstart', (e) => {
            this.dragSrcIdx = arrayIndex
            e.dataTransfer!.effectAllowed = 'move'
            // Defer the opacity class so the ghost captures the normal state.
            requestAnimationFrame(() => row.classList.add('is-dragging'))
        })

        row.addEventListener('dragover', (e) => {
            e.preventDefault()
            if (this.dragSrcIdx === null || this.dragSrcIdx === arrayIndex) return
            e.dataTransfer!.dropEffect = 'move'
            const rect = row.getBoundingClientRect()
            const edge = e.clientY < rect.top + rect.height / 2 ? 'top' : 'bottom'
            this.clearDragIndicators()
            row.classList.add(edge === 'top' ? 'drag-over-top' : 'drag-over-bottom')
        })

        row.addEventListener('dragleave', () => {
            row.classList.remove('drag-over-top', 'drag-over-bottom')
        })

        row.addEventListener('drop', (e) => {
            e.preventDefault()
            if (this.dragSrcIdx === null || this.dragSrcIdx === arrayIndex) return
            const rect = row.getBoundingClientRect()
            const edge = e.clientY < rect.top + rect.height / 2 ? 'top' : 'bottom'
            this.onReorder?.(this.dragSrcIdx, arrayIndex, edge)
            this.dragSrcIdx = null
        })

        row.addEventListener('dragend', () => {
            this.clearDragIndicators()
            row.classList.remove('is-dragging')
            this.dragSrcIdx = null
        })

        return row
    }

    private clearDragIndicators() {
        this.listEl.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach((el) => {
            el.classList.remove('drag-over-top', 'drag-over-bottom')
        })
    }

    private updateOffset() {
        const collapsed = this.el.classList.contains('docked-collapsed')
        const offset = this.docked && !collapsed ? this.el.offsetWidth + 8 : 0
        this.container.style.setProperty('--layers-panel-offset', `${offset}px`)
    }

    private setDocked(docked: boolean) {
        this.onDockChange?.(docked)
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

        // Keep handles invisible during the FLIP so they don't flash in when undocking.
        let hiddenHandles: HTMLElement[] = []
        if (!docked) {
            hiddenHandles = Array.from(
                this.el.querySelectorAll<HTMLElement>(
                    '.panel-resize-top, .panel-resize-tl, .panel-resize-tr, ' +
                        '.panel-resize-left, .panel-resize-bottom, .panel-resize-br, .panel-resize-bl'
                )
            )
            hiddenHandles.forEach((h) => (h.style.visibility = 'hidden'))
        }

        this.el.classList.add('panel-no-transition')
        this.el.style.transformOrigin = '0 0'
        this.el.style.transform = `translate(${dx}px, ${dy}px) scaleX(${scaleX}) scaleY(${scaleY})`
        void this.el.offsetHeight

        this.el.classList.remove('panel-no-transition')
        this.el.style.transform = ''

        if (hiddenHandles.length > 0) {
            this.el.addEventListener(
                'transitionend',
                () => hiddenHandles.forEach((h) => (h.style.visibility = '')),
                { once: true }
            )
        }

        this.updateOffset()
    }

    private setCollapsed(collapsed: boolean) {
        this.el.classList.toggle('docked-collapsed', collapsed)
        this.expandBtnEl.classList.toggle('hidden', !collapsed)
        this.updateOffset()
    }

    private setupResizeHandles() {
        const minW = 160
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
                if (this.docked) this.updateOffset()
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
}
