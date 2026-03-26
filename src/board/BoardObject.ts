// Shared interface for all objects that can be placed on the board.

export type PropertyField =
    | {
          type: 'number'
          key: string
          label: string
          value: number
          min?: number
          max?: number
          step?: number
      }
    | { type: 'color'; key: string; label: string; value: string; clearable?: boolean }

export interface BoardObject {
    el: HTMLElement
    onSelect: ((obj: BoardObject) => void) | null
    onDeselect: (() => void) | null
    onChange: (() => void) | null
    getPosition(): { x: number; y: number }
    getSize(): { width: number; height: number }
    getRotation(): number
    setPosition(x: number, y: number): void
    setSize(width: number, height: number): void
    setRotation(deg: number): void
    // Returns appearance fields specific to this object type.
    getAppearanceFields(): PropertyField[]
    setAppearanceProperty(key: string, value: string | number): void
}
