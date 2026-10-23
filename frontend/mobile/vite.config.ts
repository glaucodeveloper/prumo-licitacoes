import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileRoot = fileURLToPath(new URL('.', import.meta.url));
const frontendRoot = resolve(mobileRoot, '..');

export default defineConfig({
  root: mobileRoot,
  base: './',
  publicDir: false,
  build: {
    outDir: resolve(frontendRoot, 'dist-mobile'),
    emptyOutDir: true,
  },
});
