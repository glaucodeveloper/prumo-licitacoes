import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    outDir: '../dist-mobile',
    emptyOutDir: true,
  },
});
