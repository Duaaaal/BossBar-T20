// eslint-disable-next-line import/no-unresolved -- o resolvedor do ESLint 8 não interpreta os exports condicionais do Vite 8
import { defineConfig } from 'vite';

type Vite8OutputOptions = {
  inlineDynamicImports?: boolean;
  codeSplitting?: boolean;
};

// https://vitejs.dev/config
export default defineConfig({
  plugins: [
    {
      name: 'bossbar:forge-vite8-preload-output',
      configResolved(config) {
        const output = config.build.rolldownOptions.output;
        const outputs = Array.isArray(output) ? output : [output];

        for (const currentOutput of outputs) {
          if (!currentOutput) continue;
          const migratedOutput = currentOutput as Vite8OutputOptions;
          delete migratedOutput.inlineDynamicImports;
          migratedOutput.codeSplitting = false;
        }
      },
    },
  ],
});
