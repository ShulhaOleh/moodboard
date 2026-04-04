// Zoom widget — slider, editable percentage label, and +/− step buttons for canvas zoom.
// Computes new pan offsets (keeping the viewport center fixed) and reports changes via onZoomChange.

export class ZoomWidget {
    readonly el: HTMLElement
    onZoomChange: ((zoom: number, panX: number, panY: number) => void) | null = null

    private readonly slider: HTMLInputElement
    private readonly label: HTMLInputElement

    constructor(private readonly getViewport: () => { panX: number; panY: number; zoom: number }) {
        this.el = document.createElement('div')
        this.el.id = 'zoom-widget'

        this.slider = this.buildSlider()
        this.label = this.buildLabel()

        this.el.append(
            this.buildStepButton('−', -1),
            this.label,
            this.buildStepButton('+', +1),
            this.slider
        )
    }

    // Syncs the display to a zoom value applied externally (e.g. scroll wheel).
    sync(zoom: number) {
        this.label.value = `${Math.round(zoom * 100)}%`
        this.slider.value = String(Math.round(zoom * 100))
    }

    private applyZoom(pct: number) {
        const { panX, panY, zoom } = this.getViewport()
        const newZoom = pct / 100
        const cx = window.innerWidth / 2
        const cy = window.innerHeight / 2
        const newPanX = cx - (cx - panX) * (newZoom / zoom)
        const newPanY = cy - (cy - panY) * (newZoom / zoom)
        this.onZoomChange?.(newZoom, newPanX, newPanY)
        this.sync(newZoom)
    }

    private buildSlider(): HTMLInputElement {
        const slider = document.createElement('input')
        slider.type = 'range'
        slider.min = '10'
        slider.max = '400'
        slider.step = '1'
        slider.value = '100'
        slider.addEventListener('input', () => this.applyZoom(Number(slider.value)))
        return slider
    }

    private buildLabel(): HTMLInputElement {
        const label = document.createElement('input')
        label.id = 'zoom-label'
        label.type = 'text'
        label.value = '100%'
        label.addEventListener('focus', () => {
            label.value = String(Math.round(this.getViewport().zoom * 100))
            label.select()
        })
        label.addEventListener('blur', () => {
            const raw = parseInt(label.value, 10)
            const pct = isNaN(raw)
                ? Math.round(this.getViewport().zoom * 100)
                : Math.min(400, Math.max(10, raw))
            this.applyZoom(pct)
        })
        label.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') label.blur()
            if (e.key === 'Escape') {
                label.value = `${Math.round(this.getViewport().zoom * 100)}%`
                label.blur()
            }
        })
        return label
    }

    private buildStepButton(text: string, delta: number): HTMLButtonElement {
        const btn = document.createElement('button')
        btn.id = delta < 0 ? 'zoom-minus' : 'zoom-plus'
        btn.textContent = text

        let timeout: ReturnType<typeof setTimeout> | null = null
        let interval: ReturnType<typeof setInterval> | null = null

        const step = () => {
            const pct = Math.min(
                400,
                Math.max(10, Math.round(this.getViewport().zoom * 100) + delta)
            )
            this.applyZoom(pct)
        }

        btn.addEventListener('mousedown', (e) => {
            e.preventDefault()
            step()
            timeout = setTimeout(() => {
                interval = setInterval(step, 80)
            }, 500)
        })

        const stop = () => {
            if (timeout !== null) {
                clearTimeout(timeout)
                timeout = null
            }
            if (interval !== null) {
                clearInterval(interval)
                interval = null
            }
        }
        btn.addEventListener('mouseup', stop)
        btn.addEventListener('mouseleave', stop)

        return btn
    }
}
