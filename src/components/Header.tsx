import type { Surface } from '../engine/Session';
import type { Phase } from '../state';
import { PopOutIcon } from './Icons';
import { Wordmark } from './Logo';

interface HeaderProps {
  phase: Phase;
  surface: Surface;
  countdown: number;
  saved: boolean;
  canPopOut: boolean;
  onPopOut: () => void;
}

const SURFACE_LABEL: Record<Surface, string> = {
  window: 'sharing a window',
  browser: 'sharing a tab',
  monitor: 'sharing your entire screen',
  unknown: 'sharing your screen',
};

function Status({ phase, surface, countdown, saved }: Omit<HeaderProps, 'canPopOut' | 'onPopOut'>) {
  switch (phase) {
    case 'COUNTDOWN':
      return (
        <span className="pill">
          <span className="dot dot-rec" />
          Starting in {countdown}
        </span>
      );
    case 'READY':
      return (
        <span className="pill">
          <span className="dot dot-ok" />
          Ready · {SURFACE_LABEL[surface]}
        </span>
      );
    case 'RECORDING':
      return (
        <span className="pill">
          <span className="dot dot-rec pulse" />
          Recording
        </span>
      );
    case 'PAUSED':
      return (
        <span className="pill">
          <span className="dot dot-muted" />
          Paused
        </span>
      );
    case 'REVIEW':
      return (
        <span className="pill">
          <span className={saved ? 'dot dot-ok' : 'dot dot-warn'} />
          {saved ? 'Saved' : 'Not saved yet'}
        </span>
      );
    default:
      return null;
  }
}

export function Header({ phase, surface, countdown, saved, canPopOut, onPopOut }: HeaderProps) {
  return (
    <header className="header">
      <Wordmark />
      <div className="header-right">
        <Status phase={phase} surface={surface} countdown={countdown} saved={saved} />
        {canPopOut ? (
          <button
            type="button"
            className="btn btn-glass"
            onClick={onPopOut}
            title="Keep Pause and Stop in a small window that stays on top"
          >
            <PopOutIcon size={17} />
            Pop out controls
          </button>
        ) : null}
      </div>
    </header>
  );
}
