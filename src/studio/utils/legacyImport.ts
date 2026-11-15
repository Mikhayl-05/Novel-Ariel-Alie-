import { audioMap } from '../../data/audioMap';
import { allChapters } from '../../data/chapters';
import type { BgmKey, Chapter, VfxKey } from '../../types/novel';
import { parseLegacyHtmlToTiptapDoc } from './novelContentCodec';

export const DEFAULT_NOVEL_SLUG = 'selamanya-itu-lama-banget';

export interface LegacyImportNovelPayload {
  slug: string;
  title: string;
  subtitle: string;
  synopsis: string;
  author_name: string;
  cover_image_url: string;
  status: 'published';
  default_bgm: BgmKey;
}

export interface LegacyImportChapterRow {
  novel_id: string;
  legacy_id: string;
  legacy_index: number;
  sort_order: number;
  num: string;
  title: string;
  setting: string;
  feeling: string | null;
  is_prologue: boolean;
  is_ending: boolean;
  status: 'published';
  draft_doc: ReturnType<typeof parseLegacyHtmlToTiptapDoc>;
  draft_html: string;
  draft_bgm: BgmKey;
  draft_bgm_volume: number;
  draft_bgm_loop: boolean;
  draft_effect: VfxKey;
  draft_vfx_trigger: 'scroll_40';
  draft_vfx_duration_ms: number;
  draft_metadata: Record<string, unknown>;
  draft_version: number;
  published_doc: ReturnType<typeof parseLegacyHtmlToTiptapDoc>;
  published_html: string;
  published_num: string;
  published_title: string;
  published_setting: string;
  published_feeling: string | null;
  published_is_prologue: boolean;
  published_is_ending: boolean;
  published_bgm: BgmKey;
  published_bgm_volume: number;
  published_bgm_loop: boolean;
  published_effect: VfxKey;
  published_vfx_trigger: 'scroll_40';
  published_vfx_duration_ms: number;
  published_metadata: Record<string, unknown>;
  published_version: number;
}

export function buildDefaultNovelPayload(): LegacyImportNovelPayload {
  return {
    slug: DEFAULT_NOVEL_SLUG,
    title: 'Selamanya Itu Lama Banget',
    subtitle: 'Kisah Ariel & Alie',
    synopsis:
      'Novel digital kisah Ariel & Alie — dari halaman sekolah TK di bawah pohon jambu hingga akhir masa SMA.',
    author_name: 'Mikhayl',
    cover_image_url: '/asset/preview.jpg',
    status: 'published',
    default_bgm: 'default',
  };
}

export function convertLegacyChapterToDbRow(
  ch: Chapter,
  novelId: string,
  fallbackIndex = 0,
): LegacyImportChapterRow {
  const docJson = parseLegacyHtmlToTiptapDoc(ch.content);
  const cleanHtml = ch.content.trim();
  const bgm: BgmKey = ch.bgm || 'default';
  const effect: VfxKey = ch.effect || 'none';
  const metadata = { marginPreset: 'normal', legacyImported: true };
  const resolvedIndex = ch.legacyIndex ?? fallbackIndex;

  return {
    novel_id: novelId,
    legacy_id: ch.id,
    legacy_index: resolvedIndex,
    sort_order: resolvedIndex,
    num: ch.num,
    title: ch.title,
    setting: ch.setting,
    feeling: ch.feeling ?? null,
    is_prologue: Boolean(ch.isPrologue),
    is_ending: Boolean(ch.isEnding),
    status: 'published',
    draft_doc: docJson,
    draft_html: cleanHtml,
    draft_bgm: bgm,
    draft_bgm_volume: 0.42,
    draft_bgm_loop: true,
    draft_effect: effect,
    draft_vfx_trigger: 'scroll_40',
    draft_vfx_duration_ms: 25000,
    draft_metadata: metadata,
    draft_version: 1,
    published_doc: docJson,
    published_html: cleanHtml,
    published_num: ch.num,
    published_title: ch.title,
    published_setting: ch.setting,
    published_feeling: ch.feeling ?? null,
    published_is_prologue: Boolean(ch.isPrologue),
    published_is_ending: Boolean(ch.isEnding),
    published_bgm: bgm,
    published_bgm_volume: 0.42,
    published_bgm_loop: true,
    published_effect: effect,
    published_vfx_trigger: 'scroll_40',
    published_vfx_duration_ms: 25000,
    published_metadata: metadata,
    published_version: 1,
  };
}

export function buildAllLegacyChapterRows(novelId: string): LegacyImportChapterRow[] {
  return allChapters.map((ch, idx) => convertLegacyChapterToDbRow(ch, novelId, idx));
}

export function buildLegacyAudioAssetRows(novelId: string) {
  const rows: Array<{
    novel_id: string;
    chapter_id: null;
    asset_type: 'audio';
    label: string;
    asset_key: string;
    url: string;
    mime_type: string;
  }> = [];

  audioMap.default.forEach((url, idx) => {
    rows.push({
      novel_id: novelId,
      chapter_id: null,
      asset_type: 'audio',
      label: `Default Track ${idx + 1}`,
      asset_key: 'default',
      url,
      mime_type: 'audio/mpeg',
    });
  });

  (Object.keys(audioMap) as BgmKey[]).forEach((key) => {
    if (key === 'default') return;
    rows.push({
      novel_id: novelId,
      chapter_id: null,
      asset_type: 'audio',
      label: `BGM — ${key}`,
      asset_key: key,
      url: audioMap[key],
      mime_type: 'audio/mpeg',
    });
  });

  return rows;
}
