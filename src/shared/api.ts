import type {
  BackgroundSelectionResult,
  BackgroundState,
  BattleCommand,
  BattleState,
  EncounterEffectsState,
  EncounterSoundCustomizationResult,
  EncounterSoundCustomizationState,
  EncounterSoundEffect,
  EncounterSoundEffectKind,
  EncounterGeneralSetting,
  EncounterSoundSetting,
  EncounterVisualEffectSetting,
  HealthEffect,
  HealthSequenceRequest,
  HealthSequenceResult,
  MusicPlaybackState,
  MusicControlCommand,
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
import type {
  HostedEncounterStartResult,
  HostedSessionStartupProgress,
  HostedSessionState,
  HostedSessionPublicUrlResult,
} from './multiplayer';
import type {
  SceneMediaSelectionResult,
  SceneMediaSlot,
  SceneAudioSlot,
  ScenePlaylistCommand,
  ScenePlaylistSelectionResult,
  ScenePlaylistState,
  ScenePlaylistSummary,
  ScenePlan,
  ScenePlanDraft,
  SceneSaveResult,
  SceneTransitionEvent,
} from './scene';

export type BossAPI = {
  getState: () => Promise<BattleState>;
  getAppVersion: () => Promise<string>;
  undoLastChange: () => Promise<boolean>;
  confirmAppClose: () => void;
  dispatch: (command: BattleCommand) => void;
  applyHealthSequence: (
    request: HealthSequenceRequest,
  ) => Promise<HealthSequenceResult>;
  openPresentation: () => Promise<boolean>;
  isPresentationOpen: () => Promise<boolean>;
  setControlPanelMinimized: (minimized: boolean) => Promise<boolean>;
  openSoundboardWindow: () => Promise<boolean>;
  openSceneEditor: () => Promise<boolean>;
  confirmSceneEditorClose: () => void;
  getScenePlan: () => Promise<ScenePlan>;
  saveScenePlan: (draft: ScenePlanDraft) => Promise<SceneSaveResult>;
  resetSceneDraft: () => Promise<ScenePlanDraft | null>;
  chooseScenePhaseMedia: (
    phaseId: string,
    slot: SceneMediaSlot,
  ) => Promise<SceneMediaSelectionResult>;
  clearScenePhaseMedia: (
    phaseId: string,
    slot: SceneMediaSlot,
  ) => Promise<SceneSaveResult>;
  openScenePhasePlaylist: (
    phaseId: string,
    slot: SceneAudioSlot,
    phaseName: string,
    initial: ScenePlaylistSummary | null,
  ) => Promise<ScenePlaylistState | null>;
  addScenePhasePlaylistTracks: (
    phaseId: string,
    slot: SceneAudioSlot,
  ) => Promise<ScenePlaylistSelectionResult>;
  dispatchScenePhasePlaylist: (
    phaseId: string,
    slot: SceneAudioSlot,
    command: ScenePlaylistCommand,
  ) => void;
  openBossLibrary: () => Promise<boolean>;
  hasEncounterLibraryEntries: () => Promise<boolean>;
  startNewEncounter: () => Promise<boolean>;
  startHostedEncounter: () => Promise<HostedEncounterStartResult>;
  returnToLauncher: () => Promise<boolean>;
  getHostedSessionState: () => Promise<HostedSessionState>;
  setHostedSessionPublicUrl: (
    publicBaseUrl: string | null,
  ) => Promise<HostedSessionPublicUrlResult>;
  copyHostedSessionLink: (link?: string) => Promise<boolean>;
  openHostedSessionAsPlayer: () => Promise<boolean>;
  approveHostedPlayer: (requestId: string) => Promise<boolean>;
  rejectHostedPlayer: (requestId: string) => Promise<boolean>;
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
  getMusicState: () => Promise<MusicState>;
  dispatchMusicControl: (command: MusicControlCommand) => void;
  openActivePhasePlaylist: () => Promise<boolean>;
  setUniversalMute: (muted: boolean) => void;
  getEncounterEffectsState: () => Promise<EncounterEffectsState>;
  setEncounterEffectsVolume: (volume: number) => void;
  setEncounterGeneralEnabled: (
    setting: EncounterGeneralSetting,
    enabled: boolean,
  ) => void;
  setEncounterSoundEnabled: (
    setting: EncounterSoundSetting,
    enabled: boolean,
  ) => void;
  setEncounterVisualEffectEnabled: (
    setting: EncounterVisualEffectSetting,
    enabled: boolean,
  ) => void;
  getEncounterSoundCustomization: () => Promise<EncounterSoundCustomizationState>;
  addEncounterSound: (
    kind: EncounterSoundEffectKind,
  ) => Promise<EncounterSoundCustomizationResult>;
  setEncounterSoundOptionEnabled: (
    optionId: string,
    enabled: boolean,
  ) => Promise<EncounterSoundCustomizationResult>;
  removeEncounterSound: (
    optionId: string,
  ) => Promise<EncounterSoundCustomizationResult>;
  getSoundboardState: () => Promise<SoundboardState>;
  assignSoundboardSlot: (
    index: number,
    name: string,
    keepExistingFile: boolean,
  ) => Promise<SoundboardAssignmentResult>;
  dispatchSoundboard: (command: SoundboardCommand) => void;
  releaseSceneBlackout: () => Promise<boolean>;
  activateSceneBlackout: () => Promise<boolean>;
  soundEffectFinished: (effectId: number) => void;
  reportSoundEffectError: (effectId: number, index: number) => void;
  encounterEffectFinished: (effectId: number) => void;
  encounterEffectStarted: (effectId: number) => void;
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
  subscribePresentationOpen: (callback: (open: boolean) => void) => () => void;
  subscribeBossLoaded: (
    callback: (loaded: BossLibraryLoaded) => void,
  ) => () => void;
  subscribeBossLibraryChanged: (callback: () => void) => () => void;
  subscribeHostedSession: (
    callback: (state: HostedSessionState) => void,
  ) => () => void;
  subscribeHostedSessionStartupProgress: (
    callback: (progress: HostedSessionStartupProgress) => void,
  ) => () => void;
  subscribeMusic: (callback: (state: MusicState) => void) => () => void;
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
  subscribeEncounterEffects: (
    callback: (state: EncounterEffectsState) => void,
  ) => () => void;
  subscribeEncounterEffect: (
    callback: (effect: EncounterSoundEffect) => void,
  ) => () => void;
  subscribeScenePlan: (callback: (state: ScenePlan) => void) => () => void;
  subscribeSceneEditorCloseRequested: (callback: () => void) => () => void;
  subscribeScenePhasePlaylist: (
    callback: (state: ScenePlaylistState) => void,
  ) => () => void;
  subscribeActivePhasePlaylistRequested: (
    callback: (phaseId: string) => void,
  ) => () => void;
  subscribeSceneTransition: (
    callback: (effect: SceneTransitionEvent) => void,
  ) => () => void;
};
