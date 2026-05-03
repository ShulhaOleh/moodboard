// Settings overlay — full-screen panel for managing user preferences.
// Structured like Discord: fixed sidebar on the left, scrollable content on the right.

import {
    type UserSettings,
    type AccentColor,
    saveSettings,
    applyTheme,
    applyAccent,
    beginThemeTransition,
    applyUiFont,
} from '../lib/settings'
import { FontPicker } from './FontPicker'
import { loadFont } from '../lib/fonts'
import {
    type KeybindingMap,
    type ActionBindings,
    type ShortcutAction,
    type Keybinding,
    ACTION_LABELS,
    DEFAULT_KEYBINDINGS,
    saveKeybindings,
    formatBinding,
    bindingsEqual,
} from '../lib/keybindings'

type PageName = 'appearance' | 'keybindings' | 'about'
type Slot = 'primary' | 'secondary'

// Keys that are modifiers only — ignored during capture (user must press a non-modifier key).
const MODIFIER_KEYS = new Set([
    'Shift',
    'Control',
    'Alt',
    'Meta',
    'CapsLock',
    'Fn',
    'FnLock',
    'NumLock',
    'ScrollLock',
])

interface RowRefs {
    primaryBadge: HTMLButtonElement
    secondaryBadge: HTMLButtonElement
    secondaryClear: HTMLButtonElement
}

export class SettingsPanel {
    readonly el: HTMLElement
    onClose: (() => void) | null = null
    onKeybindingsChange: ((bindings: KeybindingMap) => void) | null = null

    private settings: UserSettings
    private keybindings: KeybindingMap
    private keydownListener: ((e: KeyboardEvent) => void) | null = null
    private activePage: PageName = 'appearance'
    private pages = new Map<PageName, HTMLElement>()
    private navItems = new Map<PageName, HTMLButtonElement>()
    private rowRefs = new Map<ShortcutAction, RowRefs>()

    // Non-null while a binding is being captured or a conflict is awaiting confirmation.
    private captureState: {
        action: ShortcutAction
        slot: Slot
        captureListener: ((e: KeyboardEvent) => void) | null
        badgeEl: HTMLButtonElement
        confirmEl: HTMLElement | null
    } | null = null

    constructor(container: HTMLElement, settings: UserSettings, keybindings: KeybindingMap) {
        this.settings = { ...settings }
        this.keybindings = structuredClone(keybindings)

        this.el = document.createElement('div')
        this.el.className = 'settings-overlay'

        const sidebar = this.buildSidebar()
        const content = this.buildContent()
        this.el.append(sidebar, content)
        container.appendChild(this.el)
    }

    open() {
        this.el.classList.add('is-open')
        this.keydownListener = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return
            // Don't let the board's keydown handler see Escape while settings is open.
            e.stopPropagation()
            // Capture and conflict states both clean up via cancelCapture.
            if (this.captureState) {
                this.cancelCapture()
                return
            }
            this.close()
        }
        document.addEventListener('keydown', this.keydownListener, true)
    }

    close() {
        this.cancelCapture()
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

        const navDefs: { page: PageName; label: string }[] = [
            { page: 'appearance', label: 'Appearance' },
            { page: 'keybindings', label: 'Keyboard Shortcuts' },
        ]

        for (const def of navDefs) {
            const btn = document.createElement('button')
            btn.className = 'settings-nav-item'
            btn.textContent = def.label
            btn.classList.toggle('is-active', def.page === this.activePage)
            btn.addEventListener('click', () => this.switchPage(def.page))
            this.navItems.set(def.page, btn)
            sidebar.appendChild(btn)
        }

        const divider = document.createElement('div')
        divider.className = 'settings-sidebar-divider'
        sidebar.appendChild(divider)

        const aboutBtn = document.createElement('button')
        aboutBtn.className = 'settings-nav-item'
        aboutBtn.textContent = 'About'
        aboutBtn.classList.toggle('is-active', this.activePage === 'about')
        aboutBtn.addEventListener('click', () => this.switchPage('about'))
        this.navItems.set('about', aboutBtn)
        sidebar.appendChild(aboutBtn)

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

        const appearancePage = this.buildAppearancePage()
        const keybindingsPage = this.buildKeybindingsPage()
        const aboutPage = this.buildAboutPage()
        keybindingsPage.style.display = 'none'
        aboutPage.style.display = 'none'

        this.pages.set('appearance', appearancePage)
        this.pages.set('keybindings', keybindingsPage)
        this.pages.set('about', aboutPage)

        content.append(closeBtn, appearancePage, keybindingsPage, aboutPage)
        return content
    }

    private switchPage(page: PageName) {
        if (this.captureState) this.cancelCapture()
        this.pages.forEach((el, key) => {
            el.style.display = key === page ? '' : 'none'
        })
        this.navItems.forEach((btn, key) => {
            btn.classList.toggle('is-active', key === page)
        })
        this.activePage = page
    }

    // ── Appearance page ──────────────────────────────────────────────────────────

    private buildAppearancePage(): HTMLElement {
        const page = document.createElement('div')
        page.appendChild(this.buildPageTitle('Appearance'))
        page.appendChild(this.buildThemeField())
        page.appendChild(this.buildAccentField())
        page.appendChild(this.buildUiFontField())
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
                beginThemeTransition()
                applyTheme(opt.value)
            })
            btns.push(btn)
            segmented.appendChild(btn)
        }

        field.appendChild(segmented)
        return field
    }

    private buildAccentField(): HTMLElement {
        const field = document.createElement('div')
        field.className = 'settings-field'

        const labelEl = document.createElement('div')
        labelEl.className = 'settings-field-label'
        labelEl.textContent = 'Accent color'
        field.appendChild(labelEl)

        const swatches = document.createElement('div')
        swatches.className = 'accent-swatches'

        const options: { value: AccentColor; label: string }[] = [
            { value: 'purple', label: 'Purple' },
            { value: 'blue', label: 'Blue' },
            { value: 'teal', label: 'Teal' },
            { value: 'green', label: 'Green' },
            { value: 'orange', label: 'Orange' },
            { value: 'pink', label: 'Pink' },
        ]

        for (const opt of options) {
            const swatch = document.createElement('button')
            swatch.className = 'accent-swatch'
            swatch.dataset.accentColor = opt.value
            swatch.title = opt.label
            swatch.classList.toggle('is-active', this.settings.accent === opt.value)
            swatch.addEventListener('click', () => {
                swatches
                    .querySelectorAll<HTMLButtonElement>('.accent-swatch')
                    .forEach((s) => s.classList.remove('is-active'))
                swatch.classList.add('is-active')
                this.settings.accent = opt.value
                saveSettings(this.settings)
                beginThemeTransition()
                applyAccent(opt.value)
            })
            swatches.appendChild(swatch)
        }

        field.appendChild(swatches)
        return field
    }

    private buildUiFontField(): HTMLElement {
        const field = document.createElement('div')
        field.className = 'settings-field'

        const labelEl = document.createElement('div')
        labelEl.className = 'settings-field-label'
        labelEl.textContent = 'Interface font'
        field.appendChild(labelEl)

        const picker = new FontPicker(this.settings.uiFont, (family) => {
            loadFont(family)
            this.settings.uiFont = family
            saveSettings(this.settings)
            applyUiFont(family)
        })
        picker.el.classList.add('settings-font-picker')
        field.appendChild(picker.el)

        return field
    }

    // ── Keyboard shortcuts page ──────────────────────────────────────────────────

    private buildKeybindingsPage(): HTMLElement {
        const page = document.createElement('div')
        page.appendChild(this.buildPageTitle('Keyboard Shortcuts'))

        const desc = document.createElement('p')
        desc.className = 'settings-page-desc'
        desc.textContent = 'Click a shortcut badge to reassign it. Press Escape to cancel.'
        page.appendChild(desc)

        const actions: ShortcutAction[] = [
            'delete',
            'undo',
            'redo',
            'copy',
            'cut',
            'paste',
            'pencilToggle',
            'eraserToggle',
            'renameLayer',
            'switchToEdit',
            'switchToExplore',
        ]
        for (const action of actions) {
            page.appendChild(this.buildKeybindingRow(action))
        }

        return page
    }

    private buildKeybindingRow(action: ShortcutAction): HTMLElement {
        const row = document.createElement('div')
        row.className = 'settings-field keybinding-row'
        row.dataset.action = action

        const labelEl = document.createElement('div')
        labelEl.className = 'settings-field-label'
        labelEl.textContent = ACTION_LABELS[action]
        row.appendChild(labelEl)

        const right = document.createElement('div')
        right.className = 'keybinding-right'

        const bindings = this.keybindings[action]

        // Primary badge — always set
        const primaryBadge = document.createElement('button')
        primaryBadge.className = 'keybinding-badge'
        primaryBadge.textContent = formatBinding(bindings.primary)
        primaryBadge.title = 'Click to reassign'
        primaryBadge.addEventListener('click', () =>
            this.startCapture(action, 'primary', primaryBadge, row)
        )

        // Secondary badge — empty state when null
        const secondaryBadge = document.createElement('button')
        secondaryBadge.className = 'keybinding-badge'
        secondaryBadge.title = 'Click to add a second shortcut'
        secondaryBadge.addEventListener('click', () =>
            this.startCapture(action, 'secondary', secondaryBadge, row)
        )

        // Clear button for secondary — hidden when secondary is null
        const secondaryClear = document.createElement('button')
        secondaryClear.className = 'keybinding-clear-sec'
        secondaryClear.title = 'Remove second shortcut'
        secondaryClear.innerHTML = `<svg viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 2l6 6M8 2L2 8"/></svg>`
        secondaryClear.addEventListener('click', () => {
            if (this.captureState?.action === action && this.captureState.slot === 'secondary') {
                this.cancelCapture()
            }
            this.applyBinding(action, 'secondary', null)
        })

        const resetBtn = document.createElement('button')
        resetBtn.className = 'keybinding-aux-btn'
        resetBtn.title = 'Reset to default'
        resetBtn.innerHTML = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8A5 5 0 1 0 5.5 3.5"/><polyline points="3 3.5 3 8 7.5 8"/></svg>`
        resetBtn.addEventListener('click', () => {
            if (this.captureState?.action === action && this.captureState.slot === 'primary')
                this.cancelCapture()
            this.applyBinding(
                action,
                'primary',
                structuredClone(DEFAULT_KEYBINDINGS[action].primary)
            )
        })

        secondaryClear.className = 'keybinding-aux-btn keybinding-clear-sec'

        this.rowRefs.set(action, { primaryBadge, secondaryBadge, secondaryClear })
        this.syncSecondaryBadge(action)

        const primaryPair = document.createElement('div')
        primaryPair.className = 'keybinding-pair'
        primaryPair.append(primaryBadge, resetBtn)

        const secondaryPair = document.createElement('div')
        secondaryPair.className = 'keybinding-pair'
        secondaryPair.append(secondaryBadge, secondaryClear)

        right.append(primaryPair, secondaryPair)
        row.appendChild(right)

        return row
    }

    // Updates secondary badge text and clear-button visibility to match current keybinding state.
    private syncSecondaryBadge(action: ShortcutAction) {
        const refs = this.rowRefs.get(action)!
        const secondary = this.keybindings[action].secondary
        if (secondary) {
            refs.secondaryBadge.textContent = formatBinding(secondary)
            refs.secondaryBadge.classList.remove('is-empty')
            refs.secondaryClear.classList.remove('is-hidden')
        } else {
            refs.secondaryBadge.textContent = ''
            refs.secondaryBadge.classList.add('is-empty')
            refs.secondaryClear.classList.add('is-hidden')
        }
    }

    // ── Capture flow ─────────────────────────────────────────────────────────────

    private startCapture(
        action: ShortcutAction,
        slot: Slot,
        badgeEl: HTMLButtonElement,
        rowEl: HTMLElement
    ) {
        if (this.captureState) this.cancelCapture()

        badgeEl.textContent = 'Press a key…'
        badgeEl.classList.remove('is-empty')
        badgeEl.classList.add('is-capturing')

        const captureListener = (e: KeyboardEvent) => {
            if (!this.captureState) return
            if (MODIFIER_KEYS.has(e.key)) return

            e.preventDefault()
            e.stopImmediatePropagation()

            const binding: Keybinding = {
                key: e.key,
                ctrl: e.ctrlKey || e.metaKey,
                shift: e.shiftKey,
                alt: e.altKey,
            }

            this.resolveCapture(action, slot, binding, badgeEl, rowEl)
        }

        document.addEventListener('keydown', captureListener, true)
        this.captureState = { action, slot, captureListener, badgeEl, confirmEl: null }
    }

    private resolveCapture(
        action: ShortcutAction,
        slot: Slot,
        binding: Keybinding,
        badgeEl: HTMLButtonElement,
        rowEl: HTMLElement
    ) {
        const conflict = this.findConflict(action, slot, binding)
        this.stopCaptureListener()

        if (!conflict) {
            this.applyBinding(action, slot, binding)
            this.captureState = null
            return
        }

        // Show conflict confirmation inline below the row.
        badgeEl.textContent = formatBinding(binding)
        badgeEl.classList.remove('is-capturing')
        badgeEl.classList.add('is-conflict')

        const confirmEl = this.buildConflictBar(
            conflict,
            () => {
                // Clear the conflicting slot (secondary → null, primary → reset to default).
                if (conflict.slot === 'secondary') {
                    this.applyBinding(conflict.action, 'secondary', null)
                } else {
                    this.applyBinding(
                        conflict.action,
                        'primary',
                        structuredClone(DEFAULT_KEYBINDINGS[conflict.action].primary)
                    )
                }
                this.applyBinding(action, slot, binding)
                badgeEl.classList.remove('is-conflict')
                confirmEl.remove()
                this.captureState = null
            },
            () => {
                this.cancelCapture()
            }
        )

        rowEl.after(confirmEl)
        this.captureState = { action, slot, captureListener: null, badgeEl, confirmEl }
    }

    private buildConflictBar(
        conflict: { action: ShortcutAction; slot: Slot },
        onOverride: () => void,
        onCancel: () => void
    ): HTMLElement {
        const bar = document.createElement('div')
        bar.className = 'keybinding-conflict-bar'

        const slotLabel = conflict.slot === 'secondary' ? ' (second shortcut)' : ''
        const msg = document.createElement('span')
        msg.className = 'keybinding-conflict-msg'
        msg.innerHTML = `Conflicts with <strong>${ACTION_LABELS[conflict.action]}</strong>${slotLabel}`

        const overrideBtn = document.createElement('button')
        overrideBtn.className = 'keybinding-conflict-override'
        overrideBtn.textContent = 'Override'
        overrideBtn.addEventListener('click', onOverride)

        const cancelBtn = document.createElement('button')
        cancelBtn.className = 'keybinding-conflict-cancel'
        cancelBtn.textContent = 'Cancel'
        cancelBtn.addEventListener('click', onCancel)

        bar.append(msg, overrideBtn, cancelBtn)
        return bar
    }

    private applyBinding(action: ShortcutAction, slot: Slot, binding: Keybinding | null) {
        if (slot === 'primary') {
            this.keybindings[action].primary = binding!
        } else {
            this.keybindings[action].secondary = binding
        }
        saveKeybindings(this.keybindings)
        this.onKeybindingsChange?.(structuredClone(this.keybindings))

        const refs = this.rowRefs.get(action)
        if (!refs) return

        if (slot === 'primary') {
            refs.primaryBadge.textContent = formatBinding(binding!)
            refs.primaryBadge.classList.remove('is-capturing', 'is-conflict')
        } else {
            this.syncSecondaryBadge(action)
            refs.secondaryBadge.classList.remove('is-capturing', 'is-conflict')
        }
    }

    private findConflict(
        action: ShortcutAction,
        slot: Slot,
        binding: Keybinding
    ): { action: ShortcutAction; slot: Slot } | null {
        for (const [other, otherBindings] of Object.entries(this.keybindings) as [
            ShortcutAction,
            ActionBindings,
        ][]) {
            for (const otherSlot of ['primary', 'secondary'] as const) {
                if (other === action && otherSlot === slot) continue
                const otherBinding = otherBindings[otherSlot]
                if (!otherBinding) continue
                if (bindingsEqual(binding, otherBinding)) return { action: other, slot: otherSlot }
            }
        }
        return null
    }

    private stopCaptureListener() {
        if (this.captureState?.captureListener) {
            document.removeEventListener('keydown', this.captureState.captureListener, true)
            this.captureState.captureListener = null
        }
    }

    private cancelCapture() {
        if (!this.captureState) return
        const { action, slot, badgeEl, confirmEl } = this.captureState
        this.stopCaptureListener()

        // Restore badge to its pre-capture state.
        const currentBinding = this.keybindings[action][slot]
        if (slot === 'secondary' && !currentBinding) {
            badgeEl.textContent = '+'
            badgeEl.classList.add('is-empty')
        } else if (currentBinding) {
            badgeEl.textContent = formatBinding(currentBinding)
        }
        badgeEl.classList.remove('is-capturing', 'is-conflict')
        confirmEl?.remove()
        this.captureState = null
    }

    // ── About page ───────────────────────────────────────────────────────────────

    private buildAboutPage(): HTMLElement {
        const page = document.createElement('div')
        page.className = 'about-page'

        const name = document.createElement('div')
        name.className = 'about-name'
        name.textContent = 'Moodboard'

        const tagline = document.createElement('div')
        tagline.className = 'about-tagline'
        tagline.textContent = 'A minimal canvas for collecting visual ideas.'

        const githubLink = document.createElement('a')
        githubLink.className = 'about-github-btn'
        githubLink.href = 'https://github.com/ShulhaOleh/moodboard'
        githubLink.target = '_blank'
        githubLink.rel = 'noopener noreferrer'
        githubLink.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.604-3.369-1.342-3.369-1.342-.454-1.154-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.071 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z"/></svg>View on GitHub`

        const divider = document.createElement('div')
        divider.className = 'about-divider'

        const builtWith = document.createElement('div')
        builtWith.className = 'about-built-with'
        builtWith.textContent = 'Built with Vite · TypeScript · TipTap · Dexie'

        const author = document.createElement('div')
        author.className = 'about-author'
        author.textContent = 'Created by Oleh Shulha'

        page.append(name, tagline, githubLink, divider, builtWith, author)
        return page
    }

    // ── Shared helpers ───────────────────────────────────────────────────────────

    private buildPageTitle(text: string): HTMLElement {
        const title = document.createElement('h2')
        title.className = 'settings-page-title'
        title.textContent = text
        return title
    }
}
