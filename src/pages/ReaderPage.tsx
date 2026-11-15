import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioFab } from '../components/AudioFab';
import { BottomHint } from '../components/BottomHint';
import { BottomNav } from '../components/BottomNav';
import { ChapterDrawer } from '../components/ChapterDrawer';
import { ChapterReader } from '../components/ChapterReader';
import { EndingCinematic } from '../components/EndingCinematic';
import { Header } from '../components/Header';
import { LoadingScreen } from '../components/LoadingScreen';
import { PrivateNotesSheet } from '../components/PrivateNotesSheet';
import { RelationshipMapModal } from '../components/RelationshipMapModal';
import { SettingsPanel } from '../components/SettingsPanel';
import { Toast } from '../components/Toast';
import { UpdateBanner } from '../components/UpdateBanner';
import { VisualEffectsLayer } from '../components/VisualEffectsLayer';
import { WipNoticeModal } from '../components/WipNoticeModal';
import { useChapterNavigation } from '../hooks/useChapterNavigation';
import { useFavorites } from '../hooks/useFavorites';
import { usePrivateNotes } from '../hooks/usePrivateNotes';
import { usePublishedNovelFeed } from '../hooks/usePublishedNovelFeed';
import { usePwa } from '../hooks/usePwa';
import { useReaderSettings } from '../hooks/useReaderSettings';
import { useToastAndHint } from '../hooks/useToastAndHint';
import { audioManager } from '../services/audioManager';
import {
  loadInitialStorageState,
  saveWipNoticeDismissed,
} from '../services/storageService';
import type { ChapterId } from '../types/novel';
import { vibrate } from '../utils/haptics';

export function ReaderPage() {
  const initialStateRef = useRef(loadInitialStorageState());
  const initialState = initialStateRef.current;
  const chapters = usePublishedNovelFeed();

  const [storyOpened, setStoryOpened] = useState(false);
  const [wipVisible, setWipVisible] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [relmapOpen, setRelmapOpen] = useState(false);
  const [isAudioMuted, setIsAudioMuted] = useState(audioManager.isMuted);
  const [pendingHighlightQuery, setPendingHighlightQuery] = useState<
    string | null
  >(null);

  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    toastMessage,
    toastVisible,
    showToast,
    bottomHintMessage,
    bottomHintVisible,
    showBottomHint,
  } = useToastAndHint();

  const {
    theme,
    fontScale,
    focusMode,
    reduceMotion,
    toggleTheme,
    adjustFontSize,
    toggleFocusMode,
    toggleFocusUiVisibility,
    setReduceMotionEnabled,
  } = useReaderSettings({
    initialTheme: initialState.theme,
    initialFontScale: initialState.fontScale,
    initialFocusMode: initialState.focusMode,
    initialReduceMotion: initialState.reduceMotion,
    showToast,
    showBottomHint,
  });

  const { favorites, favoriteSet, toggleFavorite } = useFavorites({
    initialFavorites: initialState.favorites,
    showToast,
  });

  const { hasNote, getNote, saveNote } = usePrivateNotes(initialState.notes);

  const { canInstall, installApp, hasUpdate, applyUpdate } = usePwa(showToast);

  const handleCloseModals = useCallback(() => {
    setNotesOpen(false);
    setRelmapOpen(false);
  }, []);

  const {
    activeChapter,
    activeIndex,
    displayedChapter,
    displayedChapterHtml,
    totalChapters,
    transitionPhase,
    subtitleTransitioning,
    endingCinematicOpen,
    completeEndingCinematic,
    goToChapter,
    goToIndex,
    changeChapter,
  } = useChapterNavigation({
    chapters,
    initialChapterId: initialState.currentChapterId,
    storyOpened,
    focusMode,
    onCloseModals: handleCloseModals,
  });

  // Ensure reader body class is clean if returning from /editor
  useEffect(() => {
    document.body.classList.remove('studio-mode');
  }, []);

  // Initialize AudioManager & subscribe to mute state
  useEffect(() => {
    audioManager.init();
    return audioManager.subscribeMute(setIsAudioMuted);
  }, []);

  useEffect(() => {
    return () => {
      if (revealTimerRef.current !== null) clearTimeout(revealTimerRef.current);
      if (wipTimerRef.current !== null) clearTimeout(wipTimerRef.current);
    };
  }, []);

  const handleOpenStory = useCallback(() => {
    setStoryOpened(true);

    document.body.classList.add('story-revealing');
    revealTimerRef.current = setTimeout(() => {
      document.body.classList.remove('story-revealing');
      document.body.classList.add('story-revealed');
    }, 2800);

    const openingBgm = activeChapter.bgm || 'default';
    audioManager.play(openingBgm, {
      volume: activeChapter.bgmVolume,
      loop: activeChapter.bgmLoop,
    });

    wipTimerRef.current = setTimeout(() => {
      if (!initialStateRef.current.wipNoticeDismissed) {
        setWipVisible(true);
      }
    }, 1200);
  }, [activeChapter.bgm, activeChapter.bgmLoop, activeChapter.bgmVolume]);

  const handleToggleDrawer = useCallback(() => {
    setDrawerOpen((prev) => !prev);
    vibrate(10);
  }, []);

  const handleSelectChapterFromDrawer = useCallback(
    (chapterId: ChapterId, matchQuery?: string) => {
      if (matchQuery) {
        goToChapter(chapterId, () => {
          setPendingHighlightQuery(matchQuery);
        });
      } else {
        goToChapter(chapterId);
      }
    },
    [goToChapter],
  );

  const handleHighlightConsumed = useCallback(() => {
    setPendingHighlightQuery(null);
  }, []);

  return (
    <>
      <LoadingScreen onOpenStory={handleOpenStory} />

      <WipNoticeModal
        visible={wipVisible}
        onAcknowledge={() => {
          saveWipNoticeDismissed();
          initialStateRef.current.wipNoticeDismissed = true;
          setWipVisible(false);
        }}
        onDismissSession={() => setWipVisible(false)}
      />

      <Header
        theme={theme}
        onBrandClick={() => goToIndex(0)}
        onToggleDrawer={handleToggleDrawer}
        onToggleSettings={() => setSettingsOpen((prev) => !prev)}
        onToggleTheme={toggleTheme}
        onOpenNotes={() => setNotesOpen(true)}
        onToggleFocusMode={toggleFocusMode}
      />

      <ChapterDrawer
        open={drawerOpen}
        chapters={chapters}
        activeChapterId={activeChapter.id}
        favoriteSet={favoriteSet}
        favoritesCount={favorites.length}
        hasNote={hasNote}
        onClose={handleToggleDrawer}
        onSelectChapter={handleSelectChapterFromDrawer}
        onToggleFavorite={toggleFavorite}
        onOpenRelationshipMap={() => setRelmapOpen(true)}
      />

      <ChapterReader
        chapter={displayedChapter}
        chapterHtml={displayedChapterHtml}
        fontScale={fontScale}
        transitionPhase={transitionPhase}
        subtitleTransitioning={subtitleTransitioning}
        focusMode={focusMode}
        pendingHighlightQuery={pendingHighlightQuery}
        onHighlightConsumed={handleHighlightConsumed}
        onBrandClick={() => goToIndex(0)}
        onToggleFocusUi={toggleFocusUiVisibility}
      />

      <SettingsPanel
        visible={settingsOpen}
        fontScale={fontScale}
        reduceMotion={reduceMotion}
        canInstallPwa={canInstall}
        onAdjustFontSize={adjustFontSize}
        onToggleReduceMotion={setReduceMotionEnabled}
        onQuickFocusMode={toggleFocusMode}
        onQuickNotes={() => {
          setSettingsOpen(false);
          setNotesOpen(true);
        }}
        onQuickRelationshipMap={() => {
          setSettingsOpen(false);
          setRelmapOpen(true);
        }}
        onInstallPwa={() => {
          void installApp();
        }}
      />

      <BottomNav
        currentIndex={activeIndex}
        totalChapters={totalChapters}
        onPrev={() => changeChapter(-1)}
        onNext={() => changeChapter(1)}
      />

      <Toast message={toastMessage} visible={toastVisible} />
      <BottomHint message={bottomHintMessage} visible={bottomHintVisible} />

      <EndingCinematic
        open={endingCinematicOpen}
        onComplete={completeEndingCinematic}
      />

      <AudioFab
        isMuted={isAudioMuted}
        onToggleMute={() => audioManager.toggleMute()}
      />

      <PrivateNotesSheet
        open={notesOpen}
        chapter={activeChapter}
        existingNote={getNote(activeChapter.id)}
        onSaveNote={saveNote}
        onClose={() => setNotesOpen(false)}
      />

      <RelationshipMapModal
        open={relmapOpen}
        onClose={() => setRelmapOpen(false)}
      />

      <VisualEffectsLayer
        chapterId={displayedChapter.id}
        effect={displayedChapter.effect}
        triggerMode={displayedChapter.vfxTrigger}
        durationMs={displayedChapter.vfxDurationMs}
      />

      <UpdateBanner visible={hasUpdate} onReload={applyUpdate} />
    </>
  );
}
