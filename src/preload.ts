import { contextBridge, ipcRenderer } from 'electron';
import type { BossAPI } from './shared/api';
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

ipcRenderer.on('soundboard:state-changed', (_event, state: SoundboardState) => {
  latestSoundboardState = state;
  for (const subscriber of soundboardSubscribers) subscriber(state);
});

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
} satisfies BossAPI;

contextBridge.exposeInMainWorld('bossAPI', bossAPI);
