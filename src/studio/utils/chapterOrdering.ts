import type { StudioChapter } from '../types/studio';
import {
  EMPTY_TIPTAP_DOC,
  serializeTiptapDocToReaderHtml,
} from './novelContentCodec';

export function generateStableUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback RFC4122-v4 compliant generator for older runtimes
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function normalizeSortOrders(chapters: StudioChapter[]): StudioChapter[] {
  return chapters.map((ch, idx) => ({
    ...ch,
    sortOrder: idx,
  }));
}

export function reorderChaptersByIds(
  chapters: StudioChapter[],
  draggedId: string,
  targetId: string,
): StudioChapter[] {
  if (draggedId === targetId) return chapters;
  const fromIdx = chapters.findIndex((c) => c.id === draggedId);
  const toIdx = chapters.findIndex((c) => c.id === targetId);
  if (fromIdx === -1 || toIdx === -1) return chapters;

  const copy = [...chapters];
  const [moved] = copy.splice(fromIdx, 1);
  copy.splice(toIdx, 0, moved);
  return normalizeSortOrders(copy);
}

export function moveChapterByDelta(
  chapters: StudioChapter[],
  chapterId: string,
  delta: -1 | 1,
): StudioChapter[] {
  const idx = chapters.findIndex((c) => c.id === chapterId);
  if (idx === -1) return chapters;
  const targetIdx = idx + delta;
  if (targetIdx < 0 || targetIdx >= chapters.length) return chapters;
  return reorderChaptersByIds(chapters, chapterId, chapters[targetIdx].id);
}

export function createNewChapterPayload(
  novelId: string,
  existingChapters: StudioChapter[],
  overrides?: Partial<StudioChapter>,
): StudioChapter {
  const now = new Date().toISOString();
  const nextOrder =
    existingChapters.length > 0
      ? Math.max(...existingChapters.map((c) => c.sortOrder)) + 1
      : 0;
  const nextNumber = existingChapters.filter((c) => !c.isPrologue).length + 1;
  const initialDoc = overrides?.draftDoc ?? {
    type: 'doc' as const,
    content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }],
  };
  const draftHtml =
    overrides?.draftHtml ?? serializeTiptapDocToReaderHtml(initialDoc);

  return {
    id: generateStableUuid(),
    novelId,
    legacyId: null,
    legacyIndex: null,
    sortOrder: nextOrder,
    num: overrides?.num ?? `Bab Baru ${nextNumber}`,
    title: overrides?.title ?? 'Bab Tanpa Judul',
    setting: overrides?.setting ?? '',
    feeling: overrides?.feeling ?? '',
    isPrologue: overrides?.isPrologue ?? false,
    isEnding: overrides?.isEnding ?? false,
    status: 'draft',
    draftDoc: initialDoc.content.length > 0 ? initialDoc : EMPTY_TIPTAP_DOC,
    draftHtml,
    draftBgm: overrides?.draftBgm ?? 'default',
    draftBgmVolume: overrides?.draftBgmVolume ?? 0.42,
    draftBgmLoop: overrides?.draftBgmLoop ?? true,
    draftEffect: overrides?.draftEffect ?? 'none',
    draftVfxTrigger: overrides?.draftVfxTrigger ?? 'scroll_40',
    draftVfxDurationMs: overrides?.draftVfxDurationMs ?? 25000,
    draftMetadata: overrides?.draftMetadata ?? { marginPreset: 'normal' },
    draftVersion: 1,
    publishedDoc: null,
    publishedHtml: null,
    publishedNum: null,
    publishedTitle: null,
    publishedSetting: null,
    publishedFeeling: null,
    publishedIsPrologue: null,
    publishedIsEnding: null,
    publishedBgm: null,
    publishedBgmVolume: null,
    publishedBgmLoop: null,
    publishedEffect: null,
    publishedVfxTrigger: null,
    publishedVfxDurationMs: null,
    publishedAt: null,
    publishedVersion: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export function duplicateChapterPayload(
  source: StudioChapter,
  existingChapters: StudioChapter[],
): { duplicated: StudioChapter; reordered: StudioChapter[] } {
  const now = new Date().toISOString();
  const duplicated: StudioChapter = {
    ...source,
    id: generateStableUuid(),
    legacyId: null,
    legacyIndex: null,
    num: `${source.num} (Salinan)`,
    title: `${source.title} (Salinan)`,
    status: 'draft',
    draftVersion: 1,
    publishedDoc: null,
    publishedHtml: null,
    publishedNum: null,
    publishedTitle: null,
    publishedSetting: null,
    publishedFeeling: null,
    publishedIsPrologue: null,
    publishedIsEnding: null,
    publishedBgm: null,
    publishedBgmVolume: null,
    publishedBgmLoop: null,
    publishedEffect: null,
    publishedVfxTrigger: null,
    publishedVfxDurationMs: null,
    publishedAt: null,
    publishedVersion: 0,
    createdAt: now,
    updatedAt: now,
  };

  const sourceIdx = existingChapters.findIndex((c) => c.id === source.id);
  const copy = [...existingChapters];
  const insertAt = sourceIdx === -1 ? copy.length : sourceIdx + 1;
  copy.splice(insertAt, 0, duplicated);
  const reordered = normalizeSortOrders(copy);
  const syncedDuplicated =
    reordered.find((c) => c.id === duplicated.id) ?? duplicated;

  return {
    duplicated: syncedDuplicated,
    reordered,
  };
}

export interface ConflictCheckInput {
  localBaseVersion: number;
  localBaseUpdatedAt: string;
  serverVersion: number;
  serverUpdatedAt: string;
}

export function detectVersionConflict(input: ConflictCheckInput): boolean {
  if (input.serverVersion > input.localBaseVersion) {
    return true;
  }
  if (
    input.serverUpdatedAt &&
    input.localBaseUpdatedAt &&
    Date.parse(input.serverUpdatedAt) > Date.parse(input.localBaseUpdatedAt) &&
    input.serverVersion !== input.localBaseVersion
  ) {
    return true;
  }
  return false;
}

export function hasUnpublishedChanges(chapter: StudioChapter): boolean {
  if (chapter.status === 'draft' || !chapter.publishedAt) return true;
  return (
    chapter.draftHtml !== (chapter.publishedHtml ?? '') ||
    chapter.num !== (chapter.publishedNum ?? '') ||
    chapter.title !== (chapter.publishedTitle ?? '') ||
    chapter.setting !== (chapter.publishedSetting ?? '') ||
    (chapter.feeling || '') !== (chapter.publishedFeeling || '') ||
    chapter.isPrologue !== Boolean(chapter.publishedIsPrologue) ||
    chapter.isEnding !== Boolean(chapter.publishedIsEnding) ||
    chapter.draftBgm !== (chapter.publishedBgm ?? 'default') ||
    chapter.draftEffect !== (chapter.publishedEffect ?? 'none')
  );
}
