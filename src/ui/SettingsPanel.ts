// Settings overlay — full-screen panel for managing user preferences.
// Structured like Discord: fixed sidebar on the left, scrollable content on the right.

import { type UserSettings, saveSettings, applyTheme } from '../lib/settings'

export class SettingsPanel {
    readonly el: HTMLElement
    onClose: (() => void) | null = null

    private settings: UserSettings
    private keydownListener: ((e: KeyboardEvent) => void) | null = null

    constructor(container: HTMLElement, settings: UserSettings) {
        this.settings = { ...settings }

        this.el = document.createElement('div')
        this.el.className = 'settings-overlay'

        const sidebar = this.buildSidebar()
        const content = this.buildContent()
        this.el.append(sidebar, content)
        container.appendChild(this.el)
    }

    open() {
        this.el.classList.add('is-open')
        // Capture phase so Escape is intercepted before the board's keydown handler.
        this.keydownListener = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation()
                this.close()
            }
        }
        document.addEventListener('keydown', this.keydownListener, true)
    }

    close() {
        this.el.classList.remove('is-open')
        if (this.keydownListener) {
            document.removeEventListener('keydown', this.keydownListener, true)
            this.keydownListener = null
        }
        this.onClose?.()
    }

    // Call after external changes to settings so the panel stays in sync.
    sync(settings: UserSettings) {
        this.settings = { ...settings }
    }

    private buildSidebar(): HTMLElement {
        const sidebar = document.createElement('nav')
        sidebar.className = 'settings-sidebar'

        const label = document.createElement('div')
        label.className = 'settings-sidebar-label'
        label.textContent = 'User Settings'
        sidebar.appendChild(label)

        const appearanceBtn = document.createElement('button')
        appearanceBtn.className = 'settings-nav-item is-active'
        appearanceBtn.textContent = 'Appearance'
        sidebar.appendChild(appearanceBtn)

        return sidebar
    }

    private buildContent(): HTMLElement {
        const content = document.createElement('div')
        content.className = 'settings-content'

        const closeBtn = document.createElement('button')
        closeBtn.className = 'settings-close-btn'
        closeBtn.title = 'Close settings (Escape)'
        closeBtn.innerHTML = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 5l10 10M15 5L5 15"/></svg>`
        closeBtn.addEventListener('click', () => this.close())

        content.append(closeBtn, this.buildAppearancePage())
        return content
    }

    private buildAppearancePage(): HTMLElement {
        const page = document.createElement('div')

        const title = document.createElement('h2')
        title.className = 'settings-page-title'
        title.textContent = 'Appearance'
        page.appendChild(title)

        page.appendChild(this.buildThemeField())
        return page
    }

    private buildThemeField(): HTMLElement {
        const field = document.createElement('div')
        field.className = 'settings-field'

        const labelEl = document.createElement('div')
        labelEl.className = 'settings-field-label'
        labelEl.textContent = 'Theme'
        field.appendChild(labelEl)

        const options: { value: UserSettings['theme']; label: string }[] = [
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
            { value: 'system', label: 'System' },
        ]

        const segmented = document.createElement('div')
        segmented.className = 'theme-segmented'

        const btns: HTMLButtonElement[] = []
        for (const opt of options) {
            const btn = document.createElement('button')
            btn.className = 'theme-option'
            btn.textContent = opt.label
            btn.classList.toggle('is-active', this.settings.theme === opt.value)
            btn.addEventListener('click', () => {
                btns.forEach((b) => b.classList.remove('is-active'))
                btn.classList.add('is-active')
                this.settings.theme = opt.value
                saveSettings(this.settings)
                applyTheme(opt.value)
            })
            btns.push(btn)
            segmented.appendChild(btn)
        }

        field.appendChild(segmented)
        return field
    }
}
