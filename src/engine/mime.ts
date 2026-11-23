export interface MimeChoice {
  /** Full type passed to MediaRecorder. */
  type: string;
  /** Container type used for the Blob and the file extension. */
  container: 'video/mp4' | 'video/webm';
  ext: 'mp4' | 'webm';
}

const CANDIDATES: MimeChoice[] = [
  { type: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', container: 'video/mp4', ext: 'mp4' },
  { type: 'video/webm;codecs=vp9,opus', container: 'video/webm', ext: 'webm' },
  { type: 'video/webm;codecs=vp8,opus', container: 'video/webm', ext: 'webm' },
  { type: 'video/webm', container: 'video/webm', ext: 'webm' },
];

/** First supported recording format, or null if this browser can't record video. */
export function pickMime(): MimeChoice | null {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return null;
  }
  for (const candidate of CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(candidate.type)) return candidate;
    } catch {
      // Some browsers throw on unknown codec strings; try the next one.
    }
  }
  return null;
}
