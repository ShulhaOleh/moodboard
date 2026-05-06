// IndexedDB persistence via Dexie — single board stored under the key 'default'.
//
// To add a new schema version:
//   1. Bump SCHEMA_VERSION.
//   2. Add a migration function to MIGRATIONS keyed by the version it produces.
//   3. Update PersistedBlock / BoardRecord types as needed.
//
// To drop support for very old versions, raise MIN_SUPPORTED_VERSION.

import Dexie, { type EntityTable } from 'dexie'
import type { TextBlockData } from '../board/TextBlock'
import type { ImageBlockData } from '../board/ImageBlock'
import type { ShapeBlockData } from '../board/ShapeBlock'
import type { LineBlockData } from '../board/LineBlock'
import type { PathBlockData } from '../board/PathBlock'
import type { NoteBlockData } from '../board/NoteBlock'

export type PersistedBlock =
    | { type: 'text'; data: TextBlockData }
    | { type: 'image'; data: ImageBlockData }
    | { type: 'shape'; data: ShapeBlockData }
    | { type: 'line'; data: LineBlockData }
    | { type: 'path'; data: PathBlockData }
    | { type: 'note'; data: NoteBlockData }

export interface GroupRecord {
    id: string
    name: string
}

export interface BoardRecord {
    id: string
    schemaVersion: number
    blocks: PersistedBlock[]
    groups?: GroupRecord[]
    panX: number
    panY: number
    zoom: number
    canvasBackground: string
    boardName?: string
}

export const SCHEMA_VERSION = 5
export const MIN_SUPPORTED_VERSION = 1

// One entry per version that requires a migration. Each function receives the
// block array from the previous version and returns the updated array.
// Versions 1–3 used additive-only changes, so no transformation is needed yet.
const MIGRATIONS: Record<number, (blocks: PersistedBlock[]) => PersistedBlock[]> = {
    // example for a future breaking change:
    // 4: (blocks) => blocks.map(migrateV3toV4),
}

// Runs all necessary migrations to bring blocks from fromVersion up to SCHEMA_VERSION.
export function migrateBlocks(blocks: PersistedBlock[], fromVersion: number): PersistedBlock[] {
    for (let v = fromVersion + 1; v <= SCHEMA_VERSION; v++) {
        blocks = MIGRATIONS[v]?.(blocks) ?? blocks
    }
    return blocks
}

class MoodboardDB extends Dexie {
    boards!: EntityTable<BoardRecord, 'id'>

    constructor() {
        super('moodboard')
        this.version(1).stores({ boards: 'id' })
    }
}

export const db = new MoodboardDB()
