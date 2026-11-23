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

interface SaveFilePickerOptions {
  suggestedName?: string;
  id?: string;
  startIn?: string;
  types?: { description?: string; accept: Record<string, string[]> }[];
}

interface Window {
  documentPictureInPicture?: DocumentPictureInPicture;
  /** File System Access API (Chrome, Edge). */
  showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;
}
