// Shared interface for all objects that can be placed on the board.

export type PropertyField =
    | { type: 'section'; label: string }
    | { type: 'button'; key: string; label: string; destructive?: boolean }
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
    // Fired when visibility or lock state changes — used by LayersPanel to update the row without a full refresh.
    onLayerChange: (() => void) | null
    // Human-readable label shown in the Layers panel.
    readonly layerLabel: string
    // User-editable name shown in the layers panel and properties panel.
    name: string
    setName(name: string): void
    // When true, the properties panel hides the name field for this object.
    readonly hideName?: true
    // When false the block is hidden (display:none) and excluded from selection.
    visible: boolean
    // When true the block cannot be dragged or selected.
    locked: boolean
    setVisible(v: boolean): void
    setLocked(v: boolean): void
    // When true, the panel hides the Position/Size/Rotation fields for this object.
    readonly omitCommonProps?: true
    // When true, the panel hides the Delete button for this object.
    readonly hideDelete?: true
    getPosition(): { x: number; y: number }
    getSize(): { width: number; height: number }
    getRotation(): number
    // Returns world-space corner points used to compute the group selection AABB.
    // Standard blocks return 4 rotated corners; LineBlock returns its 2 endpoints.
    getWorldCorners(): [number, number][]
    setPosition(x: number, y: number): void
    setSize(width: number, height: number): void
    setRotation(deg: number): void
    // Returns appearance fields specific to this object type.
    getAppearanceFields(): PropertyField[]
    setAppearanceProperty(key: string, value: string | number): void
    // Optional: called when a file is picked via allowFilePick — lets the block store the raw File.
    setFileProperty?(key: string, file: File): void
    // Controls visual selection state without firing callbacks — used by multi-select.
    markSelected(): void
    markDeselected(): void
    destroy(): void
}
