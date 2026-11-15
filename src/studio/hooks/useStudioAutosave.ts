import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clearLocalDraftBackup,
  loadLocalDraftBackup,
  saveLocalDraftBackup,
} from '../services/indexedDbDraftStore';
import {
  createChapterRevision,
  saveChapterDraftWithConcurrency,
  subscribeToNovelChapterUpdates,
  type SaveDraftPatch,
} from '../services/studioRepository';
import type {
  ConflictPayload,
  SaveState,
  StudioChapter,
} from '../types/studio';
import { detectVersionConflict } from '../utils/chapterOrdering';

interface UseStudioAutosaveOptions {
  novelId: string | null;
  activeChapter: StudioChapter | null;
  onChapterSynced: (chapter: StudioChapter) => void;
  onRemoteChapterChanged: (chapter: StudioChapter) => void;
}

export interface UseStudioAutosaveResult {
  saveState: SaveState;
  lastSavedAt: number | null;
  saveError: string | null;
  conflict: ConflictPayload | null;
  pendingBackup: boolean;
  scheduleSave: (chapterId: string, baseVersion: number, patch: SaveDraftPatch) => void;
  flushSave: (forceOverwrite?: boolean) => Promise<StudioChapter | null>;
  resolveConflictUseServer: () => Promise<void>;
  resolveConflictKeepMine: () => Promise<StudioChapter | null>;
  dismissConflict: () => void;
}

const DEBOUNCE_MS = 1100;
const AUTO_REVISION_INTERVAL_MS = 5 * 60 * 1000;

export function useStudioAutosave({
  novelId,
  activeChapter,
  onChapterSynced,
  onRemoteChapterChanged,
}: UseStudioAutosaveOptions): UseStudioAutosaveResult {
  const [saveState, setSaveState] = useState<SaveState>(() =>
    typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'saved',
  );
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<ConflictPayload | null>(null);
  const [pendingBackup, setPendingBackup] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const lastRevisionAtRef = useRef<Record<string, number>>({});
  const inFlightRef = useRef(false);

  const pendingPayloadRef = useRef<{
    chapterId: string;
    baseVersion: number;
    baseUpdatedAt: string;
    patch: SaveDraftPatch;
  } | null>(null);

  const activeChapterRef = useRef(activeChapter);
  activeChapterRef.current = activeChapter;

  const commitToSupabase = useCallback(
    async (
      chapterId: string,
      baseVersion: number,
      patch: SaveDraftPatch,
      forceOverwrite = false,
    ): Promise<StudioChapter | null> => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setSaveState('offline');
        setPendingBackup(true);
        return null;
      }

      if (inFlightRef.current) {
        return null;
      }

      inFlightRef.current = true;
      setSaveState('syncing');
      setSaveError(null);

      try {
        const result = await saveChapterDraftWithConcurrency(
          chapterId,
          baseVersion,
          patch,
          forceOverwrite,
        );

        if (result.kind === 'conflict') {
          setSaveState('conflict');
          setConflict({
            chapterId,
            localVersion: baseVersion,
            serverVersion: result.serverChapter.draftVersion,
            serverUpdatedAt: result.serverChapter.updatedAt,
            serverChapter: result.serverChapter,
          });
          return null;
        }

        retryCountRef.current = 0;
        pendingPayloadRef.current = null;
        setConflict(null);
        setPendingBackup(false);
        setSaveState('saved');
        setLastSavedAt(Date.now());
        await clearLocalDraftBackup(chapterId);
        onChapterSynced(result.chapter);

        // Periodically store an autosave revision snapshot (every 5 minutes of active editing)
        const now = Date.now();
        const prevRevTime = lastRevisionAtRef.current[chapterId] ?? 0;
        if (now - prevRevTime >= AUTO_REVISION_INTERVAL_MS) {
          lastRevisionAtRef.current[chapterId] = now;
          void createChapterRevision(result.chapter, 'autosave').catch(() => {
            // Non-blocking snapshot failure
          });
        }

        return result.chapter;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Gagal menyinkronkan ke cloud.';
        setSaveError(msg);
        setSaveState(
          typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'error',
        );

        if (retryCountRef.current < 3) {
          retryCountRef.current += 1;
          const backoffMs = 1500 * Math.pow(2, retryCountRef.current - 1);
          if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
          retryTimerRef.current = setTimeout(() => {
            const latest = pendingPayloadRef.current;
            if (latest && latest.chapterId === chapterId) {
              void commitToSupabase(
                latest.chapterId,
                latest.baseVersion,
                latest.patch,
                false,
              );
            }
          }, backoffMs);
        }

        return null;
      } finally {
        inFlightRef.current = false;
      }
    },
    [onChapterSynced],
  );

  const scheduleSave = useCallback(
    (chapterId: string, baseVersion: number, patch: SaveDraftPatch) => {
      const current = activeChapterRef.current;
      const baseUpdatedAt = current?.updatedAt ?? new Date().toISOString();

      pendingPayloadRef.current = {
        chapterId,
        baseVersion,
        baseUpdatedAt,
        patch,
      };

      setSaveState(
        typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'saving',
      );
      setSaveError(null);

      // Immediate IndexedDB/localStorage crash-safe backup
      void saveLocalDraftBackup({
        chapterId,
        novelId: novelId ?? current?.novelId ?? '',
        baseVersion,
        baseUpdatedAt,
        dirty: true,
        savedAt: Date.now(),
        patch,
      });

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const queued = pendingPayloadRef.current;
        if (!queued || queued.chapterId !== chapterId) return;
        void commitToSupabase(queued.chapterId, queued.baseVersion, queued.patch, false);
      }, DEBOUNCE_MS);
    },
    [commitToSupabase, novelId],
  );

  const flushSave = useCallback(
    async (forceOverwrite = false): Promise<StudioChapter | null> => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      const queued = pendingPayloadRef.current;
      if (!queued) {
        return activeChapterRef.current;
      }
      return commitToSupabase(
        queued.chapterId,
        queued.baseVersion,
        queued.patch,
        forceOverwrite,
      );
    },
    [commitToSupabase],
  );

  // Check if local IndexedDB has an unsynced backup when opening a chapter
  useEffect(() => {
    if (!activeChapter) return;
    let cancelled = false;
    void loadLocalDraftBackup(activeChapter.id).then((backup) => {
      if (cancelled || !backup || !backup.dirty) {
        setPendingBackup(false);
        return;
      }
      setPendingBackup(true);
      if (
        detectVersionConflict({
          localBaseVersion: backup.baseVersion,
          localBaseUpdatedAt: backup.baseUpdatedAt,
          serverVersion: activeChapter.draftVersion,
          serverUpdatedAt: activeChapter.updatedAt,
        })
      ) {
        pendingPayloadRef.current = {
          chapterId: activeChapter.id,
          baseVersion: backup.baseVersion,
          baseUpdatedAt: backup.baseUpdatedAt,
          patch: backup.patch,
        };
        setConflict({
          chapterId: activeChapter.id,
          localVersion: backup.baseVersion,
          serverVersion: activeChapter.draftVersion,
          serverUpdatedAt: activeChapter.updatedAt,
          serverChapter: activeChapter,
        });
        setSaveState('conflict');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [activeChapter?.id]);

  // Online / Offline reconnection auto-sync
  useEffect(() => {
    const handleOnline = () => {
      const queued = pendingPayloadRef.current;
      if (queued) {
        void commitToSupabase(queued.chapterId, queued.baseVersion, queued.patch, false);
      } else {
        setSaveState('saved');
      }
    };
    const handleOffline = () => {
      setSaveState('offline');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [commitToSupabase]);

  // Warn before unload if there are unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pendingPayloadRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Supabase Realtime sync for multi-tab / remote updates
  useEffect(() => {
    if (!novelId) return;
    return subscribeToNovelChapterUpdates(novelId, (remoteChapter) => {
      const current = activeChapterRef.current;
      if (!current || remoteChapter.id !== current.id) {
        onRemoteChapterChanged(remoteChapter);
        return;
      }

      // If we have unsaved local edits and remote bumped draftVersion, flag conflict
      if (
        pendingPayloadRef.current &&
        pendingPayloadRef.current.chapterId === remoteChapter.id &&
        remoteChapter.draftVersion > pendingPayloadRef.current.baseVersion
      ) {
        setConflict({
          chapterId: remoteChapter.id,
          localVersion: pendingPayloadRef.current.baseVersion,
          serverVersion: remoteChapter.draftVersion,
          serverUpdatedAt: remoteChapter.updatedAt,
          serverChapter: remoteChapter,
        });
        setSaveState('conflict');
        return;
      }

      if (remoteChapter.draftVersion > current.draftVersion) {
        onChapterSynced(remoteChapter);
      }
    });
  }, [novelId, onChapterSynced, onRemoteChapterChanged]);

  const resolveConflictUseServer = useCallback(async () => {
    if (!conflict) return;
    pendingPayloadRef.current = null;
    await clearLocalDraftBackup(conflict.chapterId);
    onChapterSynced(conflict.serverChapter);
    setConflict(null);
    setPendingBackup(false);
    setSaveState('saved');
  }, [conflict, onChapterSynced]);

  const resolveConflictKeepMine = useCallback(async (): Promise<StudioChapter | null> => {
    return flushSave(true);
  }, [flushSave]);

  const dismissConflict = useCallback(() => {
    setConflict(null);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  return {
    saveState,
    lastSavedAt,
    saveError,
    conflict,
    pendingBackup,
    scheduleSave,
    flushSave,
    resolveConflictUseServer,
    resolveConflictKeepMine,
    dismissConflict,
  };
}
