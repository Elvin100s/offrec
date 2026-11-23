import type { ReactNode } from 'react';
import { AlertIcon, CloseIcon } from './Icons';
import type { MessageCopy } from './messages';

interface MessageCardProps {
  copy: MessageCopy;
  action?: ReactNode;
  onDismiss?: () => void;
}

export function MessageCard({ copy, action, onDismiss }: MessageCardProps) {
  return (
    <div className="card message-card" role="alert">
      <span className="message-icon">
        <AlertIcon size={18} />
      </span>
      <div className="message-text">
        <span className="kicker">{copy.kicker}</span>
        <p className="message-title">{copy.title}</p>
        <p className="message-body">{copy.body}</p>
        <p className="message-next">{copy.next}</p>
        {action ? <div className="message-actions">{action}</div> : null}
      </div>
      {onDismiss ? (
        <button type="button" className="icon-btn ghost small" aria-label="Dismiss" title="Dismiss" onClick={onDismiss}>
          <CloseIcon size={16} />
        </button>
      ) : null}
    </div>
  );
}
