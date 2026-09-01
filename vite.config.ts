import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main:    resolve(__dirname, 'index.html'),
        creator: resolve(__dirname, 'creator.html'),
        preview: resolve(__dirname, 'preview.html'),
      },
    },
  },
});
