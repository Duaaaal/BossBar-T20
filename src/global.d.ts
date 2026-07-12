import type {
  BackgroundSelectionResult,
  BackgroundState,
  BattleCommand,
  BattleState,
  HealthEffect,
} from './shared/battle';

declare global {
  interface Window {
    bossAPI: {
      getState: () => Promise<BattleState>;
      dispatch: (command: BattleCommand) => void;
      openPresentation: () => Promise<boolean>;
      chooseBackground: () => Promise<BackgroundSelectionResult>;
      clearBackground: () => Promise<boolean>;
      getBackground: () => Promise<BackgroundState>;
      presentationReady: () => void;
      reportBackgroundError: (message: string) => void;
      subscribe: (callback: (state: BattleState) => void) => () => void;
      subscribeBackground: (
        callback: (state: BackgroundState) => void,
      ) => () => void;
      subscribeBackgroundError: (
        callback: (message: string) => void,
      ) => () => void;
      subscribeHealthEffect: (
        callback: (effect: HealthEffect) => void,
      ) => () => void;
    };
  }
}

export {};
