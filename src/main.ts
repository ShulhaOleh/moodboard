import './style.css'
import { Canvas, FabricText } from 'fabric'

const app = document.getElementById('app')!

const canvasEl = document.createElement('canvas')
canvasEl.width = 800
canvasEl.height = 600
app.appendChild(canvasEl)

const canvas = new Canvas(canvasEl)

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
