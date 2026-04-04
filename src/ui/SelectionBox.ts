// Shared group selection box rendered over multiple selected blocks.
// Shows a composite AABB outline with four corner resize handles and one rotation handle.
// All affine transforms (scale, rotate) are computed from a per-gesture snapshot so
// each frame applies the full delta from the initial state — no drift accumulation.

import { BoardObject } from '../board/BoardObject'
import { LineBlock } from '../board/LineBlock'

interface BlockSnapshot {
    block: BoardObject
    // Block center and dimensions captured at gesture start.
    cx: number
    cy: number
    w: number
    h: number
    rotation: number
    // LineBlock stores raw endpoints instead.
    x1: number | null
    y1: number | null
    x2: number | null
    y2: number | null
}

export class SelectionBox {
    readonly el: HTMLElement

    private blocks: BoardObject[] = []
    private gx = 0
    private gy = 0
    private gw = 0
    private gh = 0

    constructor(
        overlay: HTMLElement,
        private readonly getViewport: () => { panX: number; panY: number; zoom: number }
    ) {
        this.el = document.createElement('div')
        this.el.className = 'selection-box'
        this.el.style.display = 'none'
        this.buildHandles()
        overlay.appendChild(this.el)

        // Show rotation cursor on corner handles while Ctrl is held.
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Control') document.body.classList.add('sb-ctrl')
        })
        document.addEventListener('keyup', (e) => {
            if (e.key === 'Control') document.body.classList.remove('sb-ctrl')
        })
    }

    // ── Public API ────────────────────────────────────────────────────────────

    setBlocks(blocks: BoardObject[]) {
        this.blocks = [...blocks]
        // Hide for empty selection or a lone LineBlock (it uses its own endpoint handles).
        const hide =
            this.blocks.length === 0 ||
            (this.blocks.length === 1 && this.blocks[0] instanceof LineBlock)
        if (hide) {
            this.el.style.display = 'none'
            return
        }
        this.update()
    }

    // Recomputes the AABB from current block positions and repositions the element.
    // Call after any drag frame so the outline tracks the group.
    update() {
        if (this.blocks.length === 0) return
        if (this.blocks.length === 1 && this.blocks[0] instanceof LineBlock) return
        this.computeAABB()
        this.applyLayout()
    }

    // ── Handle construction ───────────────────────────────────────────────────

    private buildHandles() {
        const corners = [
            { cls: 'sb-nw', hx: 'left', hy: 'top' },
            { cls: 'sb-ne', hx: 'right', hy: 'top' },
            { cls: 'sb-sw', hx: 'left', hy: 'bottom' },
            { cls: 'sb-se', hx: 'right', hy: 'bottom' },
        ] as const

        for (const { cls, hx, hy } of corners) {
            const h = document.createElement('div')
            h.className = `sb-handle ${cls}`
            h.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return
                e.stopPropagation()
                e.preventDefault()
                // Ctrl+handle rotates instead of resizing.
                if (e.ctrlKey) this.startRotate(e)
                else this.startResize(e, hx, hy)
            })
            this.el.appendChild(h)
        }

        const sides: { cls: string; hx: 'left' | 'right' | null; hy: 'top' | 'bottom' | null }[] = [
            { cls: 'sb-n', hx: null, hy: 'top' },
            { cls: 'sb-s', hx: null, hy: 'bottom' },
            { cls: 'sb-w', hx: 'left', hy: null },
            { cls: 'sb-e', hx: 'right', hy: null },
        ]

        for (const { cls, hx, hy } of sides) {
            const h = document.createElement('div')
            h.className = `sb-side ${cls}`
            h.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return
                e.stopPropagation()
                e.preventDefault()
                this.startResize(e, hx, hy)
            })
            this.el.appendChild(h)
        }

        const rot = document.createElement('div')
        rot.className = 'sb-rotate'
        rot.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return
            e.stopPropagation()
            e.preventDefault()
            this.startRotate(e)
        })
        this.el.appendChild(rot)
    }

    // ── AABB ──────────────────────────────────────────────────────────────────

    private computeAABB() {
        let minX = Infinity,
            minY = Infinity,
            maxX = -Infinity,
            maxY = -Infinity
        for (const block of this.blocks) {
            for (const [wx, wy] of block.getWorldCorners()) {
                if (wx < minX) minX = wx
                if (wy < minY) minY = wy
                if (wx > maxX) maxX = wx
                if (wy > maxY) maxY = wy
            }
        }
        this.gx = minX
        this.gy = minY
        this.gw = maxX - minX
        this.gh = maxY - minY
    }

    private applyLayout() {
        this.el.style.display = ''
        this.el.style.left = `${this.gx}px`
        this.el.style.top = `${this.gy}px`
        this.el.style.width = `${this.gw}px`
        this.el.style.height = `${this.gh}px`
    }

    // ── Snapshot ──────────────────────────────────────────────────────────────

    private snapshotBlocks(): BlockSnapshot[] {
        return this.blocks.map((block) => {
            if (block instanceof LineBlock) {
                const d = block.getData()
                return {
                    block,
                    cx: (d.x1 + d.x2) / 2,
                    cy: (d.y1 + d.y2) / 2,
                    w: 0,
                    h: 0,
                    rotation: 0,
                    x1: d.x1,
                    y1: d.y1,
                    x2: d.x2,
                    y2: d.y2,
                }
            }
            const pos = block.getPosition()
            const size = block.getSize()
            return {
                block,
                cx: pos.x + size.width / 2,
                cy: pos.y + size.height / 2,
                w: size.width,
                h: size.height,
                rotation: block.getRotation(),
                x1: null,
                y1: null,
                x2: null,
                y2: null,
            }
        })
    }

    // ── Resize ────────────────────────────────────────────────────────────────

    private startResize(e: MouseEvent, hx: 'left' | 'right' | null, hy: 'top' | 'bottom' | null) {
        // Anchor is the edge/corner opposite the drag handle — stays fixed during scale.
        // For a side handle, the perpendicular axis is locked (scale = 1) so its anchor is unused.
        const ax =
            hx === 'left' ? this.gx + this.gw : hx === 'right' ? this.gx : this.gx + this.gw / 2
        const ay =
            hy === 'top' ? this.gy + this.gh : hy === 'bottom' ? this.gy : this.gy + this.gh / 2
        const origGW = this.gw
        const origGH = this.gh

        const snapshots = this.snapshotBlocks()
        // Push history before any state changes — same contract as block drag gestures.
        this.blocks.forEach((b) => b.onBeforePropertyChange?.())
        document.body.style.cursor = window.getComputedStyle(e.target as Element).cursor

        const onMove = (ev: MouseEvent) => {
            const { panX, panY, zoom } = this.getViewport()
            const mx = (ev.clientX - panX) / zoom
            const my = (ev.clientY - panY) / zoom

            let sx: number, sy: number

            if (hx !== null && hy !== null && ev.shiftKey && origGW > 1 && origGH > 1) {
                // Uniform scale (corner handles + Shift): project onto the original diagonal.
                const diagX = hx === 'right' ? origGW : -origGW
                const diagY = hy === 'bottom' ? origGH : -origGH
                const diagLenSq = diagX * diagX + diagY * diagY
                const proj = (mx - ax) * diagX + (my - ay) * diagY
                const s = Math.max(10 / Math.max(origGW, origGH), proj / diagLenSq)
                sx = s
                sy = s
            } else {
                // Side handles lock one axis; degenerate dimensions are left unchanged.
                sx = hx !== null && origGW > 1 ? Math.max(10, Math.abs(mx - ax)) / origGW : 1
                sy = hy !== null && origGH > 1 ? Math.max(10, Math.abs(my - ay)) / origGH : 1
            }

            this.applyScale(snapshots, ax, ay, sx, sy)
            this.update()
        }

        const onUp = () => {
            document.body.style.cursor = ''
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
        }

        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
    }

    private applyScale(snapshots: BlockSnapshot[], ax: number, ay: number, sx: number, sy: number) {
        for (const snap of snapshots) {
            if (snap.x1 !== null) {
                // LineBlock — transform endpoints directly in world space.
                const newX1 = ax + (snap.x1 - ax) * sx
                const newY1 = ay + (snap.y1! - ay) * sy
                const newX2 = ax + (snap.x2! - ax) * sx
                const newY2 = ay + (snap.y2! - ay) * sy
                ;(snap.block as LineBlock).setEndpoints(newX1, newY1, newX2, newY2)
            } else {
                const newCx = ax + (snap.cx - ax) * sx
                const newCy = ay + (snap.cy - ay) * sy
                const newW = Math.max(10, snap.w * sx)
                const newH = Math.max(10, snap.h * sy)
                snap.block.setPosition(newCx - newW / 2, newCy - newH / 2)
                snap.block.setSize(newW, newH)
            }
        }
    }

    // ── Rotate ────────────────────────────────────────────────────────────────

    private startRotate(e: MouseEvent) {
        const gcx = this.gx + this.gw / 2
        const gcy = this.gy + this.gh / 2

        const { panX, panY, zoom } = this.getViewport()
        const startAngle = Math.atan2(
            (e.clientY - panY) / zoom - gcy,
            (e.clientX - panX) / zoom - gcx
        )

        const snapshots = this.snapshotBlocks()
        document.body.classList.add('sb-rotating')

        const onMove = (ev: MouseEvent) => {
            const vp = this.getViewport()
            const mx = (ev.clientX - vp.panX) / vp.zoom
            const my = (ev.clientY - vp.panY) / vp.zoom
            const delta = Math.atan2(my - gcy, mx - gcx) - startAngle

            this.applyRotation(snapshots, gcx, gcy, delta)
            this.update()
        }

        const onUp = () => {
            document.body.classList.remove('sb-rotating')
            window.removeEventListener('mousemove', onMove)
            window.removeEventListener('mouseup', onUp)
        }

        window.addEventListener('mousemove', onMove)
        window.addEventListener('mouseup', onUp)
    }

    private applyRotation(snapshots: BlockSnapshot[], gcx: number, gcy: number, delta: number) {
        const cos = Math.cos(delta)
        const sin = Math.sin(delta)

        for (const snap of snapshots) {
            if (snap.x1 !== null) {
                // LineBlock — rotate both endpoints around the group center.
                const rx1 = snap.x1 - gcx,
                    ry1 = snap.y1! - gcy
                const rx2 = snap.x2! - gcx,
                    ry2 = snap.y2! - gcy
                ;(snap.block as LineBlock).setEndpoints(
                    gcx + rx1 * cos - ry1 * sin,
                    gcy + rx1 * sin + ry1 * cos,
                    gcx + rx2 * cos - ry2 * sin,
                    gcy + rx2 * sin + ry2 * cos
                )
            } else {
                // Rotate the block center around the group center, add delta to its own rotation.
                const relX = snap.cx - gcx
                const relY = snap.cy - gcy
                const newCx = gcx + relX * cos - relY * sin
                const newCy = gcy + relX * sin + relY * cos
                snap.block.setPosition(newCx - snap.w / 2, newCy - snap.h / 2)
                snap.block.setRotation(snap.rotation + (delta * 180) / Math.PI)
            }
        }
    }
}
