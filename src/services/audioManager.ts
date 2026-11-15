import { audioMap, getAudioSrcForKey } from '../data/audioMap';
import type { BgmKey } from '../types/novel';

type MuteListener = (isMuted: boolean) => void;

export interface PlayBgmOptions {
  volume?: number;
  loop?: boolean;
  restart?: boolean;
}

class AudioManagerService {
  private audio: HTMLAudioElement | null = null;
  private previewAudio: HTMLAudioElement | null = null;
  private currentKey: BgmKey | null = null;
  private defPlaylist: string[] = [];
  private defIdx = 0;
  private fadeTimer: ReturnType<typeof setInterval> | null = null;
  private muteListeners = new Set<MuteListener>();
  private initialized = false;
  private activeTargetVol = 0.42;
  private activeLoop = true;

  public isMuted = false;
  public readonly TARGET_VOL = 0.42;

  public init(): void {
    if (this.initialized || typeof Audio === 'undefined') return;
    this.initialized = true;
    this.audio = new Audio();
    this.audio.volume = 0;
    this.buildDefaultPlaylist();

    this.audio.addEventListener('ended', () => {
      if (!this.audio) return;
      if (!this.activeLoop) {
        return;
      }
      if (this.currentKey === 'default') {
        this.defIdx = (this.defIdx + 1) % this.defPlaylist.length;
        this.audio.src = this.defPlaylist[this.defIdx];
        this.audio.play().catch(() => {});
        if (!this.isMuted) this.fadeIn();
      } else {
        this.audio.currentTime = 0;
        this.audio.play().catch(() => {});
        if (!this.isMuted) this.fadeIn();
      }
    });
  }

  public buildDefaultPlaylist(shuffleTail = true): string[] {
    const [first, ...rest] = [...audioMap.default];
    if (shuffleTail) {
      for (let i = rest.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rest[i], rest[j]] = [rest[j], rest[i]];
      }
    }
    this.defPlaylist = [first, ...rest];
    this.defIdx = 0;
    return this.defPlaylist;
  }

  public getCurrentKey(): BgmKey | null {
    return this.currentKey;
  }

  private clearFadeTimer(): void {
    if (this.fadeTimer !== null) {
      clearInterval(this.fadeTimer);
      this.fadeTimer = null;
    }
  }

  private fadeIn(cb?: () => void): void {
    if (!this.audio) return;
    this.clearFadeTimer();
    const target = this.isMuted ? 0 : this.activeTargetVol;
    this.fadeTimer = setInterval(() => {
      if (!this.audio) {
        this.clearFadeTimer();
        return;
      }
      const v = Math.min(this.audio.volume + 0.035, target);
      this.audio.volume = v;
      if (v >= target) {
        this.clearFadeTimer();
        if (cb) cb();
      }
    }, 65);
  }

  private fadeOut(cb?: () => void): void {
    if (!this.audio) return;
    this.clearFadeTimer();
    this.fadeTimer = setInterval(() => {
      if (!this.audio) {
        this.clearFadeTimer();
        return;
      }
      const v = Math.max(this.audio.volume - 0.035, 0);
      this.audio.volume = v;
      if (v <= 0) {
        this.clearFadeTimer();
        this.audio.pause();
        if (cb) cb();
      }
    }, 65);
  }

  public play(key?: BgmKey | null, options?: PlayBgmOptions): void {
    this.init();
    const k: BgmKey = key || 'default';
    if (!this.audio) return;

    const requestedVol =
      typeof options?.volume === 'number'
        ? Math.max(0, Math.min(1, options.volume))
        : this.TARGET_VOL;
    const requestedLoop =
      typeof options?.loop === 'boolean' ? options.loop : true;

    this.activeTargetVol = requestedVol;
    this.activeLoop = requestedLoop;

    // Estafet: keep playing without restart if same BGM key is already playing
    if (!options?.restart && k === this.currentKey && !this.audio.paused) {
      if (!this.isMuted) {
        this.audio.volume = requestedVol;
      }
      return;
    }

    const doLoad = () => {
      if (!this.audio) return;
      this.currentKey = k;
      if (k === 'default') {
        this.audio.src = this.defPlaylist[this.defIdx] ?? '';
      } else {
        this.audio.src = audioMap[k] || '';
      }
      if (!this.audio.src) return;
      this.audio.volume = 0;
      this.audio.load();
      const playPromise = this.audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn('[AudioManager] play() gagal:', msg);
        });
      }
      if (!this.isMuted) this.fadeIn();
    };

    if (!this.audio.paused) {
      this.fadeOut(doLoad);
    } else {
      doLoad();
    }
  }

  public stop(): void {
    if (!this.audio) return;
    this.clearFadeTimer();
    this.audio.pause();
    this.audio.currentTime = 0;
    this.currentKey = null;
  }

  public playPreview(keyOrUrl: BgmKey | string, volume = 0.5, loop = true): void {
    if (typeof Audio === 'undefined') return;
    this.stopPreview();
    const src =
      keyOrUrl in audioMap || keyOrUrl === 'default'
        ? getAudioSrcForKey(keyOrUrl as BgmKey)
        : keyOrUrl;
    if (!src) return;
    const preview = new Audio(src);
    preview.volume = Math.max(0, Math.min(1, volume));
    preview.loop = loop;
    this.previewAudio = preview;
    preview.play().catch(() => {});
  }

  public stopPreview(): void {
    if (!this.previewAudio) return;
    this.previewAudio.pause();
    this.previewAudio.currentTime = 0;
    this.previewAudio = null;
  }

  public playSfx(url: string, volume = 0.7): void {
    if (typeof Audio === 'undefined' || !url || this.isMuted) return;
    const sfx = new Audio(url);
    sfx.volume = Math.max(0, Math.min(1, volume));
    sfx.play().catch(() => {});
  }

  public toggleMute(): boolean {
    this.init();
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      this.fadeOut();
    } else {
      if (this.audio && this.audio.paused && this.currentKey) {
        this.audio.play().catch(() => {});
      }
      this.fadeIn();
    }
    for (const listener of this.muteListeners) {
      listener(this.isMuted);
    }
    return this.isMuted;
  }

  public subscribeMute(listener: MuteListener): () => void {
    this.muteListeners.add(listener);
    return () => {
      this.muteListeners.delete(listener);
    };
  }
}

export const audioManager = new AudioManagerService();
