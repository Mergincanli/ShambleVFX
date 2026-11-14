import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { projectFiles } from './server/project-files';

export default defineConfig({
  plugins: [projectFiles()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: false,
    // Open the editor in the browser on `npm run dev` (set VFX_NO_OPEN=1 to stop that).
    open: !process.env.VFX_NO_OPEN,
  },
  build: {
    target: 'es2022',
    rollupOptions: {
      input: {
        editor: resolve(import.meta.dirname, 'index.html'),
        check: resolve(import.meta.dirname, 'check.html'),
      },
    },
  },
});
