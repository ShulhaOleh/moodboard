// Pure geometry utilities for PathBlock — point reduction and smooth curve generation.
// These functions are shared by PathBlock (SVG rendering) and Exporter (canvas rendering).

export interface Pt {
    x: number
    y: number
}

// Ramer-Douglas-Peucker polyline simplification.
// Removes interior points that deviate less than epsilon from the straight-line segment.
export function rdp(pts: Pt[], epsilon: number): Pt[] {
    if (pts.length <= 2) return pts.slice()
    let maxDist = 0
    let maxIdx = 0
    const end = pts.length - 1
    for (let i = 1; i < end; i++) {
        const d = perpendicularDist(pts[i], pts[0], pts[end])
        if (d > maxDist) {
            maxDist = d
            maxIdx = i
        }
    }
    if (maxDist > epsilon) {
        const left = rdp(pts.slice(0, maxIdx + 1), epsilon)
        const right = rdp(pts.slice(maxIdx), epsilon)
        return [...left.slice(0, -1), ...right]
    }
    return [pts[0], pts[end]]
}

function perpendicularDist(p: Pt, a: Pt, b: Pt): number {
    const dx = b.x - a.x
    const dy = b.y - a.y
    if (dx === 0 && dy === 0) return Math.hypot(p.x - a.x, p.y - a.y)
    const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

// Builds an SVG path `d` string from points using Catmull-Rom spline smoothing.
// smoothing: 0 → straight line segments, 100 → maximally curved (tension = 0.5)
export function buildSvgPath(pts: Pt[], smoothing: number): string {
    if (pts.length === 0) return ''
    if (pts.length === 1) {
        // Dot: tiny segment so stroke-linecap="round" renders a circle.
        return `M ${f(pts[0].x)} ${f(pts[0].y)} L ${f(pts[0].x + 0.01)} ${f(pts[0].y)}`
    }

    if (smoothing <= 0) {
        return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${f(p.x)} ${f(p.y)}`).join(' ')
    }

    const tension = (smoothing / 100) * 0.5
    let d = `M ${f(pts[0].x)} ${f(pts[0].y)}`
    for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(0, i - 1)]
        const p1 = pts[i]
        const p2 = pts[i + 1]
        const p3 = pts[Math.min(pts.length - 1, i + 2)]
        const cp1x = p1.x + (p2.x - p0.x) * tension
        const cp1y = p1.y + (p2.y - p0.y) * tension
        const cp2x = p2.x - (p3.x - p1.x) * tension
        const cp2y = p2.y - (p3.y - p1.y) * tension
        d += ` C ${f(cp1x)} ${f(cp1y)} ${f(cp2x)} ${f(cp2y)} ${f(p2.x)} ${f(p2.y)}`
    }
    return d
}

// Traces the same smooth path onto a canvas 2D context.
export function traceCanvasPath(ctx: CanvasRenderingContext2D, pts: Pt[], smoothing: number): void {
    if (pts.length === 0) return
    ctx.moveTo(pts[0].x, pts[0].y)

    if (pts.length === 1) {
        ctx.lineTo(pts[0].x + 0.01, pts[0].y)
        return
    }

    if (smoothing <= 0) {
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
        return
    }

    const tension = (smoothing / 100) * 0.5
    for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(0, i - 1)]
        const p1 = pts[i]
        const p2 = pts[i + 1]
        const p3 = pts[Math.min(pts.length - 1, i + 2)]
        const cp1x = p1.x + (p2.x - p0.x) * tension
        const cp1y = p1.y + (p2.y - p0.y) * tension
        const cp2x = p2.x - (p3.x - p1.x) * tension
        const cp2y = p2.y - (p3.y - p1.y) * tension
        ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y)
    }
}

function f(n: number): string {
    return n.toFixed(2)
}
