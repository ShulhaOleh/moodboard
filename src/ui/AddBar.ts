// Toolbar fixed at the top center of the screen for adding new board objects and switching modes.

export type BoardMode = 'edit' | 'explore'

const MODES: { mode: BoardMode; label: string; icon: string }[] = [
    {
        mode: 'edit',
        label: 'Edit',
        icon: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 3.5L15.5 10 10 11.8 7.5 17 5 3.5z"/>
        </svg>`,
    },
    {
        mode: 'explore',
        label: 'Explore',
        icon: `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8 13V7m0 0V4a1 1 0 0 1 2 0v3m-2 0a1 1 0 0 0-2 0v2m4-2a1 1 0 0 1 2 0v2m0 0v1m0-1a1 1 0 0 1 2 0v4a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4v-2a1 1 0 0 1 2 0"/>
        </svg>`,
    },
]

export class AddBar {
    readonly el: HTMLElement
    onAddText: (() => void) | null = null
    onAddImage: ((blob: Blob) => void) | null = null
    onModeChange: ((mode: BoardMode) => void) | null = null

    private fileInput: HTMLInputElement
    private triggerBtn: HTMLButtonElement
    private dropdownEl: HTMLElement
    private addButtons: HTMLButtonElement[]
    private dropdownOpen = false

    constructor(container: HTMLElement) {
        this.el = document.createElement('div')
        this.el.id = 'add-bar'

        const modePicker = document.createElement('div')
        modePicker.className = 'mode-picker'

        this.triggerBtn = document.createElement('button')
        this.triggerBtn.className = 'add-bar-btn mode-trigger'
        this.triggerBtn.addEventListener('click', () => {
            this.dropdownOpen = !this.dropdownOpen
            this.dropdownEl.classList.toggle('hidden', !this.dropdownOpen)
        })

        this.dropdownEl = document.createElement('div')
        this.dropdownEl.className = 'mode-dropdown hidden'

        for (const { mode, label, icon } of MODES) {
            const option = document.createElement('button')
            option.className = 'mode-option'
            option.dataset.mode = mode
            option.innerHTML = `${icon}<span>${label}</span>`
            option.addEventListener('click', () => {
                this.setMode(mode)
                this.closeDropdown()
            })
            this.dropdownEl.appendChild(option)
        }

        modePicker.append(this.triggerBtn, this.dropdownEl)
        this.el.appendChild(modePicker)

        const divider = document.createElement('div')
        divider.className = 'add-bar-divider'
        this.el.appendChild(divider)

        const textBtn = this.makeButton(
            'Text',
            `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
                <path d="M4 5h12M10 5v10M7 15h6"/>
            </svg>`
        )
        textBtn.addEventListener('click', () => this.onAddText?.())

        const imageBtn = this.makeButton(
            'Image',
            `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="4" width="14" height="12" rx="2"/>
                <circle cx="7.5" cy="8.5" r="1.5"/>
                <path d="M3 14l4-4 3 3 2-2 5 5"/>
            </svg>`
        )
        imageBtn.addEventListener('click', () => this.fileInput.click())

        this.addButtons = [textBtn, imageBtn]

        this.fileInput = document.createElement('input')
        this.fileInput.type = 'file'
        this.fileInput.accept = 'image/*'
        this.fileInput.style.display = 'none'
        this.fileInput.addEventListener('change', () => {
            const file = this.fileInput.files?.[0]
            if (file) this.onAddImage?.(file)
            this.fileInput.value = ''
        })

        this.el.append(textBtn, imageBtn, this.fileInput)
        container.appendChild(this.el)

        document.addEventListener('mousedown', (e) => {
            if (this.dropdownOpen && !this.el.contains(e.target as Node)) {
                this.closeDropdown()
            }
        })

        this.setMode('edit')
    }

    setMode(mode: BoardMode) {
        const def = MODES.find((m) => m.mode === mode)!

        this.triggerBtn.innerHTML = `${def.icon}<svg class="mode-chevron" viewBox="0 0 10 6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 1l4 4 4-4"/></svg>`
        this.triggerBtn.title = def.label
        this.triggerBtn.classList.toggle('is-active', mode !== 'edit')

        this.dropdownEl.querySelectorAll('.mode-option').forEach((opt) => {
            opt.classList.toggle('is-active', (opt as HTMLElement).dataset.mode === mode)
        })

        this.addButtons.forEach((btn) => (btn.disabled = mode !== 'edit'))
        this.onModeChange?.(mode)
    }

    private closeDropdown() {
        this.dropdownEl.classList.add('hidden')
        this.dropdownOpen = false
    }

    private makeButton(label: string, iconSvg: string): HTMLButtonElement {
        const btn = document.createElement('button')
        btn.className = 'add-bar-btn'
        btn.title = label
        btn.innerHTML = iconSvg
        return btn
    }
}
