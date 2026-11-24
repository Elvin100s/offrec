/// <reference types="vite/client" />

interface DocumentPictureInPictureOptions {
  width?: number;
  height?: number;
  disallowReturnToOpener?: boolean;
}

interface DocumentPictureInPicture extends EventTarget {
  requestWindow(options?: DocumentPictureInPictureOptions): Promise<Window>;
  readonly window: Window | null;
}

interface Window {
  documentPictureInPicture?: DocumentPictureInPicture;
}

/** Insertable streams for MediaStreamTrack (Chrome, Edge). Not yet in TypeScript's DOM types. */
declare class MediaStreamTrackProcessor {
  constructor(init: { track: MediaStreamTrack; maxBufferSize?: number });
  readonly readable: ReadableStream<VideoFrame>;
}

declare class MediaStreamTrackGenerator extends MediaStreamTrack {
  constructor(init: { kind: 'video' | 'audio' });
  readonly writable: WritableStream<VideoFrame>;
}
