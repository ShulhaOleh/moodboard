// App entry point — initializes the board overlay and wires up UI components.

import './style.css'
import { TextBlock } from './board/TextBlock'
import { ImageBlock } from './board/ImageBlock'
import { ShapeBlock } from './board/ShapeBlock'
import { LineBlock } from './board/LineBlock'
import { PathBlock } from './board/PathBlock'
import { NoteBlock } from './board/NoteBlock'
import { rdp, buildSvgPath } from './board/pathUtils'
import { PropertiesPanel } from './ui/PropertiesPanel'
import { LayersPanel } from './ui/LayersPanel'
import { AddBar, BoardMode, type PencilSettings } from './ui/AddBar'
import { BoardObject } from './board/BoardObject'
import { CanvasBoard } from './board/CanvasBoard'
import { SelectionBox } from './ui/SelectionBox'
import { ZoomWidget } from './ui/ZoomWidget'
import {
    db,
    type PersistedBlock,
    SCHEMA_VERSION,
    MIN_SUPPORTED_VERSION,
    migrateBlocks,
} from './lib/db'
import { Dialog } from './ui/Dialog'
import { Exporter } from './export/Exporter'
import { GuideOverlay } from './ui/GuideOverlay'
import { computeSnap } from './snap/SnapEngine'
import { BoxBlock } from './board/BoxBlock'
import { loadSettings, applyTheme, applyAccent, applyUiFont } from './lib/settings'
import { loadFont } from './lib/fonts'
import { SettingsPanel } from './ui/SettingsPanel'
import {
    loadKeybindings,
    matchesAction,
    formatBinding,
    type ActionBindings,
    type KeybindingMap,
} from './lib/keybindings'

type BlockSnapshot = PersistedBlock

const app = document.getElementById('app')!

const userSettings = loadSettings()
applyTheme(userSettings.theme)
applyAccent(userSettings.accent)
if (userSettings.uiFont) {
    loadFont(userSettings.uiFont)
    applyUiFont(userSettings.uiFont)
}

let keybindings: KeybindingMap = loadKeybindings()

const panel = new PropertiesPanel(app)
const layersPanel = new LayersPanel(app)
// Keep the zoom widget from overlapping the docked layers panel.
layersPanel.onDockChange = (docked) => app.classList.toggle('layers-panel-docked', docked)
layersPanel.onNameChange = (name) => {
    boardName = name
    scheduleSave()
}
app.classList.add('layers-panel-docked') // docked by default
const canvasBoard = new CanvasBoard(app)
panel.show(canvasBoard)
const addBar = new AddBar(app)
const settingsPanel = new SettingsPanel(app, userSettings, keybindings)
addBar.onSettingsOpen = () => settingsPanel.open()

function syncModeHints() {
    addBar.updateModeHints({
        edit: formatBinding(keybindings.switchToEdit.primary),
        explore: formatBinding(keybindings.switchToExplore.primary),
    })
}

syncModeHints()
settingsPanel.onKeybindingsChange = (updated) => {
    keybindings = updated
    syncModeHints()
}
layersPanel.isRenameKey = (e) => matchesAction(e, keybindings.renameLayer)

const overlay = document.createElement('div')
overlay.id = 'overlay'
overlay.className = 'absolute inset-0 pointer-events-none'
app.appendChild(overlay)

const zoomWidget = new ZoomWidget(() => ({ panX, panY, zoom }))
app.appendChild(zoomWidget.el)

const blocks: BoardObject[] = []
const selectedBlocks = new Set<BoardObject>()
const history: BlockSnapshot[][] = []
const clipboard: BlockSnapshot[] = []
let pasteCount = 0
// Tracks whether a property-change burst is in progress to avoid duplicate history entries.
let propertyChangeActive = false

let mode: BoardMode = 'edit'
let panX = 0
let panY = 0
let zoom = 1
let boardName = 'Untitled board'

// Pencil tool state
let pencilActive = false
// Called to abort an in-progress stroke — set by startDrawing, cleared on mouseup or cancel.
let cancelCurrentStroke: (() => void) | null = null

// Fraction of the gap to close per animation frame — higher = snappier, lower = more elastic lag.
const PENCIL_ELASTIC = 0.25
let pencilSettings: PencilSettings = addBar.getPencilSettings()

const guideOverlay = new GuideOverlay()
app.appendChild(guideOverlay.el)

const selectionBox = new SelectionBox(overlay, () => ({ panX, panY, zoom }))

function applyTransform() {
    overlay.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`
    overlay.style.transformOrigin = '0 0'
}

zoomWidget.onZoomChange = (newZoom, newPanX, newPanY) => {
    zoom = newZoom
    panX = newPanX
    panY = newPanY
    applyTransform()
    scheduleSave()
}

// ── Persistence ───────────────────────────────────────────────────────────────

let saveTimer: ReturnType<typeof setTimeout> | null = null
let pendingSave = false

function scheduleSave() {
    pendingSave = true
    if (saveTimer !== null) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
        saveTimer = null
        pendingSave = false
        void saveBoard()
    }, 1500)
}

// Cancels the debounce and saves immediately — called on every browser exit path.
function flushSave() {
    if (!pendingSave) return
    if (saveTimer !== null) {
        clearTimeout(saveTimer)
        saveTimer = null
    }
    pendingSave = false
    void saveBoard()
}

// visibilitychange fires earliest (tab switch, minimize, close) — best chance for IndexedDB to finish.
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushSave()
})
// pagehide covers mobile Safari and bfcache scenarios where beforeunload doesn't fire.
window.addEventListener('pagehide', flushSave)
// beforeunload as the final safety net.
window.addEventListener('beforeunload', flushSave)

async function saveBoard() {
    const persistedBlocks: BlockSnapshot[] = blocks.map((block) => {
        const snap = snapshotBlock(block)
        // Blob URLs are ephemeral — strip them and let the stored imageBlob reconstruct on load.
        if (snap.type === 'image' && snap.data.src.startsWith('blob:')) {
            return { type: 'image', data: { ...snap.data, src: '' } }
        }
        return snap
    })
    await db.boards.put({
        id: 'default',
        schemaVersion: SCHEMA_VERSION,
        blocks: persistedBlocks,
        panX,
        panY,
        zoom,
        canvasBackground: canvasBoard.getBackground(),
        boardName,
    })
}

// Returns true if saved data was found and restored.
async function loadBoard(): Promise<boolean> {
    const record = await db.boards.get('default')
    if (!record) return false
    if (record.schemaVersion < MIN_SUPPORTED_VERSION || record.schemaVersion > SCHEMA_VERSION)
        return false
    panX = record.panX
    panY = record.panY
    zoom = record.zoom
    applyTransform()
    zoomWidget.sync(zoom)
    canvasBoard.setBackground(record.canvasBackground ?? '')
    boardName = record.boardName ?? 'Untitled board'
    layersPanel.setName(boardName)
    for (const snap of migrateBlocks(record.blocks, record.schemaVersion)) {
        if (snap.type === 'image' && snap.data.imageBlob) {
            addBlock(
                blockFromSnapshot({
                    type: 'image',
                    data: { ...snap.data, src: URL.createObjectURL(snap.data.imageBlob) },
                })
            )
        } else {
            addBlock(blockFromSnapshot(snap))
        }
    }
    return true
}

function snapshotBlock(block: BoardObject): BlockSnapshot {
    if (block instanceof TextBlock) return { type: 'text', data: { ...block.getData() } }
    if (block instanceof ImageBlock) return { type: 'image', data: { ...block.getData() } }
    if (block instanceof NoteBlock) return { type: 'note', data: { ...block.getData() } }
    if (block instanceof ShapeBlock) return { type: 'shape', data: { ...block.getData() } }
    if (block instanceof LineBlock) return { type: 'line', data: { ...block.getData() } }
    if (block instanceof PathBlock) return { type: 'path', data: block.getData() }
    throw new Error('Unknown block type')
}

function pushHistory() {
    history.push(blocks.map(snapshotBlock))
}

function blockFromSnapshot(snap: BlockSnapshot): BoardObject {
    switch (snap.type) {
        case 'text':
            return new TextBlock(overlay, snap.data)
        case 'image': {
            const data = snap.data.imageBlob
                ? { ...snap.data, src: URL.createObjectURL(snap.data.imageBlob) }
                : snap.data
            return new ImageBlock(overlay, data)
        }
        case 'note':
            return new NoteBlock(overlay, snap.data)
        case 'shape':
            return new ShapeBlock(overlay, snap.data)
        case 'line':
            return new LineBlock(overlay, snap.data)
        case 'path':
            return new PathBlock(overlay, snap.data)
    }
}

function undo() {
    const state = history.pop()
    if (!state) return
    for (const b of [...blocks]) removeBlock(b)
    for (const snap of state) addBlock(blockFromSnapshot(snap))
    selectionBox.setBlocks([])
    scheduleSave()
}

function copySelected() {
    if (selectedBlocks.size === 0) return
    clipboard.length = 0
    for (const b of selectedBlocks) clipboard.push(snapshotBlock(b))
    pasteCount = 0
}

function paste() {
    if (clipboard.length === 0) return
    pushHistory()
    pasteCount++
    const offset = pasteCount * 20

    selectedBlocks.forEach((b) => b.markDeselected())
    selectedBlocks.clear()

    for (const snap of clipboard) {
        let newSnap: BlockSnapshot
        if (snap.type === 'line') {
            newSnap = {
                type: 'line',
                data: {
                    ...snap.data,
                    id: crypto.randomUUID(),
                    x1: snap.data.x1 + offset,
                    y1: snap.data.y1 + offset,
                    x2: snap.data.x2 + offset,
                    y2: snap.data.y2 + offset,
                },
            }
        } else if (snap.type === 'image') {
            const src = snap.data.imageBlob
                ? URL.createObjectURL(snap.data.imageBlob)
                : snap.data.src
            newSnap = {
                type: 'image',
                data: {
                    ...snap.data,
                    id: crypto.randomUUID(),
                    x: snap.data.x + offset,
                    y: snap.data.y + offset,
                    src,
                },
            }
        } else if (snap.type === 'text') {
            newSnap = {
                type: 'text',
                data: {
                    ...snap.data,
                    id: crypto.randomUUID(),
                    x: snap.data.x + offset,
                    y: snap.data.y + offset,
                },
            }
        } else if (snap.type === 'path') {
            newSnap = {
                type: 'path',
                data: {
                    ...snap.data,
                    id: crypto.randomUUID(),
                    x: snap.data.x + offset,
                    y: snap.data.y + offset,
                },
            }
        } else if (snap.type === 'note') {
            newSnap = {
                type: 'note',
                data: {
                    ...snap.data,
                    id: crypto.randomUUID(),
                    x: snap.data.x + offset,
                    y: snap.data.y + offset,
                },
            }
        } else {
            newSnap = {
                type: 'shape',
                data: {
                    ...snap.data,
                    id: crypto.randomUUID(),
                    x: snap.data.x + offset,
                    y: snap.data.y + offset,
                },
            }
        }
        const b = blockFromSnapshot(newSnap)
        addBlock(b)
        selectedBlocks.add(b)
        b.markSelected()
    }

    if (selectedBlocks.size === 1) panel.show([...selectedBlocks][0])
    else if (selectedBlocks.size > 1) panel.show(canvasBoard)
    selectionBox.setBlocks([...selectedBlocks])
    layersPanel.notifySelectionChanged(selectedBlocks)
    scheduleSave()
}

addBar.onModeChange = (newMode) => {
    mode = newMode
    app.classList.toggle('explore-mode', mode === 'explore')
    if (mode === 'edit') return
    // Deselect everything and cancel pencil when switching to explore
    if (pencilActive) setPencilActive(false)
    selectedBlocks.forEach((b) => b.markDeselected())
    selectedBlocks.clear()
    panel.show(canvasBoard)
    selectionBox.setBlocks([])
    layersPanel.notifySelectionChanged(selectedBlocks)
}

addBar.onTogglePencil = () => setPencilActive(!pencilActive)
addBar.onPencilSettingsChange = (s) => {
    pencilSettings = s
}

function setPencilActive(active: boolean) {
    pencilActive = active
    addBar.setPencilActive(active)
    app.classList.toggle('pencil-mode', active)
    if (active) {
        selectedBlocks.forEach((b) => b.markDeselected())
        selectedBlocks.clear()
        panel.show(canvasBoard)
        selectionBox.setBlocks([])
        layersPanel.notifySelectionChanged(selectedBlocks)
    }
}

// Scroll pans the canvas; Shift+scroll pans horizontally; Ctrl+scroll zooms.
document.addEventListener(
    'wheel',
    (e) => {
        e.preventDefault()
        if (e.ctrlKey) {
            const newZoom = Math.min(4, Math.max(0.1, zoom * Math.pow(0.999, e.deltaY)))
            panX = e.clientX - (e.clientX - panX) * (newZoom / zoom)
            panY = e.clientY - (e.clientY - panY) * (newZoom / zoom)
            zoom = newZoom
            applyTransform()
            zoomWidget.sync(zoom)
        } else if (e.shiftKey) {
            panX -= e.deltaY
            applyTransform()
        } else {
            panX -= e.deltaX
            panY -= e.deltaY
            applyTransform()
        }
        scheduleSave()
    },
    { passive: false }
)

function addBlock(block: BoardObject) {
    blocks.push(block)
    if (block instanceof ShapeBlock) {
        block.onTextEditChange = () => {
            if (selectedBlocks.has(block) && selectedBlocks.size === 1) panel.show(block)
        }
    }
    block.getViewport = () => ({ panX, panY, zoom })
    block.onResize = () => selectionBox.setBlocks([...selectedBlocks])
    block.onDragStart = () => pushHistory()
    block.onBeforePropertyChange = () => {
        if (!propertyChangeActive) {
            pushHistory()
            propertyChangeActive = true
        }
    }
    block.onDragMove = (dx, dy) => {
        for (const b of selectedBlocks) {
            if (b === block) continue
            const pos = b.getPosition()
            b.setPosition(pos.x + dx, pos.y + dy)
        }
        selectionBox.update()
    }
    block.onSelect = (obj, e) => {
        if (e.ctrlKey) {
            selectedBlocks.add(obj)
            // Remove handles from all — no handles in multi-selection
            selectedBlocks.forEach((b) => b.markSelected())
            panel.show(canvasBoard)
        } else {
            // Replace selection
            selectedBlocks.forEach((b) => {
                if (b !== obj) b.markDeselected()
            })
            selectedBlocks.clear()
            selectedBlocks.add(obj)
            panel.show(obj)
        }
        selectionBox.setBlocks([...selectedBlocks])
        layersPanel.notifySelectionChanged(selectedBlocks)
    }
    block.onDeselect = () => {
        selectedBlocks.forEach((b) => b.markDeselected())
        selectedBlocks.clear()
        panel.show(canvasBoard)
        selectionBox.setBlocks([])
        layersPanel.notifySelectionChanged(selectedBlocks)
    }
    block.onChange = () => scheduleSave()

    // Snap guides — only for BoxBlock subclasses (not LineBlock).
    if (block instanceof BoxBlock) {
        block.snapPosition = (rawX, rawY) => {
            const { width, height } = block.getSize()
            const dragged = { x: rawX, y: rawY, width, height }
            // Exclude the dragged block and all co-traveling selected blocks from candidates.
            const candidates = blocks
                .filter((b) => b instanceof BoxBlock && b !== block && !selectedBlocks.has(b))
                .map((b) => {
                    const pos = b.getPosition()
                    const sz = b.getSize()
                    return { x: pos.x, y: pos.y, width: sz.width, height: sz.height }
                })
            // Threshold of 6 screen pixels, converted to board units so snap strength is
            // consistent regardless of zoom level.
            const result = computeSnap(dragged, candidates, 6 / zoom)
            guideOverlay.draw(result.guides, zoom, panX, panY)
            return { x: result.x, y: result.y }
        }
    }

    layersPanel.refresh(blocks, selectedBlocks)
}

function removeBlock(block: BoardObject) {
    block.onLayerChange = null
    const idx = blocks.indexOf(block)
    if (idx !== -1) blocks.splice(idx, 1)
    selectedBlocks.delete(block)
    block.destroy()
    if (selectedBlocks.size === 0) panel.show(canvasBoard)
    layersPanel.refresh(blocks, selectedBlocks)
}

function deleteSelected() {
    if (selectedBlocks.size === 0) return
    pushHistory()
    const toDelete = [...selectedBlocks]
    toDelete.forEach((b) => removeBlock(b))
    selectionBox.setBlocks([])
    scheduleSave()
}

panel.onDelete = () => deleteSelected()

layersPanel.onSelectBlock = (block) => {
    selectedBlocks.forEach((b) => {
        if (b !== block) b.markDeselected()
    })
    selectedBlocks.clear()
    selectedBlocks.add(block)
    block.markSelected()
    panel.show(block)
    selectionBox.setBlocks([block])
    layersPanel.notifySelectionChanged(selectedBlocks)
}

layersPanel.onReorder = (fromIdx, targetIdx, edge) => {
    if (fromIdx === targetIdx) return
    pushHistory()
    const insertAt =
        fromIdx < targetIdx
            ? edge === 'top'
                ? targetIdx
                : targetIdx - 1
            : edge === 'top'
              ? targetIdx + 1
              : targetIdx
    const [block] = blocks.splice(fromIdx, 1)
    blocks.splice(insertAt, 0, block)
    // Reorder DOM to match the new array order — last element is topmost (frontmost).
    blocks.forEach((b) => overlay.appendChild(b.el))
    layersPanel.refresh(blocks, selectedBlocks)
    scheduleSave()
}

// Drag-and-drop images from the OS onto the board.
app.addEventListener('dragover', (e) => {
    if (!e.dataTransfer?.types.includes('Files')) return
    e.preventDefault()
    app.classList.add('drag-over')
})

app.addEventListener('dragleave', (e) => {
    if ((e.relatedTarget as Node | null) && app.contains(e.relatedTarget as Node)) return
    app.classList.remove('drag-over')
})

app.addEventListener('drop', (e) => {
    e.preventDefault()
    app.classList.remove('drag-over')
    const files = Array.from(e.dataTransfer?.files ?? []).filter((f) => f.type.startsWith('image/'))
    if (files.length > 0) pushHistory()
    files.forEach((file, i) => {
        const x = Math.round((e.clientX - panX) / zoom - 160 + i * 20)
        const y = Math.round((e.clientY - panY) / zoom - 120 + i * 20)
        addBlock(
            new ImageBlock(overlay, {
                id: crypto.randomUUID(),
                name: nextName('Image'),
                x,
                y,
                width: 320,
                height: 240,
                rotation: 0,
                src: URL.createObjectURL(file),
                imageBlob: file,
                objectFit: 'contain',
                opacity: 100,
                borderRadius: 6,
                background: 'transparent',
                shadowColor: '',
                shadowBlur: 0,
                shadowX: 0,
                shadowY: 0,
            })
        )
    })
})

// Reset the property-change burst flag, clear snap guides, and persist state at the end of
// any mouse interaction.
document.addEventListener('mouseup', () => {
    guideOverlay.clear()
    propertyChangeActive = false
    scheduleSave()
})

// ── Arrow-key nudge ───────────────────────────────────────────────────────────
// Tap → 1 px immediately. Hold → rAF loop after NUDGE_INITIAL_DELAY ms.
// Time-based speed with subpixel accumulation gives smooth, frame-rate-independent motion.

const NUDGE_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'])
const NUDGE_INITIAL_DELAY = 500
const NUDGE_SPEED_START = 80 // px/s when hold begins
const NUDGE_SPEED_MAX = 500 // px/s at full acceleration
const NUDGE_ACCEL_DURATION = 1500 // ms to ramp from start to max speed
const heldArrows = new Set<string>()
let nudgeDelayId: number | null = null
let nudgeRafId: number | null = null
let nudgeStartTime = 0
let nudgeLastTime = 0
let nudgeAccumX = 0
let nudgeAccumY = 0
let nudgeHistoryPushed = false

function nudgeTick(ts: number) {
    if (heldArrows.size === 0 || selectedBlocks.size === 0) {
        nudgeRafId = null
        return
    }
    nudgeRafId = requestAnimationFrame(nudgeTick)

    // First frame: initialize timestamps and skip movement to avoid a large dt jump.
    if (nudgeLastTime === 0) {
        nudgeLastTime = ts
        nudgeStartTime = ts
        return
    }

    const dt = (ts - nudgeLastTime) / 1000
    nudgeLastTime = ts
    const t = Math.min(1, (ts - nudgeStartTime) / NUDGE_ACCEL_DURATION)
    const speed = NUDGE_SPEED_START + (NUDGE_SPEED_MAX - NUDGE_SPEED_START) * t

    if (heldArrows.has('ArrowLeft')) nudgeAccumX -= speed * dt
    if (heldArrows.has('ArrowRight')) nudgeAccumX += speed * dt
    if (heldArrows.has('ArrowUp')) nudgeAccumY -= speed * dt
    if (heldArrows.has('ArrowDown')) nudgeAccumY += speed * dt

    const dx = Math.trunc(nudgeAccumX)
    const dy = Math.trunc(nudgeAccumY)
    if (dx === 0 && dy === 0) return

    nudgeAccumX -= dx
    nudgeAccumY -= dy

    for (const b of selectedBlocks) {
        const pos = b.getPosition()
        b.setPosition(pos.x + dx, pos.y + dy)
        b.onChange?.()
    }
    selectionBox.update()
    scheduleSave()
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    const active = document.activeElement as HTMLElement
    if (active.isContentEditable || active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')
        return

    // Arrow-key nudge — move selected blocks in board space
    if (NUDGE_KEYS.has(e.key) && selectedBlocks.size > 0) {
        e.preventDefault()
        if (!heldArrows.has(e.key)) {
            heldArrows.add(e.key)
            if (!nudgeHistoryPushed) {
                pushHistory()
                nudgeHistoryPushed = true
            }
            // 1 px immediately on tap
            for (const b of selectedBlocks) {
                const pos = b.getPosition()
                const dx = heldArrows.has('ArrowRight') ? 1 : heldArrows.has('ArrowLeft') ? -1 : 0
                const dy = heldArrows.has('ArrowDown') ? 1 : heldArrows.has('ArrowUp') ? -1 : 0
                b.setPosition(pos.x + dx, pos.y + dy)
                b.onChange?.()
            }
            selectionBox.update()
            scheduleSave()
            if (nudgeDelayId === null && nudgeRafId === null) {
                nudgeDelayId = window.setTimeout(() => {
                    nudgeDelayId = null
                    if (heldArrows.size === 0) return
                    nudgeAccumX = 0
                    nudgeAccumY = 0
                    nudgeLastTime = 0
                    nudgeRafId = requestAnimationFrame(nudgeTick)
                }, NUDGE_INITIAL_DELAY)
            }
        }
        return
    }

    const shortcuts: [ActionBindings, () => void][] = [
        [keybindings.delete, () => deleteSelected()],
        [keybindings.undo, () => undo()],
        [keybindings.copy, () => copySelected()],
        [
            keybindings.cut,
            () => {
                copySelected()
                deleteSelected()
            },
        ],
        [keybindings.paste, () => paste()],
        [keybindings.pencilToggle, () => setPencilActive(!pencilActive)],
        [keybindings.switchToEdit, () => addBar.setMode('edit')],
        [keybindings.switchToExplore, () => addBar.setMode('explore')],
    ]
    for (const [binding, handler] of shortcuts) {
        if (matchesAction(e, binding)) {
            e.preventDefault()
            handler()
            return
        }
    }

    // Escape — cancel in-progress stroke, or deactivate pencil tool
    if (e.key === 'Escape') {
        if (cancelCurrentStroke) {
            cancelCurrentStroke()
            return
        }
        if (pencilActive) {
            setPencilActive(false)
            return
        }
    }
})

document.addEventListener('keyup', (e) => {
    if (!NUDGE_KEYS.has(e.key)) return
    heldArrows.delete(e.key)
    if (heldArrows.size === 0) {
        if (nudgeDelayId !== null) {
            clearTimeout(nudgeDelayId)
            nudgeDelayId = null
        }
        if (nudgeRafId !== null) {
            cancelAnimationFrame(nudgeRafId)
            nudgeRafId = null
        }
        nudgeHistoryPushed = false
    }
})

// ── Pencil drawing ────────────────────────────────────────────────────────────

function startDrawing(e: MouseEvent) {
    const toBoard = (cx: number, cy: number) => ({
        x: (cx - panX) / zoom,
        y: (cy - panY) / zoom,
    })

    const startPt = toBoard(e.clientX, e.clientY)
    const rawPoints = [startPt]

    // Elastic band: a "nib" position that chases the real cursor with exponential decay.
    // This produces naturally smooth input without post-processing.
    let targetX = startPt.x
    let targetY = startPt.y
    let nibX = startPt.x
    let nibY = startPt.y
    let lastAddedX = startPt.x
    let lastAddedY = startPt.y

    // Temporary preview path in the overlay (board-space coordinates).
    // width/height 100% covers the full overlay so the SVG viewport isn't zero-sized.
    const ns = 'http://www.w3.org/2000/svg'
    const previewSvg = document.createElementNS(ns, 'svg')
    previewSvg.style.cssText = 'position:absolute;inset:0;overflow:visible;pointer-events:none'
    previewSvg.setAttribute('width', '100%')
    previewSvg.setAttribute('height', '100%')

    const previewPath = document.createElementNS(ns, 'path')
    previewPath.setAttribute('fill', 'none')
    previewPath.setAttribute('stroke', pencilSettings.stroke)
    previewPath.setAttribute('stroke-width', String(pencilSettings.strokeWidth))
    previewPath.setAttribute('stroke-linecap', 'round')
    previewPath.setAttribute('stroke-linejoin', 'round')
    previewSvg.appendChild(previewPath)
    overlay.appendChild(previewSvg)

    let committed = false
    let cancelled = false
    let animFrame: number

    const tick = () => {
        nibX += (targetX - nibX) * PENCIL_ELASTIC
        nibY += (targetY - nibY) * PENCIL_ELASTIC

        // Add a new point when the nib has moved at least 1.5 screen pixels in board units.
        if (Math.hypot(nibX - lastAddedX, nibY - lastAddedY) > 1.5 / zoom) {
            rawPoints.push({ x: nibX, y: nibY })
            lastAddedX = nibX
            lastAddedY = nibY
            // Show smooth preview using the same Catmull-Rom the committed block will use.
            previewPath.setAttribute('d', buildSvgPath(rawPoints, pencilSettings.smoothing))
        }

        animFrame = requestAnimationFrame(tick)
    }
    animFrame = requestAnimationFrame(tick)

    cancelCurrentStroke = () => {
        cancelled = true
        cancelAnimationFrame(animFrame)
        previewSvg.remove()
        cancelCurrentStroke = null
    }

    const onMove = (ev: MouseEvent) => {
        const pt = toBoard(ev.clientX, ev.clientY)
        targetX = pt.x
        targetY = pt.y
    }

    const onUp = () => {
        cancelAnimationFrame(animFrame)
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        cancelCurrentStroke = null
        previewSvg.remove()
        if (cancelled || committed) return
        committed = true
        commitDrawing(rawPoints)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
}

function commitDrawing(rawPoints: Array<{ x: number; y: number }>) {
    if (rawPoints.length < 2) return

    // Simplify with RDP (epsilon in board units ≈ 1.5 screen pixels at current zoom).
    const reduced = rdp(rawPoints, 1.5 / zoom)
    if (reduced.length < 1) return

    // Compute bounding box.
    let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity
    for (const p of reduced) {
        if (p.x < minX) minX = p.x
        if (p.y < minY) minY = p.y
        if (p.x > maxX) maxX = p.x
        if (p.y > maxY) maxY = p.y
    }

    // Ensure non-zero dimensions so the bounding box is always valid.
    const w = Math.max(maxX - minX, 1)
    const h = Math.max(maxY - minY, 1)

    // Convert to local space (relative to bounding box origin).
    const localPoints = reduced.map((p) => ({ x: p.x - minX, y: p.y - minY }))

    pushHistory()
    addBlock(
        new PathBlock(overlay, {
            id: crypto.randomUUID(),
            name: nextName('Path'),
            x: minX,
            y: minY,
            width: w,
            height: h,
            rotation: 0,
            points: localPoints,
            stroke: pencilSettings.stroke,
            strokeEnd: pencilSettings.strokeEnd || undefined,
            strokeWidth: pencilSettings.strokeWidth,
            taper: pencilSettings.taper,
            opacity: 100,
            smoothing: pencilSettings.smoothing,
        })
    )
    scheduleSave()
}

function rectsIntersect(a: DOMRect, b: DOMRect): boolean {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

// Right-click drag and middle-click drag pan the canvas in edit mode.
// A right-click that never moves past the threshold is not considered a pan, so
// the contextmenu event is only suppressed when a drag actually occurred.
let rightDragPanned = false

document.addEventListener('contextmenu', (e) => {
    if (rightDragPanned) {
        e.preventDefault()
        rightDragPanned = false
    }
})

document.addEventListener('mousedown', (e) => {
    if (e.button === 2 || e.button === 1) {
        const target = e.target as HTMLElement
        if (target.closest('#properties-panel, #layers-panel, #add-bar, #zoom-widget')) return
        e.preventDefault()

        const startX = e.clientX - panX
        const startY = e.clientY - panY
        let panning = false

        const onMove = (e: MouseEvent) => {
            if (!panning) {
                if (Math.hypot(e.clientX - (startX + panX), e.clientY - (startY + panY)) < 4) return
                panning = true
                if (e.buttons & 2) rightDragPanned = true
                app.classList.add('panning')
            }
            panX = e.clientX - startX
            panY = e.clientY - startY
            applyTransform()
        }

        const onUp = () => {
            if (panning) app.classList.remove('panning')
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
        }

        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
        return
    }

    if (e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest('#properties-panel, #layers-panel, #add-bar, #zoom-widget')) return

    if (mode === 'explore') {
        e.preventDefault()
        app.classList.add('panning')
        const startX = e.clientX - panX
        const startY = e.clientY - panY
        const onMove = (e: MouseEvent) => {
            panX = e.clientX - startX
            panY = e.clientY - startY
            applyTransform()
        }
        const onUp = () => {
            app.classList.remove('panning')
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
        }
        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
        return
    }

    // Pencil tool: start freehand drawing instead of marquee.
    if (pencilActive) {
        if (
            target.closest(
                '.text-block, .image-block, .shape-block, .line-block, .path-block, .note-block'
            )
        )
            return
        e.preventDefault()
        startDrawing(e)
        return
    }

    if (
        target.closest(
            '.text-block, .image-block, .shape-block, .line-block, .path-block, .note-block'
        )
    )
        return

    const startX = e.clientX
    const startY = e.clientY
    let dragging = false
    const marquee = document.createElement('div')
    marquee.className = 'marquee'

    const onMove = (e: MouseEvent) => {
        if (!dragging) {
            if (Math.hypot(e.clientX - startX, e.clientY - startY) < 4) return
            dragging = true
            app.appendChild(marquee)
        }
        const x = Math.min(startX, e.clientX)
        const y = Math.min(startY, e.clientY)
        marquee.style.left = `${x}px`
        marquee.style.top = `${y}px`
        marquee.style.width = `${Math.abs(e.clientX - startX)}px`
        marquee.style.height = `${Math.abs(e.clientY - startY)}px`
    }

    const onUp = () => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        if (!dragging) return
        const marqueeRect = marquee.getBoundingClientRect()
        marquee.remove()
        selectedBlocks.forEach((b) => b.markDeselected())
        selectedBlocks.clear()

        for (const block of blocks) {
            if (rectsIntersect(marqueeRect, block.el.getBoundingClientRect())) {
                selectedBlocks.add(block)
                block.markSelected()
            }
        }

        if (selectedBlocks.size === 0) panel.show(canvasBoard)
        selectionBox.setBlocks([...selectedBlocks])
        layersPanel.notifySelectionChanged(selectedBlocks)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
})

// Returns a position near the center of the viewport with a slight random offset
// so multiple objects added in sequence don't stack exactly on top of each other.
function centerPosition() {
    return {
        x: Math.round((window.innerWidth / 2 - panX) / zoom - 150 + (Math.random() - 0.5) * 40),
        y: Math.round((window.innerHeight / 2 - panY) / zoom - 100 + (Math.random() - 0.5) * 40),
    }
}

// Returns the next available name for a given label, e.g. "Rectangle 3" when
// "Rectangle 1" and "Rectangle 2" already exist.
function nextName(label: string): string {
    let max = 0
    const re = new RegExp(`^${label} (\\d+)$`)
    for (const b of blocks) {
        const m = b.name.match(re)
        if (m) max = Math.max(max, parseInt(m[1], 10))
    }
    return `${label} ${max + 1}`
}

addBar.onAddText = () => {
    pushHistory()
    const { x, y } = centerPosition()
    addBlock(
        new TextBlock(overlay, {
            id: crypto.randomUUID(),
            name: nextName('Text'),
            x,
            y,
            width: 240,
            rotation: 0,
            autoHeight: true,
            content: '',
            fontSize: 16,
            color: '#333333',
            fontFamily: 'Inter',
            textAlign: 'left',
        })
    )
}

addBar.onAddImage = () => {
    pushHistory()
    const { x, y } = centerPosition()
    addBlock(
        new ImageBlock(overlay, {
            id: crypto.randomUUID(),
            name: nextName('Image'),
            x,
            y,
            width: 320,
            height: 240,
            rotation: 0,
            src: '',
            objectFit: 'contain',
            opacity: 100,
            borderRadius: 6,
            background: 'transparent',
            shadowColor: '',
            shadowBlur: 0,
            shadowX: 0,
            shadowY: 0,
        })
    )
}

addBar.onAddNote = () => {
    pushHistory()
    const { x, y } = centerPosition()
    const note = new NoteBlock(overlay, {
        id: crypto.randomUUID(),
        name: nextName('Note'),
        x,
        y,
        width: 240,
        rotation: 0,
        content: '',
        color: '#fef08a',
        fontSize: 14,
        fontFamily: 'Inter',
        opacity: 100,
        shadowColor: '',
        shadowBlur: 0,
        shadowX: 0,
        shadowY: 0,
    })
    addBlock(note)
    note.startEdit()
}

addBar.onAddShape = (shape) => {
    pushHistory()
    const { x, y } = centerPosition()
    const style = getComputedStyle(document.documentElement)
    const accentColor = style.getPropertyValue('--color-accent').trim()
    const accentBorder = style.getPropertyValue('--color-accent-border').trim()
    if (shape === 'line' || shape === 'arrow') {
        addBlock(
            new LineBlock(overlay, {
                id: crypto.randomUUID(),
                name: nextName('Line'),
                x1: x,
                y1: y + 80,
                x2: x + 200,
                y2: y + 80,
                stroke: accentColor,
                strokeWidth: 2,
                opacity: 100,
                startPoint: 'none',
                endPoint: shape === 'arrow' ? 'triangle-arrow' : 'none',
            })
        )
        return
    }
    addBlock(
        new ShapeBlock(overlay, {
            id: crypto.randomUUID(),
            name: nextName(shape.charAt(0).toUpperCase() + shape.slice(1)),
            x,
            y,
            width: 160,
            height: 160,
            rotation: 0,
            shape,
            fill: accentBorder,
            stroke: '',
            strokeWidth: 0,
            borderRadius: 8,
            sides: 5,
            starPoints: 5,
            opacity: 100,
            shadowColor: '',
            shadowBlur: 0,
            shadowX: 0,
            shadowY: 0,
            text: '',
            textColor: '#000000',
            fontSize: 16,
            fontFamily: 'Inter',
            textAlign: 'center',
            textVerticalAlign: 'middle',
            textPadding: 8,
        })
    )
}

// ── Board-level actions ───────────────────────────────────────────────────────

async function newBoard() {
    if (
        !(await Dialog.confirm('Clear the board and start fresh? This cannot be undone.', {
            confirmLabel: 'Clear board',
            destructive: true,
        }))
    )
        return
    for (const b of [...blocks]) removeBlock(b)
    selectionBox.setBlocks([])
    panel.show(canvasBoard)
    history.length = 0
    panX = 0
    panY = 0
    zoom = 1
    applyTransform()
    zoomWidget.sync(zoom)
    canvasBoard.setBackground('')
    boardName = 'Untitled board'
    layersPanel.setName(boardName)
    void db.boards.delete('default')
}

async function exportBoard() {
    const blockData = await Promise.all(
        blocks.map(async (block) => {
            const snap = snapshotBlock(block)
            if (snap.type !== 'image') return snap
            const { imageBlob, ...rest } = snap.data
            let src = snap.data.src
            if (imageBlob) {
                const buf = await imageBlob.arrayBuffer()
                const bytes = new Uint8Array(buf)
                let binary = ''
                for (const byte of bytes) binary += String.fromCharCode(byte)
                src = `data:${imageBlob.type};base64,${btoa(binary)}`
            } else if (src.startsWith('blob:')) {
                src = ''
            }
            return { type: 'image' as const, data: { ...rest, src } }
        })
    )
    const data = {
        schemaVersion: SCHEMA_VERSION,
        boardName,
        canvasBackground: canvasBoard.getBackground(),
        panX,
        panY,
        zoom,
        blocks: blockData,
    }
    const json = JSON.stringify(data, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${boardName}.json`
    a.click()
    URL.revokeObjectURL(url)
}

function importBoard() {
    const fileInput = document.createElement('input')
    fileInput.type = 'file'
    fileInput.accept = '.json,application/json'
    fileInput.addEventListener('change', () => {
        const file = fileInput.files?.[0]
        if (!file) return
        void file.text().then(async (text) => {
            let data: ReturnType<typeof JSON.parse>
            try {
                data = JSON.parse(text)
            } catch {
                void Dialog.alert('Invalid JSON file.')
                return
            }
            if (data.schemaVersion < MIN_SUPPORTED_VERSION || data.schemaVersion > SCHEMA_VERSION) {
                void Dialog.alert(
                    `Cannot import: schema version ${data.schemaVersion} is not supported.`
                )
                return
            }
            if (
                blocks.length > 0 &&
                !(await Dialog.confirm('Import will overwrite the current board. Continue?', {
                    confirmLabel: 'Import',
                    destructive: true,
                }))
            )
                return
            for (const b of [...blocks]) removeBlock(b)
            selectionBox.setBlocks([])
            panel.show(canvasBoard)
            history.length = 0
            panX = data.panX ?? 0
            panY = data.panY ?? 0
            zoom = data.zoom ?? 1
            applyTransform()
            zoomWidget.sync(zoom)
            canvasBoard.setBackground(data.canvasBackground ?? '')
            boardName = data.boardName ?? 'Untitled board'
            layersPanel.setName(boardName)
            for (const snap of migrateBlocks(data.blocks ?? [], data.schemaVersion)) {
                if (
                    snap.type === 'image' &&
                    typeof snap.data.src === 'string' &&
                    snap.data.src.startsWith('data:')
                ) {
                    const [header, b64] = snap.data.src.split(',')
                    const mime = header.match(/data:([^;]+)/)?.[1] ?? 'image/png'
                    const binary = atob(b64)
                    const bytes = new Uint8Array(binary.length)
                    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
                    const imageBlob = new Blob([bytes], { type: mime })
                    addBlock(
                        blockFromSnapshot({
                            type: 'image',
                            data: { ...snap.data, src: URL.createObjectURL(imageBlob), imageBlob },
                        })
                    )
                } else {
                    addBlock(blockFromSnapshot(snap))
                }
            }
            scheduleSave()
        })
    })
    fileInput.click()
}

async function exportBoardPng() {
    let blob: Blob
    // When no explicit canvas background is set, fall back to the app element's computed
    // CSS background so the PNG matches what the user sees (dark/light theme checkerboard
    // base color). Without this, a transparent PNG at low opacity looks white in viewers.
    const exportBg = canvasBoard.getBackground() || window.getComputedStyle(app).backgroundColor
    try {
        blob = await exporter.exportToPng(blocks, exportBg, 2)
    } catch (err) {
        void Dialog.alert(err instanceof Error ? err.message : 'Export failed.')
        return
    }

    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${boardName}.png`
    a.click()
    URL.revokeObjectURL(url)
}

async function loadDemo() {
    if (
        blocks.length > 0 &&
        !(await Dialog.confirm('Load demo? This will overwrite the current board.', {
            confirmLabel: 'Load demo',
            destructive: true,
        }))
    )
        return
    for (const b of [...blocks]) removeBlock(b)
    selectionBox.setBlocks([])
    panel.show(canvasBoard)
    history.length = 0
    boardName = 'Untitled board'
    layersPanel.setName(boardName)
    addBlock(
        new TextBlock(overlay, {
            id: crypto.randomUUID(),
            x: 250,
            y: 100,
            rotation: 0,
            content:
                '<h1>Hello moodboard</h1><p>Double-click to <strong>edit</strong>. Select text to format it.</p><ul><li>item one</li><li>item two</li></ul>',
            fontSize: 16,
            color: '#333333',
            fontFamily: 'Inter',
            textAlign: 'left',
        })
    )
    addBlock(
        new ImageBlock(overlay, {
            id: crypto.randomUUID(),
            x: 570,
            y: 100,
            width: 320,
            height: 240,
            rotation: 0,
            src: '/moodboard/assets/sample.jpg',
            objectFit: 'contain',
            opacity: 100,
            borderRadius: 6,
            background: 'transparent',
            shadowColor: '',
            shadowBlur: 20,
            shadowX: 0,
            shadowY: 4,
        })
    )
    scheduleSave()
}

canvasBoard.onNewBoard = newBoard
canvasBoard.onLoadDemo = loadDemo
canvasBoard.onExport = exportBoard
canvasBoard.onImport = importBoard
canvasBoard.onExportPng = exportBoardPng

const exporter = new Exporter()

// Load persisted board, or show demo objects on first visit.
void loadBoard().then((loaded) => {
    if (!loaded) loadDemo()
    // Refresh the panel so the canvas background color reflects the loaded value.
    // panel.show(canvasBoard) was called synchronously before loadBoard resolved,
    // so it captured bg = '' regardless of what was stored.
    else panel.show(canvasBoard)
})
