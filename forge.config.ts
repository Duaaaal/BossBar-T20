import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';

const config: ForgeConfig = {
  ...(process.env.BOSS_BUILD_OUT
    ? { outDir: process.env.BOSS_BUILD_OUT }
    : {}),
  packagerConfig: {
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
    new MakerZIP({}, ['darwin']),
    new MakerRpm({}),
    new MakerDeb({}),
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
          entry: 'src/preload.ts',
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
