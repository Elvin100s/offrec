import type { ReactNode } from 'react';

interface IconProps {
  size?: number;
}

function Stroke({ size = 20, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const CameraIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M15 10l5-3v10l-5-3z" />
    <rect x="3" y="6" width="12" height="12" rx="2" />
  </Stroke>
);

export const CameraOffIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M15 10l5-3v10l-5-3z" />
    <rect x="3" y="6" width="12" height="12" rx="2" />
    <path d="M2 2l20 20" />
  </Stroke>
);

export const MicIcon = (p: IconProps) => (
  <Stroke {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0" />
    <path d="M12 18v3" />
  </Stroke>
);

export const MicOffIcon = (p: IconProps) => (
  <Stroke {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0" />
    <path d="M12 18v3" />
    <path d="M2 2l20 20" />
  </Stroke>
);

export const LockIcon = (p: IconProps) => (
  <Stroke {...p}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Stroke>
);

export const WindowIcon = (p: IconProps) => (
  <Stroke {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 9h18" />
  </Stroke>
);

export const MonitorIcon = (p: IconProps) => (
  <Stroke {...p}>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M8 20h8" />
    <path d="M12 16v4" />
  </Stroke>
);

export const PopOutIcon = (p: IconProps) => (
  <Stroke {...p}>
    <rect x="3" y="7" width="13" height="13" rx="2" />
    <path d="M14 3h7v7" />
    <path d="M21 3l-8 8" />
  </Stroke>
);

export const DownloadIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M12 4v11" />
    <path d="M7 10l5 5 5-5" />
    <path d="M5 20h14" />
  </Stroke>
);

export const TrashIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M4 7h16" />
    <path d="M9 7V4h6v3" />
    <path d="M6 7l1 13h10l1-13" />
  </Stroke>
);

export const AlertIcon = (p: IconProps) => (
  <Stroke {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v6" />
    <path d="M12 16.5v.5" />
  </Stroke>
);

export const CloseIcon = (p: IconProps) => (
  <Stroke {...p}>
    <path d="M6 6l12 12" />
    <path d="M18 6L6 18" />
  </Stroke>
);

export const RecordIcon = ({ size = 14 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="9" fill="currentColor" />
  </svg>
);

export const PauseIcon = ({ size = 16 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
    <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
  </svg>
);

export const PlayIcon = ({ size = 16 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M7 5l12 7-12 7z" fill="currentColor" />
  </svg>
);

export const StopIcon = ({ size = 13 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <rect x="4" y="4" width="16" height="16" rx="3" fill="currentColor" />
  </svg>
);

/** Position preset glyph: a frame with a small filled block in one corner. */
export const CornerIcon = ({ corner, size = 20 }: IconProps & { corner: 'tl' | 'tr' | 'bl' | 'br' }) => {
  const x = corner[1] === 'l' ? 5 : 13;
  const y = corner[0] === 't' ? 7 : 12;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <rect x="3" y="4" width="18" height="16" rx="3" stroke="currentColor" strokeWidth="1.8" />
      <rect x={x} y={y} width="6" height="5" rx="1.2" fill="currentColor" />
    </svg>
  );
};
