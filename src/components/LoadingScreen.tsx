import { useEffect, useRef, useState } from 'react';
import { getAllPreloadAudioUrls } from '../data/audioMap';

const LOADING_MESSAGES = [
  'Membuka halaman...',
  'Menyiapkan musik latar...',
  'Memuat kenangan Ariel & Alie...',
  'Menyusun bab per bab...',
  'Menyalakan lampu baca...',
  'Hampir siap...',
] as const;

interface LoadingScreenProps {
  onOpenStory: () => void;
}

export function LoadingScreen({ onOpenStory }: LoadingScreenProps) {
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState<string>(LOADING_MESSAGES[0]);
  const [statusFading, setStatusFading] = useState(false);
  const [quoteVisible, setQuoteVisible] = useState(false);
  const [buttonDisplay, setButtonDisplay] = useState(false);
  const [buttonVisible, setButtonVisible] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [removed, setRemoved] = useState(false);

  const openClickedRef = useRef(false);

  useEffect(() => {
    const audioUrls = getAllPreloadAudioUrls();
    const total = audioUrls.length;
    let loaded = 0;
    let msgIdx = 0;
    let allLoadedCalled = false;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    const schedule = (fn: () => void, ms: number) => {
      const id = setTimeout(() => {
        if (!cancelled) fn();
      }, ms);
      timers.push(id);
      return id;
    };

    const advanceMessage = (percent: number) => {
      const idx = Math.min(
        Math.floor(percent / 18),
        LOADING_MESSAGES.length - 1,
      );
      if (idx !== msgIdx) {
        msgIdx = idx;
        setStatusFading(true);
        schedule(() => {
          setStatusText(LOADING_MESSAGES[msgIdx]);
          setStatusFading(false);
        }, 180);
      }
    };

    const onAllLoaded = () => {
      if (allLoadedCalled || cancelled) return;
      allLoadedCalled = true;
      setProgress(100);
      setStatusFading(true);
      schedule(() => {
        setStatusText('Semua aset dimuat — kisah siap dibuka.');
        setStatusFading(false);
      }, 200);

      schedule(() => {
        setQuoteVisible(true);
      }, 500);

      schedule(() => {
        setButtonDisplay(true);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (!cancelled) setButtonVisible(true);
          });
        });
      }, 900);
    };

    const onProgress = () => {
      if (cancelled) return;
      loaded += 1;
      const pct = Math.min(Math.round((loaded / total) * 100), 100);
      setProgress(pct);
      advanceMessage(pct);
      if (loaded >= total) {
        onAllLoaded();
      }
    };

    if (total === 0) {
      onAllLoaded();
      return () => {
        cancelled = true;
        timers.forEach(clearTimeout);
      };
    }

    audioUrls.forEach((url) => {
      if (!url) {
        onProgress();
        return;
      }

      let called = false;
      const done = () => {
        if (called) return;
        called = true;
        onProgress();
      };

      const timeout = schedule(done, 1500);

      try {
        fetch(url)
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.arrayBuffer();
          })
          .then(() => {
            const a = new Audio();
            a.preload = 'auto';
            a.src = url;
            clearTimeout(timeout);
            done();
          })
          .catch(() => {
            clearTimeout(timeout);
            done();
          });
      } catch (err) {
        console.warn('[Audio Preload] Fetch error:', err);
        clearTimeout(timeout);
        done();
      }
    });

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, []);

  const handleOpenClick = () => {
    if (openClickedRef.current) return;
    openClickedRef.current = true;
    setDismissing(true);
    onOpenStory();
    setTimeout(() => {
      setRemoved(true);
    }, 800);
  };

  if (removed) return null;

  return (
    <div
      id="loading-screen"
      className={dismissing ? 'hidden' : undefined}
    >
      <div className="loading-ornament">✦</div>
      <h1 className="loading-title">Selamanya Itu Lama Banget</h1>
      <p className="loading-subtitle">Memuat kisah Ariel &amp; Alie</p>

      <div className="loading-bar-wrap">
        <div
          className="loading-bar-fill"
          id="loading-bar"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p
        className="loading-status"
        id="loading-status"
        style={{ opacity: statusFading ? 0 : 1 }}
      >
        {statusText}
      </p>

      <button
        id="open-story-btn"
        type="button"
        className={buttonVisible ? 'visible' : undefined}
        style={{ display: buttonDisplay ? 'block' : 'none' }}
        onClick={handleOpenClick}
      >
        ✦ &nbsp;Membuka Kisah
      </button>

      <p
        className={`loading-quote${quoteVisible ? ' visible' : ''}`}
        id="loading-quote"
      >
        &quot;Selamanya memang lama.
        <br />
        Tapi tidak apa-apa.
        <br />
        Ia sudah terbiasa menunggu dengan caranya sendiri.&quot;
      </p>
    </div>
  );
}
