import { useEffect, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  BookPlus,
  CheckCircle2,
  Download,
  Keyboard,
  Link as LinkIcon,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import type {
  ConflictPayload,
  DocumentMetrics,
  StudioChapter,
} from '../types/studio';
import { validateChapterForPublish } from '../utils/novelContentCodec';

export function ConflictBanner({
  conflict,
  onUseServer,
  onKeepMine,
  onDismiss,
}: {
  conflict: ConflictPayload;
  onUseServer: () => Promise<void>;
  onKeepMine: () => Promise<unknown>;
  onDismiss: () => void;
}) {
  return (
    <div className="studio-conflict-banner" role="alert">
      <div className="studio-conflict-info">
        <AlertTriangle size={16} />
        <span>
          <strong>Konflik Sinkronisasi Terdeteksi:</strong> Versi server (v
          {conflict.serverVersion}) lebih baru daripada dasar edit Anda (v
          {conflict.localVersion}). Pilih tindakan agar tidak ada naskah yang
          hilang.
        </span>
      </div>
      <div className="studio-conflict-actions">
        <button
          type="button"
          className="studio-btn studio-btn-secondary studio-btn-sm"
          onClick={() => void onUseServer()}
        >
          Muat Versi Server
        </button>
        <button
          type="button"
          className="studio-btn studio-btn-primary studio-btn-sm"
          onClick={() => void onKeepMine()}
        >
          Pertahankan Versi Saya
        </button>
        <button
          type="button"
          className="studio-icon-btn"
          aria-label="Tutup peringatan konflik"
          onClick={onDismiss}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

export function PublishModal({
  open,
  chapter,
  publishing,
  onConfirmPublish,
  onClose,
}: {
  open: boolean;
  chapter: StudioChapter | null;
  publishing: boolean;
  onConfirmPublish: () => Promise<void>;
  onClose: () => void;
}) {
  if (!open || !chapter) return null;
  const validation = validateChapterForPublish(chapter);

  return (
    <div className="studio-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="pub-modal-title">
      <div className="studio-modal-card studio-allow-select">
        <div className="studio-modal-head">
          <h2 id="pub-modal-title">
            <UploadCloud size={18} /> Publikasikan Bab ke Reader Publik
          </h2>
          <button type="button" className="studio-icon-btn" aria-label="Tutup" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="studio-modal-body">
          <p className="studio-modal-lead">
            <strong>
              {chapter.num} — {chapter.title}
            </strong>
          </p>
          <p className="studio-modal-sub">
            Tindakan ini akan menyalin isi draft, metadata, musik latar (BGM:
            <code> {chapter.draftBgm}</code>), dan VFX (
            <code>{chapter.draftEffect}</code>) ke snapshot publik{' '}
            <code>chapter_publications</code> secara atomik. Editan draft Anda
            setelah ini tidak akan mengubah tampilan pembaca hingga Anda menekan
            Publikasikan lagi.
          </p>

          {!validation.valid ? (
            <div className="studio-auth-notice error">
              <AlertTriangle size={16} />
              <div>
                <strong>Validasi Publikasi Gagal:</strong>
                <ul className="studio-modal-err-list">
                  {validation.errors.map((err) => (
                    <li key={err}>{err}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <div className="studio-auth-notice ok">
              <CheckCircle2 size={16} />
              <span>
                Naskah valid dan siap dipublikasikan ke semua pembaca publik.
              </span>
            </div>
          )}
        </div>

        <div className="studio-modal-foot">
          <button
            type="button"
            className="studio-btn studio-btn-secondary"
            onClick={onClose}
            disabled={publishing}
          >
            Batal
          </button>
          <button
            type="button"
            className="studio-btn studio-btn-primary"
            disabled={!validation.valid || publishing}
            onClick={() => void onConfirmPublish()}
          >
            <UploadCloud size={15} />
            <span>{publishing ? 'Memublikasikan…' : 'Konfirmasi & Publikasikan'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function DeleteChapterModal({
  chapter,
  deleting,
  onConfirmDelete,
  onClose,
}: {
  chapter: StudioChapter | null;
  deleting: boolean;
  onConfirmDelete: (chapter: StudioChapter) => Promise<void>;
  onClose: () => void;
}) {
  if (!chapter) return null;

  return (
    <div className="studio-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="del-modal-title">
      <div className="studio-modal-card studio-allow-select">
        <div className="studio-modal-head">
          <h2 id="del-modal-title">
            <Trash2 size={18} /> Hapus Bab Permanen?
          </h2>
          <button type="button" className="studio-icon-btn" aria-label="Tutup" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="studio-modal-body">
          <p className="studio-modal-sub">
            Anda akan menghapus bab{' '}
            <strong>
              {chapter.num} — {chapter.title}
            </strong>{' '}
            beserta seluruh riwayat revisi dan snapshot publikasinya. Jika hanya
            ingin menyembunyikan dari editor dan pembaca, gunakan{' '}
            <strong>Arsipkan Bab</strong>.
          </p>
        </div>
        <div className="studio-modal-foot">
          <button
            type="button"
            className="studio-btn studio-btn-secondary"
            onClick={onClose}
            disabled={deleting}
          >
            Batal
          </button>
          <button
            type="button"
            className="studio-btn studio-btn-danger"
            disabled={deleting}
            onClick={() => void onConfirmDelete(chapter)}
          >
            <Trash2 size={15} />
            <span>{deleting ? 'Menghapus…' : 'Hapus Permanen'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function NewNovelModal({
  open,
  busy,
  onCreateNovel,
  onClose,
}: {
  open: boolean;
  busy: boolean;
  onCreateNovel: (input: {
    title: string;
    subtitle: string;
    authorName: string;
    synopsis: string;
  }) => Promise<void>;
  onClose: () => void;
}) {
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [synopsis, setSynopsis] = useState('');

  if (!open) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    await onCreateNovel({ title, subtitle, authorName, synopsis });
    setTitle('');
    setSubtitle('');
    setAuthorName('');
    setSynopsis('');
  };

  return (
    <div className="studio-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="novel-modal-title">
      <div className="studio-modal-card studio-allow-select">
        <div className="studio-modal-head">
          <h2 id="novel-modal-title">
            <BookPlus size={18} /> Buat Novel Baru
          </h2>
          <button type="button" className="studio-icon-btn" aria-label="Tutup" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <form onSubmit={(e) => void handleSubmit(e)}>
          <div className="studio-modal-body studio-modal-form">
            <div className="studio-field">
              <label htmlFor="new-novel-title">Judul Novel</label>
              <input
                id="new-novel-title"
                type="text"
                required
                placeholder="Mis. Selamanya Itu Lama Banget — Sekuel"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="studio-field">
              <label htmlFor="new-novel-subtitle">Subjudul</label>
              <input
                id="new-novel-subtitle"
                type="text"
                placeholder="Subjudul novel (opsional)"
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
              />
            </div>
            <div className="studio-field">
              <label htmlFor="new-novel-author">Nama Penulis</label>
              <input
                id="new-novel-author"
                type="text"
                placeholder="Nama penulis"
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
              />
            </div>
            <div className="studio-field">
              <label htmlFor="new-novel-synopsis">Sinopsis Singkat</label>
              <textarea
                id="new-novel-synopsis"
                rows={3}
                value={synopsis}
                onChange={(e) => setSynopsis(e.target.value)}
              />
            </div>
          </div>
          <div className="studio-modal-foot">
            <button
              type="button"
              className="studio-btn studio-btn-secondary"
              onClick={onClose}
            >
              Batal
            </button>
            <button
              type="submit"
              className="studio-btn studio-btn-primary"
              disabled={busy || !title.trim()}
            >
              {busy ? 'Membuat…' : 'Buat Novel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function InsertLinkModal({
  open,
  initialHref,
  onApplyLink,
  onRemoveLink,
  onClose,
}: {
  open: boolean;
  initialHref: string;
  onApplyLink: (href: string) => void;
  onRemoveLink: () => void;
  onClose: () => void;
}) {
  const [href, setHref] = useState(initialHref);

  useEffect(() => {
    if (open) setHref(initialHref);
  }, [open, initialHref]);

  if (!open) return null;

  return (
    <div className="studio-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="link-modal-title">
      <div className="studio-modal-card studio-modal-sm studio-allow-select">
        <div className="studio-modal-head">
          <h2 id="link-modal-title">
            <LinkIcon size={17} /> Sisipkan / Edit Tautan
          </h2>
          <button type="button" className="studio-icon-btn" aria-label="Tutup" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (href.trim()) onApplyLink(href.trim());
          }}
        >
          <div className="studio-modal-body">
            <div className="studio-field">
              <label htmlFor="studio-link-href">URL Tujuan</label>
              <input
                id="studio-link-href"
                type="url"
                autoFocus
                placeholder="https://..."
                value={href}
                onChange={(e) => setHref(e.target.value)}
              />
            </div>
          </div>
          <div className="studio-modal-foot">
            {initialHref && (
              <button
                type="button"
                className="studio-btn studio-btn-secondary"
                onClick={onRemoveLink}
              >
                Hapus Link
              </button>
            )}
            <button
              type="button"
              className="studio-btn studio-btn-secondary"
              onClick={onClose}
            >
              Batal
            </button>
            <button type="submit" className="studio-btn studio-btn-primary">
              Terapkan
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function WordCountModal({
  open,
  metrics,
  onClose,
}: {
  open: boolean;
  metrics: DocumentMetrics;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="studio-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="wc-modal-title">
      <div className="studio-modal-card studio-modal-sm studio-allow-select">
        <div className="studio-modal-head">
          <h2 id="wc-modal-title">Statistik Dokumen Bab Ini</h2>
          <button type="button" className="studio-icon-btn" aria-label="Tutup" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="studio-modal-body">
          <dl className="studio-stats-grid">
            <div>
              <dt>Jumlah Kata</dt>
              <dd className="tabular-nums">{metrics.wordCount.toLocaleString('id-ID')}</dd>
            </div>
            <div>
              <dt>Jumlah Halaman</dt>
              <dd className="tabular-nums">{metrics.pageCount.toLocaleString('id-ID')}</dd>
            </div>
            <div>
              <dt>Karakter (dengan spasi)</dt>
              <dd className="tabular-nums">{metrics.characterCount.toLocaleString('id-ID')}</dd>
            </div>
            <div>
              <dt>Karakter (tanpa spasi)</dt>
              <dd className="tabular-nums">
                {metrics.characterCountNoSpaces.toLocaleString('id-ID')}
              </dd>
            </div>
            <div>
              <dt>Paragraf &amp; Monolog</dt>
              <dd className="tabular-nums">{metrics.paragraphCount.toLocaleString('id-ID')}</dd>
            </div>
            <div>
              <dt>Blok Dialog</dt>
              <dd className="tabular-nums">{metrics.dialogueCount.toLocaleString('id-ID')}</dd>
            </div>
          </dl>
        </div>
        <div className="studio-modal-foot">
          <button type="button" className="studio-btn studio-btn-primary" onClick={onClose}>
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}

export function ShortcutsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;

  const rows: Array<[string, string]> = [
    ['/ (Garis Miring)', 'Buka menu cepat sisipkan Dialog, Blok, Gambar, atau Format'],
    ['Ctrl / Cmd + Z', 'Undo'],
    ['Ctrl / Cmd + Y atau Shift+Z', 'Redo'],
    ['Ctrl / Cmd + B', 'Tebal (Bold)'],
    ['Ctrl / Cmd + I', 'Miring (Italic)'],
    ['Ctrl / Cmd + U', 'Garis Bawah (Underline)'],
    ['Ctrl / Cmd + Shift + X', 'Coret (Strikethrough)'],
    ['Ctrl / Cmd + K', 'Sisipkan / Edit Tautan'],
    ['Ctrl / Cmd + A', 'Pilih Semua Isi Bab'],
    ['Ctrl / Cmd + S', 'Simpan Draft Sekarang'],
    ['Ctrl / Cmd + Enter', 'Sisipkan Page Break'],
  ];

  return (
    <div className="studio-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="sc-modal-title">
      <div className="studio-modal-card studio-allow-select">
        <div className="studio-modal-head">
          <h2 id="sc-modal-title">
            <Keyboard size={18} /> Pintasan Keyboard Novel Studio
          </h2>
          <button type="button" className="studio-icon-btn" aria-label="Tutup" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="studio-modal-body">
          <table className="studio-shortcuts-table">
            <tbody>
              {rows.map(([keys, desc]) => (
                <tr key={keys}>
                  <td>
                    <kbd>{keys}</kbd>
                  </td>
                  <td>{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="studio-modal-foot">
          <button type="button" className="studio-btn studio-btn-primary" onClick={onClose}>
            Mengerti
          </button>
        </div>
      </div>
    </div>
  );
}

export function ImportLegacyModal({
  open,
  importing,
  onConfirmImport,
  onClose,
}: {
  open: boolean;
  importing: boolean;
  onConfirmImport: () => Promise<void>;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="studio-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="imp-modal-title">
      <div className="studio-modal-card studio-allow-select">
        <div className="studio-modal-head">
          <h2 id="imp-modal-title">
            <Download size={18} /> Impor 118 Chapter Bawaan ke Supabase
          </h2>
          <button type="button" className="studio-icon-btn" aria-label="Tutup" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="studio-modal-body">
          <p className="studio-modal-sub">
            Proses ini akan mengonversi seluruh 118 bab novel &ldquo;Selamanya Itu
            Lama Banget&rdquo; ke format JSONB Tiptap, menyimpannya sebagai
            record <code>chapters</code> + snapshot <code>chapter_publications</code>{' '}
            dengan mempertahankan <code>legacy_id</code> dan seluruh BGM/VFX.
            Operasi ini idempoten (aman dijalankan ulang tanpa duplikasi).
          </p>
        </div>
        <div className="studio-modal-foot">
          <button
            type="button"
            className="studio-btn studio-btn-secondary"
            onClick={onClose}
            disabled={importing}
          >
            Batal
          </button>
          <button
            type="button"
            className="studio-btn studio-btn-primary"
            disabled={importing}
            onClick={() => void onConfirmImport()}
          >
            <Download size={15} />
            <span>{importing ? 'Mengimpor 118 Chapter…' : 'Mulai Impor 118 Bab'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
