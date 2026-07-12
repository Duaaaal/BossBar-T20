import type {
  BackgroundSelectionResult,
  BackgroundState,
  BattleCommand,
  BattleState,
  HealthEffect,
  HealthSequenceRequest,
  HealthSequenceResult,
  MusicCommand,
  MusicSelectionResult,
  MusicState,
} from './shared/battle';

declare global {
  interface Window {
    bossAPI: {
      getState: () => Promise<BattleState>;
      dispatch: (command: BattleCommand) => void;
      applyHealthSequence: (
        request: HealthSequenceRequest,
      ) => Promise<HealthSequenceResult>;
      openPresentation: () => Promise<boolean>;
      openMusicWindow: () => Promise<boolean>;
      addMusicTracks: () => Promise<MusicSelectionResult>;
      getMusicState: () => Promise<MusicState>;
      dispatchMusic: (command: MusicCommand) => void;
      musicTrackEnded: () => void;
      musicFadeoutComplete: () => void;
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
      subscribeMusic: (callback: (state: MusicState) => void) => () => void;
      subscribeMusicFadeOut: (
        callback: (duration: number) => void,
      ) => () => void;
    };
  }
}

export {};
