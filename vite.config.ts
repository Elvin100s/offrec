import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Same security headers as vercel.json, so `npm run preview` behaves like production.
// (The dev server skips them: hot reload needs inline scripts and a websocket.)
const securityHeaders = {
  'Content-Security-Policy':
    "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; media-src blob: mediastream:; worker-src 'self' blob:; connect-src 'none'; manifest-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'Permissions-Policy': 'display-capture=(self), camera=(self), microphone=(self)',
  'Referrer-Policy': 'no-referrer',
};

export default defineConfig({
  plugins: [react()],
  worker: { format: 'es' },
  // assetsInlineLimit 0: never turn small fonts into data: URLs, which the CSP (font-src 'self') blocks.
  build: { target: 'es2022', sourcemap: false, assetsInlineLimit: 0 },
  preview: { headers: securityHeaders },
});
