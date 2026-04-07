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

// Densely samples the Catmull-Rom spline so that normals and widths can be
// computed at fine intervals — used by the outline-path builder below.
export function sampleCatmullRom(pts: Pt[], smoothing: number, perSegment: number = 16): Pt[] {
    if (pts.length === 0) return []
    if (pts.length === 1) return [pts[0]]
    if (smoothing <= 0) return pts.slice()

    const tension = (smoothing / 100) * 0.5
    const result: Pt[] = [pts[0]]

    for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(0, i - 1)]
        const p1 = pts[i]
        const p2 = pts[i + 1]
        const p3 = pts[Math.min(pts.length - 1, i + 2)]
        const cp1x = p1.x + (p2.x - p0.x) * tension
        const cp1y = p1.y + (p2.y - p0.y) * tension
        const cp2x = p2.x - (p3.x - p1.x) * tension
        const cp2y = p2.y - (p3.y - p1.y) * tension

        for (let j = 1; j <= perSegment; j++) {
            const t = j / perSegment
            const mt = 1 - t
            result.push({
                x:
                    mt * mt * mt * p1.x +
                    3 * mt * mt * t * cp1x +
                    3 * mt * t * t * cp2x +
                    t * t * t * p2.x,
                y:
                    mt * mt * mt * p1.y +
                    3 * mt * mt * t * cp1y +
                    3 * mt * t * t * cp2y +
                    t * t * t * p2.y,
            })
        }
    }

    return result
}

// Builds a filled SVG outline path that produces a variable-width stroke effect.
// getHalfWidth(t) receives arc-length parameter t ∈ [0,1] and returns the half-width at that point.
export function buildOutlinePath(
    pts: Pt[],
    smoothing: number,
    getHalfWidth: (t: number) => number
): string {
    const sampled = sampleCatmullRom(pts, smoothing)
    if (sampled.length < 2) {
        // Single dot — emit a tiny circle approximation using a stroke-width=0 placeholder.
        return sampled.length === 1
            ? `M ${f(sampled[0].x - getHalfWidth(0))} ${f(sampled[0].y)} A ${f(getHalfWidth(0))} ${f(getHalfWidth(0))} 0 1 0 ${f(sampled[0].x + getHalfWidth(0))} ${f(sampled[0].y)} Z`
            : ''
    }

    // Cumulative arc lengths for arc-length parameterisation.
    const arcLens: number[] = [0]
    for (let i = 1; i < sampled.length; i++) {
        arcLens.push(
            arcLens[i - 1] +
                Math.hypot(sampled[i].x - sampled[i - 1].x, sampled[i].y - sampled[i - 1].y)
        )
    }
    const totalLen = arcLens[arcLens.length - 1]

    // Outward-facing normals (perpendicular to the tangent, pointing left).
    const normals: Pt[] = sampled.map((_, i) => {
        let dx: number, dy: number
        if (i === 0) {
            dx = sampled[1].x - sampled[0].x
            dy = sampled[1].y - sampled[0].y
        } else if (i === sampled.length - 1) {
            dx = sampled[i].x - sampled[i - 1].x
            dy = sampled[i].y - sampled[i - 1].y
        } else {
            dx = sampled[i + 1].x - sampled[i - 1].x
            dy = sampled[i + 1].y - sampled[i - 1].y
        }
        const len = Math.hypot(dx, dy) || 1
        return { x: -dy / len, y: dx / len }
    })

    // Left and right offset arrays.
    const left: Pt[] = []
    const right: Pt[] = []
    for (let i = 0; i < sampled.length; i++) {
        const t = totalLen > 0 ? arcLens[i] / totalLen : 0
        const hw = getHalfWidth(t)
        left.push({ x: sampled[i].x + normals[i].x * hw, y: sampled[i].y + normals[i].y * hw })
        right.push({ x: sampled[i].x - normals[i].x * hw, y: sampled[i].y - normals[i].y * hw })
    }

    // Closed path: left side forward + right side backward.
    let d = `M ${f(left[0].x)} ${f(left[0].y)}`
    for (let i = 1; i < left.length; i++) d += ` L ${f(left[i].x)} ${f(left[i].y)}`
    for (let i = right.length - 1; i >= 0; i--) d += ` L ${f(right[i].x)} ${f(right[i].y)}`
    return d + ' Z'
}

// Canvas version: traces the variable-width outline so the caller can ctx.fill() it.
export function traceOutlineCanvas(
    ctx: CanvasRenderingContext2D,
    pts: Pt[],
    smoothing: number,
    getHalfWidth: (t: number) => number
): void {
    const sampled = sampleCatmullRom(pts, smoothing)
    if (sampled.length < 2) return

    const arcLens: number[] = [0]
    for (let i = 1; i < sampled.length; i++) {
        arcLens.push(
            arcLens[i - 1] +
                Math.hypot(sampled[i].x - sampled[i - 1].x, sampled[i].y - sampled[i - 1].y)
        )
    }
    const totalLen = arcLens[arcLens.length - 1]

    const normals: Pt[] = sampled.map((_, i) => {
        let dx: number, dy: number
        if (i === 0) {
            dx = sampled[1].x - sampled[0].x
            dy = sampled[1].y - sampled[0].y
        } else if (i === sampled.length - 1) {
            dx = sampled[i].x - sampled[i - 1].x
            dy = sampled[i].y - sampled[i - 1].y
        } else {
            dx = sampled[i + 1].x - sampled[i - 1].x
            dy = sampled[i + 1].y - sampled[i - 1].y
        }
        const len = Math.hypot(dx, dy) || 1
        return { x: -dy / len, y: dx / len }
    })

    const left: Pt[] = []
    const right: Pt[] = []
    for (let i = 0; i < sampled.length; i++) {
        const t = totalLen > 0 ? arcLens[i] / totalLen : 0
        const hw = getHalfWidth(t)
        left.push({ x: sampled[i].x + normals[i].x * hw, y: sampled[i].y + normals[i].y * hw })
        right.push({ x: sampled[i].x - normals[i].x * hw, y: sampled[i].y - normals[i].y * hw })
    }

    ctx.moveTo(left[0].x, left[0].y)
    for (let i = 1; i < left.length; i++) ctx.lineTo(left[i].x, left[i].y)
    for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y)
    ctx.closePath()
}

function f(n: number): string {
    return n.toFixed(2)
}
