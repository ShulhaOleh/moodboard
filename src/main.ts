// App entry point — initializes the board overlay and wires up UI components.

import './style.css'
import { TextBlock } from './board/TextBlock'
import { ImageBlock } from './board/ImageBlock'
import { PropertiesPanel } from './ui/PropertiesPanel'
import { AddBar } from './ui/AddBar'
import { BoardObject } from './board/BoardObject'

const app = document.getElementById('app')!

const panel = new PropertiesPanel(app)
const addBar = new AddBar(app)

const overlay = document.createElement('div')
overlay.id = 'overlay'
overlay.className = 'absolute inset-0 pointer-events-none'
app.appendChild(overlay)

const blocks: BoardObject[] = []

function addBlock(block: BoardObject) {
    blocks.push(block)
    block.onSelect = (obj) => panel.show(obj)
    block.onDeselect = () => panel.hide()
}

function removeBlock(block: BoardObject) {
    const idx = blocks.indexOf(block)
    if (idx !== -1) blocks.splice(idx, 1)
    block.destroy()
    panel.hide()
}

panel.onDelete = () => {
    if (panel.object) removeBlock(panel.object)
}

// Delete/Backspace removes the selected block unless focus is inside an editable element.
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Delete' && e.key !== 'Backspace') return
    const active = document.activeElement as HTMLElement
    if (active.isContentEditable || active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')
        return
    if (panel.object) removeBlock(panel.object)
})

// Returns a position near the center of the viewport with a slight random offset
// so multiple objects added in sequence don't stack exactly on top of each other.
function centerPosition() {
    return {
        x: Math.round(window.innerWidth / 2 - 150 + (Math.random() - 0.5) * 40),
        y: Math.round(window.innerHeight / 2 - 100 + (Math.random() - 0.5) * 40),
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
