interface LogoProps {
  size?: number;
  className?: string;
  label?: string;
}

/** The Offrec "broken ring" mark. The ring follows the text color; the dot is always the accent. */
export function LogoMark({ size = 24, className, label }: LogoProps) {
  const small = size <= 32;
  const tiny = size <= 16;
  const r = tiny ? 24 : 25;
  const strokeWidth = tiny ? 8 : small ? 6 : 5;
  const dash = tiny ? '120 31' : '125 32';
  const dot = tiny ? 13 : small ? 12 : 11;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <circle
        cx="32"
        cy="32"
        r={r}
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={dash}
        transform="rotate(-30 32 32)"
      />
      <circle cx="32" cy="32" r={dot} fill="#FF4D5E" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <a className="wordmark" href="/" title="Offrec home">
      <LogoMark size={24} className="wordmark-mark" />
      offrec
    </a>
  );
}
