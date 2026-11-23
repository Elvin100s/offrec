import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { CameraFailure, MicStatus, Surface } from '../engine/Session';
import {
  CORNERS,
  heightFraction,
  moveOverlay,
  resizeOverlay,
  type Corner,
  type Overlay,
} from '../lib/overlay';
import type { MessageKey } from '../state';
import { formatTime } from '../lib/format';
import {
  CameraIcon,
  CameraOffIcon,
  CloseIcon,
  CornerIcon,
  MicIcon,
  MicOffIcon,
  PauseIcon,
  PlayIcon,
  RecordIcon,
  StopIcon,
} from './Icons';
import { MessageCard } from './MessageCard';
import { CAMERA_FAILURES, MESSAGES } from './messages';

const pipSupported = typeof window !== 'undefined' && 'documentPictureInPicture' in window;

const CORNER_LABEL: Record<Corner, string> = {
  tl: 'Top left',
  tr: 'Top right',
  bl: 'Bottom left',
  br: 'Bottom right',
};

interface StudioProps {
  phase: 'READY' | 'RECORDING' | 'PAUSED';
  canvas: HTMLCanvasElement;
  canvasW: number;
  canvasH: number;
  surface: Surface;
  hasDisplayAudio: boolean;
  camOn: boolean;
  camPending: boolean;
  camAspect: number;
  camError: CameraFailure | null;
  micOn: boolean;
  micStatus: MicStatus;
  overlay: Overlay;
  corner: Corner | null;
  animateOverlay: boolean;
  title: string;
  elapsedSec: number;
  message: MessageKey | null;
  onToggleCam: () => void;
  onToggleMic: () => void;
  onCorner: (corner: Corner) => void;
  onOverlay: (overlay: Overlay) => void;
  onTitle: (title: string) => void;
  onRecord: () => void;
  onTogglePause: () => void;
  onDone: () => void;
  onDismissCamError: () => void;
  onDismissMessage: () => void;
}

type Drag = { mode: 'move' | Corner; startX: number; startY: number; start: Overlay; pointerId: number };

export function Studio(props: StudioProps) {
  const {
    phase,
    canvas,
    canvasW,
    canvasH,
    camOn,
    camAspect,
    overlay,
    animateOverlay,
    onOverlay,
  } = props;
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);

  // Show the compositing canvas itself as the live preview.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    canvas.className = 'stage-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Live preview of your recording');
    stage.prepend(canvas);
    return () => {
      if (canvas.parentNode === stage) stage.removeChild(canvas);
    };
  }, [canvas]);

  const beginDrag = (event: ReactPointerEvent<HTMLElement>, mode: Drag['mode']) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { mode, startX: event.clientX, startY: event.clientY, start: overlay, pointerId: event.pointerId };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    const stage = stageRef.current;
    if (!drag || !stage || event.pointerId !== drag.pointerId) return;
    // Convert CSS pixels to canvas pixels: the preview is scaled, and page zoom changes the ratio too.
    const rect = stage.getBoundingClientRect();
    const dx = (event.clientX - drag.startX) * (canvasW / rect.width);
    const dy = (event.clientY - drag.startY) * (canvasH / rect.height);
    const next =
      drag.mode === 'move'
        ? moveOverlay(drag.start, dx, dy, canvasW, canvasH, camAspect)
        : resizeOverlay(drag.start, drag.mode, dx, dy, canvasW, canvasH, camAspect);
    onOverlay(next);
  };

  const endDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const ratio = canvasW / canvasH;
  const boxHeight = heightFraction(overlay.w, canvasW, canvasH, camAspect);
  const recording = phase !== 'READY';

  return (
    <>
      <main className="studio">
        {props.message ? (
          <div className="studio-message">
            <MessageCard copy={MESSAGES[props.message]} onDismiss={props.onDismissMessage} />
          </div>
        ) : null}

        <div
          ref={stageRef}
          className="stage"
          style={{
            aspectRatio: `${canvasW} / ${canvasH}`,
            width: `min(100%, calc((100dvh - 250px) * ${ratio.toFixed(5)}))`,
          }}
        >
          {camOn ? (
            <div
              className={animateOverlay ? 'cam-box animating' : 'cam-box'}
              style={{
                left: `${overlay.x * 100}%`,
                top: `${overlay.y * 100}%`,
                width: `${overlay.w * 100}%`,
                height: `${boxHeight * 100}%`,
              }}
              onPointerDown={(e) => beginDrag(e, 'move')}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              title="Drag to move the camera"
            >
              {CORNERS.map((c) => (
                <span
                  key={c}
                  className={`handle handle-${c}`}
                  onPointerDown={(e) => beginDrag(e, c)}
                  title="Drag to resize"
                />
              ))}
            </div>
          ) : null}
          {recording ? (
            <span className="rec-badge">
              <span className={phase === 'RECORDING' ? 'dot dot-rec pulse' : 'dot dot-muted'} />
              {phase === 'RECORDING' ? 'REC' : 'PAUSED'}
            </span>
          ) : null}
        </div>

        <Notices {...props} />
      </main>

      <div className="dock-wrap">
        <div className="dock glass">
          <button
            type="button"
            className={camOn ? 'icon-btn' : 'icon-btn is-off'}
            aria-label="Camera"
            aria-pressed={camOn}
            title={props.camPending ? 'Starting camera…' : camOn ? 'Hide camera (C)' : 'Show camera (C)'}
            onClick={props.onToggleCam}
            disabled={props.camPending}
          >
            {camOn ? <CameraIcon /> : <CameraOffIcon />}
          </button>
          <button
            type="button"
            className={props.micOn && props.micStatus === 'ok' ? 'icon-btn' : 'icon-btn is-off'}
            aria-label="Microphone"
            aria-pressed={props.micOn && props.micStatus === 'ok'}
            title={
              props.micStatus === 'ok'
                ? props.micOn
                  ? 'Mute microphone (M)'
                  : 'Unmute microphone (M)'
                : props.micStatus === 'pending'
                  ? 'Starting microphone…'
                  : 'Microphone unavailable. Click to try again (M)'
            }
            onClick={props.onToggleMic}
            disabled={props.micStatus === 'pending'}
          >
            {props.micOn && props.micStatus === 'ok' ? <MicIcon /> : <MicOffIcon />}
          </button>

          <span className="divider" aria-hidden="true" />

          <div className="seg" role="group" aria-label="Camera position">
            {CORNERS.map((c) => (
              <button
                key={c}
                type="button"
                className="seg-btn seg-icon"
                aria-label={CORNER_LABEL[c]}
                aria-pressed={props.corner === c}
                title={`Move camera to ${CORNER_LABEL[c].toLowerCase()}`}
                onClick={() => props.onCorner(c)}
              >
                <CornerIcon corner={c} />
              </button>
            ))}
          </div>

          <span className="divider" aria-hidden="true" />

          <label className="title-field">
            <span className="sr-only">Title</span>
            <input
              type="text"
              value={props.title}
              placeholder="Name this recording"
              maxLength={200}
              onChange={(e) => props.onTitle(e.target.value)}
            />
          </label>

          <span className="spacer" />

          <span className={phase === 'RECORDING' ? 'timer live' : 'timer'} aria-label="Elapsed time" role="timer">
            {recording ? <span className={phase === 'RECORDING' ? 'dot dot-rec pulse' : 'dot dot-muted'} /> : null}
            {formatTime(props.elapsedSec)}
          </span>

          {phase === 'READY' ? (
            <button
              type="button"
              className="btn btn-accent"
              onClick={props.onRecord}
              title="Start recording (Space)"
              disabled={props.message === 'mime'}
            >
              <RecordIcon />
              Record
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={props.onTogglePause}
                title={phase === 'PAUSED' ? 'Resume (Space)' : 'Pause (Space)'}
              >
                {phase === 'PAUSED' ? <PlayIcon /> : <PauseIcon />}
                {phase === 'PAUSED' ? 'Resume' : 'Pause'}
              </button>
              <button type="button" className="btn btn-accent" onClick={props.onDone} title="Finish recording">
                <StopIcon />
                Done
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Notices(props: StudioProps) {
  const { phase, surface, camOn, camError, micStatus, hasDisplayAudio } = props;
  const micMissing = micStatus === 'denied' || micStatus === 'none' || micStatus === 'error';
  const floating = pipSupported && (surface === 'window' || surface === 'browser');
  const lines: string[] = [];

  if (micMissing && !hasDisplayAudio) {
    lines.push(
      'Recording without sound: no microphone or shared audio is available. Allow the microphone, or turn on “Share audio” when picking a tab.',
    );
  } else if (micMissing) {
    lines.push("Microphone not available, so only the shared tab's audio will be recorded.");
  }
  if (phase === 'READY') {
    if (surface === 'monitor' || surface === 'unknown') {
      lines.push("Floating controls are off so they don't show up in your video. To pause or stop, come back to this tab.");
    } else if (!floating) {
      lines.push("To finish, use your browser's Stop sharing bar, or come back to this tab to pause.");
    } else {
      lines.push('When you press Record, a small Pause and Stop window stays on top of your other windows.');
    }
    if (camOn) lines.push('Snap the camera to a corner, or drag it anywhere. Drag a corner handle to resize.');
  } else if (phase === 'RECORDING') {
    lines.push('Recording keeps going while you work in other windows.');
  } else {
    lines.push('Paused. The pause will not appear in the video.');
  }

  return (
    <div className="notices" aria-live="polite">
      {camError ? (
        <p className="notice notice-warn">
          <span>
            <strong>Camera not available.</strong> {CAMERA_FAILURES[camError]} You can still record your screen.
          </span>
          <button
            type="button"
            className="icon-btn ghost small"
            aria-label="Dismiss camera message"
            title="Dismiss"
            onClick={props.onDismissCamError}
          >
            <CloseIcon size={14} />
          </button>
        </p>
      ) : null}
      {lines.map((line) => (
        <p key={line} className="notice">
          {line}
        </p>
      ))}
    </div>
  );
}
