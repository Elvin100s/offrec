import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/800.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';
import '../styles.css';
import './landing.css';

// Tick the demo's timers so the hero feels live. Purely decorative.
const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
if (!reduceMotion) {
  let seconds = 134;
  const pad = (n: number) => String(n).padStart(2, '0');
  window.setInterval(() => {
    seconds += 1;
    const text = `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
    document.querySelectorAll<HTMLElement>('[data-demo-timer]').forEach((el) => {
      el.textContent = text;
    });
  }, 1000);
}
