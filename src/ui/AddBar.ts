// Toolbar fixed at the top center of the screen for adding new board objects.

export class AddBar {
    readonly el: HTMLElement
    onAddText: (() => void) | null = null
    onAddImage: ((blob: Blob) => void) | null = null

    private fileInput: HTMLInputElement

    constructor(container: HTMLElement) {
        this.el = document.createElement('div')
        this.el.id = 'add-bar'

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

        // Hidden file input — triggered by the image button
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
    }

    private makeButton(label: string, iconSvg: string): HTMLButtonElement {
        const btn = document.createElement('button')
        btn.className = 'add-bar-btn'
        btn.title = label
        btn.innerHTML = iconSvg
        return btn
    }
}
