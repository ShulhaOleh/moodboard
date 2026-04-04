// App entry point — initializes the board overlay and wires up UI components.

import './style.css'
import { TextBlock } from './board/TextBlock'
import { ImageBlock } from './board/ImageBlock'
import { ShapeBlock } from './board/ShapeBlock'
import { LineBlock } from './board/LineBlock'
import { PropertiesPanel } from './ui/PropertiesPanel'
import { LayersPanel } from './ui/LayersPanel'
import { AddBar, BoardMode } from './ui/AddBar'
import { BoardObject } from './board/BoardObject'
import { CanvasBoard } from './board/CanvasBoard'
import { SelectionBox } from './ui/SelectionBox'
import { ZoomWidget } from './ui/ZoomWidget'
import { db, type PersistedBlock, SCHEMA_VERSION } from './lib/db'

type BlockSnapshot = PersistedBlock

const app = document.getElementById('app')!

const panel = new PropertiesPanel(app)
const layersPanel = new LayersPanel(app)
// Keep the zoom widget from overlapping the docked layers panel.
layersPanel.onDockChange = (docked) => app.classList.toggle('layers-panel-docked', docked)
app.classList.add('layers-panel-docked') // docked by default
const canvasBoard = new CanvasBoard(app)
panel.show(canvasBoard)
const addBar = new AddBar(app)

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
    })
}

// Returns true if saved data was found and restored.
async function loadBoard(): Promise<boolean> {
    const record = await db.boards.get('default')
    if (!record) return false
    if (record.schemaVersion !== SCHEMA_VERSION) {
        console.warn(
            `Board schema v${record.schemaVersion} does not match current v${SCHEMA_VERSION} — skipping load`
        )
        return false
    }
    panX = record.panX
    panY = record.panY
    zoom = record.zoom
    applyTransform()
    zoomWidget.sync(zoom)
    for (const snap of record.blocks) {
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
    if (block instanceof ShapeBlock) return { type: 'shape', data: { ...block.getData() } }
    if (block instanceof LineBlock) return { type: 'line', data: { ...block.getData() } }
    throw new Error('Unknown block type')
}

function pushHistory() {
    history.push(blocks.map(snapshotBlock))
}

function blockFromSnapshot(snap: BlockSnapshot): BoardObject {
    switch (snap.type) {
        case 'text':
            return new TextBlock(overlay, snap.data)
        case 'image':
            return new ImageBlock(overlay, snap.data)
        case 'shape':
            return new ShapeBlock(overlay, snap.data)
        case 'line':
            return new LineBlock(overlay, snap.data)
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
    // Deselect everything when switching to explore
    selectedBlocks.forEach((b) => b.markDeselected())
    selectedBlocks.clear()
    panel.show(canvasBoard)
    selectionBox.setBlocks([])
    layersPanel.notifySelectionChanged(selectedBlocks)
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

// Reset the property-change burst flag and persist state at the end of any mouse interaction.
document.addEventListener('mouseup', () => {
    propertyChangeActive = false
    scheduleSave()
})

// Keyboard shortcuts: delete, undo, copy, cut, paste.
document.addEventListener('keydown', (e) => {
    const active = document.activeElement as HTMLElement
    const inEditable =
        active.isContentEditable || active.tagName === 'INPUT' || active.tagName === 'TEXTAREA'

    if ((e.key === 'Delete' || e.key === 'Backspace') && !inEditable) {
        deleteSelected()
        return
    }

    if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z' && !inEditable) {
            e.preventDefault()
            undo()
            return
        }
        if (e.key === 'c' && !inEditable) {
            e.preventDefault()
            copySelected()
            return
        }
        if (e.key === 'x' && !inEditable) {
            e.preventDefault()
            copySelected()
            deleteSelected()
            return
        }
        if (e.key === 'v' && !inEditable) {
            e.preventDefault()
            paste()
            return
        }
    }
})

function rectsIntersect(a: DOMRect, b: DOMRect): boolean {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

// Drag on empty board space: pan in explore mode, marquee select in edit mode.
document.addEventListener('mousedown', (e) => {
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

    if (target.closest('.text-block, .image-block, .shape-block, .line-block')) return

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

addBar.onAddText = () => {
    pushHistory()
    const { x, y } = centerPosition()
    addBlock(
        new TextBlock(overlay, {
            id: crypto.randomUUID(),
            x,
            y,
            width: 240,
            rotation: 0,
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

addBar.onAddShape = (shape) => {
    pushHistory()
    const { x, y } = centerPosition()
    if (shape === 'line' || shape === 'arrow') {
        addBlock(
            new LineBlock(overlay, {
                id: crypto.randomUUID(),
                x1: x,
                y1: y + 80,
                x2: x + 200,
                y2: y + 80,
                stroke: '#7c3aed',
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
            x,
            y,
            width: 160,
            height: 160,
            rotation: 0,
            shape,
            fill: '#c4b5fd',
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

// Load persisted board, or show demo objects on first visit.
void loadBoard().then((loaded) => {
    if (loaded) return
    addBlock(
        new TextBlock(overlay, {
            id: 'demo',
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
            id: 'demo-image',
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
})
