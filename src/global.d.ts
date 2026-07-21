import type { BossAPI } from './shared/api';

declare global {
  interface Window {
    bossAPI: BossAPI;
    /** Ativa URLs HTTP para assets somente no cliente remoto dos jogadores. */
    __BOSS_WEB_PLAYER__?: boolean;
  }
}

export {};
