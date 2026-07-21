import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
// eslint-disable-next-line import/no-unresolved -- pacote ESM resolvido pelo Vite
import react from '@vitejs/plugin-react';
// eslint-disable-next-line import/no-unresolved -- exports condicionais do Vite 8
import { defineConfig } from 'vite';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

// O Forge usa um servidor Vite durante `npm start`. Esta compilação pequena e
// separada fornece ao servidor local uma versão HTTP estática e atual do player.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: path.join(tmpdir(), 'bossbar-t20-web-player-dev'),
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(projectRoot, 'web-player.html'),
    },
  },
});
