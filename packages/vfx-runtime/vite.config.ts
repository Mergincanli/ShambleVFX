import { defineConfig } from 'vite';

// The runtime on its own, as the game will take it: three.js stays outside (the game pins its own copy).
export default defineConfig({
  build: {
    lib: { entry: 'src/index.ts', formats: ['es'], fileName: 'vfx-runtime' },
    rollupOptions: { external: [/^three(\/.*)?$/] },
    outDir: 'dist',
    emptyOutDir: true,
    minify: true,
    sourcemap: false,
  },
});
