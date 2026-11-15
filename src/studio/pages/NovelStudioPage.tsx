import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useEditor } from '@tiptap/react';
import {
  BookOpen,
  Check,
  CloudOff,
  ExternalLink,
  Eye,
  Loader2,
  LogOut,
  PanelLeft,
  PanelRight,
  RefreshCw,
  UploadCloud,
} from 'lucide-react';
import { VisualEffectsLayer } from '../../components/VisualEffectsLayer';
import type { VfxKey } from '../../types/novel';
import { AdminLoginView } from '../components/AdminLoginView';
import { DocumentWorkspaceCanvas } from '../components/DocumentWorkspaceCanvas';
import { StudioInspectorPanel } from '../components/StudioInspectorPanel';
import { StudioLivePreview } from '../components/StudioLivePreview';
import { StudioMenuBar } from '../components/StudioMenuBar';
import {
  ConflictBanner,
  DeleteChapterModal,
  ImportLegacyModal,
  InsertLinkModal,
  NewNovelModal,
  PublishModal,
  ShortcutsModal,
  WordCountModal,
} from '../components/StudioModals';
import { StudioSidebar } from '../components/StudioSidebar';
import { StudioToolbar } from '../components/StudioToolbar';
import { createNovelEditorExtensions } from '../editor/novelExtensions';
import { useStudioAuth } from '../hooks/useStudioAuth';
import { useStudioAutosave } from '../hooks/useStudioAutosave';
import {
  createChapterRevision,
  createNovel,
  deleteChapterById,
  fetchChaptersByNovel,
  fetchNovels,
  importLegacyChaptersAsAdmin,
  insertChapter,
  persistChapterSortOrders,
  publishChapterRpc,
  updateChapterStatusById,
} from '../services/studioRepository';
import type {
  DocumentOutlineItem,
  MarginPreset,
  StudioChapter,
  StudioChapterAsset,
  StudioChapterRevision,
  StudioNovel,
  StudioViewMode,
  TiptapDocJson,
} from '../types/studio';
import {
  createNewChapterPayload,
  duplicateChapterPayload,
  moveChapterByDelta,
  reorderChaptersByIds,
} from '../utils/chapterOrdering';
import {
  EMPTY_TIPTAP_DOC,
  extractDocumentMetrics,
  extractDocumentOutline,
  serializeTiptapDocToReaderHtml,
} from '../utils/novelContentCodec';

export function NovelStudioPage() {
  const auth = useStudioAuth();

  const [novels, setNovels] = useState<StudioNovel[]>([]);
  const [activeNovelId, setActiveNovelId] = useState<string | null>(null);
  const [chapters, setChapters] = useState<StudioChapter[]>([]);
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);

  const [viewMode, setViewMode] = useState<StudioViewMode>('editor');
  const [zoom, setZoom] = useState(1);
  const [showSidebar, setShowSidebar] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 960 : true,
  );
  const [showInspector, setShowInspector] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 1180 : true,
  );
  const [showRuler, setShowRuler] = useState(true);

  const [publishOpen, setPublishOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<StudioChapter | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [newNovelOpen, setNewNovelOpen] = useState(false);
  const [creatingNovel, setCreatingNovel] = useState(false);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkInitialHref, setLinkInitialHref] = useState('');
  const [wordCountOpen, setWordCountOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);

  const [notice, setNotice] = useState<string | null>(null);
  const [testVfx, setTestVfx] = useState<{
    key: number;
    effect: VfxKey;
    durationMs: number;
  } | null>(null);

  const isProgrammaticLoadRef = useRef(false);
  const activeChapterRef = useRef<StudioChapter | null>(null);
  const flushSaveRef = useRef<((forceOverwrite?: boolean) => Promise<StudioChapter | null>) | null>(null);

  const activeChapter = useMemo(
    () => chapters.find((c) => c.id === activeChapterId) ?? chapters[0] ?? null,
    [chapters, activeChapterId],
  );
  activeChapterRef.current = activeChapter;

  const showNotice = useCallback((msg: string) => {
    setNotice(msg);
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  // Apply studio body class exclusively while /editor is mounted
  useEffect(() => {
    document.body.classList.add('studio-mode');
    return () => {
      document.body.classList.remove('studio-mode');
    };
  }, []);

  // Listen to VFX test triggers inside studio
  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent<{ effect?: VfxKey; durationMs?: number }>)
        .detail;
      if (!detail?.effect || detail.effect === 'none') return;
      setTestVfx({
        key: Date.now(),
        effect: detail.effect,
        durationMs: detail.durationMs ?? 25000,
      });
    };
    window.addEventListener('studio:test-vfx', handler);
    return () => window.removeEventListener('studio:test-vfx', handler);
  }, []);

  const handleChapterSynced = useCallback((synced: StudioChapter) => {
    setChapters((prev) =>
      prev.map((c) => (c.id === synced.id ? synced : c)),
    );
  }, []);

  const handleRemoteChapterChanged = useCallback((remote: StudioChapter) => {
    setChapters((prev) => {
      const exists = prev.some((c) => c.id === remote.id);
      if (!exists) return prev;
      return prev.map((c) => (c.id === remote.id ? remote : c));
    });
  }, []);

  const autosave = useStudioAutosave({
    novelId: activeNovelId,
    activeChapter,
    onChapterSynced: handleChapterSynced,
    onRemoteChapterChanged: handleRemoteChapterChanged,
  });
  flushSaveRef.current = autosave.flushSave;

  const updateChapterLocalAndQueueSave = useCallback(
    (chapterId: string, updater: (prev: StudioChapter) => StudioChapter) => {
      let updatedChapter: StudioChapter | null = null;
      setChapters((prev) =>
        prev.map((ch) => {
          if (ch.id !== chapterId) return ch;
          updatedChapter = updater(ch);
          return updatedChapter;
        }),
      );

      if (updatedChapter) {
        const ch = updatedChapter as StudioChapter;
        autosave.scheduleSave(ch.id, ch.draftVersion, {
          num: ch.num,
          title: ch.title,
          setting: ch.setting,
          feeling: ch.feeling,
          isPrologue: ch.isPrologue,
          isEnding: ch.isEnding,
          draftDoc: ch.draftDoc,
          draftHtml: ch.draftHtml,
          draftBgm: ch.draftBgm,
          draftBgmVolume: ch.draftBgmVolume,
          draftBgmLoop: ch.draftBgmLoop,
          draftEffect: ch.draftEffect,
          draftVfxTrigger: ch.draftVfxTrigger,
          draftVfxDurationMs: ch.draftVfxDurationMs,
          draftMetadata: ch.draftMetadata,
        });
      }
    },
    [autosave],
  );

  const openLinkModalFromEditor = useCallback(() => {
    setLinkModalOpen(true);
  }, []);

  const extensions = useMemo(
    () =>
      createNovelEditorExtensions({
        onSaveShortcut: () => {
          void flushSaveRef.current?.().then(() => {
            showNotice('Draft tersimpan.');
          });
        },
        onLinkShortcut: () => {
          openLinkModalFromEditor();
        },
      }),
    [openLinkModalFromEditor, showNotice],
  );

  const editor = useEditor({
    extensions,
    content: activeChapter?.draftDoc ?? EMPTY_TIPTAP_DOC,
    shouldRerenderOnTransaction: false,
    onUpdate: ({ editor: ed }) => {
      if (isProgrammaticLoadRef.current) return;
      const current = activeChapterRef.current;
      if (!current) return;
      const docJson = ed.getJSON() as TiptapDocJson;
      const readerHtml = serializeTiptapDocToReaderHtml(docJson);
      updateChapterLocalAndQueueSave(current.id, (prev) => ({
        ...prev,
        draftDoc: docJson,
        draftHtml: readerHtml,
      }));
    },
  });

  // Update initial href when link modal opens
  useEffect(() => {
    if (!linkModalOpen || !editor) return;
    const attrs = editor.getAttributes('link') as { href?: string };
    setLinkInitialHref(attrs.href || '');
  }, [linkModalOpen, editor]);

  // Synchronize Tiptap editor when active chapter changes or server reloads version
  const syncedChapterMarkerRef = useRef<string>('');
  useEffect(() => {
    if (!editor || !activeChapter) return;
    const marker = `${activeChapter.id}:${activeChapter.draftVersion}`;
    if (syncedChapterMarkerRef.current === marker) return;
    syncedChapterMarkerRef.current = marker;

    isProgrammaticLoadRef.current = true;
    editor.commands.setContent(activeChapter.draftDoc ?? EMPTY_TIPTAP_DOC, {
      emitUpdate: false,
    });
    isProgrammaticLoadRef.current = false;
  }, [editor, activeChapter]);

  // Load initial novels & chapters once authenticated
  useEffect(() => {
    if (auth.status !== 'authenticated') {
      setNovels([]);
      setChapters([]);
      setActiveNovelId(null);
      setActiveChapterId(null);
      return;
    }

    let cancelled = false;
    setLoadingWorkspace(true);
    void fetchNovels()
      .then(async (list) => {
        if (cancelled) return;
        setNovels(list);
        if (list.length > 0) {
          const targetNovelId = list[0].id;
          setActiveNovelId(targetNovelId);
          const chList = await fetchChaptersByNovel(targetNovelId);
          if (cancelled) return;
          setChapters(chList);
          setActiveChapterId(chList[0]?.id ?? null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          showNotice(err instanceof Error ? err.message : 'Gagal memuat data novel.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingWorkspace(false);
      });

    return () => {
      cancelled = true;
    };
  }, [auth.status, showNotice]);

  // Global Ctrl+S fallback even if focus is outside Tiptap
  useEffect(() => {
    if (auth.status !== 'authenticated') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void autosave.flushSave().then(() => {
          showNotice('Draft tersimpan ke server.');
        });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [auth.status, autosave, showNotice]);

  const handleSelectNovel = async (novelId: string) => {
    if (!novelId || novelId === activeNovelId) return;
    await autosave.flushSave();
    setActiveNovelId(novelId);
    setLoadingWorkspace(true);
    try {
      const chList = await fetchChaptersByNovel(novelId);
      setChapters(chList);
      setActiveChapterId(chList[0]?.id ?? null);
    } finally {
      setLoadingWorkspace(false);
    }
  };

  const handleSelectChapter = async (chapterId: string) => {
    if (chapterId === activeChapterId) return;
    await autosave.flushSave();
    setActiveChapterId(chapterId);
    if (window.innerWidth < 960) setShowSidebar(false);
  };

  const handleNewChapter = async () => {
    let targetNovelId = activeNovelId;
    if (!targetNovelId) {
      setNewNovelOpen(true);
      return;
    }
    await autosave.flushSave();
    const payload = createNewChapterPayload(targetNovelId, chapters);
    const saved = await insertChapter(payload);
    setChapters((prev) => [...prev, saved]);
    setActiveChapterId(saved.id);
    setViewMode('editor');
    showNotice(`Bab baru "${saved.num}" dibuat.`);
  };

  const handleDuplicateChapter = async (source: StudioChapter) => {
    await autosave.flushSave();
    const { duplicated, reordered } = duplicateChapterPayload(source, chapters);
    const saved = await insertChapter(duplicated);
    const nextList = reordered.map((c) => (c.id === duplicated.id ? saved : c));
    setChapters(nextList);
    await persistChapterSortOrders(
      nextList.map((c) => ({ id: c.id, sortOrder: c.sortOrder })),
    );
    setActiveChapterId(saved.id);
    showNotice(`Bab "${source.title}" berhasil diduplikasi.`);
  };

  const handleArchiveToggle = async (target: StudioChapter) => {
    const nextStatus =
      target.status === 'archived'
        ? target.publishedAt
          ? 'published'
          : 'draft'
        : 'archived';
    const updated = await updateChapterStatusById(target.id, nextStatus);
    setChapters((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    showNotice(
      nextStatus === 'archived'
        ? `Bab "${updated.title}" diarsipkan.`
        : `Bab "${updated.title}" dipulihkan dari arsip.`,
    );
  };

  const handleConfirmDeleteChapter = async (target: StudioChapter) => {
    setDeleting(true);
    try {
      await deleteChapterById(target.id);
      const remaining = chapters.filter((c) => c.id !== target.id);
      setChapters(remaining);
      if (activeChapterId === target.id) {
        setActiveChapterId(remaining[0]?.id ?? null);
      }
      setDeleteTarget(null);
      showNotice(`Bab "${target.title}" dihapus permanen.`);
    } finally {
      setDeleting(false);
    }
  };

  const handleReorderChapters = async (draggedId: string, targetId: string) => {
    const reordered = reorderChaptersByIds(chapters, draggedId, targetId);
    setChapters(reordered);
    await persistChapterSortOrders(
      reordered.map((c) => ({ id: c.id, sortOrder: c.sortOrder })),
    );
  };

  const handleMoveChapterDelta = async (chapterId: string, delta: -1 | 1) => {
    const reordered = moveChapterByDelta(chapters, chapterId, delta);
    setChapters(reordered);
    await persistChapterSortOrders(
      reordered.map((c) => ({ id: c.id, sortOrder: c.sortOrder })),
    );
  };

  const handleConfirmPublish = async () => {
    if (!activeChapter) return;
    setPublishing(true);
    try {
      await autosave.flushSave();
      const published = await publishChapterRpc(activeChapter.id);
      await createChapterRevision(published, 'publish').catch(() => {});
      setChapters((prev) =>
        prev.map((c) => (c.id === published.id ? published : c)),
      );
      setPublishOpen(false);
      showNotice(`Bab "${published.title}" resmi dipublikasikan ke Reader.`);
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Gagal memublikasikan bab.');
    } finally {
      setPublishing(false);
    }
  };

  const handleRestoreRevision = async (rev: StudioChapterRevision) => {
    if (!activeChapter || !editor) return;
    const restoredDoc = rev.docJson;
    const restoredHtml = serializeTiptapDocToReaderHtml(restoredDoc);
    isProgrammaticLoadRef.current = true;
    editor.commands.setContent(restoredDoc, { emitUpdate: false });
    isProgrammaticLoadRef.current = false;

    updateChapterLocalAndQueueSave(activeChapter.id, (prev) => ({
      ...prev,
      num: rev.num,
      title: rev.title,
      setting: rev.setting,
      feeling: rev.feeling ?? '',
      draftDoc: restoredDoc,
      draftHtml: restoredHtml,
      draftBgm: rev.audioVfxSnapshot.bgm ?? prev.draftBgm,
      draftBgmVolume: rev.audioVfxSnapshot.bgm_volume ?? prev.draftBgmVolume,
      draftBgmLoop: rev.audioVfxSnapshot.bgm_loop ?? prev.draftBgmLoop,
      draftEffect: rev.audioVfxSnapshot.effect ?? prev.draftEffect,
      draftVfxTrigger: rev.audioVfxSnapshot.vfx_trigger ?? prev.draftVfxTrigger,
      draftVfxDurationMs:
        rev.audioVfxSnapshot.vfx_duration_ms ?? prev.draftVfxDurationMs,
    }));

    const flushed = await autosave.flushSave();
    if (flushed) {
      await createChapterRevision(flushed, 'restore').catch(() => {});
    }
    showNotice(`Versi #${rev.revisionNumber} dipulihkan ke draft aktif.`);
  };

  const handleInsertBlock = useCallback(
    (blockType: string) => {
      if (!editor) return;
      const chain = editor.chain().focus();
      switch (blockType) {
        case 'dialogueBlock':
          chain
            .insertContent({
              type: 'dialogueBlock',
              attrs: { speaker: 'Ariel', align: 'left' },
              content: [{ type: 'text', text: '"Tulis dialog di sini..."' }],
            })
            .run();
          break;
        case 'innerThoughtBlock':
          chain
            .insertContent({
              type: 'innerThoughtBlock',
              attrs: { tone: 'reflective' },
              content: [{ type: 'text', text: 'Monolog batin karakter...' }],
            })
            .run();
          break;
        case 'customNarrativeBlock':
          chain
            .insertContent({
              type: 'customNarrativeBlock',
              attrs: { variant: 'flashback', label: 'Flashback' },
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Tulis adegan naratif khusus...' }],
                },
              ],
            })
            .run();
          break;
        case 'sceneBreak':
          chain
            .insertContent({
              type: 'sceneBreak',
              attrs: { symbol: '✦ ✦ ✦', style: 'ornament' },
            })
            .run();
          break;
        case 'pageBreak':
          chain
            .insertContent({
              type: 'pageBreak',
              attrs: { label: 'Page Break' },
            })
            .run();
          break;
        case 'sfxBlock':
          chain
            .insertContent({
              type: 'sfxBlock',
              attrs: {
                cueName: 'Efek Suara',
                audioUrl: '/audio/cute.mp3',
                trigger: 'scroll',
                volume: 0.7,
              },
            })
            .run();
          break;
        case 'vfxBlock':
          chain
            .insertContent({
              type: 'vfxBlock',
              attrs: {
                effect: 'dust_motes',
                trigger: 'scroll',
                durationMs: 25000,
              },
            })
            .run();
          break;
        case 'bgmCue':
          chain
            .insertContent({
              type: 'bgmCue',
              attrs: {
                bgmKey: 'about_you',
                action: 'play',
                volume: 0.42,
                loop: true,
              },
            })
            .run();
          break;
        case 'chapterHeading':
          chain
            .insertContent({
              type: 'chapterHeading',
              attrs: {
                num: activeChapter?.num || 'Bagian Baru',
                title: activeChapter?.title || 'Sub-bab Baru',
                setting: activeChapter?.setting || '',
              },
            })
            .run();
          break;
        case 'imageBlock':
          chain
            .insertContent({
              type: 'imageBlock',
              attrs: {
                src: '/asset/preview.jpg',
                alt: 'Ilustrasi adegan',
                caption: '',
                width: 'normal',
              },
            })
            .run();
          break;
        default:
          break;
      }
    },
    [editor, activeChapter],
  );

  const handleInsertAsset = (asset: StudioChapterAsset) => {
    if (!editor) return;
    if (asset.assetType === 'image') {
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'imageBlock',
          attrs: {
            src: asset.url,
            alt: asset.label,
            caption: asset.label,
            width: 'normal',
          },
        })
        .run();
      showNotice(`Gambar "${asset.label}" disisipkan.`);
    } else if (asset.assetType === 'sfx') {
      editor
        .chain()
        .focus()
        .insertContent({
          type: 'sfxBlock',
          attrs: {
            cueName: asset.label,
            audioUrl: asset.url,
            trigger: 'scroll',
            volume: 0.7,
          },
        })
        .run();
      showNotice(`SFX "${asset.label}" disisipkan.`);
    }
  };

  const handleJumpToOutlineItem = (item: DocumentOutlineItem) => {
    if (!editor) return;
    let currentTopIndex = 0;
    let targetPos = 1;
    editor.state.doc.forEach((_node, offset) => {
      if (currentTopIndex === item.posIndex) {
        targetPos = offset + 1;
      }
      currentTopIndex += 1;
    });
    editor.chain().focus().setTextSelection(targetPos).scrollIntoView().run();
  };

  const handleConfirmImportLegacy = async () => {
    setImporting(true);
    try {
      const { novel, importedCount } = await importLegacyChaptersAsAdmin();
      const updatedNovels = await fetchNovels();
      setNovels(updatedNovels);
      setActiveNovelId(novel.id);
      const chList = await fetchChaptersByNovel(novel.id);
      setChapters(chList);
      setActiveChapterId(chList[0]?.id ?? null);
      setImportOpen(false);
      showNotice(`${importedCount} chapter novel berhasil diimpor ke Supabase.`);
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Gagal mengimpor 118 chapter.');
    } finally {
      setImporting(false);
    }
  };

  const handleCreateNovel = async (input: {
    title: string;
    subtitle: string;
    authorName: string;
    synopsis: string;
  }) => {
    setCreatingNovel(true);
    try {
      const created = await createNovel(input);
      setNovels((prev) => [...prev, created]);
      setActiveNovelId(created.id);
      setChapters([]);
      setActiveChapterId(null);
      setNewNovelOpen(false);
      showNotice(`Novel "${created.title}" dibuat.`);
    } finally {
      setCreatingNovel(false);
    }
  };

  const metrics = useMemo(
    () => extractDocumentMetrics(activeChapter?.draftDoc),
    [activeChapter?.draftDoc],
  );
  const outline = useMemo(
    () => extractDocumentOutline(activeChapter?.draftDoc),
    [activeChapter?.draftDoc],
  );

  // Security Gate: Never mount studio workspace until admin auth passes
  if (auth.status !== 'authenticated') {
    return (
      <AdminLoginView
        status={auth.status}
        error={auth.error}
        sessionExpiredNotice={auth.sessionExpiredNotice}
        submitting={auth.submitting}
        userEmail={auth.user?.email}
        onSignIn={auth.signIn}
        onSignOut={auth.signOut}
      />
    );
  }

  const marginPreset: MarginPreset =
    activeChapter?.draftMetadata?.marginPreset ?? 'normal';

  const saveStatusText =
    autosave.saveState === 'saving'
      ? 'Menyimpan…'
      : autosave.saveState === 'syncing'
        ? 'Menyinkronkan ke cloud…'
        : autosave.saveState === 'offline'
          ? 'Offline (backup lokal aktif)'
          : autosave.saveState === 'conflict'
            ? 'Konflik versi terdeteksi'
            : autosave.saveState === 'error'
              ? 'Gagal sinkron (mencoba ulang)'
              : autosave.lastSavedAt
                ? `Tersimpan ${new Date(autosave.lastSavedAt).toLocaleTimeString('id-ID', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}`
                : 'Semua perubahan tersimpan';

  return (
    <div className="studio-root studio-allow-select">
      {/* Top Document Header Bar */}
      <header className="studio-header">
        <div className="studio-header-left">
          <div className="studio-brand-mark" aria-hidden="true">
            <BookOpen size={17} />
          </div>
          <div className="studio-doc-heading">
            <div className="studio-doc-title-row">
              <span className="studio-app-name">Novel Studio</span>
              <span className="studio-sep-dot" aria-hidden="true">
                ·
              </span>
              <span className="studio-doc-active-name">
                {activeChapter
                  ? `${activeChapter.num}: ${activeChapter.title}`
                  : 'Belum ada bab dipilih'}
              </span>
            </div>
            <div className="studio-save-status" role="status" aria-live="polite">
              {autosave.saveState === 'saving' || autosave.saveState === 'syncing' ? (
                <Loader2 size={12} className="studio-spin" />
              ) : autosave.saveState === 'offline' ? (
                <CloudOff size={12} />
              ) : autosave.saveState === 'error' ? (
                <RefreshCw size={12} />
              ) : (
                <Check size={12} />
              )}
              <span>{saveStatusText}</span>
            </div>
          </div>
        </div>

        <div className="studio-header-right">
          <button
            type="button"
            className="studio-icon-btn"
            title="Toggle Sidebar Bab"
            aria-label="Toggle Sidebar Bab"
            onClick={() => setShowSidebar((v) => !v)}
          >
            <PanelLeft size={16} />
          </button>
          <button
            type="button"
            className="studio-icon-btn"
            title="Toggle Panel Inspektur"
            aria-label="Toggle Panel Inspektur"
            onClick={() => setShowInspector((v) => !v)}
          >
            <PanelRight size={16} />
          </button>

          <button
            type="button"
            className="studio-btn studio-btn-secondary studio-btn-sm"
            disabled={!activeChapter}
            onClick={() =>
              setViewMode((m) => (m === 'editor' ? 'preview-chapter' : 'editor'))
            }
          >
            <Eye size={14} />
            <span>{viewMode === 'editor' ? 'Pratinjau' : 'Kembali Edit'}</span>
          </button>

          <button
            type="button"
            className="studio-btn studio-btn-primary studio-btn-sm"
            disabled={!activeChapter}
            onClick={() => setPublishOpen(true)}
          >
            <UploadCloud size={14} />
            <span>Publikasikan</span>
          </button>

          <Link
            to="/"
            className="studio-btn studio-btn-secondary studio-btn-sm"
            title="Buka Novel Reader Publik"
          >
            <ExternalLink size={13} />
            <span>Reader</span>
          </Link>

          <button
            type="button"
            className="studio-btn studio-btn-secondary studio-btn-sm"
            title={`Keluar (${auth.adminProfile?.email ?? ''})`}
            aria-label="Keluar dari Novel Studio"
            onClick={() => void auth.signOut()}
          >
            <LogOut size={14} />
            <span>Keluar</span>
          </button>
        </div>
      </header>

      {viewMode === 'editor' ? (
        <>
          <StudioMenuBar
            editor={editor}
            viewMode={viewMode}
            showSidebar={showSidebar}
            showInspector={showInspector}
            showRuler={showRuler}
            marginPreset={marginPreset}
            onSaveNow={() => {
              void autosave.flushSave().then(() => showNotice('Draft tersimpan.'));
            }}
            onNewChapter={() => void handleNewChapter()}
            onDuplicateChapter={() => {
              if (activeChapter) void handleDuplicateChapter(activeChapter);
            }}
            onOpenNewNovel={() => setNewNovelOpen(true)}
            onOpenPublishModal={() => setPublishOpen(true)}
            onOpenImportLegacy={() => setImportOpen(true)}
            onToggleSidebar={() => setShowSidebar((v) => !v)}
            onToggleInspector={() => setShowInspector((v) => !v)}
            onToggleRuler={() => setShowRuler((v) => !v)}
            onChangeMarginPreset={(preset) => {
              if (!activeChapter) return;
              updateChapterLocalAndQueueSave(activeChapter.id, (prev) => ({
                ...prev,
                draftMetadata: {
                  ...prev.draftMetadata,
                  marginPreset: preset,
                },
              }));
            }}
            onChangeViewMode={setViewMode}
            onInsertBlock={handleInsertBlock}
            onOpenLinkModal={openLinkModalFromEditor}
            onOpenWordCountModal={() => setWordCountOpen(true)}
            onOpenShortcutsModal={() => setShortcutsOpen(true)}
            onPrint={() => window.print()}
          />

          <StudioToolbar
            editor={editor}
            zoom={zoom}
            onChangeZoom={setZoom}
            onPrint={() => window.print()}
            onOpenLinkModal={openLinkModalFromEditor}
            onInsertBlock={handleInsertBlock}
          />

          {autosave.conflict && (
            <ConflictBanner
              conflict={autosave.conflict}
              onUseServer={autosave.resolveConflictUseServer}
              onKeepMine={autosave.resolveConflictKeepMine}
              onDismiss={autosave.dismissConflict}
            />
          )}

          {loadingWorkspace ? (
            <div className="studio-loading-pane">
              <Loader2 size={22} className="studio-spin" />
              <span>Memuat perpustakaan novel dan bab…</span>
            </div>
          ) : novels.length === 0 ? (
            <div className="studio-empty-onboarding">
              <h2>Selamat datang di Novel Studio</h2>
              <p>
                Database Supabase masih kosong. Anda dapat langsung mengimpor 118
                chapter Novel Ariel &amp; Alie atau membuat novel baru.
              </p>
              <div className="studio-empty-actions">
                <button
                  type="button"
                  className="studio-btn studio-btn-primary"
                  onClick={() => setImportOpen(true)}
                >
                  Impor 118 Chapter Bawaan
                </button>
                <button
                  type="button"
                  className="studio-btn studio-btn-secondary"
                  onClick={() => setNewNovelOpen(true)}
                >
                  Buat Novel Baru
                </button>
              </div>
            </div>
          ) : (
            <div className="studio-workspace">
              {showSidebar && (
                <StudioSidebar
                  novels={novels}
                  activeNovelId={activeNovelId}
                  chapters={chapters}
                  activeChapterId={activeChapter?.id ?? null}
                  outline={outline}
                  onSelectNovel={(id) => void handleSelectNovel(id)}
                  onOpenNewNovel={() => setNewNovelOpen(true)}
                  onSelectChapter={(id) => void handleSelectChapter(id)}
                  onNewChapter={() => void handleNewChapter()}
                  onDuplicateChapter={(ch) => void handleDuplicateChapter(ch)}
                  onArchiveToggle={(ch) => void handleArchiveToggle(ch)}
                  onRequestDeleteChapter={setDeleteTarget}
                  onReorderChapters={(draggedId, targetId) =>
                    void handleReorderChapters(draggedId, targetId)
                  }
                  onMoveChapterDelta={(id, delta) =>
                    void handleMoveChapterDelta(id, delta)
                  }
                  onJumpToOutlineItem={handleJumpToOutlineItem}
                />
              )}

              <DocumentWorkspaceCanvas
                editor={editor}
                chapter={activeChapter}
                zoom={zoom}
                showRuler={showRuler}
                marginPreset={marginPreset}
                onUpdateHeaderField={(field, value) => {
                  if (!activeChapter) return;
                  updateChapterLocalAndQueueSave(activeChapter.id, (prev) => ({
                    ...prev,
                    [field]: value,
                  }));
                }}
              />

              {showInspector && (
                <StudioInspectorPanel
                  novelId={activeNovelId}
                  chapter={activeChapter}
                  marginPreset={marginPreset}
                  onChangeMarginPreset={(preset) => {
                    if (!activeChapter) return;
                    updateChapterLocalAndQueueSave(activeChapter.id, (prev) => ({
                      ...prev,
                      draftMetadata: {
                        ...prev.draftMetadata,
                        marginPreset: preset,
                      },
                    }));
                  }}
                  onUpdateChapterPatch={(patch) => {
                    if (!activeChapter) return;
                    updateChapterLocalAndQueueSave(activeChapter.id, (prev) => ({
                      ...prev,
                      ...patch,
                    }));
                  }}
                  onRestoreRevision={(rev) => void handleRestoreRevision(rev)}
                  onOpenPublishModal={() => setPublishOpen(true)}
                  onToggleArchive={(ch) => void handleArchiveToggle(ch)}
                  onInsertAssetToEditor={handleInsertAsset}
                />
              )}
            </div>
          )}

          <footer className="studio-status-bar">
            <div className="studio-status-left">
              <span className="tabular-nums">{metrics.wordCount.toLocaleString('id-ID')} kata</span>
              <span className="studio-sep-dot" aria-hidden="true">
                ·
              </span>
              <span className="tabular-nums">
                {metrics.characterCount.toLocaleString('id-ID')} karakter
              </span>
              <span className="studio-sep-dot" aria-hidden="true">
                ·
              </span>
              <span className="tabular-nums">{metrics.pageCount} halaman</span>
            </div>
            <div className="studio-status-right">
              <span>{auth.adminProfile?.email}</span>
              <span className="studio-sep-dot" aria-hidden="true">
                ·
              </span>
              <span>{saveStatusText}</span>
            </div>
          </footer>
        </>
      ) : (
        activeChapter && (
          <StudioLivePreview
            mode={viewMode}
            chapters={chapters}
            activeChapter={activeChapter}
            onExitPreview={() => setViewMode('editor')}
            onChangeMode={setViewMode}
          />
        )
      )}

      {/* Test VFX overlay for Studio cues */}
      {testVfx && (
        <VisualEffectsLayer
          chapterId={`studio-vfx-${testVfx.key}`}
          effect={testVfx.effect}
          triggerMode="immediate"
          durationMs={testVfx.durationMs}
        />
      )}

      {notice && (
        <div className="studio-toast" role="status" aria-live="polite">
          {notice}
        </div>
      )}

      <PublishModal
        open={publishOpen}
        chapter={activeChapter}
        publishing={publishing}
        onConfirmPublish={handleConfirmPublish}
        onClose={() => setPublishOpen(false)}
      />

      <DeleteChapterModal
        chapter={deleteTarget}
        deleting={deleting}
        onConfirmDelete={handleConfirmDeleteChapter}
        onClose={() => setDeleteTarget(null)}
      />

      <NewNovelModal
        open={newNovelOpen}
        busy={creatingNovel}
        onCreateNovel={handleCreateNovel}
        onClose={() => setNewNovelOpen(false)}
      />

      <InsertLinkModal
        open={linkModalOpen}
        initialHref={linkInitialHref}
        onApplyLink={(href) => {
          editor?.chain().focus().setLink({ href }).run();
          setLinkModalOpen(false);
        }}
        onRemoveLink={() => {
          editor?.chain().focus().unsetLink().run();
          setLinkModalOpen(false);
        }}
        onClose={() => setLinkModalOpen(false)}
      />

      <WordCountModal
        open={wordCountOpen}
        metrics={metrics}
        onClose={() => setWordCountOpen(false)}
      />

      <ShortcutsModal
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />

      <ImportLegacyModal
        open={importOpen}
        importing={importing}
        onConfirmImport={handleConfirmImportLegacy}
        onClose={() => setImportOpen(false)}
      />
    </div>
  );
}

export default NovelStudioPage;
