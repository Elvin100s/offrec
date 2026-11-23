import type { CaptureMode, MessageKey } from '../state';
import { LockIcon, MonitorIcon, RecordIcon, WindowIcon } from './Icons';
import { LogoMark } from './Logo';
import { MessageCard } from './MessageCard';
import { MESSAGES } from './messages';

interface IdleScreenProps {
  mode: CaptureMode;
  selecting: boolean;
  message: MessageKey | null;
  onMode: (mode: CaptureMode) => void;
  onStart: () => void;
  onDismissMessage: () => void;
}

const pipSupported = typeof window !== 'undefined' && 'documentPictureInPicture' in window;

export function IdleScreen({ mode, selecting, message, onMode, onStart, onDismissMessage }: IdleScreenProps) {
  const secure = typeof window !== 'undefined' && window.isSecureContext;
  const capable = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;
  const blocker: MessageKey | null = !secure ? 'insecure' : !capable ? 'unsupported' : null;
  const shown = blocker ?? message;

  const hint =
    mode === 'window'
      ? pipSupported
        ? 'Floating Pause and Stop controls stay on top of your other windows, and never show up in the video.'
        : 'Pick the window or tab you want to record. To finish, use the Stop sharing bar or come back here.'
      : 'Floating controls are turned off, so nothing extra shows up in the video. To pause or stop, come back to this tab.';

  return (
    <main className="idle">
      <div className="hero-mark" aria-hidden="true">
        <span className="ring" />
        <span className="ring ring-2" />
        <LogoMark size={132} className="hero-logo" />
      </div>

      <div className="idle-title">
        <h1>offrec</h1>
        <p className="tagline">Screen recording that never leaves your device.</p>
      </div>

      {blocker === null ? (
        <>
          <div className="idle-mode">
            <div className="seg seg-large" role="radiogroup" aria-label="What to record">
              <button
                type="button"
                role="radio"
                aria-checked={mode === 'window'}
                className="seg-btn"
                onClick={() => onMode('window')}
                disabled={selecting}
              >
                <WindowIcon size={18} />
                Window or tab
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={mode === 'screen'}
                className="seg-btn"
                onClick={() => onMode('screen')}
                disabled={selecting}
              >
                <MonitorIcon size={18} />
                Entire screen
              </button>
            </div>
            <p className="idle-hint">{hint}</p>
          </div>

          <button type="button" className="btn btn-accent btn-hero" onClick={onStart} disabled={selecting}>
            <RecordIcon size={18} />
            {selecting ? 'Choose what to share…' : 'Start'}
          </button>
        </>
      ) : null}

      {shown ? (
        <div className="idle-message">
          <MessageCard
            copy={MESSAGES[shown]}
            onDismiss={blocker ? undefined : onDismissMessage}
            action={
              shown === 'blocked' || shown === 'start-failed' ? (
                <button type="button" className="btn btn-glass" onClick={onStart}>
                  Try again
                </button>
              ) : undefined
            }
          />
        </div>
      ) : null}

      <p className="privacy">
        <LockIcon size={16} />
        Nothing leaves your device.
      </p>
    </main>
  );
}
