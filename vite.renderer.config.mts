import path from 'node:path';
import { fileURLToPath } from 'node:url';
// eslint-disable-next-line import/no-unresolved -- pacote ESM resolvido pelo Vite
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        master: path.resolve(projectRoot, 'master.html'),
        player: path.resolve(projectRoot, 'player.html'),
        music: path.resolve(projectRoot, 'music.html'),
      },
    },
  },
});
