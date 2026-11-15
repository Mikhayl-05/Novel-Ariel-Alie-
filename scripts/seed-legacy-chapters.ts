/**
 * Idempotent CLI seed/import script for Supabase:
 *   1. Upserts the primary novel ("Selamanya Itu Lama Banget").
 *   2. Optionally registers an already-created Supabase Auth admin in `admin_users`
 *      if ADMIN_USER_EMAIL is provided.
 *   3. Imports all 118 legacy chapters (preserving legacy_id, legacy_index, sort_order,
 *      metadata, BGM, VFX, and structured Tiptap JSONB + HTML) and publishes them to
 *      `chapter_publications` + initial `chapter_revisions`.
 *   4. Registers legacy audio assets in `chapter_assets`.
 *
 * Usage:
 *   VITE_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/seed-legacy-chapters.ts
 */

import { createClient } from '@supabase/supabase-js';
import {
  buildAllLegacyChapterRows,
  buildDefaultNovelPayload,
  buildLegacyAudioAssetRows,
} from '../src/studio/utils/legacyImport';

async function main() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const adminEmail = process.env.ADMIN_USER_EMAIL?.trim().toLowerCase();

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      'Missing required env vars: VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.',
    );
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (adminEmail) {
    const { data: usersData, error: usersErr } = await supabase.auth.admin.listUsers();
    if (usersErr) {
      throw new Error(`Failed to query auth.users: ${usersErr.message}`);
    }
    const adminAuthUser = usersData.users.find(
      (u) => (u.email || '').toLowerCase() === adminEmail,
    );
    if (!adminAuthUser) {
      console.warn(
        `Warning: No Supabase Auth user found with email ${adminEmail}. Create the user in Supabase Auth first, then re-run.`,
      );
    } else {
      const { error: adminInsertErr } = await supabase.from('admin_users').upsert(
        {
          user_id: adminAuthUser.id,
          email: adminEmail,
          display_name: adminAuthUser.user_metadata?.full_name ?? 'Admin',
          role: 'super_admin',
          is_active: true,
        },
        { onConflict: 'user_id' },
      );
      if (adminInsertErr) {
        throw new Error(`Failed to upsert admin_users: ${adminInsertErr.message}`);
      }
      console.log(`Admin allowlist synced for ${adminEmail} (${adminAuthUser.id}).`);
    }
  }

  const novelPayload = buildDefaultNovelPayload();
  const { data: novelRow, error: novelErr } = await supabase
    .from('novels')
    .upsert(novelPayload, { onConflict: 'slug' })
    .select('*')
    .single();

  if (novelErr || !novelRow) {
    throw new Error(`Failed to upsert novel: ${novelErr?.message}`);
  }
  console.log(`Novel ready: ${novelRow.title} (${novelRow.id})`);

  const chapterRows = buildAllLegacyChapterRows(novelRow.id);
  const nowIso = new Date().toISOString();

  const payloadWithPublishedAt = chapterRows.map((row) => ({
    ...row,
    published_at: nowIso,
  }));

  const { data: insertedChapters, error: chapErr } = await supabase
    .from('chapters')
    .upsert(payloadWithPublishedAt, { onConflict: 'legacy_id' })
    .select('*');

  if (chapErr || !insertedChapters) {
    throw new Error(`Failed to upsert chapters: ${chapErr?.message}`);
  }

  const publicationRows = insertedChapters.map((ch) => ({
    chapter_id: ch.id,
    novel_id: ch.novel_id,
    legacy_id: ch.legacy_id,
    legacy_index: ch.legacy_index,
    sort_order: ch.sort_order,
    num: ch.num,
    title: ch.title,
    setting: ch.setting,
    feeling: ch.feeling,
    is_prologue: ch.is_prologue,
    is_ending: ch.is_ending,
    content_html: ch.published_html ?? ch.draft_html,
    content_doc: ch.published_doc ?? ch.draft_doc,
    bgm: ch.published_bgm ?? ch.draft_bgm,
    bgm_volume: ch.published_bgm_volume ?? ch.draft_bgm_volume,
    bgm_loop: ch.published_bgm_loop ?? ch.draft_bgm_loop,
    effect: ch.published_effect ?? ch.draft_effect,
    vfx_trigger: ch.published_vfx_trigger ?? ch.draft_vfx_trigger,
    vfx_duration_ms: ch.published_vfx_duration_ms ?? ch.draft_vfx_duration_ms,
    metadata: ch.published_metadata ?? ch.draft_metadata,
    published_version: ch.published_version,
    published_at: ch.published_at ?? nowIso,
    is_published: true,
  }));

  const { error: pubErr } = await supabase
    .from('chapter_publications')
    .upsert(publicationRows, { onConflict: 'chapter_id' });

  if (pubErr) {
    throw new Error(`Failed to upsert chapter_publications: ${pubErr.message}`);
  }

  // Ensure initial 'import' revision exists for each chapter
  const { data: existingRevs } = await supabase
    .from('chapter_revisions')
    .select('chapter_id')
    .in(
      'chapter_id',
      insertedChapters.map((c) => c.id),
    );
  const chaptersWithRev = new Set((existingRevs || []).map((r) => r.chapter_id));
  const missingRevs = insertedChapters
    .filter((c) => !chaptersWithRev.has(c.id))
    .map((c) => ({
      chapter_id: c.id,
      revision_number: 1,
      revision_kind: 'import',
      num: c.num,
      title: c.title,
      setting: c.setting,
      feeling: c.feeling,
      doc_json: c.draft_doc,
      html_snapshot: c.draft_html,
      audio_vfx_snapshot: {
        bgm: c.draft_bgm,
        bgm_volume: c.draft_bgm_volume,
        bgm_loop: c.draft_bgm_loop,
        effect: c.draft_effect,
        vfx_trigger: c.draft_vfx_trigger,
        vfx_duration_ms: c.draft_vfx_duration_ms,
      },
    }));

  if (missingRevs.length > 0) {
    const { error: revErr } = await supabase
      .from('chapter_revisions')
      .insert(missingRevs);
    if (revErr) {
      throw new Error(`Failed to insert initial revisions: ${revErr.message}`);
    }
  }

  // Sync audio assets if none exist yet for this novel
  const { count: existingAssetCount } = await supabase
    .from('chapter_assets')
    .select('id', { count: 'exact', head: true })
    .eq('novel_id', novelRow.id);

  if (!existingAssetCount || existingAssetCount === 0) {
    const assets = buildLegacyAudioAssetRows(novelRow.id);
    const { error: assetErr } = await supabase.from('chapter_assets').insert(assets);
    if (assetErr) {
      throw new Error(`Failed to insert chapter_assets: ${assetErr.message}`);
    }
  }

  console.log(
    `Successfully verified/imported ${insertedChapters.length} chapters into Supabase.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
