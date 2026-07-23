// eslint-disable-next-line import/no-unresolved -- o resolvedor do ESLint 8 não interpreta os exports condicionais do Vite 8
import { defineConfig } from 'vite';

// Estes pacotes carregam parsers/helpers sob demanda. O bundle CommonJS gerado
// pelo Rolldown para eles perde helpers internos no processo principal do
// Electron; mantê-los externos preserva os módulos que o Node já suporta.
export default defineConfig({
  build: {
    rolldownOptions: {
      external: ['music-metadata', 'pdf-lib'],
    },
  },
});
