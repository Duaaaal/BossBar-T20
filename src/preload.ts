import { contextBridge, ipcRenderer } from 'electron';
import type { BossAPI } from './shared/api';
import {
  bossApiMethodsByRole,
  type RendererRole,
} from './shared/preload';
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
  MusicCommand,
  MusicPlaybackState,
  MusicSelectionResult,
  MusicState,
  SoundboardAssignmentResult,
  SoundboardCommand,
  SoundboardState,
  SoundboardStop,
  SoundEffect,
} from './shared/battle';
import type {
  BossLibraryDraft,
  BossLibraryDeleteResult,
  BossLibraryEntrySummary,
  BossLibraryLoadResult,
  BossLibraryLoaded,
  BossLibraryReplaceResult,
  BossLibrarySaveMode,
  BossLibrarySaveResult,
} from './shared/library';
import type {
  SceneAudioSlot,
  SceneMediaSelectionResult,
  SceneMediaSlot,
  ScenePlaylistCommand,
  ScenePlaylistSelectionResult,
  ScenePlaylistState,
  ScenePlaylistSummary,
  ScenePlan,
  ScenePlanDraft,
  SceneSaveResult,
  SceneTransitionEvent,
} from './shared/scene';

let latestBattleState: BattleState | null = null;
const stateSubscribers = new Set<(state: BattleState) => void>();
let latestBackground: BackgroundState | null = null;
const backgroundSubscribers = new Set<(state: BackgroundState) => void>();
let latestMusicState: MusicState | null = null;
const musicSubscribers = new Set<(state: MusicState) => void>();
let latestMusicPlayback: MusicPlaybackState | null = null;
const musicPlaybackSubscribers = new Set<
  (state: MusicPlaybackState) => void
>();
let latestSoundboardState: SoundboardState | null = null;
const soundboardSubscribers = new Set<(state: SoundboardState) => void>();
let latestEncounterEffectsState: EncounterEffectsState | null = null;
const encounterEffectsSubscribers = new Set<
  (state: EncounterEffectsState) => void
>();
let latestScenePlan: ScenePlan | null = null;
const scenePlanSubscribers = new Set<(state: ScenePlan) => void>();
let latestScenePlaylist: ScenePlaylistState | null = null;
const scenePlaylistSubscribers = new Set<
  (state: ScenePlaylistState) => void
>();

ipcRenderer.on('battle:state-changed', (_event, state: BattleState) => {
  latestBattleState = state;
  for (const subscriber of stateSubscribers) {
    subscriber(state);
  }
});

ipcRenderer.on('background:changed', (_event, background: BackgroundState) => {
  latestBackground = background;
  for (const subscriber of backgroundSubscribers) {
    subscriber(background);
  }
});

ipcRenderer.on('music:state-changed', (_event, state: MusicState) => {
  latestMusicState = state;
  for (const subscriber of musicSubscribers) subscriber(state);
});

ipcRenderer.on(
  'music:playback-changed',
  (_event, state: MusicPlaybackState) => {
    latestMusicPlayback = state;
    for (const subscriber of musicPlaybackSubscribers) subscriber(state);
  },
);

ipcRenderer.on('scene:state-changed', (_event, state: ScenePlan) => {
  latestScenePlan = state;
  for (const subscriber of scenePlanSubscribers) subscriber(state);
});

ipcRenderer.on(
  'scene:playlist-changed',
  (_event, state: ScenePlaylistState) => {
    latestScenePlaylist = state;
    for (const subscriber of scenePlaylistSubscribers) subscriber(state);
  },
);

ipcRenderer.on('soundboard:state-changed', (_event, state: SoundboardState) => {
  latestSoundboardState = state;
  for (const subscriber of soundboardSubscribers) subscriber(state);
});

ipcRenderer.on(
  'encounter-effects:state-changed',
  (_event, state: EncounterEffectsState) => {
    latestEncounterEffectsState = state;
    for (const subscriber of encounterEffectsSubscribers) subscriber(state);
  },
);

const bossAPI = {
  getState: async (): Promise<BattleState> => {
    const state = (await ipcRenderer.invoke('battle:get-state')) as BattleState;
    latestBattleState = state;
    return state;
  },
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('app:get-version'),
  confirmAppClose: () => ipcRenderer.send('app:confirm-close'),
  dispatch: (command: BattleCommand) => {
    ipcRenderer.send('battle:dispatch', command);
  },
  applyHealthSequence: (
    request: HealthSequenceRequest,
  ): Promise<HealthSequenceResult> => ipcRenderer.invoke('health:sequence', request),
  openPresentation: (): Promise<boolean> =>
    ipcRenderer.invoke('presentation:open'),
  isPresentationOpen: (): Promise<boolean> =>
    ipcRenderer.invoke('presentation:is-open'),
  setControlPanelMinimized: (minimized: boolean): Promise<boolean> =>
    ipcRenderer.invoke('control:set-minimized', minimized),
  openMusicWindow: (): Promise<boolean> =>
    ipcRenderer.invoke('music:open-window'),
  openSceneEditor: (): Promise<boolean> =>
    ipcRenderer.invoke('scene:open-window'),
  confirmSceneEditorClose: () => ipcRenderer.send('scene:confirm-close'),
  getScenePlan: async (): Promise<ScenePlan> => {
    const state = (await ipcRenderer.invoke('scene:get-state')) as ScenePlan;
    latestScenePlan = state;
    return state;
  },
  saveScenePlan: (draft: ScenePlanDraft): Promise<SceneSaveResult> =>
    ipcRenderer.invoke('scene:save', draft),
  chooseScenePhaseMedia: (
    phaseId: string,
    slot: SceneMediaSlot,
  ): Promise<SceneMediaSelectionResult> =>
    ipcRenderer.invoke('scene:choose-media', phaseId, slot),
  clearScenePhaseMedia: (
    phaseId: string,
    slot: SceneMediaSlot,
  ): Promise<SceneSaveResult> =>
    ipcRenderer.invoke('scene:clear-media', phaseId, slot),
  openScenePhasePlaylist: (
    phaseId: string,
    slot: SceneAudioSlot,
    phaseName: string,
    initial: ScenePlaylistSummary | null,
  ): Promise<boolean> =>
    ipcRenderer.invoke('scene:open-playlist', phaseId, slot, phaseName, initial),
  getScenePhasePlaylist: async (): Promise<ScenePlaylistState | null> => {
    const state = (await ipcRenderer.invoke(
      'scene-playlist:get-state',
    )) as ScenePlaylistState | null;
    latestScenePlaylist = state;
    return state;
  },
  addScenePhasePlaylistTracks: (): Promise<ScenePlaylistSelectionResult> =>
    ipcRenderer.invoke('scene-playlist:add-tracks'),
  dispatchScenePhasePlaylist: (
    phaseId: string,
    slot: SceneAudioSlot,
    command: ScenePlaylistCommand,
  ) => {
    ipcRenderer.send('scene-playlist:dispatch', phaseId, slot, command);
  },
  openBossLibrary: (): Promise<boolean> =>
    ipcRenderer.invoke('library:open-window'),
  hasEncounterLibraryEntries: (): Promise<boolean> =>
    ipcRenderer.invoke('library:has-entries'),
  startNewEncounter: (): Promise<boolean> =>
    ipcRenderer.invoke('launcher:new-encounter'),
  getBossLibraryEntries: (): Promise<BossLibraryEntrySummary[]> =>
    ipcRenderer.invoke('library:get-entries'),
  saveBossToLibrary: (
    draft: BossLibraryDraft,
    mode: BossLibrarySaveMode,
  ): Promise<BossLibrarySaveResult> =>
    ipcRenderer.invoke('library:save-boss', draft, mode),
  saveBossAutosave: (
    draft: BossLibraryDraft,
  ): Promise<BossLibrarySaveResult> =>
    ipcRenderer.invoke('library:autosave', draft),
  loadBossFromLibrary: (
    entryId: string,
    continueWithoutMissing: boolean,
  ): Promise<BossLibraryLoadResult> =>
    ipcRenderer.invoke('library:load-boss', entryId, continueWithoutMissing),
  replaceBossLibraryFile: (
    entryId: string,
    key: string,
  ): Promise<BossLibraryReplaceResult> =>
    ipcRenderer.invoke('library:replace-file', entryId, key),
  deleteBossLibraryEntry: (
    entryId: string,
  ): Promise<BossLibraryDeleteResult> =>
    ipcRenderer.invoke('library:delete-entry', entryId),
  closeBossLibrary: () => ipcRenderer.send('library:close-window'),
  addMusicTracks: (): Promise<MusicSelectionResult> =>
    ipcRenderer.invoke('music:add-tracks'),
  getMusicState: async (): Promise<MusicState> => {
    const state = (await ipcRenderer.invoke('music:get-state')) as MusicState;
    latestMusicState = state;
    return state;
  },
  getMusicPlayback: async (): Promise<MusicPlaybackState> => {
    const state = (await ipcRenderer.invoke(
      'music:get-playback',
    )) as MusicPlaybackState;
    latestMusicPlayback = state;
    return state;
  },
  dispatchMusic: (command: MusicCommand) => {
    ipcRenderer.send('music:dispatch', command);
  },
  setUniversalMute: (muted: boolean) => {
    ipcRenderer.send('audio:set-universal-muted', muted);
  },
  getEncounterEffectsState: async (): Promise<EncounterEffectsState> => {
    const state = (await ipcRenderer.invoke(
      'encounter-effects:get-state',
    )) as EncounterEffectsState;
    latestEncounterEffectsState = state;
    return state;
  },
  setEncounterEffectsVolume: (volume: number) => {
    ipcRenderer.send('encounter-effects:set-volume', volume);
  },
  setEncounterGeneralEnabled: (
    setting: EncounterGeneralSetting,
    enabled: boolean,
  ) => {
    ipcRenderer.send('encounter-effects:set-general-enabled', setting, enabled);
  },
  setEncounterSoundEnabled: (
    setting: EncounterSoundSetting,
    enabled: boolean,
  ) => {
    ipcRenderer.send('encounter-effects:set-sound-enabled', setting, enabled);
  },
  setEncounterVisualEffectEnabled: (
    setting: EncounterVisualEffectSetting,
    enabled: boolean,
  ) => {
    ipcRenderer.send('encounter-effects:set-visual-enabled', setting, enabled);
  },
  getEncounterSoundCustomization: (): Promise<EncounterSoundCustomizationState> =>
    ipcRenderer.invoke('encounter-sounds:get-state'),
  addEncounterSound: (
    kind: EncounterSoundEffectKind,
  ): Promise<EncounterSoundCustomizationResult> =>
    ipcRenderer.invoke('encounter-sounds:add', kind),
  setEncounterSoundOptionEnabled: (
    optionId: string,
    enabled: boolean,
  ): Promise<EncounterSoundCustomizationResult> =>
    ipcRenderer.invoke('encounter-sounds:set-enabled', optionId, enabled),
  removeEncounterSound: (
    optionId: string,
  ): Promise<EncounterSoundCustomizationResult> =>
    ipcRenderer.invoke('encounter-sounds:remove', optionId),
  getSoundboardState: async (): Promise<SoundboardState> => {
    const state = (await ipcRenderer.invoke(
      'soundboard:get-state',
    )) as SoundboardState;
    latestSoundboardState = state;
    return state;
  },
  assignSoundboardSlot: (
    index: number,
    name: string,
    keepExistingFile: boolean,
  ): Promise<SoundboardAssignmentResult> =>
    ipcRenderer.invoke('soundboard:assign', index, name, keepExistingFile),
  dispatchSoundboard: (command: SoundboardCommand) => {
    ipcRenderer.send('soundboard:dispatch', command);
  },
  setSoundboardOpen: (open: boolean): Promise<boolean> =>
    ipcRenderer.invoke('music:set-soundboard-open', open),
  soundEffectFinished: (effectId: number) => {
    ipcRenderer.send('soundboard:playback-finished', effectId);
  },
  reportSoundEffectError: (effectId: number, index: number) => {
    ipcRenderer.send('soundboard:playback-error', effectId, index);
  },
  encounterEffectFinished: (effectId: number) => {
    ipcRenderer.send('encounter-effects:playback-finished', effectId);
  },
  musicTrackEnded: () => {
    ipcRenderer.send('music:track-ended');
  },
  musicFadeoutComplete: () => {
    ipcRenderer.send('music:fadeout-complete');
  },
  reportMusicProgress: (state: MusicPlaybackState) => {
    ipcRenderer.send('music:progress', state);
  },
  chooseBackground: (): Promise<BackgroundSelectionResult> =>
    ipcRenderer.invoke('background:choose'),
  clearBackground: (): Promise<boolean> =>
    ipcRenderer.invoke('background:clear'),
  getBackground: async (): Promise<BackgroundState> => {
    const background = (await ipcRenderer.invoke(
      'background:get',
    )) as BackgroundState;
    latestBackground = background;
    return background;
  },
  presentationReady: () => {
    ipcRenderer.send('presentation:ready');
  },
  reportBackgroundError: (message: string) => {
    ipcRenderer.send('background:load-error', message);
  },
  subscribe: (callback: (state: BattleState) => void) => {
    stateSubscribers.add(callback);

    if (latestBattleState) {
      callback(latestBattleState);
    }

    return () => stateSubscribers.delete(callback);
  },
  subscribeBackground: (callback: (state: BackgroundState) => void) => {
    backgroundSubscribers.add(callback);

    if (latestBackground) {
      callback(latestBackground);
    }

    return () => backgroundSubscribers.delete(callback);
  },
  subscribeBackgroundError: (callback: (message: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, message: string) => {
      callback(message);
    };
    ipcRenderer.on('background:error', listener);
    return () => ipcRenderer.removeListener('background:error', listener);
  },
  subscribeHealthEffect: (callback: (effect: HealthEffect) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, effect: HealthEffect) => {
      callback(effect);
    };
    ipcRenderer.on('health:effect', listener);
    return () => ipcRenderer.removeListener('health:effect', listener);
  },
  subscribeAppCloseRequested: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('app:close-requested', listener);
    return () => ipcRenderer.removeListener('app:close-requested', listener);
  },
  subscribePresentationOpen: (callback: (open: boolean) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, open: boolean) => callback(open);
    ipcRenderer.on('presentation:open-changed', listener);
    return () => ipcRenderer.removeListener('presentation:open-changed', listener);
  },
  subscribeBossLoaded: (callback: (loaded: BossLibraryLoaded) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, loaded: BossLibraryLoaded) => {
      callback(loaded);
    };
    ipcRenderer.on('library:boss-loaded', listener);
    return () => ipcRenderer.removeListener('library:boss-loaded', listener);
  },
  subscribeBossLibraryChanged: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('library:entries-changed', listener);
    return () => ipcRenderer.removeListener('library:entries-changed', listener);
  },
  subscribeMusic: (callback: (state: MusicState) => void) => {
    musicSubscribers.add(callback);
    if (latestMusicState) callback(latestMusicState);
    return () => musicSubscribers.delete(callback);
  },
  subscribeMusicPlayback: (
    callback: (state: MusicPlaybackState) => void,
  ) => {
    musicPlaybackSubscribers.add(callback);
    if (latestMusicPlayback) callback(latestMusicPlayback);
    return () => musicPlaybackSubscribers.delete(callback);
  },
  subscribeMusicSeek: (callback: (time: number) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, time: number) => {
      callback(time);
    };
    ipcRenderer.on('music:seek', listener);
    return () => ipcRenderer.removeListener('music:seek', listener);
  },
  subscribeMusicFadeOut: (callback: (duration: number) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, duration: number) => {
      callback(duration);
    };
    ipcRenderer.on('music:fade-out', listener);
    return () => ipcRenderer.removeListener('music:fade-out', listener);
  },
  subscribeSoundboard: (callback: (state: SoundboardState) => void) => {
    soundboardSubscribers.add(callback);
    if (latestSoundboardState) callback(latestSoundboardState);
    return () => soundboardSubscribers.delete(callback);
  },
  subscribeSoundEffect: (callback: (effect: SoundEffect) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, effect: SoundEffect) => {
      callback(effect);
    };
    ipcRenderer.on('soundboard:play', listener);
    return () => ipcRenderer.removeListener('soundboard:play', listener);
  },
  subscribeSoundboardStop: (callback: (stop: SoundboardStop) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, stop: SoundboardStop) => {
      callback(stop);
    };
    ipcRenderer.on('soundboard:stop', listener);
    return () => ipcRenderer.removeListener('soundboard:stop', listener);
  },
  subscribeSoundboardError: (callback: (message: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, message: string) => {
      callback(message);
    };
    ipcRenderer.on('soundboard:error', listener);
    return () => ipcRenderer.removeListener('soundboard:error', listener);
  },
  subscribeEncounterEffects: (
    callback: (state: EncounterEffectsState) => void,
  ) => {
    encounterEffectsSubscribers.add(callback);
    if (latestEncounterEffectsState) callback(latestEncounterEffectsState);
    return () => encounterEffectsSubscribers.delete(callback);
  },
  subscribeEncounterEffect: (
    callback: (effect: EncounterSoundEffect) => void,
  ) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      effect: EncounterSoundEffect,
    ) => callback(effect);
    ipcRenderer.on('encounter-effects:play', listener);
    return () => ipcRenderer.removeListener('encounter-effects:play', listener);
  },
  subscribeScenePlan: (callback: (state: ScenePlan) => void) => {
    scenePlanSubscribers.add(callback);
    if (latestScenePlan) callback(latestScenePlan);
    return () => scenePlanSubscribers.delete(callback);
  },
  subscribeSceneEditorCloseRequested: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('scene:close-requested', listener);
    return () => ipcRenderer.removeListener('scene:close-requested', listener);
  },
  subscribeScenePhasePlaylist: (
    callback: (state: ScenePlaylistState) => void,
  ) => {
    scenePlaylistSubscribers.add(callback);
    if (latestScenePlaylist) callback(latestScenePlaylist);
    return () => scenePlaylistSubscribers.delete(callback);
  },
  subscribeSceneTransition: (
    callback: (effect: SceneTransitionEvent) => void,
  ) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      effect: SceneTransitionEvent,
    ) => callback(effect);
    ipcRenderer.on('scene:transition', listener);
    return () => ipcRenderer.removeListener('scene:transition', listener);
  },
} satisfies BossAPI;

export const exposeBossApi = (role: RendererRole) => {
  const roleApi = Object.fromEntries(
    bossApiMethodsByRole[role].map((method) => [method, bossAPI[method]]),
  ) as Partial<BossAPI>;

  contextBridge.exposeInMainWorld('bossAPI', Object.freeze(roleApi));
};
