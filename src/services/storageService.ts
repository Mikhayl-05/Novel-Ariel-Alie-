import {
  allChapters,
  getChapterById,
  getChapterIndexById,
} from '../data/chapters';
import type {
  ChapterId,
  MigratedStorageState,
  NotesStore,
  ThemeMode,
} from '../types/novel';
import {
  runStorageMigration,
  STORAGE_KEYS,
  type ProgressRecord,
  type StorageLike,
} from './storageMigration';

function getBrowserStorage(): StorageLike | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as T;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

export function clampFontScale(scale: number): number {
  if (!Number.isFinite(scale)) return 100;
  return Math.max(50, Math.min(160, Math.round(scale)));
}

export function loadInitialStorageState(
  storageOverride?: StorageLike,
): MigratedStorageState {
  const storage = storageOverride ?? getBrowserStorage();
  const osPrefersReducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!storage) {
    return {
      currentChapterId: allChapters[0].id,
      favorites: [],
      notes: {},
      theme: 'dark',
      fontScale: 100,
      focusMode: false,
      reduceMotion: osPrefersReducedMotion,
      wipNoticeDismissed: false,
    };
  }

  const report = runStorageMigration(storage);

  const progress = safeJsonParse<ProgressRecord>(
    storage.getItem(STORAGE_KEYS.V2_PROGRESS),
    { chapterId: report.migratedChapterId, updatedAt: Date.now() },
  );
  const currentChapterId = getChapterById(progress.chapterId)
    ? progress.chapterId
    : allChapters[0].id;

  const rawFavs = safeJsonParse<ChapterId[]>(
    storage.getItem(STORAGE_KEYS.V2_FAVORITES),
    [],
  );
  const favorites = Array.isArray(rawFavs)
    ? rawFavs.filter((id) => !!getChapterById(id))
    : [];

  const rawNotes = safeJsonParse<NotesStore>(
    storage.getItem(STORAGE_KEYS.V2_NOTES),
    {},
  );
  const notes: NotesStore = {};
  if (rawNotes && typeof rawNotes === 'object') {
    for (const [id, entry] of Object.entries(rawNotes)) {
      if (getChapterById(id) && entry && typeof entry.note === 'string') {
        notes[id] = entry;
      }
    }
  }

  const rawTheme = storage.getItem(STORAGE_KEYS.THEME);
  const theme: ThemeMode = rawTheme === 'light' ? 'light' : 'dark';

  const rawScale = parseInt(storage.getItem(STORAGE_KEYS.FONT_SCALE) || '100', 10);
  const fontScale = clampFontScale(Number.isNaN(rawScale) ? 100 : rawScale);

  const focusMode = storage.getItem(STORAGE_KEYS.FOCUS_MODE) === 'true';

  const storedReduceMotion = storage.getItem(STORAGE_KEYS.REDUCE_MOTION);
  const reduceMotion =
    storedReduceMotion === 'true' ||
    (storedReduceMotion === null && osPrefersReducedMotion);

  const wipNoticeDismissed =
    storage.getItem(STORAGE_KEYS.WIP_NOTICE_DISMISSED) === '1';

  return {
    currentChapterId,
    favorites,
    notes,
    theme,
    fontScale,
    focusMode,
    reduceMotion,
    wipNoticeDismissed,
  };
}

export function saveCurrentChapterProgress(
  chapterId: ChapterId,
  storageOverride?: StorageLike,
): void {
  const storage = storageOverride ?? getBrowserStorage();
  if (!storage || !chapterId) return;
  const idx = getChapterIndexById(chapterId);
  const payload: ProgressRecord = { chapterId, updatedAt: Date.now() };
  storage.setItem(STORAGE_KEYS.V2_PROGRESS, JSON.stringify(payload));
  if (idx !== -1) {
    storage.setItem(STORAGE_KEYS.LEGACY_CHAPTER_INDEX, String(idx));
  }
}

export function saveFavorites(
  favorites: ChapterId[],
  storageOverride?: StorageLike,
): void {
  const storage = storageOverride ?? getBrowserStorage();
  if (!storage) return;
  storage.setItem(STORAGE_KEYS.V2_FAVORITES, JSON.stringify(favorites));
  const legacyIndices = favorites
    .map((id) => getChapterIndexById(id))
    .filter((idx) => idx !== -1);
  storage.setItem(STORAGE_KEYS.LEGACY_FAVORITES, JSON.stringify(legacyIndices));
}

export function saveNotesStore(
  notes: NotesStore,
  storageOverride?: StorageLike,
): void {
  const storage = storageOverride ?? getBrowserStorage();
  if (!storage) return;
  storage.setItem(STORAGE_KEYS.V2_NOTES, JSON.stringify(notes));
  const legacyObj: Record<
    number,
    { chapterIndex: number; note: string; updatedAt: number }
  > = {};
  for (const [id, entry] of Object.entries(notes)) {
    const idx = getChapterIndexById(id);
    if (idx !== -1 && entry.note.trim() !== '') {
      legacyObj[idx] = {
        chapterIndex: idx,
        note: entry.note,
        updatedAt: entry.updatedAt,
      };
    }
  }
  storage.setItem(STORAGE_KEYS.LEGACY_NOTES, JSON.stringify(legacyObj));
}

export function saveThemePreference(
  theme: ThemeMode,
  storageOverride?: StorageLike,
): void {
  const storage = storageOverride ?? getBrowserStorage();
  storage?.setItem(STORAGE_KEYS.THEME, theme);
}

export function saveFontScalePreference(
  scale: number,
  storageOverride?: StorageLike,
): void {
  const storage = storageOverride ?? getBrowserStorage();
  storage?.setItem(STORAGE_KEYS.FONT_SCALE, String(clampFontScale(scale)));
}

export function saveFocusModePreference(
  isActive: boolean,
  storageOverride?: StorageLike,
): void {
  const storage = storageOverride ?? getBrowserStorage();
  storage?.setItem(STORAGE_KEYS.FOCUS_MODE, isActive ? 'true' : 'false');
}

export function saveReduceMotionPreference(
  isActive: boolean,
  storageOverride?: StorageLike,
): void {
  const storage = storageOverride ?? getBrowserStorage();
  storage?.setItem(STORAGE_KEYS.REDUCE_MOTION, isActive ? 'true' : 'false');
}

export function hasManualReduceMotionOverride(
  storageOverride?: StorageLike,
): boolean {
  const storage = storageOverride ?? getBrowserStorage();
  if (!storage) return false;
  return storage.getItem(STORAGE_KEYS.REDUCE_MOTION) !== null;
}

export function saveWipNoticeDismissed(
  storageOverride?: StorageLike,
): void {
  const storage = storageOverride ?? getBrowserStorage();
  storage?.setItem(STORAGE_KEYS.WIP_NOTICE_DISMISSED, '1');
}
