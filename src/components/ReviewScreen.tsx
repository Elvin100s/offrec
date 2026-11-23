import { useState, type SyntheticEvent } from 'react';
import { sanitizeFilename } from '../lib/filename';
import { formatBytes, formatTime } from '../lib/format';
import type { ReviewInfo } from '../state';
import { DownloadIcon, RecordIcon, TrashIcon } from './Icons';
import { MessageCard } from './MessageCard';
import { RECORDER_FAILED } from './messages';

interface ReviewScreenProps {
  review: ReviewInfo;
  title: string;
  onTitle: (title: string) => void;
  onSave: () => void;
  onRecordAnother: () => void;
  onDiscard: () => void;
}

/**
 * Chrome writes WebM files without a duration, which breaks seeking.
 * Jumping far past the end makes the browser work out the real duration.
 */
function fixDuration(event: SyntheticEvent<HTMLVideoElement>) {
  const video = event.currentTarget;
  if (video.duration !== Infinity) return;
  const restore = () => {
    video.removeEventListener('timeupdate', restore);
    video.currentTime = 0;
  };
  video.addEventListener('timeupdate', restore);
  video.currentTime = 1e101;
}

export function ReviewScreen({ review, title, onTitle, onSave, onRecordAnother, onDiscard }: ReviewScreenProps) {
  const [confirm, setConfirm] = useState<'none' | 'discard' | 'another'>('none');
  const filename = `${sanitizeFilename(title)}.${review.ext}`;
  const empty = review.size === 0;

  const recordAnother = () => {
    if (!review.saved) setConfirm('another');
    else onRecordAnother();
  };

  return (
    <main className="review">
      <div className="review-inner">
        {review.failed ? <MessageCard copy={RECORDER_FAILED} /> : null}

        <div className="player">
          <video src={review.url} controls playsInline preload="metadata" onLoadedMetadata={fixDuration} />
        </div>

        <div className="review-panel glass">
          <div className="review-fields">
            <label htmlFor="review-title" className="field-label">
              Title
            </label>
            <input
              id="review-title"
              type="text"
              value={title}
              maxLength={200}
              onChange={(e) => onTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !empty) onSave();
              }}
            />
            {review.savedTo && !empty ? (
              <p className="field-hint saved-to">
                <span className="dot dot-ok" /> Already saved as <span className="filename">{review.savedTo}</span>{' '}
                · {formatTime(review.durationMs / 1000)} · {formatBytes(review.size)}. Save a copy as{' '}
                <span className="filename">{filename}</span> if you like.
              </p>
            ) : (
              <p className="field-hint">
                Saves as <span className="filename">{filename}</span> · {formatTime(review.durationMs / 1000)} ·{' '}
                {formatBytes(review.size)}
              </p>
            )}
          </div>
          <div className="review-actions">
            <button type="button" className="btn btn-accent btn-large" onClick={onSave} disabled={empty}>
              <DownloadIcon size={18} />
              {review.savedTo ? 'Save a copy' : review.saved ? 'Save again' : 'Save video'}
            </button>
            <button type="button" className="btn btn-secondary btn-large" onClick={recordAnother}>
              <RecordIcon />
              Record another
            </button>
            <button
              type="button"
              className="icon-btn danger large"
              aria-label="Discard recording"
              title="Discard"
              onClick={() => setConfirm('discard')}
            >
              <TrashIcon size={18} />
            </button>
          </div>
        </div>

        {confirm !== 'none' ? (
          <div className="confirm glass-danger" role="alertdialog" aria-labelledby="confirm-title">
            <div className="confirm-text">
              <p id="confirm-title" className="confirm-title">
                {confirm === 'discard' ? 'Discard this recording?' : 'Start a new recording?'}
              </p>
              <p className="confirm-body">
                {review.savedTo
                  ? `${review.savedTo} stays on your computer. This only clears it from Offrec.`
                  : review.saved
                  ? 'The saved file stays on your computer. This copy will be cleared.'
                  : "This recording hasn't been saved and can't be recovered."}
              </p>
            </div>
            <button type="button" className="btn btn-secondary" onClick={() => setConfirm('none')} autoFocus>
              Keep it
            </button>
            <button
              type="button"
              className="btn btn-accent"
              onClick={() => {
                setConfirm('none');
                if (confirm === 'discard') onDiscard();
                else onRecordAnother();
              }}
            >
              {confirm === 'discard' ? 'Discard' : 'Discard and record'}
            </button>
          </div>
        ) : null}

        <p className="review-foot">
          {review.savedTo
            ? 'Your recording is already on this computer. Nothing was uploaded.'
            : 'The file stays on this computer. You can rename it and save again.'}
        </p>
      </div>
    </main>
  );
}
