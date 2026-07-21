import path from 'node:path';
import { fileURLToPath } from 'node:url';
// eslint-disable-next-line import/no-unresolved -- pacote ESM resolvido pelo Vite
import react from '@vitejs/plugin-react';
// eslint-disable-next-line import/no-unresolved -- o resolvedor do ESLint 8 não interpreta os exports condicionais do Vite 8
import { defineConfig } from 'vite';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const developmentCsp = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: boss-media: boss-asset:; media-src 'self' boss-media:; connect-src 'self' ws:; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none';";
const productionCsp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: boss-media: boss-asset:; media-src 'self' boss-media:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none';";

// https://vitejs.dev/config
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'strict-production-csp',
      transformIndexHtml(html, context) {
        return context.server
          ? html
          : html.replace(developmentCsp, productionCsp);
      },
    },
  ],
  server: {
    host: '127.0.0.1',
    cors: false,
  },
  build: {
    rollupOptions: {
      input: {
        launcher: path.resolve(projectRoot, 'launcher.html'),
        master: path.resolve(projectRoot, 'master.html'),
        player: path.resolve(projectRoot, 'player.html'),
        control: path.resolve(projectRoot, 'control.html'),
        library: path.resolve(projectRoot, 'library.html'),
        sceneEditor: path.resolve(projectRoot, 'scene-editor.html'),
        soundboard: path.resolve(projectRoot, 'soundboard.html'),
        webPlayer: path.resolve(projectRoot, 'web-player.html'),
      },
    },
  },
});
