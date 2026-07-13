import type { BossAPI } from './shared/api';

declare global {
  interface Window {
    bossAPI: BossAPI;
  }
}

export {};
