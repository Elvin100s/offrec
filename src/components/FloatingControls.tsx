import type { MicStatus } from '../engine/Session';
import type { Phase } from '../state';
import { formatTime } from '../lib/format';
import { MicIcon, MicOffIcon, PauseIcon, PlayIcon, StopIcon } from './Icons';
import { LogoMark } from './Logo';

interface FloatingControlsProps {
  phase: Phase;
  elapsedSec: number;
  countdown: number;
  onCancelCountdown: () => void;
  micOn: boolean;
  micStatus: MicStatus;
  onToggleMic: () => void;
  onTogglePause: () => void;
  onStop: () => void;
  onOpenRecorder: () => void;
}

/** Rendered into the Document Picture-in-Picture window. */
export function FloatingControls(props: FloatingControlsProps) {
  const { phase } = props;

  if (phase === 'REVIEW') {
    return (
      <div className="pip-bar">
        <LogoMark size={22} />
        <span className="pip-ready">Recording ready</span>
        <span className="spacer" />
        <button type="button" className="btn btn-accent" onClick={props.onOpenRecorder}>
          Open recorder
        </button>
      </div>
    );
  }

  if (phase === 'COUNTDOWN') {
    return (
      <div className="pip-bar">
        <span key={props.countdown} className="pip-count" role="status" aria-live="assertive">
          {props.countdown}
        </span>
        <span className="pip-ready">Recording starts in {props.countdown}…</span>
        <span className="spacer" />
        <button type="button" className="btn btn-secondary" onClick={props.onCancelCountdown}>
          Cancel
        </button>
      </div>
    );
  }

  if (phase !== 'RECORDING' && phase !== 'PAUSED') return null;
  const micLive = props.micOn && props.micStatus === 'ok';

  return (
    <div className="pip-bar">
      <span className={phase === 'RECORDING' ? 'timer live' : 'timer'} role="timer" aria-label="Elapsed time">
        <span className={phase === 'RECORDING' ? 'dot dot-rec pulse' : 'dot dot-muted'} />
        {formatTime(props.elapsedSec)}
      </span>
      <span className="spacer" />
      <button
        type="button"
        className={micLive ? 'icon-btn' : 'icon-btn is-off'}
        aria-label="Microphone"
        aria-pressed={micLive}
        title={micLive ? 'Mute microphone' : 'Unmute microphone'}
        onClick={props.onToggleMic}
        disabled={props.micStatus === 'pending'}
      >
        {micLive ? <MicIcon size={19} /> : <MicOffIcon size={19} />}
      </button>
      <button
        type="button"
        className="icon-btn"
        aria-label={phase === 'PAUSED' ? 'Resume' : 'Pause'}
        title={phase === 'PAUSED' ? 'Resume' : 'Pause'}
        onClick={props.onTogglePause}
      >
        {phase === 'PAUSED' ? <PlayIcon size={17} /> : <PauseIcon size={17} />}
      </button>
      <button type="button" className="btn btn-accent" onClick={props.onStop} title="Stop and review">
        <StopIcon size={12} />
        Stop
      </button>
    </div>
  );
}
