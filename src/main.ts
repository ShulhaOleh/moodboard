// App entry point — initializes the board overlay and wires up UI components.

import './style.css'
import { TextBlock } from './board/TextBlock'
import { ImageBlock } from './board/ImageBlock'
import { PropertiesPanel } from './ui/PropertiesPanel'
import { AddBar, BoardMode } from './ui/AddBar'
import { BoardObject } from './board/BoardObject'

const app = document.getElementById('app')!

const panel = new PropertiesPanel(app)
const addBar = new AddBar(app)

const overlay = document.createElement('div')
overlay.id = 'overlay'
overlay.className = 'absolute inset-0 pointer-events-none'
app.appendChild(overlay)

const zoomWidget = document.createElement('div')
zoomWidget.id = 'zoom-widget'

const zoomSlider = document.createElement('input')
zoomSlider.type = 'range'
zoomSlider.min = '10'
zoomSlider.max = '400'
zoomSlider.step = '1'
zoomSlider.value = '100'
zoomSlider.addEventListener('input', () => {
    const newZoom = Number(zoomSlider.value) / 100
    panX = window.innerWidth / 2 - (window.innerWidth / 2 - panX) * (newZoom / zoom)
    panY = window.innerHeight / 2 - (window.innerHeight / 2 - panY) * (newZoom / zoom)
    zoom = newZoom
    applyTransform()
    zoomLabel.textContent = `${Math.round(zoom * 100)}%`
})

const zoomLabel = document.createElement('span')
zoomLabel.id = 'zoom-label'
zoomLabel.textContent = '100%'

zoomWidget.append(zoomSlider, zoomLabel)
app.appendChild(zoomWidget)

const blocks: BoardObject[] = []
const selectedBlocks = new Set<BoardObject>()

let mode: BoardMode = 'edit'
let panX = 0
let panY = 0
let zoom = 1

function applyTransform() {
    overlay.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`
    overlay.style.transformOrigin = '0 0'
}

addBar.onModeChange = (newMode) => {
    mode = newMode
    app.classList.toggle('explore-mode', mode === 'explore')
    if (mode === 'edit') return
    // Deselect everything when switching to explore
    selectedBlocks.forEach((b) => b.markDeselected())
    selectedBlocks.clear()
    panel.hide()
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
            zoomLabel.textContent = `${Math.round(zoom * 100)}%`
            zoomSlider.value = String(Math.round(zoom * 100))
        } else if (e.shiftKey) {
            panX -= e.deltaY
            applyTransform()
        } else {
            panX -= e.deltaX
            panY -= e.deltaY
            applyTransform()
        }
    },
    { passive: false }
)

function addBlock(block: BoardObject) {
    blocks.push(block)
    block.onDragMove = (dx, dy) => {
        for (const b of selectedBlocks) {
            if (b === block) continue
            const pos = b.getPosition()
            b.setPosition(pos.x + dx, pos.y + dy)
        }
    }
    block.onSelect = (obj, e) => {
        if (e.ctrlKey) {
            selectedBlocks.add(obj)
            // Remove handles from all — no handles in multi-selection
            selectedBlocks.forEach((b) => b.markSelected())
            panel.hide()
        } else {
            // Replace selection
            selectedBlocks.forEach((b) => {
                if (b !== obj) b.markDeselected()
            })
            selectedBlocks.clear()
            selectedBlocks.add(obj)
            panel.show(obj)
        }
    }
    block.onDeselect = () => {
        selectedBlocks.forEach((b) => b.markDeselected())
        selectedBlocks.clear()
        panel.hide()
    }
}

function removeBlock(block: BoardObject) {
    const idx = blocks.indexOf(block)
    if (idx !== -1) blocks.splice(idx, 1)
    selectedBlocks.delete(block)
    block.destroy()
    if (selectedBlocks.size === 0) panel.hide()
}

function deleteSelected() {
    const toDelete = [...selectedBlocks]
    toDelete.forEach((b) => removeBlock(b))
}

panel.onDelete = () => deleteSelected()

// Delete/Backspace removes selected blocks unless focus is inside an editable element.
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Delete' && e.key !== 'Backspace') return
    const active = document.activeElement as HTMLElement
    if (active.isContentEditable || active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')
        return
    deleteSelected()
})

function rectsIntersect(a: DOMRect, b: DOMRect): boolean {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
}

// Drag on empty board space: pan in explore mode, marquee select in edit mode.
document.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest('#properties-panel, #add-bar, #zoom-widget')) return

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

    if (target.closest('.text-block, .image-block')) return

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

        if (selectedBlocks.size === 0) panel.hide()
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
            padding: 16,
            color: '#333333',
            background: '#ffffff',
            fontFamily: 'Inter',
            textAlign: 'left',
            borderRadius: 6,
        })
    )
}

addBar.onAddImage = (blob) => {
    const { x, y } = centerPosition()
    addBlock(
        new ImageBlock(overlay, {
            id: crypto.randomUUID(),
            x,
            y,
            width: 320,
            height: 240,
            rotation: 0,
            src: URL.createObjectURL(blob),
            imageBlob: blob,
            objectFit: 'contain',
            opacity: 100,
            borderRadius: 6,
            background: 'transparent',
        })
    )
}

// Demo objects
addBlock(
    new TextBlock(overlay, {
        id: 'demo',
        x: 100,
        y: 100,
        rotation: 0,
        content:
            '<h1>Hello moodboard</h1><p>Double-click to <strong>edit</strong>. Select text to format it.</p><ul><li>item one</li><li>item two</li></ul>',
        fontSize: 16,
        padding: 16,
        color: '#333333',
        background: '#ffffff',
        fontFamily: 'Inter',
        textAlign: 'left',
        borderRadius: 6,
    })
)

addBlock(
    new ImageBlock(overlay, {
        id: 'demo-image',
        x: 420,
        y: 100,
        width: 320,
        height: 240,
        rotation: 0,
        src: '/moodboard/assets/sample.jpg',
        objectFit: 'contain',
        opacity: 100,
        borderRadius: 6,
        background: 'transparent',
    })
)
