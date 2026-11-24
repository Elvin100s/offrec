import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Session, type Surface } from './engine/Session';
import { pickMime } from './engine/mime';
import { clampOverlay, cornerOverlay, DEFAULT_CORNER, type Corner, type Overlay } from './lib/overlay';
import { sanitizeFilename } from './lib/filename';
import { COUNTDOWN_SECONDS, initialState, isLive, reducer, type CaptureMode } from './state';
import { Header } from './components/Header';
import { IdleScreen } from './components/IdleScreen';
import { Studio } from './components/Studio';
import { ReviewScreen } from './components/ReviewScreen';
import { FloatingControls } from './components/FloatingControls';

const pipSupported = typeof window !== 'undefined' && 'documentPictureInPicture' in window;

/** Floating controls are only allowed when they can't end up in the video. */
const canFloat = (surface: Surface) => pipSupported && (surface === 'window' || surface === 'browser');

/** At most 1080p and 30 fps, so high-resolution screens don't overload the encoder. */
const CAPTURE_LIMITS = {
  width: { max: 1920 },
  height: { max: 1080 },
  frameRate: { ideal: 30, max: 30 },
};

function displayOptions(mode: CaptureMode): DisplayMediaStreamOptions {
  const options: Record<string, unknown> =
    mode === 'window'
      ? {
          video: { displaySurface: 'window', ...CAPTURE_LIMITS },
          audio: true,
          monitorTypeSurfaces: 'exclude',
          selfBrowserSurface: 'exclude',
        }
      : {
          video: { displaySurface: 'monitor', ...CAPTURE_LIMITS },
          audio: true,
          monitorTypeSurfaces: 'include',
          selfBrowserSurface: 'exclude',
        };
  return options as unknown as DisplayMediaStreamOptions;
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Copies the app's styles into the Picture-in-Picture document. */
function copyStyles(target: Window) {
  for (const node of Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))) {
    if (node instanceof HTMLLinkElement) {
      const link = target.document.createElement('link');
      link.rel = 'stylesheet';
      link.href = node.href;
      target.document.head.appendChild(link);
    } else {
      const style = target.document.createElement('style');
      style.textContent = node.textContent;
      target.document.head.appendChild(style);
    }
  }
}

function errorInfo(error: unknown): { name: string; message: string } {
  if (error && typeof error === 'object') {
    const e = error as { name?: unknown; message?: unknown };
    return { name: String(e.name ?? ''), message: String(e.message ?? '') };
  }
  return { name: '', message: '' };
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Streams, recorder, audio and worker all live inside the Session, held in a ref.
  const sessionRef = useRef<Session | null>(null);
  const urlRef = useRef<string | null>(null);
  const pipRef = useRef<Window | null>(null);
  const finishingRef = useRef(false);
  const [pipWindow, setPipWindow] = useState<Window | null>(null);

  // ---------- Cleanup helpers ----------

  const closePip = useCallback(() => {
    const win = pipRef.current;
    pipRef.current = null;
    setPipWindow(null);
    if (win && !win.closed) win.close();
  }, []);

  const teardownSession = useCallback(() => {
    sessionRef.current?.dispose();
    sessionRef.current = null;
  }, []);

  const revokeReview = useCallback(() => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
  }, []);

  // ---------- Floating controls ----------

  /** Must be called synchronously from a click or key press: the browser requires a user gesture. */
  const openPip = useCallback(() => {
    const api = window.documentPictureInPicture;
    if (!api || pipRef.current) return;
    api
      .requestWindow({ width: 400, height: 76 })
      .then((win) => {
        copyStyles(win);
        win.document.title = 'Offrec';
        win.document.documentElement.classList.add('pip-doc');
        win.document.body.classList.add('pip-body');
        win.addEventListener('pagehide', () => {
          if (pipRef.current === win) {
            pipRef.current = null;
            setPipWindow(null);
          }
        });
        pipRef.current = win;
        setPipWindow(win);
      })
      .catch(() => undefined);
  }, []);

  // ---------- Finishing a recording ----------

  const finish = useCallback(
    (fromPip: boolean) => {
      const session = sessionRef.current;
      const phase = stateRef.current.state;
      if (!session || (phase !== 'RECORDING' && phase !== 'PAUSED') || finishingRef.current) return;
      finishingRef.current = true;
      dispatch({ type: 'finishing' });
      void session.stop().then((result) => {
        finishingRef.current = false;
        if (sessionRef.current !== session) return;
        teardownSession();
        revokeReview();
        const url = URL.createObjectURL(result.blob);
        urlRef.current = url;
        dispatch({
          type: 'review',
          fromPip,
          review: {
            url,
            ext: result.mime.ext,
            size: result.blob.size,
            durationMs: result.durationMs,
            saved: result.savedTo !== null && result.blob.size > 0,
            failed: result.failed,
            savedTo: result.savedTo,
            partial: result.partial,
          },
        });
        if (!fromPip) closePip();
      });
    },
    [closePip, revokeReview, teardownSession],
  );

  // ---------- Camera ----------

  const enableCamera = useCallback((session: Session) => {
    dispatch({ type: 'camPending' });
    void session.enableCamera().then((result) => {
      if (sessionRef.current !== session) return;
      if (!result.ok) {
        dispatch({ type: 'camFailed', reason: result.reason });
        return;
      }
      const s = stateRef.current;
      const overlay = s.corner
        ? cornerOverlay(s.corner, s.overlay.w, session.width, session.height, result.aspect)
        : clampOverlay(s.overlay, session.width, session.height, result.aspect);
      session.setOverlay(overlay, false);
      session.setCameraVisible(true);
      dispatch({ type: 'camOn', aspect: result.aspect, overlay });
    });
  }, []);

  const toggleCamera = useCallback(() => {
    const session = sessionRef.current;
    const s = stateRef.current;
    if (!session || !isLive(s.state) || s.camPending) return;
    if (s.camOn) {
      session.setCameraVisible(false);
      dispatch({ type: 'camOff' });
    } else if (session.hasCamera) {
      session.setCameraVisible(true);
      dispatch({ type: 'camOn', aspect: session.cameraAspect, overlay: s.overlay });
    } else {
      enableCamera(session);
    }
  }, [enableCamera]);

  // ---------- Microphone ----------

  const requestMic = useCallback((session: Session, turnOn: boolean) => {
    dispatch({ type: 'micStatus', status: 'pending' });
    void session.enableMic().then((status) => {
      if (sessionRef.current !== session) return;
      dispatch({ type: 'micStatus', status });
      if (status === 'ok') {
        const on = turnOn || stateRef.current.micOn;
        session.setMicOn(on);
        if (on !== stateRef.current.micOn) dispatch({ type: 'setMic', on });
      }
    });
  }, []);

  const toggleMic = useCallback(() => {
    const session = sessionRef.current;
    const s = stateRef.current;
    if (!session || !isLive(s.state) || s.micStatus === 'pending') return;
    if (s.micStatus !== 'ok') {
      requestMic(session, true);
      return;
    }
    const on = !s.micOn;
    session.setMicOn(on);
    dispatch({ type: 'setMic', on });
  }, [requestMic]);

  // ---------- Sharing ----------

  const startShare = useCallback(() => {
    const s = stateRef.current;
    if (s.state !== 'IDLE' && s.state !== 'REVIEW') return;
    const media = navigator.mediaDevices;
    if (!window.isSecureContext || !media?.getDisplayMedia) {
      dispatch({ type: 'message', message: window.isSecureContext ? 'unsupported' : 'insecure' });
      return;
    }

    // Call getDisplayMedia first, synchronously, while the click still counts as a user gesture.
    let request: Promise<MediaStream>;
    try {
      request = media.getDisplayMedia(displayOptions(s.mode));
    } catch (error) {
      request = Promise.reject(error);
    }
    // The AudioContext is also created inside the gesture so it is allowed to run.
    let audio: AudioContext | null = null;
    try {
      audio = new AudioContext();
      void audio.resume().catch(() => undefined);
    } catch {
      audio = null;
    }

    closePip();
    revokeReview();
    dispatch({ type: 'selecting' });

    request.then(
      (stream) => {
        let session: Session;
        try {
          session = new Session(stream, audio, { x: 0, y: 0, w: s.overlay.w }, {
            onDisplayEnded: () => {
              const phase = stateRef.current.state;
              if (phase === 'RECORDING' || phase === 'PAUSED') {
                finish(pipRef.current !== null);
              } else if (phase === 'READY' || phase === 'COUNTDOWN') {
                teardownSession();
                closePip();
                dispatch({ type: 'reset' });
              }
            },
            onRecorderFailed: () => finish(pipRef.current !== null),
            onSecond: (seconds) => dispatch({ type: 'tick', seconds }),
          });
        } catch {
          stream.getTracks().forEach((t) => t.stop());
          void audio?.close().catch(() => undefined);
          dispatch({ type: 'selectFailed', message: 'start-failed' });
          return;
        }
        const current = stateRef.current;
        if (current.state !== 'SELECTING') {
          session.dispose();
          return;
        }
        const corner: Corner | null = current.corner ?? DEFAULT_CORNER;
        const overlay = cornerOverlay(corner, current.overlay.w, session.width, session.height, current.camAspect);
        session.setOverlay(overlay, false);
        sessionRef.current = session;
        dispatch({
          type: 'ready',
          surface: session.surface,
          canvasW: session.width,
          canvasH: session.height,
          hasDisplayAudio: session.hasDisplayAudio,
          overlay,
          corner,
        });
        // Mic is requested on entering READY, never at page load.
        requestMic(session, false);
        // If the camera was on last time, bring it back (no new prompt once allowed).
        if (current.camPreferred) enableCamera(session);
      },
      (error: unknown) => {
        void audio?.close().catch(() => undefined);
        const { name, message } = errorInfo(error);
        if (name === 'NotAllowedError' && !/system/i.test(message)) {
          // The user closed the picker. Not an error.
          dispatch({ type: 'selectCancelled' });
        } else if (name === 'NotAllowedError') {
          dispatch({ type: 'selectFailed', message: 'blocked' });
        } else {
          dispatch({ type: 'selectFailed', message: 'start-failed' });
        }
      },
    );
  }, [closePip, enableCamera, finish, requestMic, revokeReview, teardownSession]);

  // ---------- Recording controls ----------

  /** 3, 2, 1, then the recorder starts. */
  const beginCountdown = useCallback(
    (session: Session) => {
      const started = session.startAfter(
        COUNTDOWN_SECONDS * 1000,
        (secondsLeft) => {
          if (sessionRef.current === session) dispatch({ type: 'countdown', secondsLeft });
        },
        (result) => {
          if (sessionRef.current !== session) return;
          if (result === 'ok') {
            dispatch({ type: 'recording' });
            return;
          }
          closePip();
          dispatch({ type: 'countdownCancelled' });
          dispatch({ type: 'message', message: result === 'mime' ? 'mime' : 'recorder-start' });
        },
      );
      if (!started) closePip();
    },
    [closePip],
  );

  const record = useCallback(() => {
    const session = sessionRef.current;
    const s = stateRef.current;
    if (!session || s.state !== 'READY' || s.choosingFile) return;
    const mime = pickMime();
    if (!mime) {
      dispatch({ type: 'message', message: 'mime' });
      return;
    }

    // Both of these need the click's user gesture, so call them right away.
    // The save dialog goes first; the floating window second.
    let picker: Promise<FileSystemFileHandle> | null = null;
    if (s.saveToFile && window.showSaveFilePicker) {
      try {
        picker = window.showSaveFilePicker({
          suggestedName: `${sanitizeFilename(s.title)}.${mime.ext}`,
          id: 'offrec-recordings',
          startIn: 'videos',
          types: [
            {
              description: mime.ext === 'mp4' ? 'MP4 video' : 'WebM video',
              accept: { [mime.container]: [`.${mime.ext}`] },
            },
          ],
        });
      } catch (error) {
        picker = Promise.reject(error);
      }
    }
    if (canFloat(session.surface)) openPip();

    if (!picker) {
      beginCountdown(session);
      return;
    }
    dispatch({ type: 'choosingFile', on: true });
    picker
      .then(async (handle) => {
        const writable = await handle.createWritable();
        if (sessionRef.current !== session || stateRef.current.state !== 'READY') {
          await writable.abort().catch(() => undefined);
          return;
        }
        session.setFileSink(handle, writable);
        dispatch({ type: 'savingTo', name: handle.name });
        beginCountdown(session);
      })
      .catch((error: unknown) => {
        if (sessionRef.current !== session || stateRef.current.state !== 'READY') return;
        if (errorInfo(error).name === 'AbortError') {
          // The user closed the save dialog: don't record.
          closePip();
          return;
        }
        // Saving to a file isn't possible here; record in memory instead.
        beginCountdown(session);
      })
      .finally(() => dispatch({ type: 'choosingFile', on: false }));
  }, [beginCountdown, closePip, openPip]);

  const cancelCountdown = useCallback(() => {
    const session = sessionRef.current;
    if (!session || stateRef.current.state !== 'COUNTDOWN') return;
    session.cancelCountdown();
    closePip();
    dispatch({ type: 'countdownCancelled' });
  }, [closePip]);

  const togglePause = useCallback(() => {
    const session = sessionRef.current;
    const phase = stateRef.current.state;
    if (!session) return;
    if (phase === 'RECORDING') {
      session.pause();
      dispatch({ type: 'paused' });
    } else if (phase === 'PAUSED') {
      session.resume();
      dispatch({ type: 'resumed' });
    }
  }, []);

  const setCorner = useCallback((corner: Corner) => {
    const session = sessionRef.current;
    const s = stateRef.current;
    if (!session || !isLive(s.state)) return;
    const overlay = cornerOverlay(corner, s.overlay.w, session.width, session.height, s.camAspect);
    const animate = s.camOn && !prefersReducedMotion();
    session.setOverlay(overlay, animate);
    dispatch({ type: 'overlay', overlay, corner, animate });
  }, []);

  const dragOverlay = useCallback((overlay: Overlay) => {
    const session = sessionRef.current;
    if (!session) return;
    session.setOverlay(overlay, false);
    dispatch({ type: 'overlay', overlay, corner: null, animate: false });
  }, []);

  // ---------- Review ----------

  const save = useCallback(() => {
    const s = stateRef.current;
    if (s.state !== 'REVIEW' || !s.review || s.review.size === 0) return;
    const link = document.createElement('a');
    link.href = s.review.url;
    link.download = `${sanitizeFilename(s.reviewTitle)}.${s.review.ext}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    dispatch({ type: 'saved' });
  }, []);

  const discard = useCallback(() => {
    closePip();
    revokeReview();
    dispatch({ type: 'reset' });
  }, [closePip, revokeReview]);

  const finishNow = useCallback(() => {
    sessionRef.current?.finishNow();
  }, []);

  const openRecorder = useCallback(() => {
    window.focus();
    closePip();
  }, [closePip]);

  // ---------- Global effects ----------

  // Warn before leaving with a recording in progress or unsaved.
  const unsaved =
    state.state === 'RECORDING' || state.state === 'PAUSED' || (state.state === 'REVIEW' && !state.review?.saved);
  useEffect(() => {
    if (!unsaved) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [unsaved]);

  // Release the camera, mic and screen when the page goes away.
  useEffect(() => {
    const onPageHide = () => {
      sessionRef.current?.dispose();
      sessionRef.current = null;
      const win = pipRef.current;
      pipRef.current = null;
      if (win && !win.closed) win.close();
    };
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, []);

  // Keyboard: Space = record / pause, M = mic, C = camera. Ignored while typing.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return;
      const phase = stateRef.current.state;
      if (event.key === 'Escape' && phase === 'COUNTDOWN') {
        event.preventDefault();
        cancelCountdown();
      } else if (event.code === 'Space') {
        // A focused button already reacts to Space on its own.
        if (target?.closest('button, a, [role="radio"]')) return;
        if (phase === 'COUNTDOWN') {
          event.preventDefault();
          cancelCountdown();
        } else if (phase === 'READY') {
          event.preventDefault();
          record();
        } else if (phase === 'RECORDING' || phase === 'PAUSED') {
          event.preventDefault();
          togglePause();
        }
      } else if (event.key === 'm' || event.key === 'M') {
        if (isLive(phase)) toggleMic();
      } else if (event.key === 'c' || event.key === 'C') {
        if (isLive(phase)) toggleCamera();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cancelCountdown, record, togglePause, toggleCamera, toggleMic]);

  // ---------- Render ----------

  const session = sessionRef.current;
  const phase = state.state;
  const canPopOut = (phase === 'RECORDING' || phase === 'PAUSED') && canFloat(state.surface) && !pipWindow;

  return (
    <div className="app" data-phase={phase.toLowerCase()}>
      <Header
        phase={phase}
        surface={state.surface}
        countdown={state.countdown}
        saved={state.review?.saved ?? false}
        canPopOut={canPopOut}
        onPopOut={openPip}
      />

      {phase === 'IDLE' || phase === 'SELECTING' ? (
        <IdleScreen
          mode={state.mode}
          selecting={phase === 'SELECTING'}
          message={state.message}
          onMode={(mode) => dispatch({ type: 'setMode', mode })}
          onStart={startShare}
          onDismissMessage={() => dispatch({ type: 'message', message: null })}
        />
      ) : null}

      {(phase === 'READY' || phase === 'COUNTDOWN' || phase === 'RECORDING' || phase === 'PAUSED') && session ? (
        <Studio
          key={state.sessionId}
          phase={phase}
          mode={state.mode}
          canvas={session.canvas}
          canvasW={state.canvasW}
          canvasH={state.canvasH}
          surface={state.surface}
          hasDisplayAudio={state.hasDisplayAudio}
          camOn={state.camOn}
          camPending={state.camPending}
          camAspect={state.camAspect}
          camError={state.camError}
          micOn={state.micOn}
          micStatus={state.micStatus}
          overlay={state.overlay}
          corner={state.corner}
          animateOverlay={state.animateOverlay}
          title={state.title}
          elapsedSec={state.elapsedSec}
          countdown={state.countdown}
          saveToFile={state.saveToFile}
          choosingFile={state.choosingFile}
          savingTo={state.savingTo}
          onSaveToFile={(on) => dispatch({ type: 'setSaveToFile', on })}
          message={state.message}
          onCancelCountdown={cancelCountdown}
          onToggleCam={toggleCamera}
          onToggleMic={toggleMic}
          onCorner={setCorner}
          onOverlay={dragOverlay}
          onTitle={(title) => dispatch({ type: 'title', title })}
          onRecord={record}
          onTogglePause={togglePause}
          onDone={() => finish(false)}
          finishing={state.finishing}
          onFinishNow={finishNow}
          onDismissCamError={() => dispatch({ type: 'dismissCamError' })}
          onDismissMessage={() => dispatch({ type: 'message', message: null })}
        />
      ) : null}

      {phase === 'REVIEW' && state.review ? (
        <ReviewScreen
          review={state.review}
          title={state.reviewTitle}
          onTitle={(title) => dispatch({ type: 'reviewTitle', title })}
          onSave={save}
          onRecordAnother={startShare}
          onDiscard={discard}
        />
      ) : null}

      {pipWindow
        ? createPortal(
            <FloatingControls
              phase={phase}
              elapsedSec={state.elapsedSec}
              countdown={state.countdown}
              onCancelCountdown={cancelCountdown}
              micOn={state.micOn}
              micStatus={state.micStatus}
              onToggleMic={toggleMic}
              onTogglePause={togglePause}
              onStop={() => finish(true)}
              finishing={state.finishing}
              onOpenRecorder={openRecorder}
            />,
            pipWindow.document.body,
          )
        : null}
    </div>
  );
}
