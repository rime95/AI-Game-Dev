import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative paths so the built app loads from file:// inside Electron.
  base: './',
  server: { port: 5173, strictPort: true },
  worker: { format: 'es' },
});
