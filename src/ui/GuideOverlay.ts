// SVG overlay that renders smart alignment guides and spacing indicators during drag.
// Appended directly to #app and uses screen coordinates so it paints above all board
// content without depending on z-index or stacking-context ordering.

import type { SnapGuide } from '../snap/SnapEngine'

// Alignment guides use rose so they're visually distinct from the purple selection indicator.
const ALIGN_COLOR = '#f43f5e'
// Spacing indicators use amber.
const GAP_COLOR = '#f59e0b'

export class GuideOverlay {
    readonly el: SVGSVGElement

    constructor() {
        this.el = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as SVGSVGElement
        this.el.style.cssText =
            'position:fixed;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;z-index:9999'
    }

    // Clears and redraws in one synchronous call to avoid single-frame flicker.
    // All board-space coordinates are converted to screen space via panX/panY/zoom so
    // the SVG can live outside the board overlay transform.
    draw(guides: SnapGuide[], zoom: number, panX: number, panY: number) {
        this.el.innerHTML = ''
        if (guides.length === 0) return

        // Viewport edges in screen space.
        const vLeft = 0
        const vRight = window.innerWidth
        const vTop = 0
        const vBottom = window.innerHeight

        // Convert a board coordinate to a screen coordinate.
        const sx = (bx: number) => panX + bx * zoom
        const sy = (by: number) => panY + by * zoom

        // Size constants in screen pixels.
        const tick = 5
        const fontSize = 11
        const labelOffset = 8

        for (const guide of guides) {
            switch (guide.kind) {
                // Alignment guides span the full viewport so any edge can be traced at a glance.
                case 'line-v':
                    this.line(sx(guide.x), vTop, sx(guide.x), vBottom, ALIGN_COLOR)
                    break

                case 'line-h':
                    this.line(vLeft, sy(guide.y), vRight, sy(guide.y), ALIGN_COLOR)
                    break

                // Spacing indicators show the equal gap between three objects with tick marks
                // and a pixel-count label so the distance is immediately readable.
                case 'gap-h': {
                    const gap = guide.x2 - guide.x1
                    if (gap < 1) break
                    const x1s = sx(guide.x1)
                    const x2s = sx(guide.x2)
                    const ys = sy(guide.y)
                    const cx = (x1s + x2s) / 2
                    this.line(x1s, ys, x2s, ys, GAP_COLOR)
                    this.line(x1s, ys - tick, x1s, ys + tick, GAP_COLOR)
                    this.line(x2s, ys - tick, x2s, ys + tick, GAP_COLOR)
                    this.label(cx, ys - labelOffset, Math.round(gap * zoom), fontSize)
                    break
                }

                case 'gap-v': {
                    const gap = guide.y2 - guide.y1
                    if (gap < 1) break
                    const y1s = sy(guide.y1)
                    const y2s = sy(guide.y2)
                    const xs = sx(guide.x)
                    const cy = (y1s + y2s) / 2
                    this.line(xs, y1s, xs, y2s, GAP_COLOR)
                    this.line(xs - tick, y1s, xs + tick, y1s, GAP_COLOR)
                    this.line(xs - tick, y2s, xs + tick, y2s, GAP_COLOR)
                    this.label(xs + labelOffset, cy, Math.round(gap * zoom), fontSize)
                    break
                }
            }
        }
    }

    clear() {
        this.el.innerHTML = ''
    }

    private line(x1: number, y1: number, x2: number, y2: number, stroke: string) {
        const el = document.createElementNS('http://www.w3.org/2000/svg', 'line')
        el.setAttribute('x1', String(x1))
        el.setAttribute('y1', String(y1))
        el.setAttribute('x2', String(x2))
        el.setAttribute('y2', String(y2))
        el.setAttribute('stroke', stroke)
        el.setAttribute('stroke-width', '1')
        this.el.appendChild(el)
    }

    // Renders a pixel-count label with a white halo so it's legible on any background.
    // paint-order: stroke fill renders the halo behind the fill, preventing bleed-through.
    private label(x: number, y: number, value: number, fontSize: number) {
        const el = document.createElementNS('http://www.w3.org/2000/svg', 'text')
        el.setAttribute('x', String(x))
        el.setAttribute('y', String(y))
        el.setAttribute('text-anchor', 'middle')
        el.setAttribute('dominant-baseline', 'middle')
        el.setAttribute('font-size', String(fontSize))
        el.setAttribute('font-family', 'ui-monospace, monospace')
        el.setAttribute('font-weight', '600')
        el.setAttribute('fill', GAP_COLOR)
        el.setAttribute('stroke', 'rgba(255,255,255,0.92)')
        el.setAttribute('stroke-width', '3')
        el.setAttribute('paint-order', 'stroke fill')
        el.textContent = String(value)
        this.el.appendChild(el)
    }
}
