import type { CameraFailure } from '../engine/Session';
import type { MessageKey } from '../state';

export interface MessageCopy {
  kicker: string;
  title: string;
  body: string;
  next: string;
}

export const MESSAGES: Record<MessageKey, MessageCopy> = {
  unsupported: {
    kicker: 'Browser not supported',
    title: "Screen recording isn't available here",
    body: "This browser can't share a screen. Phones, tablets and older browsers don't support it.",
    next: 'Open this page in Chrome, Edge or Firefox on a computer.',
  },
  insecure: {
    kicker: 'Secure connection needed',
    title: 'Screen recording needs a secure page',
    body: 'Browsers only allow screen capture on https:// pages or on localhost.',
    next: 'Open Offrec from its https:// address, or run it locally with npm run dev.',
  },
  blocked: {
    kicker: 'Permission denied',
    title: 'Screen sharing was blocked',
    body: 'Your browser or system settings stopped screen capture.',
    next: 'Allow screen recording for this browser in your system settings, then try again.',
  },
  'start-failed': {
    kicker: "Couldn't start",
    title: "Screen sharing didn't start",
    body: 'The browser could not capture what you picked. Another app may be using it.',
    next: 'Close other screen recorders or video calls, then try again.',
  },
  mime: {
    kicker: 'Unsupported format',
    title: "This browser can't save video",
    body: 'None of the MP4 or WebM formats are available for recording.',
    next: 'Update your browser, or use Chrome, Edge or Firefox.',
  },
  'recorder-start': {
    kicker: 'Recorder error',
    title: "Recording couldn't start",
    body: 'The browser refused to start the recorder for this screen.',
    next: 'Stop sharing, pick the window again, then press Record.',
  },
};

export const RECORDER_FAILED: MessageCopy = {
  kicker: 'Recorder error',
  title: 'Recording stopped unexpectedly',
  body: 'Everything captured up to that point is ready to review below.',
  next: 'Save it now, then start a new recording.',
};

export const CAMERA_FAILURES: Record<CameraFailure, string> = {
  denied: 'Camera access was blocked. Allow the camera from the address bar, then turn the camera on again.',
  none: 'No camera was found. Connect a camera, then turn the camera on again.',
  busy: 'Your camera is being used by another app. Close that app, then turn the camera on again.',
  error: "The camera couldn't start. Reconnect it, then turn the camera on again.",
};
