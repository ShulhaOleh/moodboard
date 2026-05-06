// Central icon registry — all UI icons serialised from Lucide at module load.
// Import named constants here instead of embedding inline SVG strings in components.

import {
    MousePointer2,
    Hand,
    Square,
    Minus,
    ArrowRight,
    Circle,
    Pentagon,
    Star,
    StickyNote,
    FileText,
    Files,
    ChevronDown,
    ChevronRight,
    Undo2,
    Redo2,
    Type,
    Image as LucideImage,
    Pencil,
    Eraser,
    Settings,
    Eye,
    EyeOff,
    Lock,
    LockOpen,
    X,
    RotateCcw,
    Contrast,
    type IconNode,
} from 'lucide'

function toSvg(nodes: IconNode, extraClass?: string): string {
    const classAttr = extraClass ? ` class="${extraClass}"` : ''
    const inner = nodes
        .map(([tag, attrs]) => {
            const attrStr = Object.entries(attrs)
                .map(([k, v]) => `${k}="${v}"`)
                .join(' ')
            return `<${tag} ${attrStr}/>`
        })
        .join('')
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"${classAttr}>${inner}</svg>`
}

// Board modes
export const ICON_EDIT_MODE = toSvg(MousePointer2)
export const ICON_EXPLORE_MODE = toSvg(Hand)

// Shape tool
export const ICON_SHAPE_RECT = toSvg(Square)
export const ICON_SHAPE_LINE = toSvg(Minus)
export const ICON_SHAPE_ARROW = toSvg(ArrowRight)
export const ICON_SHAPE_ELLIPSE = toSvg(Circle)
export const ICON_SHAPE_POLYGON = toSvg(Pentagon)
export const ICON_SHAPE_STAR = toSvg(Star)

// Note style picker
export const ICON_NOTE_PLAIN = toSvg(StickyNote)
export const ICON_NOTE_DOGEAR = toSvg(FileText)
export const ICON_NOTE_STACKED = toSvg(Files)

// Toolbar
export const ICON_CHEVRON_DOWN = toSvg(ChevronDown, 'mode-chevron')
export const ICON_UNDO = toSvg(Undo2)
export const ICON_REDO = toSvg(Redo2)
export const ICON_TEXT = toSvg(Type)
export const ICON_IMAGE = toSvg(LucideImage)
export const ICON_PENCIL = toSvg(Pencil)
export const ICON_ERASER = toSvg(Eraser)
export const ICON_SETTINGS = toSvg(Settings)

// Layers panel
export const ICON_EYE = toSvg(Eye)
export const ICON_EYE_OFF = toSvg(EyeOff)
export const ICON_LOCK_CLOSED = toSvg(Lock)
export const ICON_LOCK_OPEN = toSvg(LockOpen)
export const ICON_CHEVRON_RIGHT = toSvg(ChevronRight)

// Settings panel
export const ICON_CLOSE = toSvg(X)
export const ICON_RESET = toSvg(RotateCcw)

// Properties panel
export const ICON_CONTRAST = toSvg(Contrast)
