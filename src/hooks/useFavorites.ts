import { useCallback, useMemo, useState } from 'react';
import { getChapterById } from '../data/chapters';
import { saveFavorites } from '../services/storageService';
import type { ChapterId } from '../types/novel';
import { vibrate } from '../utils/haptics';

interface UseFavoritesParams {
  initialFavorites: ChapterId[];
  showToast: (message: string) => void;
}

export function useFavorites({
  initialFavorites,
  showToast,
}: UseFavoritesParams) {
  const [favorites, setFavorites] = useState<ChapterId[]>(initialFavorites);

  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);

  const isFavorite = useCallback(
    (chapterId: ChapterId) => favoriteSet.has(chapterId),
    [favoriteSet],
  );

  const toggleFavorite = useCallback(
    (chapterId: ChapterId) => {
      const ch = getChapterById(chapterId);
      setFavorites((prev) => {
        const exists = prev.includes(chapterId);
        const next = exists
          ? prev.filter((id) => id !== chapterId)
          : [...prev, chapterId];
        saveFavorites(next);
        if (ch) {
          showToast(
            exists
              ? `💔 Bab ${ch.num} dihapus dari Favorit`
              : `❤️ Bab ${ch.num} disimpan ke Favorit`,
          );
        }
        return next;
      });
      vibrate(15);
    },
    [showToast],
  );

  return {
    favorites,
    favoriteSet,
    isFavorite,
    toggleFavorite,
  };
}
