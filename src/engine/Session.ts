import { pickMime, type MimeChoice } from './mime';
import type { Overlay } from '../lib/overlay';

export type Surface = 'window' | 'browser' | 'monitor' | 'unknown';
export type MicStatus = 'pending' | 'ok' | 'denied' | 'none' | 'error';
export type CameraFailure = 'denied' | 'none' | 'busy' | 'error';
export type CameraResult = { ok: true; aspect: number } | { ok: false; reason: CameraFailure };
export type StartResult = 'ok' | 'mime' | 'error';

export interface RecordingResult {
  blob: Blob;
  mime: MimeChoice;
  durationMs: number;
  /** The recorder reported an error; the blob holds whatever was captured before it. */
  failed: boolean;
  /** Name of the file the recording was streamed to, or null if it was kept in memory. */
  savedTo: string | null;
}

export interface SessionEvents {
  /** The user ended sharing from the browser's own UI. */
  onDisplayEnded: () => void;
  /** The MediaRecorder hit an error and can't continue. */
  onRecorderFailed: () => void;
  /** Elapsed recording time changed to a new whole second. */
  onSecond: (seconds: number) => void;
}

const SNAP_MS = 240;
const FALLBACK_MIME: MimeChoice = { type: 'video/webm', container: 'video/webm', ext: 'webm' };

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

function errorName(error: unknown): string {
  return error && typeof error === 'object' && 'name' in error ? String((error as { name: unknown }).name) : '';
}

/** A muted, inline <video> kept in the DOM (off to the side) so it keeps decoding frames in background tabs. */
function hiddenVideo(stream: MediaStream): HTMLVideoElement {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  video.className = 'offscreen-video';
  video.setAttribute('aria-hidden', 'true');
  video.srcObject = stream;
  document.body.appendChild(video);
  void video.play().catch(() => undefined);
  return video;
}

function waitForMetadata(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve) => {
    if (video.readyState >= 1 && video.videoWidth > 0) {
      resolve();
      return;
    }
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener('loadedmetadata', done);
      resolve();
    };
    video.addEventListener('loadedmetadata', done);
    window.setTimeout(done, 3000);
  });
}

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/**
 * One screen-sharing session: owns every stream, the audio graph, the
 * compositing canvas, the tick worker and the MediaRecorder. Lives from the
 * moment sharing is granted until dispose().
 */
export class Session {
  readonly canvas: HTMLCanvasElement;
  readonly width: number;
  readonly height: number;
  readonly surface: Surface;
  readonly hasDisplayAudio: boolean;

  private readonly ctx: CanvasRenderingContext2D;
  private readonly display: MediaStream;
  private readonly screenVideo: HTMLVideoElement;
  private readonly audio: AudioContext | null;
  private readonly dest: MediaStreamAudioDestinationNode | null;
  private readonly micGain: GainNode | null;
  private readonly events: SessionEvents;

  private worker: Worker | null = null;
  private fallbackTimer: number | null = null;

  private camStream: MediaStream | null = null;
  private camVideo: HTMLVideoElement | null = null;
  private camPromise: Promise<CameraResult> | null = null;
  private camVisible = false;
  private camAspect = 16 / 9;

  private micStream: MediaStream | null = null;
  private micPromise: Promise<MicStatus> | null = null;

  private target: Overlay;
  private snap: { from: Overlay; start: number } | null = null;

  private recorder: MediaRecorder | null = null;
  private recordTrack: MediaStreamTrack | null = null;
  private chunks: Blob[] = [];
  /** When set, chunks go straight to this file instead of memory. */
  private sink: {
    handle: FileSystemFileHandle;
    writable: FileSystemWritableFileStream;
    chain: Promise<void>;
  } | null = null;
  private mime: MimeChoice | null = null;
  private failed = false;
  private stopPromise: Promise<RecordingResult> | null = null;

  private countdown: {
    end: number;
    last: number;
    onCount: (secondsLeft: number) => void;
    onDone: (result: StartResult) => void;
  } | null = null;

  private accumulatedMs = 0;
  private segmentStart = 0;
  private running = false;
  private lastSecond = -1;
  private disposed = false;

  private readonly handleDisplayEnded = () => {
    if (!this.disposed) this.events.onDisplayEnded();
  };

  constructor(display: MediaStream, audio: AudioContext | null, overlay: Overlay, events: SessionEvents) {
    this.display = display;
    this.audio = audio;
    this.events = events;
    this.target = overlay;

    const track = display.getVideoTracks()[0];
    const settings = (track ? track.getSettings() : {}) as unknown as {
      width?: number;
      height?: number;
      displaySurface?: string;
    };
    this.width = even(settings.width || 1920);
    this.height = even(settings.height || 1080);
    const surface = settings.displaySurface;
    this.surface = surface === 'window' || surface === 'browser' || surface === 'monitor' ? surface : 'unknown';

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    const ctx = this.canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.width, this.height);

    this.screenVideo = hiddenVideo(display);
    track?.addEventListener('ended', this.handleDisplayEnded);

    const displayAudio = display.getAudioTracks();
    this.hasDisplayAudio = displayAudio.length > 0;
    if (audio) {
      this.dest = audio.createMediaStreamDestination();
      this.micGain = audio.createGain();
      this.micGain.gain.value = 1;
      this.micGain.connect(this.dest);
      if (displayAudio.length > 0) {
        audio.createMediaStreamSource(new MediaStream(displayAudio)).connect(this.dest);
      }
    } else {
      this.dest = null;
      this.micGain = null;
    }

    this.startTicks();
  }

  // ---------- Draw loop ----------

  private startTicks() {
    try {
      this.worker = new Worker(new URL('./tick.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = () => this.draw();
    } catch {
      // Workers unavailable: fall back to a main-thread timer (slower in background tabs).
      this.worker = null;
      this.fallbackTimer = window.setInterval(() => this.draw(), 33);
    }
  }

  private draw() {
    if (this.disposed) return;
    this.tickCountdown();
    this.emitSecond();

    const video = this.screenVideo;
    if (video.readyState < 2 || video.videoWidth === 0) return;

    const { ctx, width: W, height: H } = this;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (vw === W && vh === H) {
      ctx.drawImage(video, 0, 0, W, H);
    } else {
      // The shared window changed size: rescale into the fixed canvas, keeping its proportions.
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      const scale = Math.min(W / vw, H / vh);
      const dw = vw * scale;
      const dh = vh * scale;
      ctx.drawImage(video, (W - dw) / 2, (H - dh) / 2, dw, dh);
    }

    const cam = this.camVideo;
    if (this.camVisible && cam && cam.readyState >= 2 && cam.videoWidth > 0) {
      this.drawCamera(cam);
    }
  }

  private currentOverlay(): Overlay {
    if (!this.snap) return this.target;
    const t = Math.min(1, (performance.now() - this.snap.start) / SNAP_MS);
    const e = 1 - Math.pow(1 - t, 3);
    const from = this.snap.from;
    const to = this.target;
    if (t >= 1) this.snap = null;
    return { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, w: from.w + (to.w - from.w) * e };
  }

  private drawCamera(cam: HTMLVideoElement) {
    const { ctx, width: W, height: H } = this;
    const o = this.currentOverlay();
    const ow = o.w * W;
    const oh = ow / this.camAspect;
    const ox = o.x * W;
    const oy = o.y * H;
    const radius = Math.max(6, ow * 0.045);

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = Math.max(8, ow * 0.06);
    ctx.shadowOffsetY = Math.max(2, ow * 0.015);
    roundRectPath(ctx, ox, oy, ow, oh, radius);
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.restore();

    ctx.save();
    roundRectPath(ctx, ox, oy, ow, oh, radius);
    ctx.clip();
    const cw = cam.videoWidth;
    const ch = cam.videoHeight;
    const scale = Math.max(ow / cw, oh / ch);
    const dw = cw * scale;
    const dh = ch * scale;
    // Mirror like a selfie view.
    ctx.translate(ox + ow, oy);
    ctx.scale(-1, 1);
    ctx.drawImage(cam, (ow - dw) / 2, (oh - dh) / 2, dw, dh);
    ctx.restore();

    ctx.save();
    roundRectPath(ctx, ox, oy, ow, oh, radius);
    ctx.lineWidth = Math.max(2, W / 900);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.stroke();
    ctx.restore();
  }

  private emitSecond() {
    if (!this.recorder) return;
    const seconds = Math.floor(this.elapsedMs() / 1000);
    if (seconds !== this.lastSecond) {
      this.lastSecond = seconds;
      this.events.onSecond(seconds);
    }
  }

  // ---------- Camera ----------

  get hasCamera(): boolean {
    return this.camStream !== null;
  }

  get cameraAspect(): number {
    return this.camAspect;
  }

  /** Requests the camera once per session. Later calls reuse the same stream. */
  enableCamera(): Promise<CameraResult> {
    if (this.camStream) return Promise.resolve({ ok: true, aspect: this.camAspect });
    if (this.camPromise) return this.camPromise;
    const media = navigator.mediaDevices;
    if (!media?.getUserMedia) return Promise.resolve({ ok: false, reason: 'error' });

    this.camPromise = media
      .getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      .then(
        async (stream): Promise<CameraResult> => {
          if (this.disposed) {
            stream.getTracks().forEach((t) => t.stop());
            return { ok: false, reason: 'error' };
          }
          this.camStream = stream;
          const video = hiddenVideo(stream);
          this.camVideo = video;
          await waitForMetadata(video);
          const settings = stream.getVideoTracks()[0]?.getSettings();
          let aspect = 16 / 9;
          if (video.videoWidth > 0 && video.videoHeight > 0) aspect = video.videoWidth / video.videoHeight;
          else if (settings?.width && settings.height) aspect = settings.width / settings.height;
          this.camAspect = aspect;
          return { ok: true, aspect };
        },
        (error: unknown): CameraResult => {
          const name = errorName(error);
          if (name === 'NotAllowedError' || name === 'SecurityError') return { ok: false, reason: 'denied' };
          if (name === 'NotFoundError' || name === 'OverconstrainedError') return { ok: false, reason: 'none' };
          if (name === 'NotReadableError' || name === 'AbortError') return { ok: false, reason: 'busy' };
          return { ok: false, reason: 'error' };
        },
      )
      .finally(() => {
        this.camPromise = null;
      });
    return this.camPromise;
  }

  /** Shows or hides the overlay. Never stops the camera track. */
  setCameraVisible(visible: boolean) {
    this.camVisible = visible && this.camStream !== null;
  }

  setOverlay(overlay: Overlay, animate: boolean) {
    this.snap = animate ? { from: this.currentOverlay(), start: performance.now() } : null;
    this.target = overlay;
  }

  // ---------- Microphone ----------

  enableMic(): Promise<MicStatus> {
    if (this.micStream) return Promise.resolve('ok');
    if (this.micPromise) return this.micPromise;
    const audio = this.audio;
    const gain = this.micGain;
    const media = navigator.mediaDevices;
    if (!audio || !gain || !media?.getUserMedia) return Promise.resolve('error');

    this.micPromise = media
      .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false })
      .then(
        (stream): MicStatus => {
          if (this.disposed) {
            stream.getTracks().forEach((t) => t.stop());
            return 'error';
          }
          this.micStream = stream;
          audio.createMediaStreamSource(stream).connect(gain);
          return 'ok';
        },
        (error: unknown): MicStatus => {
          const name = errorName(error);
          if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
          if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'none';
          return 'error';
        },
      )
      .finally(() => {
        this.micPromise = null;
      });
    return this.micPromise;
  }

  /** Mutes or unmutes the mic in the recording. Never stops the mic track. */
  setMicOn(on: boolean) {
    if (this.audio && this.micGain) this.micGain.gain.setValueAtTime(on ? 1 : 0, this.audio.currentTime);
  }

  // ---------- Recording ----------

  /**
   * Starts recording after a countdown. The countdown runs on the worker ticks,
   * so it stays on time even when this tab is in the background.
   */
  startAfter(ms: number, onCount: (secondsLeft: number) => void, onDone: (result: StartResult) => void): boolean {
    if (this.disposed || this.recorder || this.countdown) return false;
    this.countdown = { end: performance.now() + ms, last: -1, onCount, onDone };
    this.tickCountdown();
    return true;
  }

  cancelCountdown() {
    this.countdown = null;
    this.clearFileSink(true);
  }

  // ---------- Saving to a file while recording ----------

  /** Streams the recording into this file. Must be set before recording starts. */
  setFileSink(handle: FileSystemFileHandle, writable: FileSystemWritableFileStream): boolean {
    if (this.disposed || this.recorder) return false;
    this.clearFileSink(false);
    this.sink = { handle, writable, chain: Promise.resolve() };
    return true;
  }

  get savingTo(): string | null {
    return this.sink?.handle.name ?? null;
  }

  /** Drops the file sink before anything was recorded. Optionally removes the empty file the picker created. */
  private clearFileSink(removeFile: boolean) {
    const sink = this.sink;
    if (!sink || this.recorder) return;
    this.sink = null;
    void sink.writable
      .abort()
      .catch(() => undefined)
      .then(() => {
        const removable = sink.handle as unknown as { remove?: () => Promise<void> };
        return removeFile && removable.remove ? removable.remove() : undefined;
      })
      .catch(() => undefined);
  }

  private tickCountdown() {
    const c = this.countdown;
    if (!c) return;
    const remaining = c.end - performance.now();
    if (remaining <= 0) {
      this.countdown = null;
      c.onDone(this.start());
      return;
    }
    const secondsLeft = Math.ceil(remaining / 1000);
    if (secondsLeft !== c.last) {
      c.last = secondsLeft;
      c.onCount(secondsLeft);
    }
  }

  start(): StartResult {
    if (this.disposed || this.recorder) return 'error';
    const mime = pickMime();
    if (!mime) return 'mime';
    void this.audio?.resume().catch(() => undefined);

    const track = this.canvas.captureStream(30).getVideoTracks()[0];
    if (!track) return 'error';
    const output = new MediaStream([track, ...(this.dest ? this.dest.stream.getAudioTracks() : [])]);

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(output, { mimeType: mime.type, videoBitsPerSecond: 5_000_000 });
    } catch {
      track.stop();
      return 'error';
    }
    this.chunks = [];
    const sink = this.sink;
    recorder.ondataavailable = (event) => {
      if (!event.data || event.data.size === 0) return;
      if (!sink) {
        this.chunks.push(event.data);
        return;
      }
      // Write each one-second chunk to disk, in order.
      const data = event.data;
      sink.chain = sink.chain
        .then(() => sink.writable.write(data))
        .catch(() => {
          if (!this.failed) {
            this.failed = true;
            this.events.onRecorderFailed();
          }
        });
    };
    recorder.onerror = () => {
      this.failed = true;
      this.events.onRecorderFailed();
    };
    try {
      recorder.start(1000);
    } catch {
      track.stop();
      return 'error';
    }

    this.recorder = recorder;
    this.recordTrack = track;
    this.mime = mime;
    this.accumulatedMs = 0;
    this.segmentStart = performance.now();
    this.running = true;
    this.lastSecond = -1;
    this.emitSecond();
    return 'ok';
  }

  pause() {
    if (this.recorder?.state !== 'recording') return;
    this.recorder.pause();
    this.accumulatedMs += performance.now() - this.segmentStart;
    this.running = false;
  }

  resume() {
    if (this.recorder?.state !== 'paused') return;
    this.recorder.resume();
    this.segmentStart = performance.now();
    this.running = true;
  }

  elapsedMs(): number {
    return this.accumulatedMs + (this.running ? performance.now() - this.segmentStart : 0);
  }

  /** Stops recording. The Blob is assembled inside the recorder's onstop handler. */
  stop(): Promise<RecordingResult> {
    if (this.stopPromise) return this.stopPromise;
    const recorder = this.recorder;
    const mime = this.mime ?? FALLBACK_MIME;
    const durationMs = this.elapsedMs();
    this.accumulatedMs = durationMs;
    this.running = false;

    const sink = this.sink;
    this.stopPromise = new Promise<RecordingResult>((resolve) => {
      const assemble = () => {
        if (!sink) {
          resolve({
            blob: new Blob(this.chunks, { type: mime.container }),
            mime,
            durationMs,
            failed: this.failed,
            savedTo: null,
          });
          return;
        }
        // Finish writing, close the file (this is when it appears under its real name), then read it back for review.
        void (async () => {
          try {
            await sink.chain;
            await sink.writable.close();
            const file = await sink.handle.getFile();
            resolve({ blob: file, mime, durationMs, failed: this.failed, savedTo: sink.handle.name });
          } catch {
            resolve({
              blob: new Blob([], { type: mime.container }),
              mime,
              durationMs,
              failed: true,
              savedTo: sink.handle.name,
            });
          } finally {
            this.sink = null;
          }
        })();
      };
      if (!recorder || recorder.state === 'inactive') {
        assemble();
        return;
      }
      recorder.onstop = assemble;
      try {
        recorder.stop();
      } catch {
        this.failed = true;
        assemble();
      }
    });
    return this.stopPromise;
  }

  // ---------- Cleanup ----------

  /** Stops every track (the camera light turns off), closes audio, ends the draw loop. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.countdown = null;

    this.worker?.terminate();
    this.worker = null;
    if (this.fallbackTimer !== null) window.clearInterval(this.fallbackTimer);
    this.fallbackTimer = null;

    this.display.getVideoTracks()[0]?.removeEventListener('ended', this.handleDisplayEnded);
    if (this.recorder && this.recorder.state !== 'inactive') {
      try {
        this.recorder.stop();
      } catch {
        // Already stopping.
      }
    }
    if (this.sink) {
      // Leaving mid-recording: close the file so what was captured is kept.
      void this.sink.chain.then(() => this.sink?.writable.close()).catch(() => undefined);
    }
    for (const stream of [this.display, this.camStream, this.micStream, this.dest?.stream ?? null]) {
      stream?.getTracks().forEach((t) => t.stop());
    }
    this.recordTrack?.stop();
    if (this.audio && this.audio.state !== 'closed') void this.audio.close().catch(() => undefined);

    for (const video of [this.screenVideo, this.camVideo]) {
      if (!video) continue;
      video.pause();
      video.srcObject = null;
      video.remove();
    }
    this.canvas.remove();
    this.camStream = null;
    this.micStream = null;
    this.camVideo = null;
  }
}
