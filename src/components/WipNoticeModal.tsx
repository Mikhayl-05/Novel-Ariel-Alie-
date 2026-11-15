interface WipNoticeModalProps {
  visible: boolean;
  onAcknowledge: () => void;
  onDismissSession: () => void;
}

export function WipNoticeModal({
  visible,
  onAcknowledge,
  onDismissSession,
}: WipNoticeModalProps) {
  return (
    <div
      id="wip-popup-overlay"
      className={visible ? 'visible' : undefined}
      role="dialog"
      aria-modal="true"
      aria-label="Pemberitahuan Pengerjaan"
    >
      <div id="wip-popup-box">
        <div id="wip-popup-icon">✍️</div>
        <p id="wip-popup-title">Catatan untuk Pembaca</p>
        <p id="wip-popup-body">
          Bab <strong>LXXVIII hingga CX</strong> saat ini masih dalam masa
          pengerjaan.
          <br />
          <br />
          Mohon maaf bila ada <em>typo</em>, alur yang terasa belum sempurna,
          atau detail yang belum konsisten — semuanya masih dalam proses
          penyempurnaan. Terima kasih atas pengertian dan kesabarannya. ✦
        </p>
        <hr id="wip-popup-rule" />
        <div id="wip-popup-actions">
          <button
            type="button"
            className="wip-btn wip-btn-primary"
            id="wip-btn-mengerti"
            onClick={onAcknowledge}
          >
            Mengerti
          </button>
          <button
            type="button"
            className="wip-btn wip-btn-secondary"
            id="wip-btn-tutup"
            onClick={onDismissSession}
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
