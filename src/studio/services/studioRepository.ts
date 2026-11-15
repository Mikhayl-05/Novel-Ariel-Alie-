import type { BgmKey, Chapter, VfxKey } from '../../types/novel';
import type {
  AdminProfile,
  ChapterStatus,
  ChapterStudioMetadata,
  RevisionKind,
  StudioChapter,
  StudioChapterAsset,
  StudioChapterRevision,
  StudioNovel,
  TiptapDocJson,
  VfxTriggerMode,
} from '../types/studio';
import {
  buildAllLegacyChapterRows,
  buildDefaultNovelPayload,
  buildLegacyAudioAssetRows,
} from '../utils/legacyImport';
import {
  EMPTY_TIPTAP_DOC,
  parseLegacyHtmlToTiptapDoc,
  serializeTiptapDocToReaderHtml,
} from '../utils/novelContentCodec';
import { getSupabaseClient, requireSupabaseClient } from './supabaseClient';

interface DbNovelRow {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  synopsis: string | null;
  author_name: string | null;
  cover_image_url: string | null;
  status: 'draft' | 'published' | 'archived';
  default_bgm: string | null;
  created_at: string;
  updated_at: string;
}

interface DbChapterRow {
  id: string;
  novel_id: string;
  legacy_id: string | null;
  legacy_index: number | null;
  sort_order: number;
  num: string;
  title: string;
  setting: string | null;
  feeling: string | null;
  is_prologue: boolean;
  is_ending: boolean;
  status: ChapterStatus;
  draft_doc: TiptapDocJson | null;
  draft_html: string | null;
  draft_bgm: string | null;
  draft_bgm_volume: number | null;
  draft_bgm_loop: boolean | null;
  draft_effect: string | null;
  draft_vfx_trigger: VfxTriggerMode | null;
  draft_vfx_duration_ms: number | null;
  draft_metadata: ChapterStudioMetadata | null;
  draft_version: number;
  published_doc: TiptapDocJson | null;
  published_html: string | null;
  published_num: string | null;
  published_title: string | null;
  published_setting: string | null;
  published_feeling: string | null;
  published_is_prologue: boolean | null;
  published_is_ending: boolean | null;
  published_bgm: string | null;
  published_bgm_volume: number | null;
  published_bgm_loop: boolean | null;
  published_effect: string | null;
  published_vfx_trigger: VfxTriggerMode | null;
  published_vfx_duration_ms: number | null;
  published_at: string | null;
  published_version: number;
  created_at: string;
  updated_at: string;
}

export interface PublishedReaderChapter extends Chapter {
  bgmVolume?: number;
  bgmLoop?: boolean;
  vfxTrigger?: VfxTriggerMode;
  vfxDurationMs?: number;
}

function mapNovelRow(row: DbNovelRow): StudioNovel {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle ?? '',
    synopsis: row.synopsis ?? '',
    authorName: row.author_name ?? '',
    coverImageUrl: row.cover_image_url,
    status: row.status,
    defaultBgm: (row.default_bgm || 'default') as BgmKey,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapChapterRow(row: DbChapterRow): StudioChapter {
  const doc =
    row.draft_doc && row.draft_doc.type === 'doc'
      ? row.draft_doc
      : row.draft_html
        ? parseLegacyHtmlToTiptapDoc(row.draft_html)
        : EMPTY_TIPTAP_DOC;

  return {
    id: row.id,
    novelId: row.novel_id,
    legacyId: row.legacy_id,
    legacyIndex: row.legacy_index,
    sortOrder: row.sort_order,
    num: row.num,
    title: row.title,
    setting: row.setting ?? '',
    feeling: row.feeling ?? '',
    isPrologue: Boolean(row.is_prologue),
    isEnding: Boolean(row.is_ending),
    status: row.status,
    draftDoc: doc,
    draftHtml: row.draft_html ?? serializeTiptapDocToReaderHtml(doc),
    draftBgm: (row.draft_bgm || 'default') as BgmKey,
    draftBgmVolume: Number(row.draft_bgm_volume ?? 0.42),
    draftBgmLoop: row.draft_bgm_loop !== false,
    draftEffect: (row.draft_effect || 'none') as VfxKey,
    draftVfxTrigger: row.draft_vfx_trigger ?? 'scroll_40',
    draftVfxDurationMs: Number(row.draft_vfx_duration_ms ?? 25000),
    draftMetadata: row.draft_metadata ?? { marginPreset: 'normal' },
    draftVersion: row.draft_version ?? 1,
    publishedDoc: row.published_doc,
    publishedHtml: row.published_html,
    publishedNum: row.published_num,
    publishedTitle: row.published_title,
    publishedSetting: row.published_setting,
    publishedFeeling: row.published_feeling,
    publishedIsPrologue: row.published_is_prologue,
    publishedIsEnding: row.published_is_ending,
    publishedBgm: row.published_bgm as BgmKey | null,
    publishedBgmVolume:
      row.published_bgm_volume !== null ? Number(row.published_bgm_volume) : null,
    publishedBgmLoop: row.published_bgm_loop,
    publishedEffect: row.published_effect as VfxKey | null,
    publishedVfxTrigger: row.published_vfx_trigger,
    publishedVfxDurationMs: row.published_vfx_duration_ms,
    publishedAt: row.published_at,
    publishedVersion: row.published_version ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function verifyAdminAccess(userId: string): Promise<AdminProfile | null> {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase
    .from('admin_users')
    .select('user_id, email, display_name, role, is_active')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    userId: data.user_id,
    email: data.email,
    displayName: data.display_name,
    role: data.role as 'admin' | 'super_admin',
    isActive: data.is_active,
  };
}

/**
 * Public Reader query — reads strictly from `chapter_publications` (published snapshots only).
 * Anonymous users never touch the `chapters` table.
 */
export async function fetchPublishedChaptersForReader(): Promise<
  PublishedReaderChapter[] | null
> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('chapter_publications')
    .select(
      'chapter_id, legacy_id, legacy_index, sort_order, num, title, setting, feeling, is_prologue, is_ending, content_html, bgm, bgm_volume, bgm_loop, effect, vfx_trigger, vfx_duration_ms',
    )
    .eq('is_published', true)
    .order('sort_order', { ascending: true });

  if (error || !data || data.length === 0) {
    return null;
  }

  return data.map((row, idx) => ({
    id: row.legacy_id || row.chapter_id,
    legacyIndex: row.legacy_index ?? idx,
    num: row.num,
    title: row.title,
    setting: row.setting ?? '',
    feeling: row.feeling ?? undefined,
    isPrologue: Boolean(row.is_prologue),
    isEnding: Boolean(row.is_ending),
    bgm: (row.bgm || 'default') as BgmKey,
    bgmVolume: Number(row.bgm_volume ?? 0.42),
    bgmLoop: row.bgm_loop !== false,
    effect: (row.effect || 'none') as VfxKey,
    vfxTrigger: (row.vfx_trigger || 'scroll_40') as VfxTriggerMode,
    vfxDurationMs: Number(row.vfx_duration_ms ?? 25000),
    content: row.content_html,
  }));
}

export async function fetchNovels(): Promise<StudioNovel[]> {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase
    .from('novels')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data as DbNovelRow[]).map(mapNovelRow);
}

export async function createNovel(input: {
  title: string;
  subtitle?: string;
  synopsis?: string;
  authorName?: string;
}): Promise<StudioNovel> {
  const supabase = requireSupabaseClient();
  const slugBase = input.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const slug = `${slugBase || 'novel'}-${Date.now().toString(36)}`;
  const { data, error } = await supabase
    .from('novels')
    .insert({
      slug,
      title: input.title.trim(),
      subtitle: input.subtitle?.trim() ?? '',
      synopsis: input.synopsis?.trim() ?? '',
      author_name: input.authorName?.trim() ?? '',
      status: 'draft',
    })
    .select('*')
    .single();
  if (error || !data) throw new Error(error?.message || 'Gagal membuat novel.');
  return mapNovelRow(data as DbNovelRow);
}

export async function fetchChaptersByNovel(novelId: string): Promise<StudioChapter[]> {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase
    .from('chapters')
    .select('*')
    .eq('novel_id', novelId)
    .order('sort_order', { ascending: true });
  if (error) throw new Error(error.message);
  return (data as DbChapterRow[]).map(mapChapterRow);
}

export async function fetchChapterById(chapterId: string): Promise<StudioChapter> {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase
    .from('chapters')
    .select('*')
    .eq('id', chapterId)
    .single();
  if (error || !data) {
    throw new Error(error?.message || 'Gagal memuat ulang bab dari server.');
  }
  return mapChapterRow(data as DbChapterRow);
}

export async function insertChapter(chapter: StudioChapter): Promise<StudioChapter> {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase
    .from('chapters')
    .insert({
      id: chapter.id,
      novel_id: chapter.novelId,
      legacy_id: chapter.legacyId,
      legacy_index: chapter.legacyIndex,
      sort_order: chapter.sortOrder,
      num: chapter.num,
      title: chapter.title,
      setting: chapter.setting,
      feeling: chapter.feeling || null,
      is_prologue: chapter.isPrologue,
      is_ending: chapter.isEnding,
      status: chapter.status,
      draft_doc: chapter.draftDoc,
      draft_html: chapter.draftHtml,
      draft_bgm: chapter.draftBgm,
      draft_bgm_volume: chapter.draftBgmVolume,
      draft_bgm_loop: chapter.draftBgmLoop,
      draft_effect: chapter.draftEffect,
      draft_vfx_trigger: chapter.draftVfxTrigger,
      draft_vfx_duration_ms: chapter.draftVfxDurationMs,
      draft_metadata: chapter.draftMetadata,
      draft_version: chapter.draftVersion,
    })
    .select('*')
    .single();
  if (error || !data) throw new Error(error?.message || 'Gagal menyimpan bab baru.');
  return mapChapterRow(data as DbChapterRow);
}

export async function deleteChapterById(chapterId: string): Promise<void> {
  const supabase = requireSupabaseClient();
  const { error } = await supabase.from('chapters').delete().eq('id', chapterId);
  if (error) throw new Error(error.message);
}

export async function updateChapterStatusById(
  chapterId: string,
  status: ChapterStatus,
): Promise<StudioChapter> {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase
    .from('chapters')
    .update({ status })
    .eq('id', chapterId)
    .select('*')
    .single();
  if (error || !data) throw new Error(error?.message || 'Gagal mengubah status bab.');
  return mapChapterRow(data as DbChapterRow);
}

export async function persistChapterSortOrders(
  orderedChapters: Array<{ id: string; sortOrder: number }>,
): Promise<void> {
  const supabase = requireSupabaseClient();
  await Promise.all(
    orderedChapters.map(async ({ id, sortOrder }) => {
      const { error } = await supabase
        .from('chapters')
        .update({ sort_order: sortOrder })
        .eq('id', id);
      if (error) throw new Error(error.message);

      // Also keep public sort_order aligned if already published
      await supabase
        .from('chapter_publications')
        .update({ sort_order: sortOrder })
        .eq('chapter_id', id);
    }),
  );
}

export interface SaveDraftPatch {
  num: string;
  title: string;
  setting: string;
  feeling: string;
  isPrologue: boolean;
  isEnding: boolean;
  draftDoc: TiptapDocJson;
  draftHtml: string;
  draftBgm: BgmKey;
  draftBgmVolume: number;
  draftBgmLoop: boolean;
  draftEffect: VfxKey;
  draftVfxTrigger: VfxTriggerMode;
  draftVfxDurationMs: number;
  draftMetadata: ChapterStudioMetadata;
}

export type OptimisticSaveResult =
  | { kind: 'ok'; chapter: StudioChapter }
  | { kind: 'conflict'; serverChapter: StudioChapter };

export async function saveChapterDraftWithConcurrency(
  chapterId: string,
  expectedVersion: number,
  patch: SaveDraftPatch,
  forceOverwrite = false,
): Promise<OptimisticSaveResult> {
  const supabase = requireSupabaseClient();

  let effectiveVersion = expectedVersion;
  if (forceOverwrite) {
    const { data: latestRow, error: latestErr } = await supabase
      .from('chapters')
      .select('draft_version')
      .eq('id', chapterId)
      .single();
    if (latestErr || !latestRow) {
      throw new Error(latestErr?.message || 'Bab tidak ditemukan saat force overwrite.');
    }
    effectiveVersion = Number(latestRow.draft_version ?? expectedVersion);
  }

  const nextVersion = effectiveVersion + 1;
  const { data, error } = await supabase
    .from('chapters')
    .update({
      num: patch.num,
      title: patch.title,
      setting: patch.setting,
      feeling: patch.feeling || null,
      is_prologue: patch.isPrologue,
      is_ending: patch.isEnding,
      draft_doc: patch.draftDoc,
      draft_html: patch.draftHtml,
      draft_bgm: patch.draftBgm,
      draft_bgm_volume: patch.draftBgmVolume,
      draft_bgm_loop: patch.draftBgmLoop,
      draft_effect: patch.draftEffect,
      draft_vfx_trigger: patch.draftVfxTrigger,
      draft_vfx_duration_ms: patch.draftVfxDurationMs,
      draft_metadata: patch.draftMetadata,
      draft_version: nextVersion,
    })
    .eq('id', chapterId)
    .eq('draft_version', effectiveVersion)
    .select('*')
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    const { data: currentServer, error: fetchErr } = await supabase
      .from('chapters')
      .select('*')
      .eq('id', chapterId)
      .single();
    if (fetchErr || !currentServer) {
      throw new Error(fetchErr?.message || 'Terjadi konflik versi dokumen.');
    }
    return {
      kind: 'conflict',
      serverChapter: mapChapterRow(currentServer as DbChapterRow),
    };
  }

  return {
    kind: 'ok',
    chapter: mapChapterRow(data as DbChapterRow),
  };
}

export async function publishChapterRpc(chapterId: string): Promise<StudioChapter> {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase.rpc('publish_chapter', {
    p_chapter_id: chapterId,
  });
  if (error || !data) {
    throw new Error(error?.message || 'Gagal memublikasikan bab.');
  }
  return mapChapterRow(data as DbChapterRow);
}

export async function fetchChapterRevisions(
  chapterId: string,
): Promise<StudioChapterRevision[]> {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase
    .from('chapter_revisions')
    .select('*')
    .eq('chapter_id', chapterId)
    .order('revision_number', { ascending: false })
    .limit(40);
  if (error) throw new Error(error.message);
  return (data || []).map((row) => ({
    id: row.id,
    chapterId: row.chapter_id,
    revisionNumber: row.revision_number,
    revisionKind: row.revision_kind as RevisionKind,
    num: row.num,
    title: row.title,
    setting: row.setting ?? '',
    feeling: row.feeling,
    docJson: row.doc_json as TiptapDocJson,
    htmlSnapshot: row.html_snapshot,
    audioVfxSnapshot: row.audio_vfx_snapshot ?? {},
    createdAt: row.created_at,
  }));
}

export async function createChapterRevision(
  chapter: StudioChapter,
  kind: RevisionKind,
): Promise<StudioChapterRevision> {
  const supabase = requireSupabaseClient();
  const { data: latestRev } = await supabase
    .from('chapter_revisions')
    .select('revision_number')
    .eq('chapter_id', chapter.id)
    .order('revision_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextNum = Number(latestRev?.revision_number ?? 0) + 1;
  const { data, error } = await supabase
    .from('chapter_revisions')
    .insert({
      chapter_id: chapter.id,
      revision_number: nextNum,
      revision_kind: kind,
      num: chapter.num,
      title: chapter.title,
      setting: chapter.setting,
      feeling: chapter.feeling || null,
      doc_json: chapter.draftDoc,
      html_snapshot: chapter.draftHtml,
      audio_vfx_snapshot: {
        bgm: chapter.draftBgm,
        bgm_volume: chapter.draftBgmVolume,
        bgm_loop: chapter.draftBgmLoop,
        effect: chapter.draftEffect,
        vfx_trigger: chapter.draftVfxTrigger,
        vfx_duration_ms: chapter.draftVfxDurationMs,
      },
    })
    .select('*')
    .single();

  if (error || !data) throw new Error(error?.message || 'Gagal membuat revision.');
  return {
    id: data.id,
    chapterId: data.chapter_id,
    revisionNumber: data.revision_number,
    revisionKind: data.revision_kind as RevisionKind,
    num: data.num,
    title: data.title,
    setting: data.setting ?? '',
    feeling: data.feeling,
    docJson: data.doc_json as TiptapDocJson,
    htmlSnapshot: data.html_snapshot,
    audioVfxSnapshot: data.audio_vfx_snapshot ?? {},
    createdAt: data.created_at,
  };
}

export async function fetchNovelAssets(
  novelId: string,
): Promise<StudioChapterAsset[]> {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase
    .from('chapter_assets')
    .select('*')
    .eq('novel_id', novelId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map((row) => ({
    id: row.id,
    novelId: row.novel_id,
    chapterId: row.chapter_id,
    assetType: row.asset_type,
    label: row.label,
    assetKey: row.asset_key,
    url: row.url,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    createdAt: row.created_at,
  }));
}

export async function registerNovelAsset(input: {
  novelId: string;
  chapterId?: string | null;
  assetType: 'image' | 'audio' | 'sfx' | 'cover' | 'attachment';
  label: string;
  assetKey?: string | null;
  url: string;
  mimeType?: string | null;
}): Promise<StudioChapterAsset> {
  const supabase = requireSupabaseClient();
  const { data, error } = await supabase
    .from('chapter_assets')
    .insert({
      novel_id: input.novelId,
      chapter_id: input.chapterId ?? null,
      asset_type: input.assetType,
      label: input.label.trim(),
      asset_key: input.assetKey ?? null,
      url: input.url.trim(),
      mime_type: input.mimeType ?? null,
    })
    .select('*')
    .single();
  if (error || !data) throw new Error(error?.message || 'Gagal menyimpan aset.');
  return {
    id: data.id,
    novelId: data.novel_id,
    chapterId: data.chapter_id,
    assetType: data.asset_type,
    label: data.label,
    assetKey: data.asset_key,
    url: data.url,
    mimeType: data.mime_type,
    byteSize: data.byte_size,
    createdAt: data.created_at,
  };
}

export async function deleteNovelAsset(assetId: string): Promise<void> {
  const supabase = requireSupabaseClient();
  const { error } = await supabase.from('chapter_assets').delete().eq('id', assetId);
  if (error) throw new Error(error.message);
}

export async function importLegacyChaptersAsAdmin(): Promise<{
  novel: StudioNovel;
  importedCount: number;
}> {
  const supabase = requireSupabaseClient();
  const novelPayload = buildDefaultNovelPayload();
  const { data: novelRow, error: novelErr } = await supabase
    .from('novels')
    .upsert(novelPayload, { onConflict: 'slug' })
    .select('*')
    .single();

  if (novelErr || !novelRow) {
    throw new Error(novelErr?.message || 'Gagal menyiapkan novel utama.');
  }

  const nowIso = new Date().toISOString();
  const rows = buildAllLegacyChapterRows(novelRow.id).map((r) => ({
    ...r,
    published_at: nowIso,
  }));

  const { data: insertedChapters, error: chapErr } = await supabase
    .from('chapters')
    .upsert(rows, { onConflict: 'legacy_id' })
    .select('*');

  if (chapErr || !insertedChapters) {
    throw new Error(chapErr?.message || 'Gagal mengimpor 118 chapter.');
  }

  const pubRows = (insertedChapters as DbChapterRow[]).map((ch) => ({
    chapter_id: ch.id,
    novel_id: ch.novel_id,
    legacy_id: ch.legacy_id,
    legacy_index: ch.legacy_index,
    sort_order: ch.sort_order,
    num: ch.num,
    title: ch.title,
    setting: ch.setting ?? '',
    feeling: ch.feeling,
    is_prologue: ch.is_prologue,
    is_ending: ch.is_ending,
    content_html: ch.published_html ?? ch.draft_html ?? '',
    content_doc: ch.published_doc ?? ch.draft_doc ?? EMPTY_TIPTAP_DOC,
    bgm: ch.published_bgm ?? ch.draft_bgm ?? 'default',
    bgm_volume: ch.published_bgm_volume ?? ch.draft_bgm_volume ?? 0.42,
    bgm_loop: ch.published_bgm_loop ?? ch.draft_bgm_loop ?? true,
    effect: ch.published_effect ?? ch.draft_effect ?? 'none',
    vfx_trigger: ch.published_vfx_trigger ?? ch.draft_vfx_trigger ?? 'scroll_40',
    vfx_duration_ms:
      ch.published_vfx_duration_ms ?? ch.draft_vfx_duration_ms ?? 25000,
    metadata: {},
    published_version: ch.published_version || 1,
    published_at: ch.published_at ?? nowIso,
    is_published: true,
  }));

  const { error: pubErr } = await supabase
    .from('chapter_publications')
    .upsert(pubRows, { onConflict: 'chapter_id' });

  if (pubErr) throw new Error(pubErr.message);

  const { count: assetCount } = await supabase
    .from('chapter_assets')
    .select('id', { count: 'exact', head: true })
    .eq('novel_id', novelRow.id);

  if (!assetCount || assetCount === 0) {
    const assets = buildLegacyAudioAssetRows(novelRow.id);
    await supabase.from('chapter_assets').insert(assets);
  }

  return {
    novel: mapNovelRow(novelRow as DbNovelRow),
    importedCount: insertedChapters.length,
  };
}

export function subscribeToNovelChapterUpdates(
  novelId: string,
  onRemoteChapterUpdate: (chapter: StudioChapter) => void,
): () => void {
  const supabase = getSupabaseClient();
  if (!supabase) return () => {};

  const channel = supabase
    .channel(`studio-chapters:${novelId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'chapters',
        filter: `novel_id=eq.${novelId}`,
      },
      (payload) => {
        if (payload.new) {
          onRemoteChapterUpdate(mapChapterRow(payload.new as DbChapterRow));
        }
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
