import {
  allChapters,
  getChapterById,
  getChapterByLegacyIndex,
} from '../data/chapters';
import type { ChapterId, NoteEntry, NotesStore } from '../types/novel';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const STORAGE_KEYS = {
  // Legacy keys (v0)
  LEGACY_CHAPTER_INDEX: 'novel-chapter-index',
  LEGACY_FAVORITES: 'novel-favorites',
  LEGACY_NOTES: 'novel-notes',
  THEME: 'novel-theme',
  FONT_SCALE: 'novel-font-scale',
  FOCUS_MODE: 'novel-focus-mode',
  REDUCE_MOTION: 'novel-reduce-motion',
  WIP_NOTICE_DISMISSED: 'wip_notice_dismissed',

  // Versioned ID-based keys (v1)
  STORAGE_VERSION: 'novel-storage-version',
  V2_PROGRESS: 'novel-v2-progress',
  V2_FAVORITES: 'novel-v2-favorites',
  V2_NOTES: 'novel-v2-notes',
} as const;

export const CURRENT_STORAGE_VERSION = '1';

export interface ProgressRecord {
  chapterId: ChapterId;
  updatedAt: number;
}

export interface MigrationReport {
  version: string;
  alreadyMigrated: boolean;
  verified: boolean;
  migratedChapterId: ChapterId;
  migratedFavoritesCount: number;
  migratedNotesCount: number;
}

function safeParseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as T;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function resolveChapterId(keyOrIndex: string | number): ChapterId | null {
  if (typeof keyOrIndex === 'string') {
    if (getChapterById(keyOrIndex)) return keyOrIndex;
    if (/^\d+$/.test(keyOrIndex)) {
      const ch = getChapterByLegacyIndex(parseInt(keyOrIndex, 10));
      return ch ? ch.id : null;
    }
    return null;
  }
  if (typeof keyOrIndex === 'number' && Number.isInteger(keyOrIndex)) {
    const ch = getChapterByLegacyIndex(keyOrIndex);
    return ch ? ch.id : null;
  }
  return null;
}

function isValidV2Progress(raw: string | null): boolean {
  if (!raw) return false;
  const parsed = safeParseJson<Partial<ProgressRecord> | null>(raw, null);
  return !!(
    parsed &&
    typeof parsed.chapterId === 'string' &&
    getChapterById(parsed.chapterId)
  );
}

function isValidV2Favorites(raw: string | null): boolean {
  if (!raw) return false;
  const parsed = safeParseJson<unknown>(raw, null);
  return (
    Array.isArray(parsed) &&
    parsed.every((id) => typeof id === 'string' && !!getChapterById(id))
  );
}

function isValidV2Notes(raw: string | null): boolean {
  if (!raw) return false;
  const parsed = safeParseJson<unknown>(raw, null);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return false;
  }
  for (const [id, entry] of Object.entries(parsed)) {
    if (!getChapterById(id)) return false;
    if (!entry || typeof entry !== 'object') return false;
    const candidate = entry as Partial<NoteEntry>;
    if (typeof candidate.note !== 'string') return false;
  }
  return true;
}

/**
 * Safely and idempotently migrates legacy index-based localStorage entries
 * to permanent chapter-ID-based versioned storage without deleting legacy keys.
 */
export function runStorageMigration(storage: StorageLike): MigrationReport {
  const defaultChapterId = allChapters[0].id;
  const existingVersion = storage.getItem(STORAGE_KEYS.STORAGE_VERSION);

  const hasAllValidV2 =
    existingVersion === CURRENT_STORAGE_VERSION &&
    isValidV2Progress(storage.getItem(STORAGE_KEYS.V2_PROGRESS)) &&
    isValidV2Favorites(storage.getItem(STORAGE_KEYS.V2_FAVORITES)) &&
    isValidV2Notes(storage.getItem(STORAGE_KEYS.V2_NOTES));

  if (hasAllValidV2) {
    const progress = safeParseJson<ProgressRecord>(
      storage.getItem(STORAGE_KEYS.V2_PROGRESS),
      { chapterId: defaultChapterId, updatedAt: Date.now() },
    );
    const favs = safeParseJson<ChapterId[]>(
      storage.getItem(STORAGE_KEYS.V2_FAVORITES),
      [],
    );
    const notes = safeParseJson<NotesStore>(
      storage.getItem(STORAGE_KEYS.V2_NOTES),
      {},
    );
    return {
      version: CURRENT_STORAGE_VERSION,
      alreadyMigrated: true,
      verified: true,
      migratedChapterId: progress.chapterId,
      migratedFavoritesCount: favs.length,
      migratedNotesCount: Object.keys(notes).length,
    };
  }

  // 1. Migrate progress (only if v2 progress not already valid)
  let migratedChapterId = defaultChapterId;
  if (isValidV2Progress(storage.getItem(STORAGE_KEYS.V2_PROGRESS))) {
    const existingProg = safeParseJson<ProgressRecord>(
      storage.getItem(STORAGE_KEYS.V2_PROGRESS),
      { chapterId: defaultChapterId, updatedAt: Date.now() },
    );
    migratedChapterId = existingProg.chapterId;
  } else {
    const legacyIndexRaw = storage.getItem(STORAGE_KEYS.LEGACY_CHAPTER_INDEX);
    const parsedIdx = legacyIndexRaw !== null ? parseInt(legacyIndexRaw, 10) : 0;
    const resolved =
      Number.isInteger(parsedIdx) && parsedIdx >= 0
        ? getChapterByLegacyIndex(parsedIdx)?.id
        : undefined;
    migratedChapterId = resolved ?? defaultChapterId;
    const progressPayload: ProgressRecord = {
      chapterId: migratedChapterId,
      updatedAt: Date.now(),
    };
    storage.setItem(STORAGE_KEYS.V2_PROGRESS, JSON.stringify(progressPayload));
  }

  // 2. Migrate favorites (only if v2 favorites not already valid)
  let migratedFavorites: ChapterId[] = [];
  if (isValidV2Favorites(storage.getItem(STORAGE_KEYS.V2_FAVORITES))) {
    migratedFavorites = safeParseJson<ChapterId[]>(
      storage.getItem(STORAGE_KEYS.V2_FAVORITES),
      [],
    );
  } else {
    const legacyFavs = safeParseJson<unknown>(
      storage.getItem(STORAGE_KEYS.LEGACY_FAVORITES),
      [],
    );
    const seen = new Set<ChapterId>();
    if (Array.isArray(legacyFavs)) {
      for (const item of legacyFavs) {
        if (typeof item === 'number' || typeof item === 'string') {
          const resolvedId = resolveChapterId(item);
          if (resolvedId && !seen.has(resolvedId)) {
            seen.add(resolvedId);
            migratedFavorites.push(resolvedId);
          }
        }
      }
    }
    storage.setItem(
      STORAGE_KEYS.V2_FAVORITES,
      JSON.stringify(migratedFavorites),
    );
  }

  // 3. Migrate private notes (only if v2 notes not already valid)
  let migratedNotes: NotesStore = {};
  if (isValidV2Notes(storage.getItem(STORAGE_KEYS.V2_NOTES))) {
    migratedNotes = safeParseJson<NotesStore>(
      storage.getItem(STORAGE_KEYS.V2_NOTES),
      {},
    );
  } else {
    const legacyNotesRaw = safeParseJson<unknown>(
      storage.getItem(STORAGE_KEYS.LEGACY_NOTES),
      {},
    );
    if (
      legacyNotesRaw &&
      typeof legacyNotesRaw === 'object' &&
      !Array.isArray(legacyNotesRaw)
    ) {
      for (const [key, val] of Object.entries(legacyNotesRaw)) {
        if (!val || typeof val !== 'object') continue;
        const rawEntry = val as {
          chapterIndex?: number;
          chapterId?: string;
          note?: unknown;
          updatedAt?: unknown;
        };
        if (typeof rawEntry.note !== 'string' || rawEntry.note.trim() === '') {
          continue;
        }
        const resolvedId =
          (typeof rawEntry.chapterId === 'string' &&
            resolveChapterId(rawEntry.chapterId)) ||
          resolveChapterId(key) ||
          (typeof rawEntry.chapterIndex === 'number'
            ? resolveChapterId(rawEntry.chapterIndex)
            : null);
        if (!resolvedId) continue;
        const chapter = getChapterById(resolvedId);
        migratedNotes[resolvedId] = {
          chapterId: resolvedId,
          chapterIndex: chapter?.legacyIndex,
          note: rawEntry.note,
          updatedAt:
            typeof rawEntry.updatedAt === 'number'
              ? rawEntry.updatedAt
              : Date.now(),
        };
      }
    }
    storage.setItem(STORAGE_KEYS.V2_NOTES, JSON.stringify(migratedNotes));
  }

  // 4. Verify all migrated v2 records before stamping version
  const verified =
    isValidV2Progress(storage.getItem(STORAGE_KEYS.V2_PROGRESS)) &&
    isValidV2Favorites(storage.getItem(STORAGE_KEYS.V2_FAVORITES)) &&
    isValidV2Notes(storage.getItem(STORAGE_KEYS.V2_NOTES));

  if (verified) {
    storage.setItem(STORAGE_KEYS.STORAGE_VERSION, CURRENT_STORAGE_VERSION);
  }

  return {
    version: verified ? CURRENT_STORAGE_VERSION : '0',
    alreadyMigrated: false,
    verified,
    migratedChapterId,
    migratedFavoritesCount: migratedFavorites.length,
    migratedNotesCount: Object.keys(migratedNotes).length,
  };
}
