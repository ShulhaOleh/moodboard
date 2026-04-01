// Shared interface for all objects that can be placed on the board.

export type PropertyField =
    | { type: 'section'; label: string }
    | {
          type: 'number'
          key: string
          label: string
          value: number
          min?: number
          max?: number
          step?: number
      }
    | {
          type: 'slider'
          key: string
          label: string
          value: number
          min: number
          max: number
          step?: number
      }
    | { type: 'color'; key: string; label: string; value: string; clearable?: boolean }
    | {
          type: 'text'
          key: string
          label: string
          value: string
          placeholder?: string
          allowFilePick?: boolean
      }
    | { type: 'font'; key: string; label: string; value: string }
    | {
          type: 'select'
          key: string
          label: string
          value: string
          options: { value: string; label: string }[]
      }

export interface BoardObject {
    el: HTMLElement
    onSelect: ((obj: BoardObject, e: MouseEvent) => void) | null
    onDeselect: (() => void) | null
    onChange: (() => void) | null
    onDragMove: ((dx: number, dy: number) => void) | null
    // Fired once when a drag/resize/rotate gesture commits (threshold exceeded or handle pressed).
    onDragStart: (() => void) | null
    // Fired before any setter (setPosition, setSize, setRotation, setAppearanceProperty) applies a change.
    onBeforePropertyChange: (() => void) | null
    // When true, the panel hides the Position/Size/Rotation fields for this object.
    readonly omitCommonProps?: true
    // When true, the panel hides the Delete button for this object.
    readonly hideDelete?: true
    getPosition(): { x: number; y: number }
    getSize(): { width: number; height: number }
    getRotation(): number
    setPosition(x: number, y: number): void
    setSize(width: number, height: number): void
    setRotation(deg: number): void
    // Returns appearance fields specific to this object type.
    getAppearanceFields(): PropertyField[]
    setAppearanceProperty(key: string, value: string | number): void
    // Controls visual selection state without firing callbacks — used by multi-select.
    markSelected(): void
    markDeselected(): void
    destroy(): void
}
