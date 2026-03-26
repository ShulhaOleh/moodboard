// App entry point — initializes the canvas, HTML overlay, and demo content.

import './style.css'
import { Canvas } from 'fabric'
import { TextBlock } from './board/TextBlock'
import { PropertiesPanel } from './ui/PropertiesPanel'

const app = document.getElementById('app')!

const canvasEl = document.createElement('canvas')
app.appendChild(canvasEl)

const canvas = new Canvas(canvasEl, {
    width: window.innerWidth,
    height: window.innerHeight,
})

window.addEventListener('resize', () => {
    canvas.setDimensions({ width: window.innerWidth, height: window.innerHeight })
})

const panel = new PropertiesPanel(app)

// Overlay hosts HTML-based elements (text blocks) layered above the Fabric canvas.
const overlay = document.createElement('div')
overlay.id = 'overlay'
overlay.className = 'absolute inset-0 pointer-events-none'
app.appendChild(overlay)

const demo = new TextBlock(overlay, {
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
})

demo.onSelect = (obj) => panel.show(obj)
demo.onDeselect = () => panel.hide()
