import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

// `music-metadata` e `pdf-lib` precisam permanecer externos ao bundle do
// processo principal. Incluímos somente a árvore transitiva usada por eles,
// evitando copiar todo o `node_modules` para o aplicativo empacotado.
const externalRuntimeModuleDirectories = [
  '/node_modules/@borewit/text-codec',
  '/node_modules/@pdf-lib/standard-fonts',
  '/node_modules/@pdf-lib/upng',
  '/node_modules/@tokenizer/inflate',
  '/node_modules/@tokenizer/token',
  '/node_modules/content-type',
  '/node_modules/debug',
  '/node_modules/file-type',
  '/node_modules/ieee754',
  '/node_modules/media-typer',
  '/node_modules/ms',
  '/node_modules/music-metadata',
  '/node_modules/pako',
  '/node_modules/pdf-lib',
  '/node_modules/pdf-lib/node_modules/tslib',
  '/node_modules/strtok3',
  '/node_modules/token-types',
  '/node_modules/uint8array-extras',
  '/node_modules/win-guid',
] as const;

const isExternalRuntimeModulePath = (file: string) =>
  externalRuntimeModuleDirectories.some(
    (directory) =>
      file === directory ||
      file.startsWith(`${directory}/`) ||
      directory.startsWith(`${file}/`),
  );

const config: ForgeConfig = {
  ...(process.env.BOSS_BUILD_OUT
    ? { outDir: process.env.BOSS_BUILD_OUT }
    : {}),
  packagerConfig: {
    // O plugin Vite normalmente copia apenas `.vite`; preservamos também os
    // módulos externos estritamente necessários em tempo de execução.
    ignore: (file) => {
      if (!file) return false;
      return !file.startsWith('/.vite') && !isExternalRuntimeModulePath(file);
    },
    // Mantém futuras mídias de `assets` fora do ASAR para permitir streaming e seek.
    asar: {
      unpack: '**/assets/**/*.{aac,flac,m4a,m4v,mkv,mov,mp3,mp4,oga,ogg,ogv,wav,webm}',
    },
    icon: 'assets/bossbar-icon.ico',
    extraResource: ['assets'],
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      // Mantém o identificador interno para que instalações antigas possam ser atualizadas.
      name: 'boss_battle',
      title: 'BossBar - Tormenta20',
      description: 'BossBar - Tormenta20',
      copyright: 'Copyright 2026 Brian',
      setupExe: 'BossBar-Tormenta20-Setup.exe',
      setupIcon: 'assets/bossbar-icon.ico',
    }),
  ],
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload-control.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
        {
          entry: 'src/preload-launcher.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
        {
          entry: 'src/preload-library.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
        {
          entry: 'src/preload-master.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
        {
          entry: 'src/preload-player.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
        {
          entry: 'src/preload-scene-editor.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
        {
          entry: 'src/preload-soundboard.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.mts',
        },
      ],
      // Cada preload possui uma API distinta. A compilação sequencial evita que
      // múltiplos alvos disputem o mesmo diretório de saída do Forge/Vite.
      concurrent: false,
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
