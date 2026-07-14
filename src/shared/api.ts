import type {
  BackgroundSelectionResult,
  BackgroundState,
  BattleCommand,
  BattleState,
  HealthEffect,
  HealthSequenceRequest,
  HealthSequenceResult,
  MusicCommand,
  MusicPlaybackState,
  MusicSelectionResult,
  MusicState,
  SoundboardAssignmentResult,
  SoundboardCommand,
  SoundboardState,
  SoundboardStop,
  SoundEffect,
} from './battle';
import type {
  BossLibraryDraft,
  BossLibraryDeleteResult,
  BossLibraryEntrySummary,
  BossLibraryLoadResult,
  BossLibraryLoaded,
  BossLibraryReplaceResult,
  BossLibrarySaveMode,
  BossLibrarySaveResult,
} from './library';

export type BossAPI = {
  getState: () => Promise<BattleState>;
  getAppVersion: () => Promise<string>;
  confirmAppClose: () => void;
  dispatch: (command: BattleCommand) => void;
  applyHealthSequence: (
    request: HealthSequenceRequest,
  ) => Promise<HealthSequenceResult>;
  openPresentation: () => Promise<boolean>;
  openMusicWindow: () => Promise<boolean>;
  openBossLibrary: (bossId: string) => Promise<boolean>;
  getBossLibraryEntries: () => Promise<BossLibraryEntrySummary[]>;
  saveBossToLibrary: (
    draft: BossLibraryDraft,
    mode: BossLibrarySaveMode,
  ) => Promise<BossLibrarySaveResult>;
  saveBossAutosave: (
    draft: BossLibraryDraft,
  ) => Promise<BossLibrarySaveResult>;
  loadBossFromLibrary: (
    entryId: string,
    continueWithoutMissing: boolean,
  ) => Promise<BossLibraryLoadResult>;
  replaceBossLibraryFile: (
    entryId: string,
    key: string,
  ) => Promise<BossLibraryReplaceResult>;
  deleteBossLibraryEntry: (
    entryId: string,
  ) => Promise<BossLibraryDeleteResult>;
  closeBossLibrary: () => void;
  addMusicTracks: () => Promise<MusicSelectionResult>;
  getMusicState: () => Promise<MusicState>;
  getMusicPlayback: () => Promise<MusicPlaybackState>;
  dispatchMusic: (command: MusicCommand) => void;
  setUniversalMute: (muted: boolean) => void;
  getSoundboardState: () => Promise<SoundboardState>;
  assignSoundboardSlot: (
    index: number,
    name: string,
    keepExistingFile: boolean,
  ) => Promise<SoundboardAssignmentResult>;
  dispatchSoundboard: (command: SoundboardCommand) => void;
  setSoundboardOpen: (open: boolean) => Promise<boolean>;
  soundEffectFinished: (effectId: number) => void;
  reportSoundEffectError: (effectId: number, index: number) => void;
  musicTrackEnded: () => void;
  musicFadeoutComplete: () => void;
  reportMusicProgress: (state: MusicPlaybackState) => void;
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
  subscribeAppCloseRequested: (callback: () => void) => () => void;
  subscribeBossLoaded: (
    callback: (loaded: BossLibraryLoaded) => void,
  ) => () => void;
  subscribeBossLibraryChanged: (callback: () => void) => () => void;
  subscribeMusic: (callback: (state: MusicState) => void) => () => void;
  subscribeMusicPlayback: (
    callback: (state: MusicPlaybackState) => void,
  ) => () => void;
  subscribeMusicSeek: (callback: (time: number) => void) => () => void;
  subscribeMusicFadeOut: (
    callback: (duration: number) => void,
  ) => () => void;
  subscribeSoundboard: (
    callback: (state: SoundboardState) => void,
  ) => () => void;
  subscribeSoundEffect: (
    callback: (effect: SoundEffect) => void,
  ) => () => void;
  subscribeSoundboardStop: (
    callback: (stop: SoundboardStop) => void,
  ) => () => void;
  subscribeSoundboardError: (
    callback: (message: string) => void,
  ) => () => void;
};
