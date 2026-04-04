// Modal dialog utility — replaces native alert/confirm with styled popups.

interface ConfirmOptions {
    confirmLabel?: string
    destructive?: boolean
}

export class Dialog {
    static alert(message: string): Promise<void> {
        return new Promise((resolve) => {
            const { backdrop, actions } = buildShell(message)

            const okBtn = makeBtn('OK', ['dialog-btn-primary'])
            okBtn.addEventListener('click', dismiss)
            actions.appendChild(okBtn)

            mount(backdrop)
            okBtn.focus()

            backdrop.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === 'Escape') {
                    e.preventDefault()
                    dismiss()
                }
            })

            function dismiss() {
                close(backdrop)
                resolve()
            }
        })
    }

    static confirm(message: string, opts: ConfirmOptions = {}): Promise<boolean> {
        const { confirmLabel = 'Confirm', destructive = false } = opts
        return new Promise((resolve) => {
            const { backdrop, actions } = buildShell(message)

            const cancelBtn = makeBtn('Cancel', ['dialog-btn-secondary'])
            const confirmBtn = makeBtn(confirmLabel, [
                'dialog-btn-primary',
                ...(destructive ? ['is-destructive'] : []),
            ])

            cancelBtn.addEventListener('click', () => dismiss(false))
            confirmBtn.addEventListener('click', () => dismiss(true))
            actions.appendChild(cancelBtn)
            actions.appendChild(confirmBtn)

            mount(backdrop)
            cancelBtn.focus()

            backdrop.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    e.preventDefault()
                    dismiss(false)
                }
                if (e.key === 'Enter') {
                    e.preventDefault()
                    dismiss(true)
                }
            })

            function dismiss(result: boolean) {
                close(backdrop)
                resolve(result)
            }
        })
    }
}

function buildShell(message: string): { backdrop: HTMLElement; actions: HTMLElement } {
    const backdrop = document.createElement('div')
    backdrop.className = 'dialog-backdrop'
    backdrop.tabIndex = -1

    const box = document.createElement('div')
    box.className = 'dialog-box'
    box.setAttribute('role', 'dialog')

    const msg = document.createElement('p')
    msg.className = 'dialog-message'
    msg.textContent = message

    const actions = document.createElement('div')
    actions.className = 'dialog-actions'

    box.appendChild(msg)
    box.appendChild(actions)
    backdrop.appendChild(box)

    return { backdrop, actions }
}

function makeBtn(label: string, classes: string[]): HTMLButtonElement {
    const btn = document.createElement('button')
    btn.className = ['dialog-btn', ...classes].join(' ')
    btn.textContent = label
    return btn
}

function mount(backdrop: HTMLElement) {
    document.body.appendChild(backdrop)
    // Next frame triggers the CSS enter transition
    requestAnimationFrame(() => backdrop.classList.add('is-open'))
}

function close(backdrop: HTMLElement) {
    backdrop.classList.remove('is-open')
    backdrop.addEventListener('transitionend', () => backdrop.remove(), { once: true })
}
