// Drives the compositor. Timers in a worker keep firing while the tab is in the
// background, unlike requestAnimationFrame (which stops) and main-thread timers
// (which get throttled to once a second or less).
const scope = self as unknown as { postMessage(message: unknown): void };

setInterval(() => {
  scope.postMessage(0);
}, 33);

export {};
