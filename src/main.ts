// App entry point — initializes the canvas, HTML overlay, and demo content.

import './style.css'
import { Canvas } from 'fabric'
import { TextBlock } from './board/TextBlock'

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

// Overlay hosts HTML-based elements (text blocks) layered above the Fabric canvas.
const overlay = document.createElement('div')
overlay.id = 'overlay'
overlay.className = 'absolute inset-0 pointer-events-none'
app.appendChild(overlay)

new TextBlock(overlay, {
    id: 'demo',
    x: 100,
    y: 100,
    rotation: 0,
    content:
        '# Hello moodboard\n\nDouble-click to **edit**. Supports _markdown_.\n\n- item one\n- item two',
    fontSize: 16,
    padding: 16,
})
