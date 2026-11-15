import { useEffect, useState } from 'react';
import { allChapters } from '../data/chapters';
import {
  fetchPublishedChaptersForReader,
  type PublishedReaderChapter,
} from '../studio/services/studioRepository';
import { isSupabaseConfigured } from '../studio/services/supabaseClient';

export function usePublishedNovelFeed(): PublishedReaderChapter[] {
  const [chapters, setChapters] = useState<PublishedReaderChapter[]>(allChapters);

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;
    let cancelled = false;

    void fetchPublishedChaptersForReader()
      .then((remoteChapters) => {
        if (!cancelled && remoteChapters && remoteChapters.length > 0) {
          setChapters(remoteChapters);
        }
      })
      .catch(() => {
        // Keep bundled 118 legacy chapters seamlessly on offline/network error
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return chapters;
}
