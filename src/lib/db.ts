// IndexedDB persistence via Dexie — single board stored under the key 'default'.
// Bump SCHEMA_VERSION and add a migration branch in loadBoard() whenever PersistedBlock changes.

import Dexie, { type EntityTable } from 'dexie'
import type { TextBlockData } from '../board/TextBlock'
import type { ImageBlockData } from '../board/ImageBlock'
import type { ShapeBlockData } from '../board/ShapeBlock'
import type { LineBlockData } from '../board/LineBlock'
import type { PathBlockData } from '../board/PathBlock'

export type PersistedBlock =
    | { type: 'text'; data: TextBlockData }
    | { type: 'image'; data: ImageBlockData }
    | { type: 'shape'; data: ShapeBlockData }
    | { type: 'line'; data: LineBlockData }
    | { type: 'path'; data: PathBlockData }

export interface BoardRecord {
    id: string
    schemaVersion: number
    blocks: PersistedBlock[]
    panX: number
    panY: number
    zoom: number
    canvasBackground: string
    boardName?: string
}

export const SCHEMA_VERSION = 2

class MoodboardDB extends Dexie {
    boards!: EntityTable<BoardRecord, 'id'>

    constructor() {
        super('moodboard')
        this.version(1).stores({ boards: 'id' })
    }
}

export const db = new MoodboardDB()
