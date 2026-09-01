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
  MusicDuckEvent,
  MusicPlaybackState,
  MusicControlCommand,
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
  HostedPlayerPasswordResetResult,
  NotesSaveResult,
  PlayerProfileDeleteResult,
  PlayerProfileSummary,
  PlayerSheetChangeDecisionResult,
} from './shared/character-sheet';
import type {
  CustomStatusLibraryMutationResult,
  CustomStatusPreset,
  CustomStatusPresetDraft,
} from './shared/custom-status-library';
import type {
  HostedEncounterStartResult,
  HostedSessionStartupProgress,
  HostedSessionState,
  HostedSessionPublicUrlResult,
} from './shared/multiplayer';
import type {
  EncounterDebugOverrideRequest,
  EncounterDebugResult,
  EncounterDebugSnapshot,
} from './shared/encounter-debugger';
import type {
  AreaDamageRequest,
  AreaDamageResult,
  DirectPlayerDamageRequest,
  EncounterFormulaRollRequest,
  EncounterFormulaRollResult,
  EncounterTurnActionResult,
  EncounterTurnState,
  PlayerCombatActionRequest,
  PlayerCombatActionResult,
  PlayerHudState,
  PlayerResourceNotice,
  PlayerStatusRequest,
  PlayerTargetActionResult,
} from './shared/player-combat';
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
let latestSoundboardState: SoundboardState | null = null;
const soundboardSubscribers = new Set<(state: SoundboardState) => void>();
let latestEncounterEffectsState: EncounterEffectsState | null = null;
const encounterEffectsSubscribers = new Set<
  (state: EncounterEffectsState) => void
>();
let latestPlayerHuds: PlayerHudState[] = [];
const playerHudSubscribers = new Set<(state: PlayerHudState[]) => void>();
let latestEncounterTurnState: EncounterTurnState | null = null;
const encounterTurnSubscribers = new Set<
  (state: EncounterTurnState) => void
>();
let latestScenePlan: ScenePlan | null = null;
const scenePlanSubscribers = new Set<(state: ScenePlan) => void>();
let latestScenePlaylist: ScenePlaylistState | null = null;
const scenePlaylistSubscribers = new Set<
  (state: ScenePlaylistState) => void
>();
let latestActivePhasePlaylistRequest: string | null = null;
const activePhasePlaylistRequestSubscribers = new Set<
  (phaseId: string) => void
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

ipcRenderer.on(
  'scene:open-active-playlist-requested',
  (_event, phaseId: string) => {
    latestActivePhasePlaylistRequest = phaseId;
    for (const subscriber of activePhasePlaylistRequestSubscribers) {
      subscriber(phaseId);
    }
    if (activePhasePlaylistRequestSubscribers.size > 0) {
      latestActivePhasePlaylistRequest = null;
    }
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

ipcRenderer.on(
  'multiplayer:player-huds-changed',
  (_event, state: PlayerHudState[]) => {
    latestPlayerHuds = state;
    for (const subscriber of playerHudSubscribers) subscriber(state);
  },
);

ipcRenderer.on(
  'multiplayer:turn-changed',
  (_event, state: EncounterTurnState) => {
    latestEncounterTurnState = state;
    for (const subscriber of encounterTurnSubscribers) subscriber(state);
  },
);

const bossAPI = {
  getState: async (): Promise<BattleState> => {
    const state = (await ipcRenderer.invoke('battle:get-state')) as BattleState;
    latestBattleState = state;
    return state;
  },
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('app:get-version'),
  undoLastChange: (): Promise<boolean> => ipcRenderer.invoke('app:undo'),
  confirmAppClose: () => ipcRenderer.send('app:confirm-close'),
  dispatch: (command: BattleCommand) => {
    ipcRenderer.send('battle:dispatch', command);
  },
  applyHealthSequence: (
    request: HealthSequenceRequest,
  ): Promise<HealthSequenceResult> => ipcRenderer.invoke('health:sequence', request),
  applyAreaDamage: (
    request: AreaDamageRequest,
  ): Promise<AreaDamageResult> => ipcRenderer.invoke('player-combat:area-damage', request),
  applyDirectPlayerDamage: (
    request: DirectPlayerDamageRequest,
  ): Promise<PlayerTargetActionResult> =>
    ipcRenderer.invoke('player-combat:direct-damage', request),
  resolveDirectPlayerDamage: (
    pendingDamageId: string,
  ): Promise<PlayerTargetActionResult> =>
    ipcRenderer.invoke('player-combat:resolve-direct-damage', pendingDamageId),
  applyPlayerStatus: (
    request: PlayerStatusRequest,
  ): Promise<PlayerTargetActionResult> =>
    ipcRenderer.invoke('player-combat:apply-status', request),
  getPlayerHuds: async (): Promise<PlayerHudState[]> => {
    latestPlayerHuds = await ipcRenderer.invoke('multiplayer:get-player-huds');
    return latestPlayerHuds;
  },
  getEncounterTurnState: async (): Promise<EncounterTurnState> => {
    const state = await ipcRenderer.invoke(
      'multiplayer:get-turn-state',
    ) as EncounterTurnState;
    latestEncounterTurnState = state;
    return state;
  },
  advanceEncounterTurn: (
    expectedParticipantId?: string | null,
  ): Promise<EncounterTurnActionResult> =>
    ipcRenderer.invoke('multiplayer:advance-turn', expectedParticipantId),
  rollEncounterInitiative: (
    participantId?: string | null,
    extremeAdvantage = false,
  ): Promise<EncounterTurnActionResult> =>
    ipcRenderer.invoke(
      'multiplayer:roll-initiative',
      participantId,
      extremeAdvantage,
    ),
  rollEncounterFormula: (
    request: EncounterFormulaRollRequest,
  ): Promise<EncounterFormulaRollResult> =>
    ipcRenderer.invoke('multiplayer:roll-formula', request),
  requestPlayerCombatAction: async (
    _request: PlayerCombatActionRequest,
  ): Promise<PlayerCombatActionResult> => {
    void _request;
    return {
      ok: false,
      error: 'As ações de personagem são realizadas pelo navegador do jogador.',
    };
  },
  approveActionPointRequest: (
    requestId: string,
  ): Promise<PlayerCombatActionResult> =>
    ipcRenderer.invoke('multiplayer:approve-action-point', requestId),
  rejectActionPointRequest: (
    requestId: string,
  ): Promise<PlayerCombatActionResult> =>
    ipcRenderer.invoke('multiplayer:reject-action-point', requestId),
  grantHostedHeroPoint: (
    playerId: string,
  ): Promise<PlayerCombatActionResult> =>
    ipcRenderer.invoke('multiplayer:grant-hero-point', playerId),
  grantHostedActionPoint: (
    playerId: string,
  ): Promise<PlayerCombatActionResult> =>
    ipcRenderer.invoke('multiplayer:grant-action-point', playerId),
  revokeHostedHeroPoint: (
    playerId: string,
  ): Promise<PlayerCombatActionResult> =>
    ipcRenderer.invoke('multiplayer:revoke-hero-point', playerId),
  revokeHostedActionPoint: (
    playerId: string,
  ): Promise<PlayerCombatActionResult> =>
    ipcRenderer.invoke('multiplayer:revoke-action-point', playerId),
  setHostedUnarmedStrikeEnabled: (
    playerId: string,
    enabled: boolean,
  ): Promise<PlayerCombatActionResult> =>
    ipcRenderer.invoke(
      'multiplayer:set-unarmed-strike-enabled',
      playerId,
      enabled,
    ),
  setCharacterPrivate: async () => ({
    ok: false,
    error: 'A privacidade é controlada pelo próprio jogador no navegador.',
  }),
  usePlayerAction: async () => ({
    ok: false,
    error: 'As ações são controladas pelo próprio jogador no navegador.',
  }),
  openPresentation: (): Promise<boolean> =>
    ipcRenderer.invoke('presentation:open'),
  isPresentationOpen: (): Promise<boolean> =>
    ipcRenderer.invoke('presentation:is-open'),
  setControlPanelMinimized: (minimized: boolean): Promise<boolean> =>
    ipcRenderer.invoke('control:set-minimized', minimized),
  getCustomStatusLibrary: (): Promise<CustomStatusPreset[]> =>
    ipcRenderer.invoke('custom-status-library:get'),
  createCustomStatusPreset: (
    draft: CustomStatusPresetDraft,
  ): Promise<CustomStatusLibraryMutationResult> =>
    ipcRenderer.invoke('custom-status-library:create', draft),
  deleteCustomStatusPreset: (
    presetId: string,
  ): Promise<CustomStatusLibraryMutationResult> =>
    ipcRenderer.invoke('custom-status-library:delete', presetId),
  openSoundboardWindow: (): Promise<boolean> =>
    ipcRenderer.invoke('soundboard:open-window'),
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
  resetSceneDraft: (): Promise<ScenePlanDraft | null> =>
    ipcRenderer.invoke('scene:reset-draft'),
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
  ): Promise<ScenePlaylistState | null> =>
    ipcRenderer.invoke('scene:open-playlist', phaseId, slot, phaseName, initial),
  addScenePhasePlaylistTracks: (
    phaseId: string,
    slot: SceneAudioSlot,
  ): Promise<ScenePlaylistSelectionResult> =>
    ipcRenderer.invoke('scene-playlist:add-tracks', phaseId, slot),
  dispatchScenePhasePlaylist: (
    phaseId: string,
    slot: SceneAudioSlot,
    command: ScenePlaylistCommand,
  ) => {
    ipcRenderer.send('scene-playlist:dispatch', phaseId, slot, command);
  },
  openBossLibrary: (): Promise<boolean> =>
    ipcRenderer.invoke('library:open-window'),
  openEncounterDebugger: (): Promise<boolean> =>
    ipcRenderer.invoke('encounter-debugger:open-window'),
  getEncounterDebugSnapshot: (): Promise<EncounterDebugSnapshot> =>
    ipcRenderer.invoke('encounter-debugger:get-snapshot'),
  overwriteEncounterDebugCreature: (
    request: EncounterDebugOverrideRequest,
  ): Promise<EncounterDebugResult> =>
    ipcRenderer.invoke('encounter-debugger:overwrite-creature', request),
  hasEncounterLibraryEntries: (): Promise<boolean> =>
    ipcRenderer.invoke('library:has-entries'),
  startNewEncounter: (): Promise<boolean> =>
    ipcRenderer.invoke('launcher:new-encounter'),
  startHostedEncounter: (): Promise<HostedEncounterStartResult> =>
    ipcRenderer.invoke('launcher:host-encounter'),
  returnToLauncher: (): Promise<boolean> =>
    ipcRenderer.invoke('app:return-to-launcher'),
  getHostedSessionState: (): Promise<HostedSessionState> =>
    ipcRenderer.invoke('multiplayer:get-session'),
  setHostedSessionPublicUrl: (
    publicBaseUrl: string | null,
  ): Promise<HostedSessionPublicUrlResult> =>
    ipcRenderer.invoke('multiplayer:set-public-url', publicBaseUrl),
  copyHostedSessionLink: (link?: string): Promise<boolean> =>
    ipcRenderer.invoke('multiplayer:copy-link', link),
  openHostedSessionAsPlayer: (): Promise<boolean> =>
    ipcRenderer.invoke('multiplayer:open-local-player'),
  approveHostedPlayer: (requestId: string): Promise<boolean> =>
    ipcRenderer.invoke('multiplayer:approve-player', requestId),
  rejectHostedPlayer: (requestId: string): Promise<boolean> =>
    ipcRenderer.invoke('multiplayer:reject-player', requestId),
  openHostedPlayerSheet: (playerId: string): Promise<boolean> =>
    ipcRenderer.invoke('multiplayer:open-player-sheet', playerId),
  resetHostedPlayerPassword: (
    playerId: string,
    password: string,
  ): Promise<HostedPlayerPasswordResetResult> =>
    ipcRenderer.invoke('multiplayer:reset-player-password', playerId, password),
  deleteHostedPlayerAccount: (
    playerId: string,
  ): Promise<PlayerProfileDeleteResult> =>
    ipcRenderer.invoke('multiplayer:delete-player-account', playerId),
  getPlayerProfiles: (): Promise<PlayerProfileSummary[]> =>
    ipcRenderer.invoke('multiplayer:get-player-profiles'),
  openPlayerProfileSheet: (profileId: string): Promise<boolean> =>
    ipcRenderer.invoke('multiplayer:open-profile-sheet', profileId),
  resetPlayerProfilePassword: (
    profileId: string,
    password: string,
  ): Promise<HostedPlayerPasswordResetResult> =>
    ipcRenderer.invoke('multiplayer:reset-profile-password', profileId, password),
  deletePlayerProfile: (
    profileId: string,
  ): Promise<PlayerProfileDeleteResult> =>
    ipcRenderer.invoke('multiplayer:delete-profile', profileId),
  decidePlayerSheetChanges: (
    requestId: string,
    approved: boolean,
  ): Promise<PlayerSheetChangeDecisionResult> =>
    ipcRenderer.invoke('multiplayer:decide-sheet-changes', requestId, approved),
  getMasterNotes: (): Promise<string> => ipcRenderer.invoke('notes:get-master'),
  saveMasterNotes: (content: string): Promise<NotesSaveResult> =>
    ipcRenderer.invoke('notes:save-master', content),
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
  getMusicState: async (): Promise<MusicState> => {
    const state = (await ipcRenderer.invoke('music:get-state')) as MusicState;
    latestMusicState = state;
    return state;
  },
  dispatchMusicControl: (command: MusicControlCommand) => {
    ipcRenderer.send('music:control', command);
  },
  openActivePhasePlaylist: (): Promise<boolean> =>
    ipcRenderer.invoke('scene:open-active-playlist'),
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
  releaseSceneBlackout: (): Promise<boolean> =>
    ipcRenderer.invoke('scene:release-blackout'),
  activateSceneBlackout: (): Promise<boolean> =>
    ipcRenderer.invoke('scene:activate-blackout'),
  soundEffectFinished: (effectId: number) => {
    ipcRenderer.send('soundboard:playback-finished', effectId);
  },
  reportSoundEffectError: (effectId: number, index: number) => {
    ipcRenderer.send('soundboard:playback-error', effectId, index);
  },
  encounterEffectFinished: (effectId: number) => {
    ipcRenderer.send('encounter-effects:playback-finished', effectId);
  },
  encounterEffectStarted: (effectId: number) => {
    ipcRenderer.send('encounter-effects:playback-started', effectId);
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
  subscribeHostedSession: (callback: (state: HostedSessionState) => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      state: HostedSessionState,
    ) => callback(state);
    ipcRenderer.on('multiplayer:session-changed', listener);
    return () => ipcRenderer.removeListener('multiplayer:session-changed', listener);
  },
  subscribePlayerHuds: (callback: (state: PlayerHudState[]) => void) => {
    playerHudSubscribers.add(callback);
    callback(latestPlayerHuds);
    return () => playerHudSubscribers.delete(callback);
  },
  subscribePlayerResourceNotice: (
    _callback: (notice: PlayerResourceNotice) => void,
  ) => {
    void _callback;
    return () => undefined;
  },
  subscribeEncounterTurn: (callback: (state: EncounterTurnState) => void) => {
    encounterTurnSubscribers.add(callback);
    if (latestEncounterTurnState) callback(latestEncounterTurnState);
    return () => encounterTurnSubscribers.delete(callback);
  },
  subscribeHostedSessionStartupProgress: (
    callback: (progress: HostedSessionStartupProgress) => void,
  ) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      progress: HostedSessionStartupProgress,
    ) => callback(progress);
    ipcRenderer.on('multiplayer:hosting-progress', listener);
    return () => ipcRenderer.removeListener('multiplayer:hosting-progress', listener);
  },
  subscribeMusic: (callback: (state: MusicState) => void) => {
    musicSubscribers.add(callback);
    if (latestMusicState) callback(latestMusicState);
    return () => musicSubscribers.delete(callback);
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
  subscribeMusicDuck: (callback: (event: MusicDuckEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, event: MusicDuckEvent) => {
      callback(event);
    };
    ipcRenderer.on('music:duck', listener);
    return () => ipcRenderer.removeListener('music:duck', listener);
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
  subscribeActivePhasePlaylistRequested: (callback: (phaseId: string) => void) => {
    activePhasePlaylistRequestSubscribers.add(callback);
    if (latestActivePhasePlaylistRequest) {
      callback(latestActivePhasePlaylistRequest);
      latestActivePhasePlaylistRequest = null;
    }
    return () => activePhasePlaylistRequestSubscribers.delete(callback);
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
