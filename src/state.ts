import type { CameraFailure, MicStatus, Surface } from './engine/Session';
import { DEFAULT_CORNER, DEFAULT_W, type Corner, type Overlay } from './lib/overlay';

export type Phase = 'IDLE' | 'SELECTING' | 'READY' | 'COUNTDOWN' | 'RECORDING' | 'PAUSED' | 'REVIEW';

/** Seconds counted down between pressing Record and the recording starting. */
export const COUNTDOWN_SECONDS = 3;

export type CaptureMode = 'window' | 'screen';
export type MessageKey = 'unsupported' | 'insecure' | 'blocked' | 'start-failed' | 'mime' | 'recorder-start';

export interface ReviewInfo {
  url: string;
  ext: 'mp4' | 'webm';
  size: number;
  durationMs: number;
  saved: boolean;
  /** The recorder errored mid-way; the video holds what was captured. */
  failed: boolean;
  /** Finished early with "Finish now": the last moments may be missing. */
  partial: boolean;
}

export interface AppState {
  state: Phase;
  /** Bumps for every new sharing session so the preview remounts. */
  sessionId: number;
  mode: CaptureMode;
  surface: Surface;
  canvasW: number;
  canvasH: number;
  hasDisplayAudio: boolean;

  camOn: boolean;
  camPending: boolean;
  camPreferred: boolean;
  camAspect: number;
  camError: CameraFailure | null;

  micOn: boolean;
  micStatus: MicStatus;

  overlay: Overlay;
  corner: Corner | null;
  animateOverlay: boolean;

  title: string;
  reviewTitle: string;
  elapsedSec: number;
  countdown: number;
  /** Stop was pressed; waiting for the recorder to finish. */
  finishing: boolean;
  message: MessageKey | null;
  review: ReviewInfo | null;
  stoppedFromPip: boolean;
}

export type Action =
  | { type: 'setMode'; mode: CaptureMode }
  | { type: 'selecting' }
  | { type: 'selectCancelled' }
  | { type: 'selectFailed'; message: MessageKey }
  | {
      type: 'ready';
      surface: Surface;
      canvasW: number;
      canvasH: number;
      hasDisplayAudio: boolean;
      overlay: Overlay;
      corner: Corner | null;
    }
  | { type: 'micStatus'; status: MicStatus }
  | { type: 'setMic'; on: boolean }
  | { type: 'camPending' }
  | { type: 'camOn'; aspect: number; overlay: Overlay }
  | { type: 'camOff' }
  | { type: 'camFailed'; reason: CameraFailure }
  | { type: 'dismissCamError' }
  | { type: 'overlay'; overlay: Overlay; corner: Corner | null; animate: boolean }
  | { type: 'title'; title: string }
  | { type: 'reviewTitle'; title: string }
  | { type: 'finishing' }
  | { type: 'countdown'; secondsLeft: number }
  | { type: 'countdownCancelled' }
  | { type: 'recording' }
  | { type: 'paused' }
  | { type: 'resumed' }
  | { type: 'tick'; seconds: number }
  | { type: 'review'; review: ReviewInfo; fromPip: boolean }
  | { type: 'saved' }
  | { type: 'reset' }
  | { type: 'message'; message: MessageKey | null };

export function initialState(): AppState {
  return {
    state: 'IDLE',
    sessionId: 0,
    mode: 'window',
    surface: 'unknown',
    canvasW: 1920,
    canvasH: 1080,
    hasDisplayAudio: false,
    camOn: false,
    camPending: false,
    camPreferred: false,
    camAspect: 16 / 9,
    camError: null,
    micOn: true,
    micStatus: 'pending',
    overlay: { x: 0, y: 0, w: DEFAULT_W },
    corner: DEFAULT_CORNER,
    animateOverlay: false,
    title: '',
    reviewTitle: 'recording',
    elapsedSec: 0,
    countdown: COUNTDOWN_SECONDS,
    finishing: false,
    message: null,
    review: null,
    stoppedFromPip: false,
  };
}

export const isLive = (phase: Phase) =>
  phase === 'READY' || phase === 'COUNTDOWN' || phase === 'RECORDING' || phase === 'PAUSED';

/** Every transition is guarded: actions that don't fit the current state are ignored. */
export function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case 'setMode':
      return s.state === 'IDLE' ? { ...s, mode: a.mode } : s;

    case 'selecting':
      if (s.state !== 'IDLE' && s.state !== 'REVIEW') return s;
      return { ...s, state: 'SELECTING', message: null, review: null, stoppedFromPip: false, elapsedSec: 0 };

    case 'selectCancelled':
      return s.state === 'SELECTING' ? { ...s, state: 'IDLE' } : s;

    case 'selectFailed':
      return s.state === 'SELECTING' ? { ...s, state: 'IDLE', message: a.message } : s;

    case 'ready':
      if (s.state !== 'SELECTING') return s;
      return {
        ...s,
        state: 'READY',
        sessionId: s.sessionId + 1,
        surface: a.surface,
        canvasW: a.canvasW,
        canvasH: a.canvasH,
        hasDisplayAudio: a.hasDisplayAudio,
        overlay: a.overlay,
        corner: a.corner,
        animateOverlay: false,
        camOn: false,
        camPending: false,
        camError: null,
        micStatus: 'pending',
        elapsedSec: 0,
        message: null,
      };

    case 'micStatus':
      if (!isLive(s.state)) return s;
      // The mic counts as live only when micOn && micStatus === 'ok'; the preference is kept.
      return { ...s, micStatus: a.status };

    case 'setMic':
      return isLive(s.state) && s.micStatus === 'ok' ? { ...s, micOn: a.on } : s;

    case 'camPending':
      return isLive(s.state) ? { ...s, camPending: true, camError: null } : s;

    case 'camOn':
      if (!isLive(s.state)) return s;
      return {
        ...s,
        camOn: true,
        camPending: false,
        camPreferred: true,
        camAspect: a.aspect,
        camError: null,
        overlay: a.overlay,
        animateOverlay: false,
      };

    case 'camOff':
      return isLive(s.state) ? { ...s, camOn: false, camPreferred: false } : s;

    case 'camFailed':
      return isLive(s.state) ? { ...s, camOn: false, camPending: false, camPreferred: false, camError: a.reason } : s;

    case 'dismissCamError':
      return { ...s, camError: null };

    case 'overlay':
      return isLive(s.state) ? { ...s, overlay: a.overlay, corner: a.corner, animateOverlay: a.animate } : s;

    case 'title':
      return { ...s, title: a.title };

    case 'reviewTitle':
      return s.state === 'REVIEW' ? { ...s, reviewTitle: a.title } : s;

    case 'finishing':
      return s.state === 'RECORDING' || s.state === 'PAUSED' ? { ...s, finishing: true } : s;

    case 'countdown':
      if (s.state !== 'READY' && s.state !== 'COUNTDOWN') return s;
      return { ...s, state: 'COUNTDOWN', countdown: a.secondsLeft, message: null };

    case 'countdownCancelled':
      return s.state === 'COUNTDOWN' ? { ...s, state: 'READY', countdown: COUNTDOWN_SECONDS } : s;

    case 'recording':
      if (s.state !== 'COUNTDOWN') return s;
      return { ...s, state: 'RECORDING', elapsedSec: 0, countdown: COUNTDOWN_SECONDS, message: null };

    case 'paused':
      return s.state === 'RECORDING' ? { ...s, state: 'PAUSED' } : s;

    case 'resumed':
      return s.state === 'PAUSED' ? { ...s, state: 'RECORDING' } : s;

    case 'tick':
      return s.state === 'RECORDING' || s.state === 'PAUSED' ? { ...s, elapsedSec: a.seconds } : s;

    case 'review':
      if (s.state !== 'RECORDING' && s.state !== 'PAUSED') return s;
      return {
        ...s,
        state: 'REVIEW',
        review: a.review,
        reviewTitle: s.title.trim() || 'recording',
        stoppedFromPip: a.fromPip,
        camOn: false,
        camPending: false,
        finishing: false,
      };

    case 'saved':
      return s.state === 'REVIEW' && s.review ? { ...s, review: { ...s.review, saved: true } } : s;

    case 'reset':
      if (s.state === 'IDLE') return s;
      return {
        ...s,
        state: 'IDLE',
        review: null,
        camOn: false,
        camPending: false,
        elapsedSec: 0,
        countdown: COUNTDOWN_SECONDS,
        finishing: false,
        stoppedFromPip: false,
      };

    case 'message':
      return { ...s, message: a.message };
  }
}
