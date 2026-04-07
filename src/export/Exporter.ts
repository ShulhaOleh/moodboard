// Scene-graph renderer — exports the board to a PNG by traversing all visible blocks
// and drawing them to an OffscreenCanvas using the Canvas 2D API.
// No DOM capture; each block type is rasterized from its data model.

import { BoardObject } from '../board/BoardObject'
import { TextBlock } from '../board/TextBlock'
import { ImageBlock } from '../board/ImageBlock'
import { ShapeBlock, type ShapeBlockData, type ShapeType } from '../board/ShapeBlock'
import { LineBlock, type PointStyle } from '../board/LineBlock'
import { PathBlock } from '../board/PathBlock'
import { traceCanvasPath } from '../board/pathUtils'
import { parseHtmlText, type StyledParagraph, type TextRun } from './parseHtmlText'

const PADDING = 40

// ── Public API ────────────────────────────────────────────────────────────────

export class Exporter {
    async exportToPng(blocks: BoardObject[], background: string, scale: number): Promise<Blob> {
        const visible = blocks.filter((b) => b.visible)
        const bbox = computeBBox(visible)
        if (!bbox) throw new Error('Nothing to export — add some blocks first.')

        const cw = Math.ceil(bbox.width * scale)
        const ch = Math.ceil(bbox.height * scale)
        const canvas = makeCanvas(cw, ch)
        const ctx = canvas.getContext('2d') as CanvasRenderingContext2D
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = 'high'

        // Map board space → canvas pixels
        ctx.scale(scale, scale)
        ctx.translate(-bbox.x, -bbox.y)

        // Board background
        if (background) {
            ctx.fillStyle = background
            ctx.fillRect(bbox.x, bbox.y, bbox.width, bbox.height)
        }

        // Collect all font families referenced by visible text so we can explicitly
        // load them before any canvas measurement — document.fonts.ready alone does
        // not guarantee dynamically-injected Google Fonts <link> tags have resolved.
        const fontFamilies = new Set<string>()
        for (const block of visible) {
            if (block instanceof TextBlock) fontFamilies.add(block.getData().fontFamily)
            if (block instanceof ShapeBlock && block.getData().text)
                fontFamilies.add(block.getData().fontFamily)
        }
        await Promise.all([
            document.fonts.ready,
            ...[...fontFamilies].map((f) => document.fonts.load(`16px "${f}"`)),
        ])
        const images = await preloadImages(visible)

        for (const block of visible) {
            ctx.save()
            renderBlock(ctx, block, images, background)
            ctx.restore()
        }

        return canvasToBlob(canvas)
    }
}

// ── Bounding box ──────────────────────────────────────────────────────────────

function computeBBox(
    blocks: BoardObject[]
): { x: number; y: number; width: number; height: number } | null {
    let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity

    for (const block of blocks) {
        const corners = block.getWorldCorners()
        if (corners.length === 0) continue
        for (const [cx, cy] of corners) {
            if (cx < minX) minX = cx
            if (cy < minY) minY = cy
            if (cx > maxX) maxX = cx
            if (cy > maxY) maxY = cy
        }

        // Expand for shadow extent so no shadow is clipped
        let expand = 0
        if (block instanceof ImageBlock) {
            const d = block.getData()
            if (d.shadowColor) expand = Math.abs(d.shadowX) + Math.abs(d.shadowY) + d.shadowBlur
        } else if (block instanceof ShapeBlock) {
            const d = block.getData()
            if (d.shadowColor) expand = Math.abs(d.shadowX) + Math.abs(d.shadowY) + d.shadowBlur
        }
        if (expand > 0) {
            minX -= expand
            minY -= expand
            maxX += expand
            maxY += expand
        }
    }

    if (!isFinite(minX)) return null
    return {
        x: minX - PADDING,
        y: minY - PADDING,
        width: maxX - minX + PADDING * 2,
        height: maxY - minY + PADDING * 2,
    }
}

// ── Canvas helpers ────────────────────────────────────────────────────────────

function makeCanvas(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h)
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    return c
}

function canvasToBlob(canvas: OffscreenCanvas | HTMLCanvasElement): Promise<Blob> {
    if (canvas instanceof OffscreenCanvas) return canvas.convertToBlob({ type: 'image/png' })
    return new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png')
    )
}

// ── Image preloading ──────────────────────────────────────────────────────────

async function preloadImages(blocks: BoardObject[]): Promise<Map<string, HTMLImageElement>> {
    const map = new Map<string, HTMLImageElement>()
    const loads: Promise<void>[] = []

    for (const block of blocks) {
        if (!(block instanceof ImageBlock)) continue
        const { src } = block.getData()
        if (!src || map.has(src)) continue
        const img = new Image()
        map.set(src, img)
        loads.push(
            new Promise<void>((resolve) => {
                img.onload = () => resolve()
                img.onerror = () => resolve()
                img.src = src
            })
        )
    }

    await Promise.all(loads)
    return map
}

// ── Block dispatch ────────────────────────────────────────────────────────────

function renderBlock(
    ctx: CanvasRenderingContext2D,
    block: BoardObject,
    images: Map<string, HTMLImageElement>,
    boardBg: string
) {
    if (block instanceof TextBlock) renderTextBlock(ctx, block)
    else if (block instanceof ImageBlock) renderImageBlock(ctx, block, images, boardBg)
    else if (block instanceof ShapeBlock) renderShapeBlock(ctx, block)
    else if (block instanceof LineBlock) renderLineBlock(ctx, block)
    else if (block instanceof PathBlock) renderPathBlock(ctx, block)
}

// ── TextBlock ─────────────────────────────────────────────────────────────────

function renderTextBlock(ctx: CanvasRenderingContext2D, block: TextBlock) {
    const data = block.getData()
    if (!data.content?.trim()) return

    const { x, y } = block.getPosition()
    const { width, height } = block.getSize()
    const rotation = block.getRotation()

    applyBoxTransform(ctx, x, y, width, height, rotation)

    const paragraphs = parseHtmlText(data.content, {
        fontFamily: data.fontFamily,
        fontSize: data.fontSize,
        color: data.color,
        textAlign: data.textAlign,
    })

    renderParagraphs(ctx, paragraphs, width)
}

// ── ImageBlock ────────────────────────────────────────────────────────────────

function renderImageBlock(
    ctx: CanvasRenderingContext2D,
    block: ImageBlock,
    images: Map<string, HTMLImageElement>,
    boardBg: string
) {
    const data = block.getData()
    const { x, y } = block.getPosition()
    const { width: w, height: h } = block.getSize()
    const rotation = block.getRotation()

    applyBoxTransform(ctx, x, y, w, h, rotation)
    ctx.globalAlpha = data.opacity / 100

    const radius = Math.min(data.borderRadius, w / 2, h / 2)
    const clipPath = new Path2D()
    clipPath.roundRect(0, 0, w, h, radius)

    // Shadow: draw opaque shape to generate correct shadow strength, then clear settings.
    // The opaque fill inside the clip will be overdrawn by the actual block content.
    if (data.shadowColor) {
        ctx.save()
        ctx.shadowColor = data.shadowColor
        ctx.shadowBlur = data.shadowBlur
        ctx.shadowOffsetX = data.shadowX
        ctx.shadowOffsetY = data.shadowY
        ctx.fillStyle = '#ffffff'
        ctx.fill(clipPath)
        ctx.restore()
    }

    ctx.clip(clipPath)

    // Overdraw the opaque shadow-source fill only when a shadow was actually drawn.
    // Without this guard the entire clip area would be painted with boardBg and would
    // cover any blocks that sit beneath the transparent regions of this image block.
    if (data.shadowColor) {
        if (boardBg) {
            ctx.fillStyle = boardBg
            ctx.fillRect(0, 0, w, h)
        } else {
            ctx.clearRect(0, 0, w, h)
        }
    }

    if (data.background) {
        ctx.fillStyle = data.background
        ctx.fillRect(0, 0, w, h)
    }

    const img = data.src ? images.get(data.src) : undefined
    if (img && img.naturalWidth > 0) drawImageFit(ctx, img, 0, 0, w, h, data.objectFit)
}

function drawImageFit(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement,
    x: number,
    y: number,
    w: number,
    h: number,
    fit: 'cover' | 'contain' | 'fill'
) {
    const iw = img.naturalWidth,
        ih = img.naturalHeight
    if (fit === 'fill') {
        ctx.drawImage(img, x, y, w, h)
    } else if (fit === 'contain') {
        const s = Math.min(w / iw, h / ih)
        ctx.drawImage(img, x + (w - iw * s) / 2, y + (h - ih * s) / 2, iw * s, ih * s)
    } else {
        // cover
        const s = Math.max(w / iw, h / ih)
        ctx.drawImage(img, x - (iw * s - w) / 2, y - (ih * s - h) / 2, iw * s, ih * s)
    }
}

// ── ShapeBlock ────────────────────────────────────────────────────────────────

function renderShapeBlock(ctx: CanvasRenderingContext2D, block: ShapeBlock) {
    const data = block.getData()
    const { x, y } = block.getPosition()
    const { width: w, height: h } = block.getSize()
    const rotation = block.getRotation()

    applyBoxTransform(ctx, x, y, w, h, rotation)
    ctx.globalAlpha = data.opacity / 100

    const path = buildShapePath(data, w, h)

    // Shadow applied on the first fill/stroke draw, then cleared so subsequent draws don't repeat it
    if (data.shadowColor) {
        ctx.shadowColor = data.shadowColor
        ctx.shadowBlur = data.shadowBlur
        ctx.shadowOffsetX = data.shadowX
        ctx.shadowOffsetY = data.shadowY
    }

    if (data.fill) {
        ctx.fillStyle = data.fill
        ctx.fill(path)
        ctx.shadowColor = 'transparent'
    }

    if (data.stroke && data.strokeWidth > 0) {
        // vector-effect: non-scaling-stroke — lineWidth is in block-local pixels (no viewBox scaling)
        ctx.strokeStyle = data.stroke
        ctx.lineWidth = data.strokeWidth
        ctx.stroke(path)
        ctx.shadowColor = 'transparent'
    }

    if (data.text?.trim()) {
        ctx.shadowColor = 'transparent'
        renderShapeText(ctx, data, w, h)
    }
}

function buildShapePath(data: ShapeBlockData, w: number, h: number): Path2D {
    const path = new Path2D()
    const sx = w / 100,
        sy = h / 100

    switch (data.shape as ShapeType) {
        case 'rectangle': {
            const r = Math.min((data.borderRadius / 100) * Math.min(w, h), w / 2, h / 2)
            path.roundRect(0, 0, w, h, r)
            break
        }
        case 'ellipse':
            path.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
            break
        case 'polygon': {
            const pts = polygonPoints(data.sides)
            path.moveTo(pts[0][0] * sx, pts[0][1] * sy)
            for (let i = 1; i < pts.length; i++) path.lineTo(pts[i][0] * sx, pts[i][1] * sy)
            path.closePath()
            break
        }
        case 'star': {
            const pts = starPoints(data.starPoints)
            path.moveTo(pts[0][0] * sx, pts[0][1] * sy)
            for (let i = 1; i < pts.length; i++) path.lineTo(pts[i][0] * sx, pts[i][1] * sy)
            path.closePath()
            break
        }
    }

    return path
}

// Mirrors ShapeBlock's private point math — regular polygon inscribed in a 0-100 viewBox
function polygonPoints(sides: number): [number, number][] {
    return Array.from({ length: sides }, (_, i) => {
        const a = (i * 2 * Math.PI) / sides - Math.PI / 2
        return [50 + 48 * Math.cos(a), 50 + 48 * Math.sin(a)] as [number, number]
    })
}

// Mirrors ShapeBlock's private point math — star with fixed 0.4 inner-radius ratio
function starPoints(points: number): [number, number][] {
    return Array.from({ length: points * 2 }, (_, i) => {
        const a = (i * Math.PI) / points - Math.PI / 2
        const r = i % 2 === 0 ? 48 : 48 * 0.4
        return [50 + r * Math.cos(a), 50 + r * Math.sin(a)] as [number, number]
    })
}

function renderShapeText(
    ctx: CanvasRenderingContext2D,
    data: ShapeBlockData,
    w: number,
    h: number
) {
    const pad = data.textPadding
    const innerW = Math.max(w - pad * 2, 1)
    const innerH = Math.max(h - pad * 2, 1)

    const paragraphs = parseHtmlText(data.text, {
        fontFamily: data.fontFamily,
        fontSize: data.fontSize,
        color: data.textColor,
        textAlign: data.textAlign,
    })

    const totalH = measureParagraphsHeight(ctx, paragraphs, innerW)
    let offsetY = 0
    if (data.textVerticalAlign === 'middle') offsetY = (innerH - totalH) / 2
    else if (data.textVerticalAlign === 'bottom') offsetY = innerH - totalH

    ctx.save()
    ctx.translate(pad, pad)
    const clip = new Path2D()
    clip.rect(0, 0, innerW, innerH)
    ctx.clip(clip)
    ctx.translate(0, offsetY)
    renderParagraphs(ctx, paragraphs, innerW)
    ctx.restore()
}

// ── LineBlock ─────────────────────────────────────────────────────────────────

function renderLineBlock(ctx: CanvasRenderingContext2D, block: LineBlock) {
    const data = block.getData()
    const { x1, y1, x2, y2 } = data
    const len = Math.hypot(x2 - x1, y2 - y1)
    if (len < 0.5) return

    const angle = Math.atan2(y2 - y1, x2 - x1)
    const color = data.stroke || '#000000'

    ctx.globalAlpha = data.opacity / 100

    // Shorten the drawn line at each end so arrow tips appear flush at the endpoints
    const startOff = markerLineOffset(data.startPoint, data.strokeWidth)
    const endOff = markerLineOffset(data.endPoint, data.strokeWidth)
    const cos = Math.cos(angle),
        sin = Math.sin(angle)

    ctx.beginPath()
    ctx.moveTo(x1 + cos * startOff, y1 + sin * startOff)
    ctx.lineTo(x2 - cos * endOff, y2 - sin * endOff)
    ctx.strokeStyle = color
    ctx.lineWidth = data.strokeWidth
    ctx.lineCap = 'butt'
    ctx.lineJoin = 'round'
    ctx.stroke()

    drawEndpoint(ctx, data.startPoint, x1, y1, angle, true, color, data.strokeWidth)
    drawEndpoint(ctx, data.endPoint, x2, y2, angle, false, color, data.strokeWidth)
}

// How far to pull the line end back when a decorative marker is present
function markerLineOffset(style: PointStyle, sw: number): number {
    if (style === 'line-arrow' || style === 'triangle-arrow' || style === 'reversed-triangle')
        return sw
    return 0
}

// markerWidth values mirror the SVG marker definitions in LineBlock
const MARKER_WIDTHS: Record<PointStyle, number> = {
    none: 0,
    round: 1,
    square: 1,
    'line-arrow': 2,
    'triangle-arrow': 2,
    'reversed-triangle': 2,
    'circle-arrow': 2.5,
    'diamond-arrow': 2.5,
}

function drawEndpoint(
    ctx: CanvasRenderingContext2D,
    style: PointStyle,
    ex: number,
    ey: number,
    lineAngle: number,
    isStart: boolean,
    color: string,
    strokeWidth: number
) {
    if (style === 'none') return

    // markerScale maps the 0-10 marker viewBox to screen pixels
    const markerScale = (strokeWidth * (MARKER_WIDTHS[style] ?? 1)) / 10

    ctx.save()
    ctx.translate(ex, ey)
    // All markers: rotate so +X axis aligns with the line direction.
    // Start/end shape differences are baked into the path geometry below.
    ctx.rotate(lineAngle)
    ctx.scale(markerScale, markerScale)
    ctx.translate(-5, -5) // refX=5, refY=5 → endpoint at marker center

    ctx.fillStyle = color
    ctx.strokeStyle = color

    switch (style) {
        case 'round':
        case 'circle-arrow':
            ctx.beginPath()
            ctx.arc(5, 5, 5, 0, Math.PI * 2)
            ctx.fill()
            break

        case 'square':
            ctx.fillRect(0, 0, 10, 10)
            break

        case 'line-arrow':
            // Open V: start marker path opens toward -X (outward from start);
            //         end marker path opens toward +X (outward from end)
            ctx.beginPath()
            if (isStart) {
                ctx.moveTo(9, 1)
                ctx.lineTo(1, 5)
                ctx.lineTo(9, 9)
            } else {
                ctx.moveTo(1, 1)
                ctx.lineTo(9, 5)
                ctx.lineTo(1, 9)
            }
            ctx.lineWidth = 3.5
            ctx.lineJoin = 'round'
            ctx.lineCap = 'round'
            ctx.stroke()
            break

        case 'triangle-arrow':
            ctx.beginPath()
            if (isStart) {
                ctx.moveTo(10, 1)
                ctx.lineTo(0, 5)
                ctx.lineTo(10, 9)
            } else {
                ctx.moveTo(0, 1)
                ctx.lineTo(10, 5)
                ctx.lineTo(0, 9)
            }
            ctx.closePath()
            ctx.fill()
            break

        case 'reversed-triangle':
            ctx.beginPath()
            if (isStart) {
                ctx.moveTo(0, 1)
                ctx.lineTo(10, 5)
                ctx.lineTo(0, 9)
            } else {
                ctx.moveTo(10, 1)
                ctx.lineTo(0, 5)
                ctx.lineTo(10, 9)
            }
            ctx.closePath()
            ctx.fill()
            break

        case 'diamond-arrow':
            ctx.beginPath()
            ctx.moveTo(5, 0)
            ctx.lineTo(10, 5)
            ctx.lineTo(5, 10)
            ctx.lineTo(0, 5)
            ctx.closePath()
            ctx.fill()
            break
    }

    ctx.restore()
}

// ── Text layout ───────────────────────────────────────────────────────────────

interface TextLine {
    segments: { text: string; run: TextRun; x: number }[]
    width: number
    maxFontSize: number
}

function renderParagraphs(
    ctx: CanvasRenderingContext2D,
    paragraphs: StyledParagraph[],
    containerW: number
) {
    ctx.textBaseline = 'top'
    let y = 0

    for (let pi = 0; pi < paragraphs.length; pi++) {
        const para = paragraphs[pi]
        const isLast = pi === paragraphs.length - 1
        const availW = Math.max(containerW - para.indent, 1)
        const lines = wrapRuns(ctx, para.runs, availW)

        for (let li = 0; li < lines.length; li++) {
            const line = lines[li]
            const lineH = (line.maxFontSize || para.blockFontSize) * 1.2

            // Bullet prefix: rendered left of the indent on the first line only
            if (li === 0 && para.bullet) {
                const bulletRun = line.segments[0]?.run ?? makeFallbackRun(para)
                drawTextRun(ctx, { ...bulletRun, text: para.bullet }, para.indent * -0.9, y)
            }

            let startX = para.indent
            if (para.textAlign === 'center') startX = para.indent + (availW - line.width) / 2
            else if (para.textAlign === 'right') startX = para.indent + availW - line.width

            for (const seg of line.segments)
                drawTextRun(ctx, { ...seg.run, text: seg.text }, startX + seg.x, y)

            y += lineH
        }

        if (!isLast) y += para.marginBottom
    }
}

function measureParagraphsHeight(
    ctx: CanvasRenderingContext2D,
    paragraphs: StyledParagraph[],
    containerW: number
): number {
    let h = 0
    for (let pi = 0; pi < paragraphs.length; pi++) {
        const para = paragraphs[pi]
        const isLast = pi === paragraphs.length - 1
        const lines = wrapRuns(ctx, para.runs, Math.max(containerW - para.indent, 1))
        for (const line of lines) h += (line.maxFontSize || para.blockFontSize) * 1.2
        if (!isLast) h += para.marginBottom
    }
    return h
}

// Splits runs into word-wrapped lines. Explicit '\n' runs force a line break.
function wrapRuns(ctx: CanvasRenderingContext2D, runs: TextRun[], maxW: number): TextLine[] {
    const lines: TextLine[] = []
    let segments: { text: string; run: TextRun; x: number }[] = []
    let lineW = 0
    let maxFS = 0

    function flush() {
        if (segments.length === 0) return
        lines.push({ segments, width: lineW, maxFontSize: maxFS })
        segments = []
        lineW = 0
        maxFS = 0
    }

    for (const run of runs) {
        ctx.font = runFont(run)
        for (const token of tokenize(run.text)) {
            if (token === '\n') {
                flush()
                continue
            }

            const tw = ctx.measureText(token).width
            const isSpace = /^\s+$/.test(token)

            // Start new line when word would overflow (but never break at start of empty line)
            if (!isSpace && lineW + tw > maxW && segments.length > 0) flush()

            // Skip leading spaces on a fresh line
            if (isSpace && segments.length === 0) continue

            segments.push({ text: token, run, x: lineW })
            lineW += tw
            if (run.fontSize > maxFS) maxFS = run.fontSize
        }
    }

    flush()
    return lines.length > 0 ? lines : [{ segments: [], width: 0, maxFontSize: 12 }]
}

// Splits a text string into word+space tokens and explicit newline tokens
function tokenize(text: string): string[] {
    const tokens: string[] = []
    const re = /\n|[^\S\n]*\S+[^\S\n]*/g
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) tokens.push(m[0])
    return tokens
}

function runFont(run: TextRun): string {
    const parts: string[] = []
    if (run.fontStyle !== 'normal') parts.push(run.fontStyle)
    if (run.fontWeight !== 'normal' && run.fontWeight !== '400') parts.push(run.fontWeight)
    const family = run.fontFamily.includes(' ') ? `"${run.fontFamily}"` : run.fontFamily
    parts.push(`${run.fontSize}px ${family}`)
    return parts.join(' ')
}

function drawTextRun(ctx: CanvasRenderingContext2D, run: TextRun, x: number, y: number) {
    ctx.font = runFont(run)
    ctx.fillStyle = run.color
    ctx.textBaseline = 'top'
    ctx.fillText(run.text, x, y)

    if (run.underline || run.strikethrough) {
        const tw = ctx.measureText(run.text).width
        const thick = Math.max(1, run.fontSize * 0.07)
        if (run.strikethrough) ctx.fillRect(x, y + run.fontSize * 0.45, tw, thick)
        if (run.underline) ctx.fillRect(x, y + run.fontSize * 0.92, tw, thick)
    }
}

function makeFallbackRun(para: StyledParagraph): TextRun {
    return {
        text: '',
        fontFamily: 'sans-serif',
        fontSize: para.blockFontSize,
        fontWeight: 'normal',
        fontStyle: 'normal',
        color: '#000000',
        underline: false,
        strikethrough: false,
    }
}

// ── PathBlock ─────────────────────────────────────────────────────────────────

function renderPathBlock(ctx: CanvasRenderingContext2D, block: PathBlock) {
    const data = block.getData()
    if (data.points.length === 0) return

    const { x, y } = block.getPosition()
    const { width: w, height: h } = block.getSize()
    const rotation = block.getRotation()

    applyBoxTransform(ctx, x, y, w, h, rotation)
    ctx.globalAlpha = data.opacity / 100

    ctx.beginPath()
    traceCanvasPath(ctx, data.points, data.smoothing)
    ctx.strokeStyle = data.stroke || '#000000'
    ctx.lineWidth = data.strokeWidth
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.stroke()
}

// ── Shared transform ──────────────────────────────────────────────────────────

// Positions the context so that (0,0) = top-left of the block in board space,
// with the rotation applied around the block's center (matching CSS transform-origin: center).
function applyBoxTransform(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    rotationDeg: number
) {
    ctx.translate(x + w / 2, y + h / 2)
    ctx.rotate(rotationDeg * (Math.PI / 180))
    ctx.translate(-w / 2, -h / 2)
}
