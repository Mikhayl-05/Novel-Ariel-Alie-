import { useCallback, useState } from 'react';
import { getChapterIndexById } from '../data/chapters';
import { saveNotesStore } from '../services/storageService';
import type { ChapterId, NotesStore } from '../types/novel';

export function usePrivateNotes(initialNotes: NotesStore) {
  const [notes, setNotes] = useState<NotesStore>(initialNotes);

  const hasNote = useCallback(
    (chapterId: ChapterId) => {
      const entry = notes[chapterId];
      return !!(entry && entry.note && entry.note.trim() !== '');
    },
    [notes],
  );

  const getNote = useCallback(
    (chapterId: ChapterId) => notes[chapterId] ?? null,
    [notes],
  );

  const saveNote = useCallback((chapterId: ChapterId, text: string) => {
    const updatedAt = Date.now();
    setNotes((prev) => {
      const next: NotesStore = { ...prev };
      if (text.trim() === '') {
        delete next[chapterId];
      } else {
        const chapterIndex = getChapterIndexById(chapterId);
        next[chapterId] = {
          chapterId,
          chapterIndex: chapterIndex !== -1 ? chapterIndex : undefined,
          note: text,
          updatedAt,
        };
      }
      saveNotesStore(next);
      return next;
    });
    return text.trim() === '' ? null : updatedAt;
  }, []);

  return {
    notes,
    hasNote,
    getNote,
    saveNote,
  };
}
