import './style.css'
import { Canvas, FabricText } from 'fabric'

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

const text = new FabricText('moodboard', {
    left: 400,
    top: 300,
    originX: 'center',
    originY: 'center',
    fontSize: 48,
    fill: '#333',
})

canvas.add(text)
canvas.renderAll()
