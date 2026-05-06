// Keyboard shortcut bindings — definition, persistence, and matching helpers.

const STORAGE_KEY = 'moodboard-keybindings'

export type ShortcutAction =
    | 'delete'
    | 'undo'
    | 'redo'
    | 'copy'
    | 'cut'
    | 'paste'
    | 'pencilToggle'
    | 'eraserToggle'
    | 'renameLayer'
    | 'switchToEdit'
    | 'switchToExplore'
    | 'group'
    | 'ungroup'

export interface Keybinding {
    key: string // e.g. 'z', 'Delete', 'p'
    ctrl: boolean // true = Ctrl (Win/Linux) or Cmd (Mac)
    shift: boolean
    alt: boolean
}

// Each action has a primary binding and an optional secondary binding.
export interface ActionBindings {
    primary: Keybinding
    secondary: Keybinding | null
}

export type KeybindingMap = Record<ShortcutAction, ActionBindings>

export const ACTION_LABELS: Record<ShortcutAction, string> = {
    delete: 'Delete selection',
    undo: 'Undo',
    redo: 'Redo',
    copy: 'Copy',
    cut: 'Cut',
    paste: 'Paste',
    pencilToggle: 'Toggle pencil tool',
    eraserToggle: 'Toggle eraser tool',
    renameLayer: 'Rename selected layer',
    switchToEdit: 'Switch to Edit mode',
    switchToExplore: 'Switch to Explore mode',
    group: 'Group selection',
    ungroup: 'Ungroup selection',
}

export const DEFAULT_KEYBINDINGS: KeybindingMap = {
    delete: {
        primary: { key: 'Delete', ctrl: false, shift: false, alt: false },
        secondary: { key: 'Backspace', ctrl: false, shift: false, alt: false },
    },
    undo: { primary: { key: 'z', ctrl: true, shift: false, alt: false }, secondary: null },
    redo: { primary: { key: 'y', ctrl: true, shift: false, alt: false }, secondary: null },
    copy: { primary: { key: 'c', ctrl: true, shift: false, alt: false }, secondary: null },
    cut: { primary: { key: 'x', ctrl: true, shift: false, alt: false }, secondary: null },
    paste: { primary: { key: 'v', ctrl: true, shift: false, alt: false }, secondary: null },
    pencilToggle: { primary: { key: 'p', ctrl: false, shift: false, alt: false }, secondary: null },
    eraserToggle: { primary: { key: 'e', ctrl: false, shift: true, alt: false }, secondary: null },
    renameLayer: { primary: { key: 'F2', ctrl: false, shift: false, alt: false }, secondary: null },
    switchToEdit: { primary: { key: 'e', ctrl: false, shift: false, alt: false }, secondary: null },
    switchToExplore: {
        primary: { key: 'r', ctrl: false, shift: false, alt: false },
        secondary: null,
    },
    group: { primary: { key: 'g', ctrl: true, shift: false, alt: false }, secondary: null },
    ungroup: { primary: { key: 'g', ctrl: true, shift: true, alt: false }, secondary: null },
}

export function loadKeybindings(): KeybindingMap {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return structuredClone(DEFAULT_KEYBINDINGS)
        const saved = JSON.parse(raw) as Partial<Record<ShortcutAction, ActionBindings>>
        const result = structuredClone(DEFAULT_KEYBINDINGS)
        for (const action of Object.keys(DEFAULT_KEYBINDINGS) as ShortcutAction[]) {
            const val = saved[action]
            if (val && 'primary' in val) result[action] = val
        }
        return result
    } catch {
        return structuredClone(DEFAULT_KEYBINDINGS)
    }
}

export function saveKeybindings(bindings: KeybindingMap): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings))
}

// Returns true if the event matches either the primary or secondary binding.
// ctrl:true accepts either Ctrl (Windows) or Meta/Cmd (Mac).
export function matchesAction(e: KeyboardEvent, bindings: ActionBindings): boolean {
    return (
        matchesBinding(e, bindings.primary) ||
        (bindings.secondary !== null && matchesBinding(e, bindings.secondary))
    )
}

function matchesBinding(e: KeyboardEvent, b: Keybinding): boolean {
    return (
        e.key.toLowerCase() === b.key.toLowerCase() &&
        (e.ctrlKey || e.metaKey) === b.ctrl &&
        e.shiftKey === b.shift &&
        e.altKey === b.alt
    )
}

// Human-readable label for a keybinding, e.g. "Ctrl+Z" or "Delete".
export function formatBinding(b: Keybinding): string {
    const parts: string[] = []
    if (b.ctrl) parts.push('Ctrl')
    if (b.alt) parts.push('Alt')
    if (b.shift) parts.push('Shift')
    parts.push(formatKey(b.key))
    return parts.join('+')
}

// Direct binding comparison (no KeyboardEvent needed).
export function bindingsEqual(a: Keybinding, b: Keybinding): boolean {
    return (
        a.key.toLowerCase() === b.key.toLowerCase() &&
        a.ctrl === b.ctrl &&
        a.shift === b.shift &&
        a.alt === b.alt
    )
}

const KEY_DISPLAY: Record<string, string> = {
    ' ': 'Space',
    arrowup: '↑',
    arrowdown: '↓',
    arrowleft: '←',
    arrowright: '→',
}

function formatKey(key: string): string {
    const mapped = KEY_DISPLAY[key.toLowerCase()]
    if (mapped) return mapped
    return key.length === 1 ? key.toUpperCase() : key
}
