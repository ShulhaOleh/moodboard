// Layers panel — shows all board objects in z-order with drag-to-reorder, visibility and lock toggles.
// Docks to the left edge of the viewport. Behavior mirrors PropertiesPanel (same dock/undock/collapse/resize).

import { BoardObject } from '../board/BoardObject'
import {
    ICON_EYE,
    ICON_EYE_OFF,
    ICON_LOCK_CLOSED,
    ICON_LOCK_OPEN,
    ICON_CHEVRON_RIGHT,
} from '../lib/icons'
import type { GroupRecord } from '../lib/db'

type BlockItem = { kind: 'block'; block: BoardObject; arrayIndex: number }
type GroupItem = {
    kind: 'group'
    groupId: string
    group: GroupRecord
    members: BlockItem[]
}
type DisplayItem = BlockItem | GroupItem

// Flattened visual row used for shift-range computation.
type FlatItem =
    | { type: 'block'; block: BoardObject }
    | { type: 'group'; groupId: string; members: BoardObject[] }
    | { type: 'member'; block: BoardObject }

// Identifies which row set the range anchor.
type AnchorKey =
    | { type: 'block'; block: BoardObject }
    | { type: 'member'; block: BoardObject }
    | { type: 'group'; groupId: string }

export class LayersPanel {
    readonly el: HTMLElement
    // Called when a layer row is plain-clicked — main.ts replaces the selection.
    onSelectBlock: ((block: BoardObject) => void) | null = null
    // Called when a layer row is Ctrl/Cmd-clicked — main.ts toggles the block.
    onCtrlSelectBlock: ((block: BoardObject) => void) | null = null
    // Called when a group header is plain-clicked — main.ts selects all members.
    onGroupSelect: ((groupId: string) => void) | null = null
    // Called when a group header is Ctrl/Cmd-clicked — main.ts toggles all members.
    onCtrlGroupSelect: ((groupId: string) => void) | null = null
    // Called on Shift+click with the contiguous range of blocks to select.
    onRangeSelect: ((blocks: BoardObject[]) => void) | null = null
    // Called when the user reorders rows via drag-and-drop.
    onReorder: ((fromIdx: number, targetIdx: number, edge: 'top' | 'bottom') => void) | null = null
    // Called when the user renames the board via the name input.
    onNameChange: ((name: string) => void) | null = null
    // Called when the user renames a group via inline edit.
    onRenameGroup: ((groupId: string, name: string) => void) | null = null

    // Called whenever the panel docks or undocks — main.ts uses it to reposition overlapping widgets.
    onDockChange: ((docked: boolean) => void) | null = null
    // Overridden by main.ts to use the user's configured keybinding instead of the hardcoded default.
    isRenameKey: (e: KeyboardEvent) => boolean = (e) => e.key === 'F2'
    private docked = true
    private listEl: HTMLUListElement
    private nameInput: HTMLInputElement
    private expandBtnEl: HTMLButtonElement
    private snapPreviewEl: HTMLElement
    private cachedBlocks: BoardObject[] = []
    private cachedGroups: Map<string, GroupRecord> = new Map()
    private collapsedGroups = new Set<string>()
    private dragSrcIdx: number | null = null
    private anchorKey: AnchorKey | null = null
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
                <div class="board-name-row">
                    <input class="board-name-input" type="text" value="Untitled board" spellcheck="false" />
                </div>
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
        this.nameInput = this.el.querySelector('.board-name-input') as HTMLInputElement

        let prevName = this.nameInput.value
        this.nameInput.addEventListener('focus', () => {
            prevName = this.nameInput.value
        })
        this.nameInput.addEventListener('blur', () => {
            const val = this.nameInput.value.trim()
            if (val && val !== prevName) this.onNameChange?.(val)
            else if (!val) this.nameInput.value = prevName
        })
        this.nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.nameInput.blur()
            if (e.key === 'Escape') {
                this.nameInput.value = prevName
                this.nameInput.blur()
            }
        })

        document.addEventListener('keydown', (e) => {
            if (!this.isRenameKey(e)) return
            // Check for a selected group header first.
            const groupHeader = this.listEl.querySelector<HTMLElement>(
                '.layer-group-header.is-selected'
            )
            if (groupHeader) {
                e.preventDefault()
                const gid = groupHeader.dataset.groupId!
                const g = this.cachedGroups.get(gid)
                if (g) this.startGroupInlineEdit(groupHeader, gid, g)
                return
            }
            const selected = this.listEl.querySelector<HTMLLIElement>('.layer-row.is-selected')
            if (!selected) return
            e.preventDefault()
            const idx = Number(selected.dataset.arrayIndex)
            const block = this.cachedBlocks[idx]
            if (block) this.startInlineEdit(selected, block)
        })

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
    refresh(
        blocks: BoardObject[],
        selectedBlocks: Set<BoardObject>,
        groups?: Map<string, GroupRecord>
    ) {
        for (const b of this.cachedBlocks) b.onLayerChange = null
        this.cachedBlocks = [...blocks]
        this.cachedGroups = groups ?? new Map()
        this.listEl.innerHTML = ''
        for (const item of this.buildDisplayItems()) {
            if (item.kind === 'group') {
                this.listEl.appendChild(this.buildGroupItem(item, selectedBlocks))
            } else {
                this.listEl.appendChild(this.buildRow(item.block, item.arrayIndex, selectedBlocks))
            }
        }
    }

    // Lightweight selection sync — updates is-selected without rebuilding rows.
    notifySelectionChanged(selectedBlocks: Set<BoardObject>) {
        this.listEl.querySelectorAll<HTMLElement>('.layer-row').forEach((row) => {
            const idx = Number(row.dataset.arrayIndex)
            const block = this.cachedBlocks[idx]
            if (block) row.classList.toggle('is-selected', selectedBlocks.has(block))
        })
        this.listEl.querySelectorAll<HTMLElement>('.layer-group-header').forEach((header) => {
            const gid = header.dataset.groupId
            if (!gid) return
            const members = this.cachedBlocks.filter((b) => b.groupId === gid)
            const allSelected = members.length > 0 && members.every((b) => selectedBlocks.has(b))
            header.classList.toggle('is-selected', allSelected)
        })
    }

    // Builds a flat-to-tree display list from the current blocks array.
    // Groups appear at the z-position of their frontmost member; members retain z-order within the group.
    private buildDisplayItems(): DisplayItem[] {
        const items: DisplayItem[] = []
        const seen = new Map<string, GroupItem>()
        for (let i = this.cachedBlocks.length - 1; i >= 0; i--) {
            const block = this.cachedBlocks[i]
            const gid = block.groupId
            const group = gid ? this.cachedGroups.get(gid) : undefined
            if (gid && group) {
                let groupItem = seen.get(gid)
                if (!groupItem) {
                    groupItem = { kind: 'group', groupId: gid, group, members: [] }
                    seen.set(gid, groupItem)
                    items.push(groupItem)
                }
                groupItem.members.push({ kind: 'block', block, arrayIndex: i })
            } else {
                items.push({ kind: 'block', block, arrayIndex: i })
            }
        }
        return items
    }

    // Returns all visible rows in top-to-bottom display order for range computation.
    // Collapsed group members are omitted (they aren't visible rows).
    private getFlatVisibleItems(): FlatItem[] {
        const flat: FlatItem[] = []
        for (const item of this.buildDisplayItems()) {
            if (item.kind === 'block') {
                flat.push({ type: 'block', block: item.block })
            } else {
                flat.push({
                    type: 'group',
                    groupId: item.groupId,
                    members: item.members.map((m) => m.block),
                })
                if (!this.collapsedGroups.has(item.groupId)) {
                    for (const m of item.members) flat.push({ type: 'member', block: m.block })
                }
            }
        }
        return flat
    }

    // Returns blocks covered by the range [anchor..target] in visual order.
    private computeRange(anchor: AnchorKey, target: AnchorKey): BoardObject[] {
        const flat = this.getFlatVisibleItems()

        const findIndex = (key: AnchorKey): number => {
            if (key.type === 'group') {
                return flat.findIndex((f) => f.type === 'group' && f.groupId === key.groupId)
            }
            return flat.findIndex(
                (f) => (f.type === 'block' || f.type === 'member') && f.block === key.block
            )
        }

        const a = findIndex(anchor)
        const b = findIndex(target)
        if (a === -1 || b === -1) return []

        const start = Math.min(a, b)
        const end = Math.max(a, b)
        const result: BoardObject[] = []
        for (let i = start; i <= end; i++) {
            const f = flat[i]
            if (f.type === 'group') {
                for (const m of f.members) if (m.visible && !m.locked) result.push(m)
            } else {
                if (f.block.visible && !f.block.locked) result.push(f.block)
            }
        }
        return result
    }

    private buildGroupItem(item: GroupItem, selectedBlocks: Set<BoardObject>): HTMLLIElement {
        const li = document.createElement('li')
        li.className = 'layer-group-item'

        const allSelected =
            item.members.length > 0 && item.members.every((m) => selectedBlocks.has(m.block))
        const isCollapsed = this.collapsedGroups.has(item.groupId)

        // ── Group header row ──────────────────────────────────────────────────
        const header = document.createElement('div')
        header.className = 'layer-group-header'
        if (allSelected) header.classList.add('is-selected')
        header.dataset.groupId = item.groupId

        const chevron = document.createElement('button')
        chevron.className = 'layer-group-chevron'
        chevron.title = isCollapsed ? 'Expand group' : 'Collapse group'
        chevron.innerHTML = ICON_CHEVRON_RIGHT
        if (!isCollapsed) chevron.classList.add('is-open')
        chevron.addEventListener('click', (e) => {
            e.stopPropagation()
            if (this.collapsedGroups.has(item.groupId)) {
                this.collapsedGroups.delete(item.groupId)
                chevron.classList.add('is-open')
                chevron.title = 'Collapse group'
                children.style.display = ''
            } else {
                this.collapsedGroups.add(item.groupId)
                chevron.classList.remove('is-open')
                chevron.title = 'Expand group'
                children.style.display = 'none'
            }
        })

        const label = document.createElement('span')
        label.className = 'layer-label'
        label.textContent = item.group.name

        const visBtn = this.makeGroupVisBtn(item)
        const lockBtn = this.makeGroupLockBtn(item)

        header.append(chevron, label, visBtn, lockBtn)

        label.addEventListener('dblclick', (e) => {
            e.stopPropagation()
            this.startGroupInlineEdit(header, item.groupId, item.group)
        })

        header.addEventListener('mousedown', (e) => {
            if (
                (e.target as HTMLElement).closest(
                    '.layer-vis-btn, .layer-lock-btn, .layer-group-chevron'
                )
            )
                return
            const target: AnchorKey = { type: 'group', groupId: item.groupId }
            if (e.shiftKey && this.anchorKey) {
                e.preventDefault()
                this.onRangeSelect?.(this.computeRange(this.anchorKey, target))
            } else if (e.ctrlKey || e.metaKey) {
                this.anchorKey = target
                this.onCtrlGroupSelect?.(item.groupId)
            } else {
                this.anchorKey = target
                this.onGroupSelect?.(item.groupId)
            }
        })

        // ── Children container ────────────────────────────────────────────────
        const children = document.createElement('ul')
        children.className = 'layer-group-children'
        if (isCollapsed) children.style.display = 'none'
        for (const m of item.members) {
            children.appendChild(this.buildMemberRow(m.block, m.arrayIndex, selectedBlocks))
        }

        li.append(header, children)
        return li
    }

    private makeGroupVisBtn(item: GroupItem): HTMLButtonElement {
        const allVisible = item.members.every((m) => m.block.visible)
        const btn = document.createElement('button')
        btn.className = 'layer-vis-btn'
        btn.title = 'Toggle group visibility'
        btn.innerHTML = allVisible ? ICON_EYE : ICON_EYE_OFF
        btn.addEventListener('click', (e) => {
            e.stopPropagation()
            const next = !item.members.every((m) => m.block.visible)
            for (const m of item.members) m.block.setVisible(next)
            btn.innerHTML = next ? ICON_EYE : ICON_EYE_OFF
        })
        return btn
    }

    private makeGroupLockBtn(item: GroupItem): HTMLButtonElement {
        const allLocked = item.members.every((m) => m.block.locked)
        const btn = document.createElement('button')
        btn.className = 'layer-lock-btn'
        btn.title = 'Toggle group lock'
        btn.innerHTML = allLocked ? ICON_LOCK_CLOSED : ICON_LOCK_OPEN
        btn.addEventListener('click', (e) => {
            e.stopPropagation()
            const next = !item.members.every((m) => m.block.locked)
            for (const m of item.members) m.block.setLocked(next)
            btn.innerHTML = next ? ICON_LOCK_CLOSED : ICON_LOCK_OPEN
        })
        return btn
    }

    private buildMemberRow(
        block: BoardObject,
        arrayIndex: number,
        selectedBlocks: Set<BoardObject>
    ): HTMLLIElement {
        const row = document.createElement('li')
        row.className = 'layer-row layer-member-row'
        row.dataset.arrayIndex = String(arrayIndex)
        if (selectedBlocks.has(block)) row.classList.add('is-selected')
        if (!block.visible) row.classList.add('is-hidden')
        if (block.locked) row.classList.add('is-locked')

        const label = document.createElement('span')
        label.className = 'layer-label'
        label.textContent = block.name

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

        row.append(label, visBtn, lockBtn)

        block.onLayerChange = () => {
            row.classList.toggle('is-hidden', !block.visible)
            row.classList.toggle('is-locked', block.locked)
            visBtn.innerHTML = block.visible ? ICON_EYE : ICON_EYE_OFF
            lockBtn.innerHTML = block.locked ? ICON_LOCK_CLOSED : ICON_LOCK_OPEN
            label.textContent = block.name
        }

        label.addEventListener('dblclick', (e) => {
            e.stopPropagation()
            this.startInlineEdit(row, block)
        })

        row.addEventListener('mousedown', (e) => {
            if ((e.target as HTMLElement).closest('.layer-vis-btn, .layer-lock-btn')) return
            const target: AnchorKey = { type: 'member', block }
            if (e.shiftKey && this.anchorKey) {
                e.preventDefault()
                this.onRangeSelect?.(this.computeRange(this.anchorKey, target))
            } else if (e.ctrlKey || e.metaKey) {
                this.anchorKey = target
                this.onCtrlSelectBlock?.(block)
            } else {
                this.anchorKey = target
                this.onSelectBlock?.(block)
            }
        })

        return row
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
        label.textContent = block.name

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

        block.onLayerChange = () => {
            row.classList.toggle('is-hidden', !block.visible)
            row.classList.toggle('is-locked', block.locked)
            visBtn.innerHTML = block.visible ? ICON_EYE : ICON_EYE_OFF
            lockBtn.innerHTML = block.locked ? ICON_LOCK_CLOSED : ICON_LOCK_OPEN
            label.textContent = block.name
        }

        label.addEventListener('dblclick', (e) => {
            e.stopPropagation()
            this.startInlineEdit(row, block)
        })

        row.addEventListener('mousedown', (e) => {
            if ((e.target as HTMLElement).closest('.layer-vis-btn, .layer-lock-btn')) return
            const target: AnchorKey = { type: 'block', block }
            if (e.shiftKey && this.anchorKey) {
                e.preventDefault()
                this.onRangeSelect?.(this.computeRange(this.anchorKey, target))
            } else if (e.ctrlKey || e.metaKey) {
                this.anchorKey = target
                this.onCtrlSelectBlock?.(block)
            } else {
                this.anchorKey = target
                this.onSelectBlock?.(block)
            }
        })

        // Drag-to-reorder using HTML5 DnD.
        row.addEventListener('dragstart', (e) => {
            this.dragSrcIdx = arrayIndex
            e.dataTransfer!.effectAllowed = 'move'
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

    setName(name: string) {
        this.nameInput.value = name
    }

    private startGroupInlineEdit(header: HTMLElement, groupId: string, group: GroupRecord) {
        const label = header.querySelector<HTMLElement>('.layer-label')!
        const input = document.createElement('input')
        input.className = 'layer-name-input'
        input.value = group.name
        label.replaceWith(input)
        input.focus()
        input.select()

        let committed = false
        const commit = () => {
            if (committed) return
            committed = true
            const val = input.value.trim()
            if (val && val !== group.name) this.onRenameGroup?.(groupId, val)
            input.replaceWith(label)
            label.textContent = this.cachedGroups.get(groupId)?.name ?? group.name
        }
        const cancel = () => {
            if (committed) return
            committed = true
            input.replaceWith(label)
        }
        input.addEventListener('blur', commit)
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault()
                input.blur()
            }
            if (e.key === 'Escape') {
                e.preventDefault()
                input.removeEventListener('blur', commit)
                cancel()
            }
        })
    }

    private startInlineEdit(row: HTMLLIElement, block: BoardObject) {
        const label = row.querySelector<HTMLElement>('.layer-label')!
        const input = document.createElement('input')
        input.className = 'layer-name-input'
        input.value = block.name
        label.replaceWith(input)
        input.focus()
        input.select()

        let committed = false
        const commit = () => {
            if (committed) return
            committed = true
            const val = input.value.trim()
            if (val) block.setName(val)
            input.replaceWith(label)
            label.textContent = block.name
        }
        const cancel = () => {
            if (committed) return
            committed = true
            input.replaceWith(label)
        }

        input.addEventListener('blur', commit)
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault()
                input.blur()
            }
            if (e.key === 'Escape') {
                e.preventDefault()
                input.removeEventListener('blur', commit)
                cancel()
            }
        })
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
