// Pure snap computation — no DOM dependencies.
// Given a dragged rect and a list of candidate rects, returns a snapped position
// and the guide lines to draw. Stateless; all inputs are plain data.

export interface SnapRect {
    x: number
    y: number
    width: number
    height: number
}

export type SnapGuide =
    | { kind: 'line-v'; x: number; y1: number; y2: number }
    | { kind: 'line-h'; y: number; x1: number; x2: number }
    | { kind: 'gap-h'; y: number; x1: number; x2: number }
    | { kind: 'gap-v'; x: number; y1: number; y2: number }

export interface SnapResult {
    x: number
    y: number
    guides: SnapGuide[]
}

export function computeSnap(
    dragged: SnapRect,
    candidates: SnapRect[],
    threshold: number
): SnapResult {
    if (candidates.length === 0) return { x: dragged.x, y: dragged.y, guides: [] }

    // ── X-axis alignment snap ─────────────────────────────────────────────────

    const xSnap = findAlignSnap(dragged.x, dragged.width, candidates, 'x', threshold)
    const xSpace = xSnap ? null : findSpacingH(dragged, candidates, threshold)

    const snappedX = xSnap ? dragged.x + xSnap.delta : xSpace ? xSpace.x : dragged.x

    // ── Y-axis alignment snap ─────────────────────────────────────────────────

    const ySnap = findAlignSnap(dragged.y, dragged.height, candidates, 'y', threshold)
    const ySpace = ySnap ? null : findSpacingV(dragged, candidates, threshold)

    const snappedY = ySnap ? dragged.y + ySnap.delta : ySpace ? ySpace.y : dragged.y

    // ── Build guides using post-snap rect ─────────────────────────────────────
    // Guide spans include the snapped dragged rect so lines visually touch the block.

    const snapped = { x: snappedX, y: snappedY, width: dragged.width, height: dragged.height }
    const guides: SnapGuide[] = []

    if (xSnap) {
        const y1 = Math.min(snapped.y, ...xSnap.matches.map((c) => c.y))
        const y2 = Math.max(snapped.y + snapped.height, ...xSnap.matches.map((c) => c.y + c.height))
        guides.push({ kind: 'line-v', x: xSnap.guidePos, y1, y2 })
    }
    if (ySnap) {
        const x1 = Math.min(snapped.x, ...ySnap.matches.map((c) => c.x))
        const x2 = Math.max(snapped.x + snapped.width, ...ySnap.matches.map((c) => c.x + c.width))
        guides.push({ kind: 'line-h', y: ySnap.guidePos, x1, x2 })
    }
    if (xSpace) guides.push(...xSpace.guides)
    if (ySpace) guides.push(...ySpace.guides)

    return { x: snappedX, y: snappedY, guides }
}

// ── Alignment snap ────────────────────────────────────────────────────────────

interface AlignSnap {
    delta: number
    guidePos: number
    // All candidate rects that have an edge/center at guidePos — used for span calculation.
    matches: SnapRect[]
}

// Finds the best edge-to-edge or center-to-center snap on one axis.
// Two-pass: first find the minimum |delta|, then aggregate all candidates at that position.
function findAlignSnap(
    dragMin: number,
    dragSize: number,
    candidates: SnapRect[],
    axis: 'x' | 'y',
    threshold: number
): AlignSnap | null {
    const dragMax = dragMin + dragSize
    const dragCenter = dragMin + dragSize / 2

    let bestAbsDelta = threshold + 1
    let bestDelta = 0
    let bestGuidePos = 0

    function consider(dragPoint: number, candPos: number) {
        const delta = candPos - dragPoint
        const abs = Math.abs(delta)
        if (abs < bestAbsDelta) {
            bestAbsDelta = abs
            bestDelta = delta
            bestGuidePos = candPos
        }
    }

    for (const c of candidates) {
        const cMin = axis === 'x' ? c.x : c.y
        const cSize = axis === 'x' ? c.width : c.height
        const cMax = cMin + cSize
        const cCenter = cMin + cSize / 2
        consider(dragMin, cMin)
        consider(dragMin, cMax)
        consider(dragMax, cMin)
        consider(dragMax, cMax)
        consider(dragCenter, cCenter)
    }

    if (bestAbsDelta > threshold) return null

    // Second pass: collect all candidates that have any edge/center at bestGuidePos.
    const matches: SnapRect[] = []
    for (const c of candidates) {
        const cMin = axis === 'x' ? c.x : c.y
        const cSize = axis === 'x' ? c.width : c.height
        const cMax = cMin + cSize
        const cCenter = cMin + cSize / 2
        if (
            Math.abs(cMin - bestGuidePos) < 0.5 ||
            Math.abs(cMax - bestGuidePos) < 0.5 ||
            Math.abs(cCenter - bestGuidePos) < 0.5
        ) {
            matches.push(c)
        }
    }

    return { delta: bestDelta, guidePos: bestGuidePos, matches }
}

// ── Equal spacing ─────────────────────────────────────────────────────────────

// Horizontal: three objects in a row — snap the dragged block to achieve equal gaps.
function findSpacingH(
    dragged: SnapRect,
    candidates: SnapRect[],
    threshold: number
): { x: number; guides: SnapGuide[] } | null {
    // Closest candidate to the left: largest right edge that is at or left of dragged.x.
    let leftCand: SnapRect | null = null
    let maxRightEdge = -Infinity
    for (const c of candidates) {
        const re = c.x + c.width
        if (re <= dragged.x && re > maxRightEdge) {
            maxRightEdge = re
            leftCand = c
        }
    }

    // Closest candidate to the right: smallest left edge at or right of dragged.right.
    let rightCand: SnapRect | null = null
    let minLeftEdge = Infinity
    for (const c of candidates) {
        if (c.x >= dragged.x + dragged.width && c.x < minLeftEdge) {
            minLeftEdge = c.x
            rightCand = c
        }
    }

    if (!leftCand || !rightCand) return null

    const inner = rightCand.x - (leftCand.x + leftCand.width) - dragged.width
    if (inner < 0) return null

    const gap = inner / 2
    const targetX = leftCand.x + leftCand.width + gap

    if (Math.abs(targetX - dragged.x) > threshold) return null

    const allMinY = Math.min(leftCand.y, dragged.y, rightCand.y)
    const allMaxY = Math.max(
        leftCand.y + leftCand.height,
        dragged.y + dragged.height,
        rightCand.y + rightCand.height
    )
    const midY = (allMinY + allMaxY) / 2

    return {
        x: targetX,
        guides: [
            { kind: 'gap-h', y: midY, x1: leftCand.x + leftCand.width, x2: targetX },
            { kind: 'gap-h', y: midY, x1: targetX + dragged.width, x2: rightCand.x },
        ],
    }
}

// Vertical: same logic transposed to the Y axis.
function findSpacingV(
    dragged: SnapRect,
    candidates: SnapRect[],
    threshold: number
): { y: number; guides: SnapGuide[] } | null {
    let topCand: SnapRect | null = null
    let maxBottomEdge = -Infinity
    for (const c of candidates) {
        const be = c.y + c.height
        if (be <= dragged.y && be > maxBottomEdge) {
            maxBottomEdge = be
            topCand = c
        }
    }

    let bottomCand: SnapRect | null = null
    let minTopEdge = Infinity
    for (const c of candidates) {
        if (c.y >= dragged.y + dragged.height && c.y < minTopEdge) {
            minTopEdge = c.y
            bottomCand = c
        }
    }

    if (!topCand || !bottomCand) return null

    const inner = bottomCand.y - (topCand.y + topCand.height) - dragged.height
    if (inner < 0) return null

    const gap = inner / 2
    const targetY = topCand.y + topCand.height + gap

    if (Math.abs(targetY - dragged.y) > threshold) return null

    const allMinX = Math.min(topCand.x, dragged.x, bottomCand.x)
    const allMaxX = Math.max(
        topCand.x + topCand.width,
        dragged.x + dragged.width,
        bottomCand.x + bottomCand.width
    )
    const midX = (allMinX + allMaxX) / 2

    return {
        y: targetY,
        guides: [
            { kind: 'gap-v', x: midX, y1: topCand.y + topCand.height, y2: targetY },
            { kind: 'gap-v', x: midX, y1: targetY + dragged.height, y2: bottomCand.y },
        ],
    }
}
