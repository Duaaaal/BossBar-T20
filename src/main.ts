import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  net,
  protocol,
  screen,
  session,
  shell,
} from 'electron';
import { randomInt, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createReadStream, mkdirSync, statSync } from 'node:fs';
import {
  copyFile,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pathToFileURL } from 'node:url';
import started from 'electron-squirrel-startup';
// O resolvedor do ESLint ainda não reconhece o export condicional "node" do pacote.
// eslint-disable-next-line import/no-unresolved
import { parseFile } from 'music-metadata';
import {
  applyBattleCommand,
  advanceBossTurn,
  calculateHealthSequence,
  clampDamageToHealthFloor,
  chooseEncounterSoundIndex,
  createInitialBoss,
  getEncounterSoundEffectKind,
  initialEncounterEffectsState,
  initialBattleState,
  isMusicControlCommand,
  isEncounterSoundEnabled,
  isEncounterSoundEffectKind,
  isBattleCommand,
  type BackgroundSelectionResult,
  type BackgroundState,
  type BattleState,
  type BossState,
  type EncounterEffectsState,
  type EncounterGeneralSetting,
  type EncounterSoundCustomizationResult,
  type EncounterSoundCustomizationState,
  type EncounterSoundEffect,
  type EncounterSoundEffectKind,
  type EncounterSoundOption,
  type EncounterSoundSetting,
  type EncounterVisualEffectSetting,
  type HealthEffect,
  type HealthSequenceRequest,
  type HealthSequenceResult,
  type MusicPlaybackState,
  type MusicControlCommand,
  type MusicState,
  type SoundboardAssignmentResult,
  type SoundboardState,
  type SoundboardStop,
  type SoundEffect,
  isSoundboardCommand,
} from './shared/battle';
import type {
  BossLibraryDeleteResult,
  BossLibraryBossDraft,
  BossLibraryDraft,
  BossLibraryEntrySummary,
  BossLibraryLoadResult,
  BossLibraryLoaded,
  BossLibraryReplaceResult,
  BossLibrarySaveResult,
  MissingLibraryFile,
} from './shared/library';
import type {
  HostedPlayerPasswordResetResult,
  NotesSaveResult,
  PlayerProfileDeleteResult,
} from './shared/character-sheet';
import {
  isCustomStatusPresetId,
  type CustomStatusLibraryMutationResult,
} from './shared/custom-status-library';
import {
  backgroundImageExtensions,
  backgroundMediaTypeForFile,
  backgroundVideoExtensions,
  backgroundVideoMimeTypeForFile,
  resolveByteRange,
  resolveMediaOriginPolicy,
} from './shared/media';
import type { RendererRole } from './shared/preload';
import type {
  HostedEncounterStartResult,
  HostedSessionStartupProgress,
  HostedSessionState,
  HostedSessionPublicUrlResult,
  MultiplayerPresence,
} from './shared/multiplayer';
import {
  advanceEncounterTurns,
  beginEncounterTurns,
  emptyEncounterTurnState,
  isAreaDamageRequest,
  isDirectPlayerDamageRequest,
  linkEncounterRollCorrelation,
  normalizeEncounterFormulaRequest,
  prepareManualInitiative,
  rollInitiativeOrder,
  rollManualInitiative,
  type AreaDamageResult,
  type DirectPlayerDamageRequest,
  type EncounterFormulaRollResult,
  type EncounterRollResult,
  type EncounterTurnActionResult,
  type EncounterTurnState,
  type PlayerCombatActionResult,
  type PlayerHudState,
  type PlayerStatusRequest,
  type PlayerTargetActionResult,
} from './shared/player-combat';
import {
  normalizeActiveStatuses,
  parseDamageFormula,
  rollDamageFormulaDetailed,
  type ActiveBossStatus,
} from './shared/status';
import {
  normalizeBossSkillOverrides,
  normalizeBossSkillValues,
  resolveBossSkillValues,
} from './shared/boss-skills';
import {
  deriveStatusAttributes,
  reconcileStatusIncompatibilities,
} from './shared/status-rules';
import {
  adjacentScenePlaylistTrackId,
  applySceneBossPatch,
  clampSceneOverflowHealth,
  createScenePlan,
  normalizeSceneBossPatch,
  validateSceneRanges,
  type SceneBossDirective,
  type SceneAudioSlot,
  type SceneMediaSelectionResult,
  type SceneMediaSlot,
  type ScenePhase,
  type ScenePlaylistCommand,
  type ScenePlaylistSelectionResult,
  type ScenePlaylistState,
  type ScenePlaylistSummary,
  type ScenePlan,
  type ScenePlanDraft,
  type SceneSaveResult,
  type SceneTransitionEvent,
  type SceneTransitionKind,
} from './shared/scene';
import {
  calculateInitialDockedPresentationSize,
  calculateProportionalDockedSize,
} from './shared/window-layout';
import {
  createPublicPresentationSnapshot,
  toPublicBattleState,
  toPublicSceneState,
} from './multiplayer/public-presentation';
import {
  MultiplayerSessionServer,
  type SessionMediaResource,
} from './multiplayer/session-server';
import { PlayerProfileStore } from './multiplayer/player-profile-store';
import { CustomStatusLibraryStore } from './custom-status-library-store';
import {
  CLOUDFLARED_VERSION,
  ensureCloudflaredBinary,
  startCloudflareQuickTunnel,
  type QuickTunnelHandle,
} from './multiplayer/quick-tunnel';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'boss-media',
    privileges: {
      standard: true,
      secure: true,
      corsEnabled: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
  {
    scheme: 'boss-asset',
    privileges: {
      standard: true,
      secure: true,
      corsEnabled: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);

if (started) {
  app.quit();
}

// Playwright launches only the development Electron binary with this opt-in
// profile. Packaged releases ignore it and keep every production fuse intact.
const isolatedTestProfile = !app.isPackaged &&
  process.env.BOSSBAR_E2E === '1' &&
  process.env.BOSSBAR_E2E_PROFILE
  ? path.resolve(process.env.BOSSBAR_E2E_PROFILE)
  : null;
if (isolatedTestProfile) {
  const isolatedPaths = {
    userData: path.join(isolatedTestProfile, 'user-data'),
    sessionData: path.join(isolatedTestProfile, 'session-data'),
    temp: path.join(isolatedTestProfile, 'temp'),
    documents: path.join(isolatedTestProfile, 'documents'),
    music: path.join(isolatedTestProfile, 'music'),
    pictures: path.join(isolatedTestProfile, 'pictures'),
  } as const;
  for (const directory of Object.values(isolatedPaths)) {
    mkdirSync(directory, { recursive: true });
  }
  for (const [name, directory] of Object.entries(isolatedPaths)) {
    app.setPath(name as Parameters<typeof app.setPath>[0], directory);
  }
}

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let masterWindow: BrowserWindow | null = null;
let playerWindow: BrowserWindow | null = null;
let controlWindow: BrowserWindow | null = null;
let launcherWindow: BrowserWindow | null = null;
let soundboardWindow: BrowserWindow | null = null;
let libraryWindow: BrowserWindow | null = null;
let sceneEditorWindow: BrowserWindow | null = null;
let hostedSessionServer: MultiplayerSessionServer | null = null;
let hostedSessionPresence: MultiplayerPresence | null = null;
let playerHudState: PlayerHudState[] = [];
let encounterTurnState: EncounterTurnState = emptyEncounterTurnState();
let localEncounterRollSequence = 0;
let hostedPublicBaseUrl: string | null = null;
let hostedPublicInviteUrl: string | null = null;
let hostedQuickTunnel: QuickTunnelHandle | null = null;
let hostedSessionError: string | null = null;
let playerProfileStorePromise: Promise<PlayerProfileStore> | null = null;
const getPlayerProfileStore = () => {
  playerProfileStorePromise ??= PlayerProfileStore.open(path.join(
    app.getPath('userData'),
    'multiplayer-players',
  ));
  return playerProfileStorePromise;
};
let customStatusLibraryStorePromise: Promise<CustomStatusLibraryStore> | null = null;
const getCustomStatusLibraryStore = () => {
  customStatusLibraryStorePromise ??= CustomStatusLibraryStore.open(
    app.getPath('userData'),
  );
  return customStatusLibraryStorePromise;
};
let returningToLauncher = false;
const hostedMediaSources = new Map<string, SessionMediaResource>();
const hostedMediaIdsBySource = new Map<string, string>();
let pendingActivePlaylistPhaseId: string | null = null;
let playerWindowReady = false;
let battleState: BattleState = initialBattleState;
let scenePlan: ScenePlan = createScenePlan(battleState.bosses);
const sceneMediaPaths = new Map<string, string>();
const pendingSceneMediaPaths = new Map<string, string | null>();
const scenePlaylistPaths = new Map<string, string>();
type PendingScenePlaylist = {
  summary: ScenePlaylistSummary;
  paths: Map<string, string>;
};
const pendingScenePlaylists = new Map<string, PendingScenePlaylist>();
const sceneBossArchive = new Map(battleState.bosses.map((boss) => [boss.id, boss]));
const queuedScenePhaseIndexes: number[] = [];
const pendingScenePhaseIndexes = new Set<number>();
let sceneTransitioning = false;
let sceneTransitionSequence = 0;
let sceneTransitionTimer: ReturnType<typeof setTimeout> | null = null;
let pendingBlackoutPhaseIndex: number | null = null;
let resumeMusicAfterManualBlackout = false;
let activeBackgroundFilePath: string | null = null;
let configuredBackgroundFilePath: string | null = null;
let configuredBackgroundName: string | null = null;
let backgroundRevision = 0;
let healthEffectSequence = 0;
const pendingHealthTimers = new Set<ReturnType<typeof setTimeout>>();
type InternalMusicTrack = {
  id: string;
  name: string;
  filePath: string;
  duration: number;
};
const musicTracks: InternalMusicTrack[] = [];
type InternalSoundboardSlot = {
  index: number;
  name: string;
  filePath: string;
};
const soundboardSlots: Array<InternalSoundboardSlot | null> = Array.from(
  { length: 20 },
  () => null,
);
const soundEffectSources = new Map<
  number,
  { filePath: string; index: number }
>();
const encounterEffectSources = new Map<number, string>();
type PendingLocalCombatImpact = {
  battle: BattleState;
  healthEffect: HealthEffect;
  soundEffect: EncounterSoundEffect | null;
  timeout: ReturnType<typeof setTimeout> | null;
};
const pendingLocalCombatImpacts: PendingLocalCombatImpact[] = [];
type InternalEncounterSoundOption = Omit<EncounterSoundOption, 'previewUrl'> & {
  filePath: string;
};
const encounterSoundOptions: InternalEncounterSoundOption[] = [];
const defaultEncounterSoundDefinitions: Array<{
  kind: EncounterSoundEffectKind;
  directory: string;
  sounds: Array<{ fileName: string; label: string }>;
}> = [
  {
    kind: 'damage',
    directory: 'Mecanica_Dano',
    sounds: [
      { fileName: 'Dano_1.mp3', label: 'Dano 1' },
      { fileName: 'Dano_2.mp3', label: 'Dano 2' },
      { fileName: 'Dano_3.mp3', label: 'Dano 3' },
      { fileName: 'Dano_4.mp3', label: 'Dano 4' },
    ],
  },
  {
    kind: 'critical-damage',
    directory: 'Mecanica_Dano',
    sounds: [
      { fileName: 'Crit_1.mp3', label: 'Crítico 1' },
      { fileName: 'Crit_2.mp3', label: 'Crítico 2' },
    ],
  },
  {
    kind: 'heal',
    directory: 'Mecanica_Cura',
    sounds: [
      { fileName: 'heal_1.mp3', label: 'Cura 1' },
      { fileName: 'heal_2.mp3', label: 'Cura 2' },
    ],
  },
  {
    kind: 'shield-impact',
    directory: 'Mecanica_Escudo',
    sounds: [
      { fileName: 'impacto_escudo_1.mp3', label: 'Impacto no escudo 1' },
      { fileName: 'impacto_escudo_2.mp3', label: 'Impacto no escudo 2' },
      { fileName: 'impacto_escudo_3.mp3', label: 'Impacto no escudo 3' },
    ],
  },
  {
    kind: 'shield-break',
    directory: 'Mecanica_Escudo',
    sounds: [{ fileName: 'escudo_quebrando.mp3', label: 'Escudo quebrando' }],
  },
  {
    kind: 'dice-roll',
    directory: 'Mecanica_Rolagem_Dados',
    sounds: [
      { fileName: 'dice_1.mp3', label: 'Rolagem de dados 1' },
      { fileName: 'dice_2.mp3', label: 'Rolagem de dados 2' },
      { fileName: 'dice_3.mp3', label: 'Rolagem de dados 3' },
    ],
  },
];
const defaultEncounterSoundEnabled = new Map<string, boolean>();
const previousEncounterSoundIndex = new Map<EncounterSoundEffectKind, number>();
const encounterSoundGroupLastPlayedAt = new Map<EncounterSoundEffectKind, number>();
let musicTrackSequence = 0;
let soundEffectSequence = 0;
let encounterEffectSequence = 0;
let encounterSoundCustomizationRevision = 0;
let soundboardRevision = 0;
let musicState: Omit<MusicState, 'tracks'> = {
  currentTrackId: null,
  isPlaying: false,
  loop: false,
  volume: 0.8,
  muted: false,
  universalMuted: false,
  playbackVersion: 0,
  revision: 0,
};
let musicPlaybackState: MusicPlaybackState = {
  trackId: null,
  currentTime: 0,
  duration: 0,
};
let soundboardAudioState = {
  volume: 0.8,
  muted: false,
  loop: false,
};
let encounterEffectsAudioState = {
  volume: initialEncounterEffectsState.volume,
  general: { ...initialEncounterEffectsState.general },
  sounds: { ...initialEncounterEffectsState.sounds },
  visuals: { ...initialEncounterEffectsState.visuals },
  revision: initialEncounterEffectsState.revision,
};
type AppUndoSnapshot = {
  battleState: BattleState;
  scenePlan: ScenePlan;
  sceneMediaPaths: Array<[string, string]>;
  scenePlaylistPaths: Array<[string, string]>;
  sceneBossArchive: Array<[string, BossState]>;
  activeBackgroundFilePath: string | null;
  configuredBackgroundFilePath: string | null;
  configuredBackgroundName: string | null;
  pendingBackgroundChange:
    | { type: 'set'; filePath: string; name: string }
    | { type: 'clear' }
    | null;
  linkedLibraryEntryId: string | null;
  musicTracks: InternalMusicTrack[];
  musicState: typeof musicState;
  musicPlaybackState: MusicPlaybackState;
  soundboardSlots: Array<InternalSoundboardSlot | null>;
  soundboardAudioState: typeof soundboardAudioState;
  encounterEffectsAudioState: typeof encounterEffectsAudioState;
};
const appUndoHistory: AppUndoSnapshot[] = [];
const MAX_APP_UNDO_HISTORY = 5;
let lastAppUndoKey: string | null = null;
let lastAppUndoRecordedAt = 0;

const captureAppUndoSnapshot = (): AppUndoSnapshot => structuredClone({
  battleState,
  scenePlan,
  sceneMediaPaths: [...sceneMediaPaths],
  scenePlaylistPaths: [...scenePlaylistPaths],
  sceneBossArchive: [...sceneBossArchive],
  activeBackgroundFilePath,
  configuredBackgroundFilePath,
  configuredBackgroundName,
  pendingBackgroundChange,
  linkedLibraryEntryId,
  musicTracks,
  musicState,
  musicPlaybackState,
  soundboardSlots,
  soundboardAudioState,
  encounterEffectsAudioState,
});

const rememberAppChange = (
  snapshot = captureAppUndoSnapshot(),
  coalesceKey?: string,
) => {
  const recordedAt = Date.now();
  if (
    coalesceKey &&
    lastAppUndoKey === coalesceKey &&
    recordedAt - lastAppUndoRecordedAt <= 600
  ) return;
  appUndoHistory.push(snapshot);
  if (appUndoHistory.length > MAX_APP_UNDO_HISTORY) appUndoHistory.shift();
  lastAppUndoKey = coalesceKey ?? null;
  lastAppUndoRecordedAt = recordedAt;
};
let masterFocusTimer: ReturnType<typeof setTimeout> | null = null;
let battleMusicStartTimer: ReturnType<typeof setTimeout> | null = null;
let allowAppClose = false;
let gracefulQuitCompleted = false;
let gracefulQuitInProgress = false;
let hostedSessionStopPromise: Promise<void> | null = null;
let allowPlayerWindowClose = false;
let playerWindowClosePending = false;
let playerWindowCloseTimer: ReturnType<typeof setTimeout> | null = null;
let lastPlayerWindowPosition: Pick<WindowBounds, 'x' | 'y'> | null = null;
let dockedMoveFitTimer: ReturnType<typeof setTimeout> | null = null;
let allowControlWindowClose = false;
let allowSceneEditorClose = false;
let synchronizingDockedWindows = false;
let synchronizingDockedFocus = false;
const CONTROL_PANEL_MINIMIZED_HEIGHT = 32;
const CONTROL_PANEL_DOCK_OVERLAP = 1;
const CONTROL_PANEL_MIN_EXPANDED_HEIGHT = 390;
const CONTROL_PANEL_PREFERRED_HEIGHT = 420;
const CONTROL_PANEL_MAX_EXPANDED_HEIGHT = 470;
const PLAYER_MIN_CONTENT_WIDTH = 960;
const PLAYER_PREFERRED_CONTENT_WIDTH = 1280;
const PLAYER_MAX_OUTER_WIDTH = 1920;
const PLAYER_MAX_OUTER_HEIGHT = 1040;
const PLAYER_NATIVE_FRAME_BUDGET = 48;
const DOCKED_WINDOW_GAP = 12;
const MAX_USER_MEDIA_BYTES = 100 * 1024 * 1024;
let controlPanelMinimized = false;
let controlPanelExpandedHeight = CONTROL_PANEL_PREFERRED_HEIGHT;
let pendingBackgroundChange:
  | { type: 'set'; filePath: string; name: string }
  | { type: 'clear' }
  | null = null;

type StoredMediaFile = {
  name: string;
  filePath: string;
};

type StoredLibraryBoss = BossLibraryBossDraft;
type LegacyStoredLibraryBoss = Omit<
  StoredLibraryBoss,
  'bossId' | 'rangedDefense' | 'shield' | 'turnCount' | 'activeStatuses'
> & {
  bossId?: string;
  rangedDefense?: number;
  shield?: number;
  turnCount?: number;
  activeStatuses?: ActiveBossStatus[];
};

type StoredSceneMedia = StoredMediaFile & {
  mediaType: 'image' | 'video' | 'audio';
  duration?: number;
};

type StoredScenePlaylistTrack = StoredMediaFile & {
  id: string;
  duration: number;
};

type StoredScenePlaylist = Omit<
  ScenePlaylistSummary,
  'tracks' | 'revision'
> & {
  tracks: StoredScenePlaylistTrack[];
  revision?: number;
};

type StoredScenePhase = Omit<ScenePhase, 'background' | 'transitionSound' | 'music'> & {
  background: StoredSceneMedia | null;
  transitionSound: StoredScenePlaylist | null;
  music: StoredScenePlaylist | null;
};

type StoredScenePlan = Pick<
  ScenePlan,
  'bossSlots' | 'showPhaseMarkers' | 'activePhaseIndex' | 'activePhaseIds' | 'blackoutActive'
> & {
  phases: StoredScenePhase[];
  templates: StoredLibraryBoss[];
};

type BossLibraryEntry = {
  schemaVersion: 5;
  id: string;
  isAutosave: boolean;
  createdAt: string;
  updatedAt: string;
  bosses: StoredLibraryBoss[];
  activeBossIndex: number;
  background: StoredMediaFile | null;
  music: {
    tracks: Array<StoredMediaFile & { duration: number }>;
    currentTrackFilePath: string | null;
    loop: boolean;
    volume: number;
    muted: boolean;
  };
  soundboard: {
    slots: Array<StoredMediaFile & { index: number }>;
    volume: number;
    muted: boolean;
    loop?: boolean;
  };
  scene: StoredScenePlan;
};

let bossLibraryEntries: BossLibraryEntry[] = [];
let linkedLibraryEntryId: string | null = null;
let libraryWriteQueue: Promise<void> = Promise.resolve();
let encounterEffectsWriteQueue: Promise<void> = Promise.resolve();
let encounterSoundCustomizationWriteQueue: Promise<void> = Promise.resolve();

const supportedBackgroundExtensions: ReadonlySet<string> = new Set([
  ...backgroundImageExtensions,
  ...backgroundVideoExtensions,
]);

const getBackgroundState = (): BackgroundState => ({
  url: activeBackgroundFilePath
    ? `boss-media://background/current?v=${backgroundRevision}`
    : null,
  name: battleState.backgroundName,
  mediaType: activeBackgroundFilePath
    ? backgroundMediaTypeForFile(activeBackgroundFilePath)
    : null,
});

type RendererPage = RendererRole;

const preloadFile = (page: RendererPage) =>
  path.join(__dirname, `preload-${page}.js`);

const rendererFile = (page: RendererPage) =>
  path.join(
    __dirname,
    `../renderer/${MAIN_WINDOW_VITE_NAME}/${page}.html`,
  );

const rendererDirectory = () => path.dirname(rendererFile('player'));

const hostedWebDirectory = () => app.isPackaged
  ? rendererDirectory()
  : path.join(app.getPath('temp'), 'bossbar-t20-web-player-dev');

const bundledAssetsDirectory = () => app.isPackaged
  ? path.join(process.resourcesPath, 'assets')
  : path.join(app.getAppPath(), 'assets');

const applicationIcon = () =>
  path.join(bundledAssetsDirectory(), 'bossbar-icon.ico');

const resolveBundledAssetPath = (requestUrl: URL): string | null => {
  if (requestUrl.hostname !== 'local') return null;

  let relativePath: string;
  try {
    relativePath = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, '');
  } catch {
    return null;
  }
  if (!relativePath || relativePath.includes('\0')) return null;

  const root = path.resolve(bundledAssetsDirectory());
  const resolvedPath = path.resolve(root, relativePath);
  const containedPath = path.relative(root, resolvedPath);
  if (
    !containedPath ||
    containedPath === '..' ||
    containedPath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(containedPath)
  ) return null;
  return resolvedPath;
};

const backgroundImageMimeTypeForFile = (filePath: string) => {
  switch (path.extname(filePath).toLowerCase()) {
    case '.avif': return 'image/avif';
    case '.bmp': return 'image/bmp';
    case '.gif': return 'image/gif';
    case '.jfif':
    case '.jpeg':
    case '.jpg': return 'image/jpeg';
    case '.png': return 'image/png';
    case '.webp': return 'image/webp';
    default: return null;
  }
};

const resolveHostedMediaResource = (
  sourceUrl: string,
): SessionMediaResource | null => {
  let requestUrl: URL;
  try {
    requestUrl = new URL(sourceUrl);
  } catch {
    return null;
  }
  if (requestUrl.protocol !== 'boss-media:') return null;

  let filePath: string | null = null;
  let contentType = 'audio/mpeg';
  if (requestUrl.hostname === 'background') {
    filePath = activeBackgroundFilePath;
    if (filePath) {
      contentType = backgroundVideoMimeTypeForFile(filePath) ??
        backgroundImageMimeTypeForFile(filePath) ?? '';
    }
  } else if (requestUrl.hostname === 'audio') {
    const trackId = decodeURIComponent(requestUrl.pathname.slice(1));
    filePath = musicTracks.find((track) => track.id === trackId)?.filePath ?? null;
  } else if (requestUrl.hostname === 'sfx') {
    const effectId = Number(decodeURIComponent(requestUrl.pathname.slice(1)));
    filePath = Number.isInteger(effectId)
      ? soundEffectSources.get(effectId)?.filePath ?? null
      : null;
  } else if (requestUrl.hostname === 'encounter-sfx') {
    const effectId = Number(decodeURIComponent(requestUrl.pathname.slice(1)));
    filePath = Number.isInteger(effectId)
      ? encounterEffectSources.get(effectId) ?? null
      : null;
  } else if (requestUrl.hostname === 'encounter-sound-preview') {
    const optionId = decodeURIComponent(requestUrl.pathname.slice(1));
    filePath = encounterSoundOptions.find(
      (option) => option.id === optionId,
    )?.filePath ?? null;
  } else if (requestUrl.hostname === 'soundboard') {
    const slotIndex = Number(decodeURIComponent(requestUrl.pathname.slice(1)));
    filePath = Number.isInteger(slotIndex)
      ? soundboardSlots[slotIndex - 1]?.filePath ?? null
      : null;
  } else if (requestUrl.hostname === 'scene-background') {
    const phaseId = decodeURIComponent(requestUrl.pathname.slice(1));
    filePath = sceneMediaPaths.get(sceneMediaKey(phaseId, 'background')) ?? null;
    if (filePath) {
      contentType = backgroundVideoMimeTypeForFile(filePath) ??
        backgroundImageMimeTypeForFile(filePath) ?? '';
    }
  } else if (requestUrl.hostname === 'scene-audio') {
    const mediaKey = decodeURIComponent(requestUrl.pathname.slice(1));
    const [phaseId, rawSlot, trackId] = mediaKey.split(':');
    const pending = ['transitionSound', 'music'].includes(rawSlot)
      ? pendingScenePlaylists.get(`${phaseId}:${rawSlot}`)
      : null;
    filePath = (trackId ? pending?.paths.get(trackId) : null) ??
      scenePlaylistPaths.get(mediaKey) ??
      sceneMediaPaths.get(mediaKey) ??
      null;
  }

  return filePath && contentType ? { filePath, contentType } : null;
};

const rewriteHostedMediaUrl = (
  sourceUrl: string,
  mediaUrl: (id: string) => string,
) => {
  const resource = resolveHostedMediaResource(sourceUrl);
  if (!resource) return '';
  let fileFingerprint = '';
  try {
    const file = statSync(resource.filePath);
    fileFingerprint = `${file.size}:${file.mtimeMs}`;
  } catch {
    return '';
  }
  const sourceKey = `${resource.contentType}\n${resource.filePath}\n${fileFingerprint}`;
  let mediaId = hostedMediaIdsBySource.get(sourceKey);
  if (!mediaId) {
    mediaId = randomUUID();
    hostedMediaIdsBySource.set(sourceKey, mediaId);
  }
  hostedMediaSources.set(mediaId, resource);
  return mediaUrl(mediaId);
};

const defaultMediaDirectory = (
  projectFolder: 'Imagens' | 'Musica' | 'SFX',
  systemFolder: 'music' | 'pictures',
) => app.isPackaged
  ? app.getPath(systemFolder)
  : path.join(app.getAppPath(), projectFolder);

const personalSfxDirectories = () => Array.from(new Set([
  app.isPackaged
    ? path.join(path.dirname(process.execPath), 'SFX')
    : path.join(app.getAppPath(), 'SFX'),
  path.join(app.getPath('documents'), 'BossBar - Tormenta20', 'SFX'),
  path.join(app.getPath('userData'), 'SFX'),
  path.join(process.cwd(), 'SFX'),
]));

const findPersonalSfxFile = async (relativePath: string) => {
  for (const directory of personalSfxDirectories()) {
    const candidate = path.join(directory, relativePath);
    try {
      if ((await stat(candidate)).isFile()) return candidate;
    } catch {
      // Continue procurando nas bibliotecas pessoais conhecidas.
    }
  }
  return null;
};

const findEncounterSfxFile = async (relativePath: string) => {
  const bundledCandidate = path.join(
    bundledAssetsDirectory(),
    'SFX',
    relativePath,
  );
  try {
    if ((await stat(bundledCandidate)).isFile()) return bundledCandidate;
  } catch {
    // O instalador pode não conter esta categoria em versões antigas.
  }
  return findPersonalSfxFile(relativePath);
};

const loadEncounterMechanicSounds = async () => {
  let storedDefaultEnabled: Record<string, unknown> = {};
  let storedCustomSounds: unknown[] = [];
  try {
    const contents = await readFile(encounterSoundCustomizationPath(), 'utf8');
    const parsed = JSON.parse(contents) as unknown;
    if (isRecord(parsed)) {
      storedDefaultEnabled = isRecord(parsed.defaultEnabled)
        ? parsed.defaultEnabled
        : {};
      storedCustomSounds = Array.isArray(parsed.customSounds)
        ? parsed.customSounds
        : [];
    }
  } catch (error) {
    if (isRecord(error) && error.code !== 'ENOENT') {
      console.error('Não foi possível ler a personalização dos efeitos sonoros.', error);
    }
  }

  defaultEncounterSoundEnabled.clear();
  const defaultOptions = await Promise.all(
    defaultEncounterSoundDefinitions.flatMap(({ kind, directory, sounds }) =>
      sounds.map(async ({ fileName, label }) => {
        const id = `default:${kind}:${fileName.toLowerCase()}`;
        const enabled = typeof storedDefaultEnabled[id] === 'boolean'
          ? storedDefaultEnabled[id]
          : true;
        defaultEncounterSoundEnabled.set(id, enabled);
        const filePath = await findEncounterSfxFile(path.join(directory, fileName));
        return filePath
          ? { id, kind, name: label, isDefault: true, enabled, filePath }
          : null;
      }),
    ),
  );

  const customOptions = await Promise.all(storedCustomSounds.map(async (value) => {
    if (
      !isRecord(value) ||
      typeof value.id !== 'string' ||
      !value.id.startsWith('custom:') ||
      !isEncounterSoundEffectKind(value.kind) ||
      typeof value.name !== 'string' ||
      !value.name.trim() ||
      typeof value.filePath !== 'string' ||
      path.extname(value.filePath).toLowerCase() !== '.mp3'
    ) return null;
    try {
      if (!(await stat(value.filePath)).isFile()) return null;
    } catch {
      return null;
    }
    return {
      id: value.id,
      kind: value.kind,
      name: value.name.slice(0, 100),
      isDefault: false,
      enabled: typeof value.enabled === 'boolean' ? value.enabled : true,
      filePath: value.filePath,
    } satisfies InternalEncounterSoundOption;
  }));

  encounterSoundOptions.splice(
    0,
    encounterSoundOptions.length,
    ...defaultOptions.filter(
      (option): option is InternalEncounterSoundOption => Boolean(option),
    ),
    ...customOptions.filter(
      (option): option is Exclude<typeof option, null> => Boolean(option),
    ),
  );
  previousEncounterSoundIndex.clear();
  encounterSoundGroupLastPlayedAt.clear();
  encounterSoundCustomizationRevision += 1;
};

const rendererUrl = (page: RendererPage) => {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    const baseUrl = MAIN_WINDOW_VITE_DEV_SERVER_URL.endsWith('/')
      ? MAIN_WINDOW_VITE_DEV_SERVER_URL
      : `${MAIN_WINDOW_VITE_DEV_SERVER_URL}/`;
    return new URL(`${page}.html`, baseUrl).toString();
  }

  return pathToFileURL(rendererFile(page)).toString();
};

const rendererOrigin = () => new URL(rendererUrl('player')).origin;

const loadRenderer = (
  window: BrowserWindow,
  page: RendererPage,
) => {
  const allowedUrl = rendererUrl(page);
  const blockUnexpectedNavigation = (
    event: Electron.Event,
    navigationUrl: string,
  ) => {
    if (navigationUrl !== allowedUrl) event.preventDefault();
  };

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', blockUnexpectedNavigation);
  window.webContents.on('will-redirect', blockUnexpectedNavigation);
  void window.loadURL(allowedUrl);
};

const getMusicState = (): MusicState => ({
  ...musicState,
  tracks: musicTracks.map(({ id, name, duration }) => ({
    id,
    name,
    duration,
    url: `boss-media://audio/${id}`,
  })),
});

const getSoundboardState = (): SoundboardState => ({
  slots: soundboardSlots.map((slot, arrayIndex) => ({
    index: arrayIndex + 1,
    name: slot?.name ?? null,
    assigned: Boolean(slot),
  })),
  ...soundboardAudioState,
  universalMuted: musicState.universalMuted,
  revision: soundboardRevision,
});

const getEncounterEffectsState = (): EncounterEffectsState => ({
  ...encounterEffectsAudioState,
  universalMuted: musicState.universalMuted,
});

const encounterSoundSourceUrl = (optionId: string) =>
  `boss-media://encounter-sound-preview/${encodeURIComponent(optionId)}`;

const createHostedEncounterSoundUrls = (mediaUrl: (id: string) => string) =>
  encounterSoundOptions
    .filter((option) => option.enabled)
    .map((option) => rewriteHostedMediaUrl(
      encounterSoundSourceUrl(option.id),
      mediaUrl,
    ))
    .filter(Boolean);

const createHostedPreloadMediaUrls = (mediaUrl: (id: string) => string) => {
  const sourceUrls = [
    ...musicTracks.map(({ id }) => `boss-media://audio/${encodeURIComponent(id)}`),
    ...soundboardSlots.flatMap((slot, index) => slot
      ? [`boss-media://soundboard/${index + 1}`]
      : []),
    ...scenePlan.phases.flatMap((phase) => [
      ...(phase.background
        ? [`boss-media://scene-background/${encodeURIComponent(phase.id)}`]
        : []),
      ...(['transitionSound', 'music'] as const).flatMap((slot) =>
        phase[slot]?.tracks.map((track) =>
          scenePlaylistTrackUrl(phase.id, slot, track.id)
        ) ?? []),
    ]),
    ...encounterSoundOptions
      .filter((option) => option.enabled)
      .map((option) => encounterSoundSourceUrl(option.id)),
  ];
  return [...new Set(sourceUrls
    .map((sourceUrl) => rewriteHostedMediaUrl(sourceUrl, mediaUrl))
    .filter(Boolean))];
};

const createHostedPresentationSnapshot = (
  mediaUrl: (id: string) => string,
) => ({
  ...createPublicPresentationSnapshot(
    {
      battle: battleState,
      background: getBackgroundState(),
      scenePlan,
      encounterEffects: getEncounterEffectsState(),
      music: getMusicState(),
      musicPlayback: musicPlaybackState,
      soundboard: getSoundboardState(),
    },
    {
      rewriteMediaUrl: (url) => rewriteHostedMediaUrl(url, mediaUrl),
    },
  ),
  encounterSoundUrls: createHostedEncounterSoundUrls(mediaUrl),
});

const getHostedSessionState = (): HostedSessionState => {
  const server = hostedSessionServer;
  if (!server) {
    return {
      active: false,
      roomCode: null,
      tunnelProvider: null,
      tunnelStatus: 'inactive',
      publicBaseUrl: null,
      shareUrl: null,
      localUrl: null,
      lanUrls: [],
      connectedPlayers: 0,
      maxPlayers: 10,
      players: [],
      pendingJoinRequests: [],
      pendingActionPointRequests: [],
      error: null,
    };
  }
  const presence = hostedSessionPresence ?? server.getPresence();
  const { invite } = server.info;
  return {
    active: true,
    roomCode: invite.roomCode,
    tunnelProvider: 'cloudflare-quick',
    tunnelStatus: hostedSessionError ? 'error' : 'online',
    publicBaseUrl: hostedPublicBaseUrl,
    shareUrl: hostedPublicInviteUrl,
    localUrl: invite.localUrl,
    lanUrls: [...invite.lanUrls],
    connectedPlayers: presence.connectedPlayers,
    maxPlayers: presence.maxPlayers,
    players: presence.players.map((player) => ({ ...player })),
    pendingJoinRequests: server.getPendingJoinRequests(),
    pendingActionPointRequests: server.getPendingActionPointRequests(),
    error: hostedSessionError,
  };
};

const broadcastHostedSessionState = () => {
  if (masterWindow && !masterWindow.isDestroyed()) {
    masterWindow.webContents.send(
      'multiplayer:session-changed',
      getHostedSessionState(),
    );
  }
};

const broadcastPlayerHuds = () => {
  for (const window of [masterWindow, playerWindow, controlWindow]) {
    if (window && !window.isDestroyed()) {
      window.webContents.send(
        'multiplayer:player-huds-changed',
        playerHudState,
      );
    }
  }
};

const broadcastEncounterTurnState = () => {
  for (const window of [playerWindow, controlWindow, masterWindow]) {
    if (window && !window.isDestroyed()) {
      window.webContents.send(
        'multiplayer:turn-changed',
        encounterTurnState,
      );
    }
  }
};

const reportHostedSessionStartupProgress = (
  percent: number,
  stage: string,
) => {
  if (!launcherWindow || launcherWindow.isDestroyed()) return;
  const progress: HostedSessionStartupProgress = {
    percent: Math.max(0, Math.min(100, percent)),
    stage,
  };
  launcherWindow.webContents.send('multiplayer:hosting-progress', progress);
};

const startHostedSession = async (): Promise<HostedEncounterStartResult> => {
  if (hostedSessionServer) {
    return { ok: true, session: getHostedSessionState() };
  }
  hostedMediaSources.clear();
  hostedMediaIdsBySource.clear();
  hostedSessionPresence = null;
  hostedPublicBaseUrl = null;
  hostedPublicInviteUrl = null;
  hostedSessionError = null;
  let startingServer: MultiplayerSessionServer | null = null;
  let startingTunnel: QuickTunnelHandle | null = null;
  try {
    const playerProfileStore = await getPlayerProfileStore();
    reportHostedSessionStartupProgress(5, 'Preparando o encontro...');
    reportHostedSessionStartupProgress(10, 'Verificando o componente de conexão segura...');
    const binaryPath = await ensureCloudflaredBinary({
      binaryPath: path.join(
        app.getPath('userData'),
        'network-tools',
        `cloudflared-${CLOUDFLARED_VERSION}.exe`,
      ),
      fetchBinary: net.fetch as typeof fetch,
      onProgress: (progress) => reportHostedSessionStartupProgress(
        10 + progress * 45,
        progress < 1
          ? 'Baixando o componente de conexão segura...'
          : 'Componente de conexão pronto.',
      ),
    });
    reportHostedSessionStartupProgress(62, 'Iniciando a sala local...');
    const server = await MultiplayerSessionServer.start({
      // O túnel acessa somente o loopback. Nenhuma porta de entrada é exposta.
      networkMode: 'loopback',
      webRoot: hostedWebDirectory(),
      webIndexFile: 'web-player.html',
      assetRoot: bundledAssetsDirectory(),
      playerProfileStore,
      initialSnapshot: ({ mediaUrl }) =>
        createHostedPresentationSnapshot(mediaUrl),
      resolveMedia: ({ id }) => hostedMediaSources.get(id) ?? null,
      preloadMediaUrls: ({ mediaUrl }) => createHostedPreloadMediaUrls(mediaUrl),
      onPresenceChanged: (presence) => {
        hostedSessionPresence = presence;
        broadcastHostedSessionState();
      },
      onJoinRequestsChanged: () => broadcastHostedSessionState(),
      onActionPointRequestsChanged: () => broadcastHostedSessionState(),
      onPlayerHudsChanged: (huds) => {
        playerHudState = huds;
        broadcastPlayerHuds();
      },
      onTurnStateChanged: (turnState) => {
        encounterTurnState = turnState;
        broadcastEncounterTurnState();
      },
      onTurnStarted: (participant) => {
        if (participant.kind === 'boss') {
          beginBossStatusTurn(participant.sourceId);
        }
      },
      onDiceRolled: () => publishDiceRollSound(),
      getBossDefense: (bossId, attackType) => {
        const boss = battleState.bosses.find(
          (candidate) => candidate.id === bossId,
        );
        if (!boss || boss.currentHealth <= 0) return null;
        const effective = deriveStatusAttributes(
          {
            attack: boss.attack,
            rangedAttack: boss.rangedAttack,
            skills: boss.skills,
            meleeDefense: boss.defense,
            rangedDefense: boss.rangedDefense,
            damageReduction: boss.damageReduction,
            shield: boss.shield,
          },
          boss.activeStatuses,
          encounterEffectsAudioState.general.automaticStatusEffects,
        );
        return attackType === 'melee'
          ? effective.values.meleeDefense
          : effective.values.rangedDefense;
      },
      applyBossDamage: (bossId, damage, context) => {
        const before = battleState.bosses.find(
          (candidate) => candidate.id === bossId,
        );
        if (!before) {
          return {
            ok: false,
            appliedDamage: 0,
            error: 'Chefão não encontrado.',
          };
        }
        if (context?.nonlethal === true && before.currentHealth <= 1) {
          return { ok: true, appliedDamage: 0 };
        }
        rememberAppChange();
        applyHealthMutation(
          'damage',
          bossId,
          Math.max(1, Math.ceil(damage)),
          {
            critical: context?.critical === true,
            minimumHealth: context?.nonlethal === true ? 1 : 0,
          },
        );
        const after = battleState.bosses.find(
          (candidate) => candidate.id === bossId,
        );
        return {
          ok: true,
          appliedDamage: Math.max(
            0,
            before.currentHealth - (after?.currentHealth ?? before.currentHealth),
          ),
        };
      },
    });
    startingServer = server;
    reportHostedSessionStartupProgress(72, 'Criando o túnel HTTPS temporário...');
    let tunnel: QuickTunnelHandle | null = null;
    tunnel = await startCloudflareQuickTunnel({
      binaryPath,
      localOrigin: new URL(server.info.invite.localUrl).origin,
      onUnexpectedExit: (message) => {
        if (hostedQuickTunnel !== tunnel) return;
        hostedQuickTunnel = null;
        hostedSessionError = `${message} Encerre e hospede a sala novamente.`;
        hostedPublicBaseUrl = null;
        hostedPublicInviteUrl = null;
        server.clearPublicInviteUrl();
        broadcastHostedSessionState();
      },
    });
    startingTunnel = tunnel;
    reportHostedSessionStartupProgress(94, 'Validando o convite dos jogadores...');
    const publicInvite = server.publicInviteUrl(tunnel.publicBaseUrl);
    hostedSessionServer = server;
    hostedQuickTunnel = tunnel;
    hostedSessionPresence = server.getPresence();
    hostedPublicBaseUrl = publicInvite.baseUrl;
    hostedPublicInviteUrl = publicInvite.inviteUrl;
    reportHostedSessionStartupProgress(100, 'Sala hospedada com segurança.');
    broadcastHostedSessionState();
    return { ok: true, session: getHostedSessionState() };
  } catch (error) {
    await startingTunnel?.close().catch(() => undefined);
    await startingServer?.close('server-shutdown').catch(() => undefined);
    hostedMediaSources.clear();
    hostedMediaIdsBySource.clear();
    hostedSessionPresence = null;
    hostedPublicBaseUrl = null;
    hostedPublicInviteUrl = null;
    hostedQuickTunnel = null;
    hostedSessionError = null;
    reportHostedSessionStartupProgress(0, 'Não foi possível criar a sala.');
    return {
      ok: false,
      error: error instanceof Error
        ? error.message
        : 'Não foi possível iniciar a sala hospedada.',
    };
  }
};

const stopHostedSession = async (
  reason: 'host-ended-session' | 'server-shutdown' = 'host-ended-session',
) => {
  if (hostedSessionStopPromise) return hostedSessionStopPromise;
  const server = hostedSessionServer;
  if (!server) return;
  const tunnel = hostedQuickTunnel;
  hostedSessionServer = null;
  hostedSessionPresence = null;
  hostedPublicBaseUrl = null;
  hostedPublicInviteUrl = null;
  hostedQuickTunnel = null;
  hostedSessionError = null;
  playerHudState = [];
  encounterTurnState = emptyEncounterTurnState();
  localEncounterRollSequence = 0;
  broadcastPlayerHuds();
  broadcastEncounterTurnState();
  broadcastHostedSessionState();
  hostedSessionStopPromise = (async () => {
    try {
      // Keep the public route alive until every connected browser has had a
      // chance to acknowledge the room-closed notice.
      await server.close(reason);
    } finally {
      await tunnel?.close().catch(() => undefined);
      hostedMediaSources.clear();
      hostedMediaIdsBySource.clear();
    }
  })();
  try {
    await hostedSessionStopPromise;
  } finally {
    hostedSessionStopPromise = null;
  }
};

const getEncounterSoundCustomizationState = (): EncounterSoundCustomizationState => ({
  options: encounterSoundOptions.map((option) => ({
    id: option.id,
    kind: option.kind,
    name: option.name,
    previewUrl: `boss-media://encounter-sound-preview/${encodeURIComponent(option.id)}?v=${encounterSoundCustomizationRevision}`,
    isDefault: option.isDefault,
    enabled: option.enabled,
  })),
  revision: encounterSoundCustomizationRevision,
});

const bossLibraryPath = () =>
  path.join(app.getPath('userData'), 'boss-library.json');

const masterNotesPath = () =>
  path.join(app.getPath('userData'), 'master-notes.md');

const encounterEffectsSettingsPath = () =>
  path.join(app.getPath('userData'), 'encounter-effects-settings.json');

const encounterSoundCustomizationPath = () =>
  path.join(app.getPath('userData'), 'encounter-sound-customization.json');

const customEncounterSoundsDirectory = () =>
  path.join(app.getPath('userData'), 'custom-encounter-sounds');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object');

const isSafeSceneIdentifier = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value);

const isStoredMediaFile = (value: unknown): value is StoredMediaFile =>
  isRecord(value) &&
  typeof value.name === 'string' &&
  typeof value.filePath === 'string';

const isFiniteStoredNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const loadEncounterEffectsSettings = async () => {
  try {
    const contents = await readFile(encounterEffectsSettingsPath(), 'utf8');
    const parsed = JSON.parse(contents) as unknown;
    if (!isRecord(parsed)) return;
    const sounds = isRecord(parsed.sounds) ? parsed.sounds : {};
    const visuals = isRecord(parsed.visuals) ? parsed.visuals : {};
    const general = isRecord(parsed.general) ? parsed.general : {};
    encounterEffectsAudioState = {
      volume: isFiniteStoredNumber(parsed.volume)
        ? Math.max(0, Math.min(1, parsed.volume))
        : initialEncounterEffectsState.volume,
      general: {
        automaticStatusEffects:
          typeof general.automaticStatusEffects === 'boolean'
            ? general.automaticStatusEffects
            : initialEncounterEffectsState.general.automaticStatusEffects,
        phaseMarkers:
          typeof general.phaseMarkers === 'boolean'
            ? general.phaseMarkers
            : initialEncounterEffectsState.general.phaseMarkers,
      },
      sounds: {
        heal: typeof sounds.heal === 'boolean'
          ? sounds.heal
          : initialEncounterEffectsState.sounds.heal,
        damage: typeof sounds.damage === 'boolean'
          ? sounds.damage
          : initialEncounterEffectsState.sounds.damage,
        shield: typeof sounds.shield === 'boolean'
          ? sounds.shield
          : initialEncounterEffectsState.sounds.shield,
        dice: typeof sounds.dice === 'boolean'
          ? sounds.dice
          : initialEncounterEffectsState.sounds.dice,
      },
      visuals: {
        screenShake: typeof visuals.screenShake === 'boolean'
          ? visuals.screenShake
          : initialEncounterEffectsState.visuals.screenShake,
        healthBarShake: typeof visuals.healthBarShake === 'boolean'
          ? visuals.healthBarShake
          : initialEncounterEffectsState.visuals.healthBarShake,
        damageEffect: typeof visuals.damageEffect === 'boolean'
          ? visuals.damageEffect
          : initialEncounterEffectsState.visuals.damageEffect,
        healEffect: typeof visuals.healEffect === 'boolean'
          ? visuals.healEffect
          : initialEncounterEffectsState.visuals.healEffect,
        particles: typeof visuals.particles === 'boolean'
          ? visuals.particles
          : initialEncounterEffectsState.visuals.particles,
        floatingDamageNumbers:
          typeof visuals.floatingDamageNumbers === 'boolean'
            ? visuals.floatingDamageNumbers
            : initialEncounterEffectsState.visuals.floatingDamageNumbers,
        healthNumbers: typeof visuals.healthNumbers === 'boolean'
          ? visuals.healthNumbers
          : initialEncounterEffectsState.visuals.healthNumbers,
      },
      revision: initialEncounterEffectsState.revision,
    };
    if (isFiniteStoredNumber(parsed.musicVolume)) {
      musicState = {
        ...musicState,
        volume: Math.max(0, Math.min(1, parsed.musicVolume)),
      };
    }
  } catch (error) {
    if (isRecord(error) && error.code !== 'ENOENT') {
      console.error('Não foi possível ler as configurações de efeitos.', error);
    }
  }
};

const persistEncounterEffectsSettings = () => {
  const filePath = encounterEffectsSettingsPath();
  const temporaryPath = `${filePath}.tmp`;
  const contents = JSON.stringify(
    {
      schemaVersion: 3,
      volume: encounterEffectsAudioState.volume,
      musicVolume: musicState.volume,
      general: encounterEffectsAudioState.general,
      sounds: encounterEffectsAudioState.sounds,
      visuals: encounterEffectsAudioState.visuals,
    },
    null,
    2,
  );
  encounterEffectsWriteQueue = encounterEffectsWriteQueue
    .catch(() => undefined)
    .then(async () => {
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(temporaryPath, contents, 'utf8');
      try {
        await rename(temporaryPath, filePath);
      } catch (error) {
        if (
          !isRecord(error) ||
          (error.code !== 'EEXIST' && error.code !== 'EPERM')
        ) throw error;
        await rm(filePath, { force: true });
        await rename(temporaryPath, filePath);
      }
    });
  return encounterEffectsWriteQueue;
};

const persistEncounterEffectsSettingsSafely = () => {
  void persistEncounterEffectsSettings().catch((error) => {
    console.error('Não foi possível salvar as configurações de efeitos.', error);
  });
};

const persistEncounterSoundCustomization = () => {
  const filePath = encounterSoundCustomizationPath();
  const temporaryPath = `${filePath}.tmp`;
  const contents = JSON.stringify(
    {
      schemaVersion: 1,
      defaultEnabled: Object.fromEntries(defaultEncounterSoundEnabled),
      customSounds: encounterSoundOptions
        .filter((option) => !option.isDefault)
        .map(({ id, kind, name, enabled, filePath: soundFilePath }) => ({
          id,
          kind,
          name,
          enabled,
          filePath: soundFilePath,
        })),
    },
    null,
    2,
  );
  encounterSoundCustomizationWriteQueue = encounterSoundCustomizationWriteQueue
    .catch(() => undefined)
    .then(async () => {
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(temporaryPath, contents, 'utf8');
      try {
        await rename(temporaryPath, filePath);
      } catch (error) {
        if (
          !isRecord(error) ||
          (error.code !== 'EEXIST' && error.code !== 'EPERM')
        ) throw error;
        await rm(filePath, { force: true });
        await rename(temporaryPath, filePath);
      }
    });
  return encounterSoundCustomizationWriteQueue;
};

const isStoredMusicTrack = (
  value: unknown,
): value is StoredMediaFile & { duration: number } =>
  isRecord(value) &&
  isFiniteStoredNumber(value.duration) &&
  isStoredMediaFile(value);

const isStoredSoundboardSlot = (
  value: unknown,
): value is StoredMediaFile & { index: number } =>
  isRecord(value) &&
  isFiniteStoredNumber(value.index) &&
  isStoredMediaFile(value);

type StoredLibraryEnvelope = {
  schemaVersion: unknown;
  id: string;
  isAutosave: boolean;
  createdAt: string;
  updatedAt: string;
  background: StoredMediaFile | null;
  music: BossLibraryEntry['music'];
  soundboard: BossLibraryEntry['soundboard'];
  scene?: unknown;
} & Record<string, unknown>;

const isStoredLibraryEnvelope = (
  value: unknown,
): value is StoredLibraryEnvelope => {
  if (!isRecord(value)) return false;
  if (
    typeof value.id !== 'string' ||
    typeof value.isAutosave !== 'boolean' ||
    typeof value.createdAt !== 'string' ||
    typeof value.updatedAt !== 'string' ||
    !isRecord(value.music) ||
    !isRecord(value.soundboard)
  ) return false;

  const backgroundIsValid =
    value.background === null || isStoredMediaFile(value.background);
  const tracksAreValid =
    Array.isArray(value.music.tracks) &&
    value.music.tracks.every(isStoredMusicTrack);
  const slotsAreValid =
    Array.isArray(value.soundboard.slots) &&
    value.soundboard.slots.every(isStoredSoundboardSlot);

  return (
    backgroundIsValid &&
    tracksAreValid &&
    (value.music.currentTrackFilePath === null ||
      typeof value.music.currentTrackFilePath === 'string') &&
    typeof value.music.loop === 'boolean' &&
    isFiniteStoredNumber(value.music.volume) &&
    typeof value.music.muted === 'boolean' &&
    slotsAreValid &&
    isFiniteStoredNumber(value.soundboard.volume) &&
    typeof value.soundboard.muted === 'boolean' &&
    (value.soundboard.loop === undefined || typeof value.soundboard.loop === 'boolean')
  );
};

const isStoredLibraryBoss = (value: unknown): value is LegacyStoredLibraryBoss =>
  isRecord(value) &&
  (value.bossId === undefined || typeof value.bossId === 'string') &&
  typeof value.bossName === 'string' &&
  typeof value.amount === 'string' &&
  isFiniteStoredNumber(value.maxHealth) &&
  isFiniteStoredNumber(value.currentHealth) &&
  isFiniteStoredNumber(value.attack) &&
  isFiniteStoredNumber(value.rangedAttack) &&
  isFiniteStoredNumber(value.defense) &&
  (value.rangedDefense === undefined || isFiniteStoredNumber(value.rangedDefense)) &&
  (value.shield === undefined || isFiniteStoredNumber(value.shield)) &&
  isFiniteStoredNumber(value.skills) &&
  (value.skillOverrides === undefined || Array.isArray(value.skillOverrides)) &&
  isFiniteStoredNumber(value.damageReduction) &&
  typeof value.description === 'string' &&
  (value.actionSeverity === 'normal' || value.actionSeverity === 'grave');

const normalizeStoredLibraryBoss = (
  value: unknown,
  includesStatusState: boolean,
  includesRangedDefense: boolean,
  fallbackBossId: string,
): StoredLibraryBoss | null => {
  if (!isStoredLibraryBoss(value)) return null;
  if (
    includesStatusState && (
      !isFiniteStoredNumber(value.turnCount) ||
      !Array.isArray(value.activeStatuses)
    )
  ) return null;
  if (includesRangedDefense && !isFiniteStoredNumber(value.rangedDefense)) {
    return null;
  }

  const skillValues = normalizeBossSkillValues(value.skillValues, value.skills);
  const skillOverrides = normalizeBossSkillOverrides(
    value.skillOverrides,
    value.skills,
    skillValues,
  );

  return {
    bossId: value.bossId?.trim() || fallbackBossId,
    bossName: value.bossName,
    amount: value.amount,
    maxHealth: value.maxHealth,
    currentHealth: value.currentHealth,
    attack: value.attack,
    rangedAttack: value.rangedAttack,
    defense: value.defense,
    rangedDefense: includesRangedDefense
      ? value.rangedDefense ?? value.defense
      : value.defense,
    shield: value.shield ?? 0,
    skills: value.skills,
    skillValues: resolveBossSkillValues(value.skills, skillValues, skillOverrides),
    skillOverrides,
    damageReduction: value.damageReduction,
    description: value.description,
    actionSeverity: value.actionSeverity,
    turnCount: includesStatusState
      ? clampInteger(value.turnCount ?? 0, 0, 1_000_000)
      : 0,
    activeStatuses: includesStatusState
      ? reconcileStatusIncompatibilities(
          normalizeActiveStatuses(value.activeStatuses),
        )
      : [],
  };
};

const isStoredSceneMedia = (value: unknown): value is StoredSceneMedia =>
  isRecord(value) &&
  typeof value.name === 'string' &&
  typeof value.filePath === 'string' &&
  (value.mediaType === 'image' || value.mediaType === 'video' || value.mediaType === 'audio') &&
  (value.duration === undefined || isFiniteStoredNumber(value.duration));

const normalizeStoredScenePlaylist = (
  value: unknown,
  phaseId: string,
  slot: SceneAudioSlot,
): StoredScenePlaylist | null | undefined => {
  if (value === null) return null;
  if (isStoredSceneMedia(value) && value.mediaType === 'audio') {
    const id = `legacy-${phaseId}-${slot}`;
    return {
      tracks: [{
        id,
        name: value.name,
        filePath: value.filePath,
        duration: value.duration ?? 0,
      }],
      currentTrackId: id,
      volume: 0.8,
      muted: false,
      loop: false,
      revision: 0,
    };
  }
  if (
    !isRecord(value) ||
    !Array.isArray(value.tracks) ||
    value.tracks.length > 200 ||
    typeof value.volume !== 'number' ||
    !Number.isFinite(value.volume) ||
    typeof value.muted !== 'boolean' ||
    typeof value.loop !== 'boolean'
  ) return undefined;
  const tracks = value.tracks.flatMap((track): StoredScenePlaylistTrack[] =>
    isRecord(track) &&
    isSafeSceneIdentifier(track.id) &&
    typeof track.name === 'string' &&
    typeof track.filePath === 'string' &&
    isFiniteStoredNumber(track.duration)
      ? [{
          id: track.id.slice(0, 80),
          name: track.name.slice(0, 255),
          filePath: track.filePath,
          duration: Math.max(0, track.duration),
        }]
      : [],
  );
  if (
    tracks.length !== value.tracks.length ||
    new Set(tracks.map((track) => track.id)).size !== tracks.length
  ) return undefined;
  const requestedCurrent = typeof value.currentTrackId === 'string'
    ? value.currentTrackId
    : null;
  return {
    tracks,
    currentTrackId: tracks.some((track) => track.id === requestedCurrent)
      ? requestedCurrent
      : tracks[0]?.id ?? null,
    volume: Math.max(0, Math.min(1, value.volume)),
    muted: value.muted,
    loop: value.loop,
    revision: Number.isInteger(value.revision) ? value.revision as number : 0,
  };
};

const defaultStoredScene = (bosses: StoredLibraryBoss[]): StoredScenePlan => {
  const slots = bosses.map((boss) => ({
    bossId: boss.bossId,
    label: boss.bossName,
    original: true,
  }));
  return {
    bossSlots: slots,
    showPhaseMarkers: false,
    activePhaseIndex: -1,
    activePhaseIds: Object.fromEntries(slots.map((slot) => [slot.bossId, null])),
    blackoutActive: false,
    templates: bosses.map((boss) => ({ ...boss })),
    phases: [{
      id: 'phase-1',
      name: 'Fase 1',
      triggerBossId: slots[0]?.bossId ?? 'boss-1',
      startHealth: bosses[0]?.currentHealth ?? bosses[0]?.maxHealth ?? 500,
      endHealth: 0,
      transition: 'fade' as const,
      transitionDurationSeconds: 2,
      transitionSoundDelaySeconds: 0,
      background: null,
      transitionSound: null,
      music: null,
      bosses: slots.map((bossSlot) => ({
        bossId: bossSlot.bossId,
        presence: 'present' as const,
        carryOverflowDamage: true,
        patch: {},
      })),
    }],
  };
};

const normalizeStoredScene = (
  value: unknown,
  bosses: StoredLibraryBoss[],
): StoredScenePlan | null => {
  if (!isRecord(value) || !Array.isArray(value.bossSlots) || !Array.isArray(value.phases)) {
    return null;
  }
  const rawPhases = value.phases;
  const bossSlots = value.bossSlots.flatMap((slot): ScenePlan['bossSlots'] =>
    isRecord(slot) &&
    typeof slot.bossId === 'string' &&
    typeof slot.label === 'string' &&
    typeof slot.original === 'boolean'
      ? [{ bossId: slot.bossId, label: slot.label.slice(0, 100), original: slot.original }]
      : [],
  );
  if (
    bossSlots.length < 1 ||
    bossSlots.length > 3 ||
    bossSlots.length !== value.bossSlots.length ||
    new Set(bossSlots.map((slot) => slot.bossId)).size !== bossSlots.length
  ) return null;
  const knownIds = new Set(bossSlots.map((slot) => slot.bossId));
  const storedBossesById = new Map(bosses.map((boss) => [boss.bossId, boss]));
  const phases = rawPhases.flatMap((rawPhase, phaseIndex): StoredScenePhase[] => {
    if (
      !isRecord(rawPhase) ||
      !isSafeSceneIdentifier(rawPhase.id) ||
      typeof rawPhase.name !== 'string' ||
      typeof rawPhase.triggerBossId !== 'string' ||
      !knownIds.has(rawPhase.triggerBossId) ||
      (!isFiniteStoredNumber(rawPhase.startHealth) && !isFiniteStoredNumber(rawPhase.startPercent)) ||
      (!isFiniteStoredNumber(rawPhase.endHealth) && !isFiniteStoredNumber(rawPhase.endPercent)) ||
      !['fade', 'fade-blackout', 'blackout', 'explosion'].includes(String(rawPhase.transition)) ||
      !Array.isArray(rawPhase.bosses)
    ) return [];
    const directives = rawPhase.bosses.flatMap((directive): SceneBossDirective[] => {
      if (
        !isRecord(directive) ||
        typeof directive.bossId !== 'string' ||
        !knownIds.has(directive.bossId) ||
        !['inherit', 'present', 'absent'].includes(String(directive.presence)) ||
        !isRecord(directive.patch)
      ) return [];
      return [{
        bossId: directive.bossId,
        presence: directive.presence as SceneBossDirective['presence'],
        carryOverflowDamage: directive.carryOverflowDamage !== false,
        patch: normalizeSceneBossPatch(directive.patch),
      }];
    });
    if (directives.length !== bossSlots.length) return [];
    const background = rawPhase.background === null
      ? null
      : isStoredSceneMedia(rawPhase.background) &&
        rawPhase.background.mediaType !== 'audio'
        ? rawPhase.background
        : undefined;
    const transitionSound = normalizeStoredScenePlaylist(
      rawPhase.transitionSound,
      rawPhase.id,
      'transitionSound',
    );
    const music = normalizeStoredScenePlaylist(
      rawPhase.music,
      rawPhase.id,
      'music',
    );
    if (background === undefined || transitionSound === undefined || music === undefined) return [];
    const triggerBoss = storedBossesById.get(rawPhase.triggerBossId);
    const triggerMaximum = triggerBoss?.maxHealth ?? 500;
    const triggerInitialHealth = triggerBoss?.currentHealth ?? triggerMaximum;
    const legacyStart = phaseIndex === 0
      ? triggerInitialHealth
      : Math.round(triggerInitialHealth * Number(rawPhase.startPercent) / 100);
    const startHealth = isFiniteStoredNumber(rawPhase.startHealth)
      ? Math.round(rawPhase.startHealth)
      : legacyStart;
    const endHealth = isFiniteStoredNumber(rawPhase.endHealth)
      ? Math.round(rawPhase.endHealth)
      : Math.round(triggerInitialHealth * Number(rawPhase.endPercent) / 100);
    const transition = rawPhase.transition === 'explosion'
      ? 'fade'
      : rawPhase.transition as SceneTransitionKind;
    const requestedDuration = isFiniteStoredNumber(rawPhase.transitionDurationSeconds)
      ? rawPhase.transitionDurationSeconds
      : transition === 'blackout' ? 0 : 2;
    const transitionDurationSeconds = transition === 'blackout'
      ? 0
      : Math.max(0.01, Math.min(10, requestedDuration));
    const requestedDelay = isFiniteStoredNumber(rawPhase.transitionSoundDelaySeconds)
      ? rawPhase.transitionSoundDelaySeconds
      : 0;
    return [{
      id: rawPhase.id,
      name: rawPhase.name,
      triggerBossId: rawPhase.triggerBossId,
      startHealth,
      endHealth,
      transition,
      transitionDurationSeconds,
      transitionSoundDelaySeconds: Math.max(
        0,
        Math.min(transitionDurationSeconds, requestedDelay),
      ),
      background,
      transitionSound,
      music,
      bosses: directives,
    }];
  });
  if (phases.length !== rawPhases.length) return null;
  const primaryBossId = bossSlots[0]?.bossId;
  const universalPhases = phases.filter(
    (phase) => phase.triggerBossId === primaryBossId,
  );
  if (!primaryBossId || validateSceneRanges(universalPhases)) return null;
  const rawActivePhaseIds = isRecord(value.activePhaseIds) ? value.activePhaseIds : {};
  const requestedActivePhaseId = rawActivePhaseIds[primaryBossId];
  const legacyActivePhase = Number.isInteger(value.activePhaseIndex)
    ? phases[clampInteger(value.activePhaseIndex as number, -1, phases.length - 1)]
    : null;
  const activePhaseIndex = typeof requestedActivePhaseId === 'string'
    ? universalPhases.findIndex((phase) => phase.id === requestedActivePhaseId)
    : legacyActivePhase
      ? universalPhases.findIndex((phase) => phase.id === legacyActivePhase.id)
      : -1;
  const activePhaseIds = Object.fromEntries(bossSlots.map((slot) => {
    const activeId = universalPhases[activePhaseIndex]?.id ?? null;
    return [slot.bossId, activeId];
  }));
  const storedBossIds = new Set(bosses.map((boss) => boss.bossId));
  if ([...storedBossIds].some((id) => !knownIds.has(id))) return null;
  const rawTemplates = Array.isArray(value.templates) ? value.templates : bosses;
  const templates = rawTemplates.flatMap((template, index): StoredLibraryBoss[] => {
    const fallbackId = bossSlots[index]?.bossId ?? `scene-template-${index + 1}`;
    const normalized = normalizeStoredLibraryBoss(template, true, true, fallbackId);
    return normalized ? [normalized] : [];
  });
  if (
    templates.length !== rawTemplates.length ||
    templates.some((template) => !knownIds.has(template.bossId))
  ) return null;
  return {
    bossSlots,
    phases: universalPhases,
    showPhaseMarkers: value.showPhaseMarkers === true,
    activePhaseIndex,
    activePhaseIds,
    blackoutActive: false,
    templates,
  };
};

const normalizeStoredLibraryEntry = (
  value: unknown,
): BossLibraryEntry | null => {
  if (!isStoredLibraryEnvelope(value)) return null;

  if (
    (value.schemaVersion === 5 || value.schemaVersion === 4 || value.schemaVersion === 3 || value.schemaVersion === 2) &&
    Array.isArray(value.bosses) &&
    value.bosses.length >= 1 &&
    value.bosses.length <= 3 &&
    Number.isInteger(value.activeBossIndex) &&
    (value.activeBossIndex as number) >= 0 &&
    (value.activeBossIndex as number) < value.bosses.length
  ) {
    const bosses = value.bosses.map((boss, index) =>
      normalizeStoredLibraryBoss(
        boss,
        value.schemaVersion === 5 || value.schemaVersion === 4 || value.schemaVersion === 3,
        value.schemaVersion === 5 || value.schemaVersion === 4,
        `boss-${index + 1}`,
      ),
    );
    if (bosses.some((boss) => boss === null)) return null;
    const normalizedBosses = bosses as StoredLibraryBoss[];
    const scene = value.schemaVersion === 5
      ? normalizeStoredScene(value.scene, normalizedBosses)
      : defaultStoredScene(normalizedBosses);
    if (!scene) return null;
    return {
      schemaVersion: 5,
      id: value.id,
      isAutosave: value.isAutosave,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      bosses: normalizedBosses,
      activeBossIndex: value.activeBossIndex as number,
      background: value.background,
      music: value.music,
      soundboard: value.soundboard,
      scene,
    };
  }

  if (value.schemaVersion === 1) {
    const boss = normalizeStoredLibraryBoss(value.boss, false, false, 'boss-1');
    if (!boss) return null;
    return {
      schemaVersion: 5,
      id: value.id,
      isAutosave: value.isAutosave,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      bosses: [boss],
      activeBossIndex: 0,
      background: value.background,
      music: value.music,
      soundboard: value.soundboard,
      scene: defaultStoredScene([boss]),
    };
  }

  return null;
};

const loadBossLibrary = async () => {
  try {
    const contents = await readFile(bossLibraryPath(), 'utf8');
    const parsed = JSON.parse(contents) as unknown;
    if (!isRecord(parsed) || !Array.isArray(parsed.entries)) return [];
    return parsed.entries.flatMap((entry) => {
      const normalized = normalizeStoredLibraryEntry(entry);
      return normalized ? [normalized] : [];
    });
  } catch (error) {
    if (isRecord(error) && error.code !== 'ENOENT') {
      console.error('Não foi possível ler a biblioteca de encontros.', error);
    }
    return [];
  }
};

const persistBossLibrary = () => {
  const filePath = bossLibraryPath();
  const temporaryPath = `${filePath}.tmp`;
  const contents = JSON.stringify(
    { schemaVersion: 5, entries: bossLibraryEntries },
    null,
    2,
  );

  libraryWriteQueue = libraryWriteQueue
    .catch(() => undefined)
    .then(async () => {
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(temporaryPath, contents, 'utf8');
      try {
        await rename(temporaryPath, filePath);
      } catch (error) {
        if (!isRecord(error) || (error.code !== 'EEXIST' && error.code !== 'EPERM')) {
          throw error;
        }
        await rm(filePath, { force: true });
        await rename(temporaryPath, filePath);
      }
    });
  return libraryWriteQueue;
};

const notifyLibraryChanged = () => {
  for (const window of [libraryWindow, launcherWindow]) {
    if (window && !window.isDestroyed()) {
      window.webContents.send('library:entries-changed');
    }
  }
};

const clampInteger = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, Math.round(value)));

const normalizeLibraryDraft = (value: unknown): BossLibraryDraft | null => {
  if (
    !isRecord(value) ||
    typeof value.activeBossId !== 'string' ||
    !Array.isArray(value.bosses) ||
    value.bosses.length < 1 ||
    value.bosses.length > 3
  ) return null;

  const bosses = value.bosses.flatMap((rawBoss): BossLibraryBossDraft[] => {
    if (!isRecord(rawBoss) || typeof rawBoss.bossId !== 'string') return [];
  const numericFields = [
    'maxHealth',
    'currentHealth',
    'attack',
    'rangedAttack',
    'defense',
    'rangedDefense',
    'shield',
    'skills',
    'damageReduction',
    'turnCount',
  ] as const;
    if (numericFields.some((field) => !Number.isFinite(rawBoss[field]))) return [];
  if (
      typeof rawBoss.bossName !== 'string' ||
      typeof rawBoss.amount !== 'string' ||
      typeof rawBoss.description !== 'string' ||
      !Array.isArray(rawBoss.activeStatuses) ||
      (rawBoss.actionSeverity !== 'normal' && rawBoss.actionSeverity !== 'grave')
    ) return [];

    const maxHealth = clampInteger(rawBoss.maxHealth as number, 1, 1_000_000);
    const amount = /^[0-9.,/]{1,24}$/.test(rawBoss.amount.trim())
      ? rawBoss.amount.trim()
    : '50';
    const skillBase = clampInteger(rawBoss.skills as number, -999, 999);
    const rawSkillValues = normalizeBossSkillValues(rawBoss.skillValues, skillBase);
    const skillOverrides = normalizeBossSkillOverrides(
      rawBoss.skillOverrides,
      skillBase,
      rawSkillValues,
    );
    return [{
      bossId: rawBoss.bossId,
      bossName: rawBoss.bossName.trim().slice(0, 100) || 'O Chefão Sem Nome',
      amount,
      maxHealth,
      currentHealth: clampInteger(rawBoss.currentHealth as number, 0, maxHealth),
      attack: clampInteger(rawBoss.attack as number, -999, 999),
      rangedAttack: clampInteger(rawBoss.rangedAttack as number, -999, 999),
      defense: clampInteger(rawBoss.defense as number, 0, 999),
      rangedDefense: clampInteger(rawBoss.rangedDefense as number, 0, 999),
      shield: clampInteger(rawBoss.shield as number, 0, 999),
      skills: skillBase,
      skillValues: resolveBossSkillValues(skillBase, rawSkillValues, skillOverrides),
      skillOverrides,
      damageReduction: clampInteger(rawBoss.damageReduction as number, 0, 999),
      description: rawBoss.description.trim().slice(0, 100),
      actionSeverity: rawBoss.actionSeverity,
      turnCount: clampInteger(rawBoss.turnCount as number, 0, 1_000_000),
      activeStatuses: reconcileStatusIncompatibilities(
        normalizeActiveStatuses(rawBoss.activeStatuses),
      ),
    }];
  });

  const uniqueBossIds = new Set(bosses.map((boss) => boss.bossId));
  if (
    bosses.length !== value.bosses.length ||
    uniqueBossIds.size !== bosses.length ||
    !uniqueBossIds.has(value.activeBossId)
  ) return null;

  return { activeBossId: value.activeBossId, bosses };
};

const captureLibraryEntry = (
  draft: BossLibraryDraft,
  existingEntry: BossLibraryEntry | null,
  isAutosave: boolean,
): BossLibraryEntry => {
  const now = new Date().toISOString();
  const currentTrack = musicTracks.find(
    (track) => track.id === musicState.currentTrackId,
  );
  const bosses = draft.bosses.map((boss) => ({
    bossId: boss.bossId,
    bossName: boss.bossName,
    amount: boss.amount,
    maxHealth: boss.maxHealth,
    currentHealth: boss.currentHealth,
    attack: boss.attack,
    rangedAttack: boss.rangedAttack,
    defense: boss.defense,
    rangedDefense: boss.rangedDefense,
    shield: boss.shield,
    skills: boss.skills,
    skillValues: boss.skillValues,
    skillOverrides: boss.skillOverrides,
    damageReduction: boss.damageReduction,
    description: boss.description,
    actionSeverity: boss.actionSeverity,
    turnCount: boss.turnCount,
    activeStatuses: boss.activeStatuses,
  }));
  const storedScene: StoredScenePlan = {
    bossSlots: scenePlan.bossSlots.map((slot) => ({ ...slot })),
    showPhaseMarkers: scenePlan.showPhaseMarkers,
    activePhaseIndex: scenePlan.activePhaseIndex,
    activePhaseIds: { ...scenePlan.activePhaseIds },
    blackoutActive: false,
    templates: scenePlan.bossSlots.flatMap((slot): StoredLibraryBoss[] => {
      const boss = battleState.bosses.find((item) => item.id === slot.bossId) ??
        sceneBossArchive.get(slot.bossId);
      if (!boss) return [];
      return [{
        bossId: boss.id,
        bossName: boss.bossName,
        amount: boss.controlAmount,
        maxHealth: boss.maxHealth,
        currentHealth: boss.currentHealth,
        attack: boss.attack,
        rangedAttack: boss.rangedAttack,
        defense: boss.defense,
        rangedDefense: boss.rangedDefense,
        shield: boss.shield,
        skills: boss.skills,
        skillValues: boss.skillValues,
        skillOverrides: boss.skillOverrides,
        damageReduction: boss.damageReduction,
        description: boss.nextAction,
        actionSeverity: boss.actionSeverity,
        turnCount: boss.turnCount,
        activeStatuses: boss.activeStatuses,
      }];
    }),
    phases: scenePlan.phases.map((phase) => {
      const storedBackground = (): StoredSceneMedia | null => {
        const filePath = sceneMediaPaths.get(sceneMediaKey(phase.id, 'background'));
        const summary = phase.background;
        if (!filePath || !summary) return null;
        return {
          filePath,
          name: summary.name,
          mediaType: summary.mediaType,
        };
      };
      const storedPlaylist = (slot: SceneAudioSlot): StoredScenePlaylist | null => {
        const summary = phase[slot];
        if (!summary) return null;
        const tracks = summary.tracks.flatMap((track): StoredScenePlaylistTrack[] => {
          const filePath = scenePlaylistPaths.get(
            scenePlaylistTrackKey(phase.id, slot, track.id),
          );
          return filePath ? [{
            id: track.id,
            name: track.name,
            filePath,
            duration: track.duration,
          }] : [];
        });
        if (tracks.length === 0) return null;
        return {
          tracks,
          currentTrackId: tracks.some((track) => track.id === summary.currentTrackId)
            ? summary.currentTrackId
            : tracks[0].id,
          volume: summary.volume,
          muted: summary.muted,
          loop: summary.loop,
          revision: summary.revision,
        };
      };
      return {
        ...phase,
        bosses: phase.bosses.map((directive) => ({
          ...directive,
          patch: { ...directive.patch },
        })),
        background: storedBackground(),
        transitionSound: storedPlaylist('transitionSound'),
        music: storedPlaylist('music'),
      };
    }),
  };
  return {
    schemaVersion: 5,
    id: existingEntry?.id ?? (isAutosave ? 'autosave' : randomUUID()),
    isAutosave,
    createdAt: existingEntry?.createdAt ?? now,
    updatedAt: now,
    bosses,
    activeBossIndex: Math.max(
      0,
      draft.bosses.findIndex((boss) => boss.bossId === draft.activeBossId),
    ),
    background: configuredBackgroundFilePath
      ? {
          filePath: configuredBackgroundFilePath,
          name: configuredBackgroundName ?? path.basename(configuredBackgroundFilePath),
        }
      : null,
    music: {
      tracks: musicTracks.map(({ name, filePath, duration }) => ({
        name,
        filePath,
        duration,
      })),
      currentTrackFilePath: currentTrack?.filePath ?? null,
      loop: musicState.loop,
      volume: musicState.volume,
      muted: musicState.muted,
    },
    soundboard: {
      slots: soundboardSlots.flatMap((slot) => slot ? [{ ...slot }] : []),
      volume: soundboardAudioState.volume,
      muted: soundboardAudioState.muted,
      loop: soundboardAudioState.loop,
    },
    scene: storedScene,
  };
};

const getBossLibrarySummaries = (): BossLibraryEntrySummary[] =>
  [...bossLibraryEntries]
    .sort((left, right) => {
      if (left.isAutosave !== right.isAutosave) return left.isAutosave ? -1 : 1;
      return right.updatedAt.localeCompare(left.updatedAt);
    })
    .map((entry) => ({
      id: entry.id,
      isAutosave: entry.isAutosave,
      bosses: entry.bosses.map((boss) => ({
        bossName: boss.bossName,
        maxHealth: boss.maxHealth,
        currentHealth: boss.currentHealth,
        attack: boss.attack,
        rangedAttack: boss.rangedAttack,
        defense: boss.defense,
        rangedDefense: boss.rangedDefense,
        shield: boss.shield ?? 0,
        skills: boss.skills,
        damageReduction: boss.damageReduction,
      })),
      updatedAt: entry.updatedAt,
    }));

const libraryEntryLabel = (entry: BossLibraryEntry) =>
  entry.bosses.map((boss) => boss.bossName).join(' / ');

const fileIsAvailable = async (
  filePath: string,
  kind: MissingLibraryFile['kind'],
) => {
  const extension = path.extname(filePath).toLowerCase();
  if (kind === 'background' && !supportedBackgroundExtensions.has(extension)) {
    return false;
  }
  if (kind !== 'background' && extension !== '.mp3') return false;
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
};

const findMissingLibraryFiles = async (
  entry: BossLibraryEntry,
): Promise<MissingLibraryFile[]> => {
  const candidates: Array<MissingLibraryFile & { filePath: string }> = [];
  if (entry.background) {
    candidates.push({
      key: 'background',
      kind: 'background',
      label: entry.background.name,
      filePath: entry.background.filePath,
    });
  }
  entry.music.tracks.forEach((track, index) => {
    candidates.push({
      key: `music:${index}`,
      kind: 'music',
      label: track.name,
      filePath: track.filePath,
    });
  });
  entry.soundboard.slots.forEach((slot) => {
    candidates.push({
      key: `soundboard:${slot.index}`,
      kind: 'soundboard',
      label: `Atalho ${slot.index} — ${slot.name}`,
      filePath: slot.filePath,
    });
  });
  entry.scene.phases.forEach((phase) => {
    if (phase.background) {
      candidates.push({
        key: `scene:${phase.id}:background`,
        kind: 'background',
        label: `${phase.name} — ${phase.background.name}`,
        filePath: phase.background.filePath,
      });
    }
    phase.transitionSound?.tracks.forEach((track) => {
      candidates.push({
        key: `scene:${phase.id}:transitionSound:${track.id}`,
        kind: 'music',
        label: `${phase.name} — ${track.name}`,
        filePath: track.filePath,
      });
    });
    phase.music?.tracks.forEach((track) => {
      candidates.push({
        key: `scene:${phase.id}:music:${track.id}`,
        kind: 'music',
        label: `${phase.name} — ${track.name}`,
        filePath: track.filePath,
      });
    });
  });

  const availability = await Promise.all(
    candidates.map((candidate) => fileIsAvailable(candidate.filePath, candidate.kind)),
  );
  return candidates.flatMap((candidate, index) => availability[index]
    ? []
    : [{ key: candidate.key, kind: candidate.kind, label: candidate.label }],
  );
};

const broadcastMusicState = () => {
  const nextState = getMusicState();
  for (const window of [masterWindow, playerWindow]) {
    if (window && !window.isDestroyed()) {
      window.webContents.send('music:state-changed', nextState);
    }
  }
  if (hostedSessionServer) {
    hostedSessionServer.publishMusic(
      createHostedPresentationSnapshot(
        (id) => hostedSessionServer?.mediaUrl(id) ?? '',
      ).music,
    );
  }
};

const broadcastSoundboardState = () => {
  const state = getSoundboardState();
  for (const window of [soundboardWindow, playerWindow, controlWindow]) {
    if (window && !window.isDestroyed()) {
      window.webContents.send('soundboard:state-changed', state);
    }
  }
  if (hostedSessionServer) {
    hostedSessionServer.publishSoundboard(
      createHostedPresentationSnapshot(
        (id) => hostedSessionServer?.mediaUrl(id) ?? '',
      ).soundboard,
    );
  }
};

const broadcastEncounterEffectsState = () => {
  const state = getEncounterEffectsState();
  for (const window of [masterWindow, playerWindow, controlWindow]) {
    if (window && !window.isDestroyed()) {
      window.webContents.send('encounter-effects:state-changed', state);
    }
  }
  hostedSessionServer?.publishEncounterEffects(state);
};

const broadcastHostedEncounterSoundLibrary = () => {
  const server = hostedSessionServer;
  if (!server) return;
  server.publishEncounterSoundLibrary(
    createHostedEncounterSoundUrls((id) => server.mediaUrl(id)),
  );
};

const releaseCurrentLocalCombatImpact = (soundEffectId?: number) => {
  const pending = pendingLocalCombatImpacts[0];
  if (!pending) return;
  const expectedSoundId = pending.soundEffect?.id;
  if (
    expectedSoundId !== undefined &&
    soundEffectId !== undefined &&
    expectedSoundId !== soundEffectId
  ) return;
  if (pending.timeout) clearTimeout(pending.timeout);
  pendingLocalCombatImpacts.shift();
  if (playerWindow && !playerWindow.isDestroyed()) {
    playerWindow.webContents.send('battle:state-changed', pending.battle);
    playerWindow.webContents.send('health:effect', pending.healthEffect);
  }
  startCurrentLocalCombatImpact();
};

function startCurrentLocalCombatImpact() {
  const pending = pendingLocalCombatImpacts[0];
  if (!pending) return;
  if (!playerWindow || playerWindow.isDestroyed() || !pending.soundEffect) {
    releaseCurrentLocalCombatImpact();
    return;
  }
  pending.timeout = setTimeout(() => {
    releaseCurrentLocalCombatImpact(pending.soundEffect?.id);
  }, 4_000);
  sendEncounterEffect(pending.soundEffect, false);
}

const enqueueLocalCombatImpact = (
  battle: BattleState,
  healthEffect: HealthEffect,
  soundEffect: EncounterSoundEffect | null,
) => {
  pendingLocalCombatImpacts.push({
    battle,
    healthEffect,
    soundEffect,
    timeout: null,
  });
  if (pendingLocalCombatImpacts.length === 1) {
    startCurrentLocalCombatImpact();
  }
};

const clearPendingLocalCombatImpacts = () => {
  pendingLocalCombatImpacts.forEach(({ timeout }) => {
    if (timeout) clearTimeout(timeout);
  });
  pendingLocalCombatImpacts.length = 0;
};

const sendSceneTransition = (event: SceneTransitionEvent) => {
  if (playerWindow && !playerWindow.isDestroyed()) {
    playerWindow.webContents.send('scene:transition', event);
  }
  const server = hostedSessionServer;
  if (!server) return;
  server.publishSceneTransition({
    ...event,
    soundUrl: event.soundUrl
      ? rewriteHostedMediaUrl(event.soundUrl, (id) => server.mediaUrl(id)) || null
      : null,
  });
};

const sendMusicFadeOut = (duration: number) => {
  if (playerWindow && !playerWindow.isDestroyed()) {
    playerWindow.webContents.send('music:fade-out', duration);
  }
  hostedSessionServer?.publishMusicFadeOut(duration);
};

const sendSoundboardStop = (stop: SoundboardStop) => {
  if (playerWindow && !playerWindow.isDestroyed()) {
    playerWindow.webContents.send('soundboard:stop', stop);
  }
  hostedSessionServer?.publishSoundboardStop(stop);
};

const sendSoundEffect = (effect: SoundEffect) => {
  if (playerWindow && !playerWindow.isDestroyed()) {
    playerWindow.webContents.send('soundboard:play', effect);
  }
  const server = hostedSessionServer;
  if (!server) return;
  const url = rewriteHostedMediaUrl(effect.url, (id) => server.mediaUrl(id));
  if (url) server.publishSoundEffect({ ...effect, url });
};

const sendEncounterEffect = (
  effect: EncounterSoundEffect,
  publishHosted = true,
) => {
  if (playerWindow && !playerWindow.isDestroyed()) {
    playerWindow.webContents.send('encounter-effects:play', effect);
  }
  const server = publishHosted ? hostedSessionServer : null;
  if (!server) return;
  const url = rewriteHostedMediaUrl(effect.url, (id) => server.mediaUrl(id));
  if (url) server.publishEncounterEffect({ ...effect, url });
};

const prepareEncounterSound = (soundKind: EncounterSoundEffectKind | null) => {
  if (
    !soundKind ||
    ((!playerWindow || playerWindow.isDestroyed()) && !hostedSessionServer) ||
    musicState.universalMuted ||
    encounterEffectsAudioState.volume <= 0 ||
    !isEncounterSoundEnabled(encounterEffectsAudioState, soundKind)
  ) return null;

  const availableSounds = encounterSoundOptions.filter(
    (option) => option.kind === soundKind && option.enabled,
  );
  const playbackTime = Date.now();
  const soundIndex = chooseEncounterSoundIndex(
    availableSounds.length,
    previousEncounterSoundIndex.get(soundKind) ?? null,
    encounterSoundGroupLastPlayedAt.get(soundKind) ?? null,
    playbackTime,
    randomInt,
  );
  const selectedSound = availableSounds[soundIndex] ?? null;
  if (!selectedSound) return null;
  previousEncounterSoundIndex.set(soundKind, soundIndex);
  encounterSoundGroupLastPlayedAt.set(soundKind, playbackTime);

  encounterEffectSequence += 1;
  encounterEffectSources.set(encounterEffectSequence, selectedSound.filePath);
  const encounterEffect: EncounterSoundEffect = {
    id: encounterEffectSequence,
    kind: soundKind,
    url: `boss-media://encounter-sfx/${encounterEffectSequence}`,
  };
  return { encounterEffect, optionId: selectedSound.id };
};

const prepareEncounterMechanicSound = (effect: HealthEffect) =>
  prepareEncounterSound(getEncounterSoundEffectKind(effect));

const publishDiceRollSound = () => {
  const prepared = prepareEncounterSound('dice-roll');
  if (!prepared) return;
  sendEncounterEffect(prepared.encounterEffect);
};

const stopSoundboardPlayback = (index?: number) => {
  sendSoundboardStop(index === undefined ? {} : { index });
};

const resetMusicPlayback = (trackId = musicState.currentTrackId) => {
  const duration =
    musicTracks.find((track) => track.id === trackId)?.duration ?? 0;
  musicPlaybackState = { trackId, currentTime: 0, duration };
};

const createSoundboardWindow = () => {
  if (soundboardWindow && !soundboardWindow.isDestroyed()) {
    if (soundboardWindow.isMinimized()) soundboardWindow.restore();
    soundboardWindow.show();
    soundboardWindow.focus();
    return soundboardWindow;
  }

  const anchor = controlWindow?.getBounds() ?? playerWindow?.getBounds() ??
    screen.getPrimaryDisplay().bounds;
  const { workArea } = screen.getDisplayMatching(anchor);
  const width = Math.min(720, workArea.width);
  const height = Math.min(690, workArea.height);
  const window = new BrowserWindow({
    icon: applicationIcon(),
    width,
    height,
    x: workArea.x + Math.round((workArea.width - width) / 2),
    y: workArea.y + Math.round((workArea.height - height) / 2),
    minWidth: Math.min(560, width),
    minHeight: Math.min(560, height),
    title: 'Soundboard - BossBar T20',
    backgroundColor: '#111117',
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadFile('soundboard'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  soundboardWindow = window;
  window.webContents.on('did-finish-load', () => {
    if (!window.isDestroyed()) {
      window.webContents.send('battle:state-changed', battleState);
      window.webContents.send('soundboard:state-changed', getSoundboardState());
    }
  });
  loadRenderer(window, 'soundboard');
  window.on('closed', () => {
    if (soundboardWindow === window) soundboardWindow = null;
  });
  return window;
};

const createLibraryWindow = () => {
  if (libraryWindow && !libraryWindow.isDestroyed()) {
    if (libraryWindow.isMinimized()) libraryWindow.restore();
    libraryWindow.show();
    libraryWindow.focus();
    libraryWindow.webContents.send('library:entries-changed');
    return libraryWindow;
  }

  const { workArea } = screen.getPrimaryDisplay();
  const width = Math.min(1160, workArea.width);
  const height = Math.min(760, workArea.height);
  const window = new BrowserWindow({
    icon: applicationIcon(),
    width,
    height,
    x: workArea.x + Math.round((workArea.width - width) / 2),
    y: workArea.y + Math.round((workArea.height - height) / 2),
    minWidth: Math.min(900, width),
    minHeight: Math.min(520, height),
    title: 'Biblioteca de Encontros - BossBar T20',
    backgroundColor: '#111117',
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadFile('library'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  libraryWindow = window;
  loadRenderer(window, 'library');
  window.on('closed', () => {
    if (libraryWindow === window) {
      libraryWindow = null;
    }
  });
  return window;
};

const createSceneEditorWindow = () => {
  if (sceneEditorWindow && !sceneEditorWindow.isDestroyed()) {
    if (sceneEditorWindow.isMinimized()) sceneEditorWindow.restore();
    sceneEditorWindow.show();
    sceneEditorWindow.focus();
    sceneEditorWindow.webContents.send('scene:state-changed', scenePlan);
    return sceneEditorWindow;
  }

  const { workArea } = screen.getDisplayMatching(
    masterWindow?.getBounds() ?? screen.getPrimaryDisplay().bounds,
  );
  allowSceneEditorClose = false;
  pendingSceneMediaPaths.clear();
  const width = Math.min(1180, workArea.width);
  const height = Math.min(820, workArea.height);
  const window = new BrowserWindow({
    icon: applicationIcon(),
    width,
    height,
    x: workArea.x + Math.round((workArea.width - width) / 2),
    y: workArea.y + Math.round((workArea.height - height) / 2),
    minWidth: Math.min(940, width),
    minHeight: Math.min(620, height),
    title: 'Editar Cena - BossBar T20',
    backgroundColor: '#100d13',
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadFile('scene-editor'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  sceneEditorWindow = window;
  window.on('close', (event) => {
    if (allowSceneEditorClose) return;
    event.preventDefault();
    window.show();
    window.focus();
    window.webContents.focus();
    window.webContents.send('scene:close-requested');
  });
  window.webContents.on('did-finish-load', () => {
    if (!window.isDestroyed()) {
      window.webContents.send('scene:state-changed', scenePlan);
      window.webContents.send('battle:state-changed', battleState);
      if (pendingActivePlaylistPhaseId) {
        window.webContents.send(
          'scene:open-active-playlist-requested',
          pendingActivePlaylistPhaseId,
        );
        pendingActivePlaylistPhaseId = null;
      }
    }
  });
  loadRenderer(window, 'scene-editor');
  window.on('closed', () => {
    if (sceneEditorWindow === window) {
      sceneEditorWindow = null;
      allowSceneEditorClose = false;
      pendingSceneMediaPaths.clear();
      pendingScenePlaylists.clear();
    }
  });
  return window;
};

type WindowBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const getDockedControlBounds = (
  playerBounds: WindowBounds,
  controlHeight: number,
): WindowBounds => ({
  x: playerBounds.x,
  y: playerBounds.y + playerBounds.height - CONTROL_PANEL_DOCK_OVERLAP,
  width: playerBounds.width,
  height: controlHeight,
});

const getDockedControlBoundsForWindow = (
  window: BrowserWindow,
  controlHeight: number,
): WindowBounds => {
  const contentBounds = window.getContentBounds();
  return getDockedControlBounds(contentBounds, controlHeight);
};

const getMasterWidthForWorkArea = (workArea: Electron.Rectangle) =>
  Math.min(430, Math.max(390, Math.round(workArea.width * 0.25)));

const getPlayerAreaForDisplay = (
  display: Electron.Display,
): Electron.Rectangle => {
  const { workArea } = display;
  const primaryDisplay = screen.getPrimaryDisplay();
  if (display.id !== primaryDisplay.id) return { ...workArea };

  const masterWidth = getMasterWidthForWorkArea(workArea);
  return {
    x: workArea.x,
    y: workArea.y,
    width: Math.max(1, workArea.width - masterWidth - DOCKED_WINDOW_GAP),
    height: workArea.height,
  };
};

const diagonalResizeEdges = new Set<Electron.WillResizeDetails['edge']>([
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
]);

const isDiagonalResize = (details: Electron.WillResizeDetails) =>
  diagonalResizeEdges.has(details.edge);

type DockedResizeSource = 'player' | 'control';

const applyDockedGroupGeometry = (
  window: BrowserWindow,
  requestedContentWidth: number,
  requestedControlHeight: number,
  display: Electron.Display,
  edge: Electron.WillResizeDetails['edge'],
  source: DockedResizeSource,
  scaleControlHeight: boolean,
) => {
  const playerArea = getPlayerAreaForDisplay(display);
  const { workArea } = display;
  const outerBounds = window.getBounds();
  const contentBounds = window.getContentBounds();
  const frameWidth = Math.max(0, outerBounds.width - contentBounds.width);
  const frameHeight = Math.max(0, outerBounds.height - contentBounds.height);
  const topInset = Math.max(0, contentBounds.y - outerBounds.y);
  const maximumContentWidthFromOuterHeight = Math.max(
    1,
    Math.floor(
      Math.max(1, PLAYER_MAX_OUTER_HEIGHT - frameHeight) * (16 / 9),
    ),
  );
  const size = calculateProportionalDockedSize({
    requestedContentWidth,
    currentContentWidth: contentBounds.width,
    currentControlHeight: requestedControlHeight,
    availableContentWidth: Math.max(
      1,
      Math.min(
        playerArea.width - frameWidth,
        PLAYER_MAX_OUTER_WIDTH - frameWidth,
        maximumContentWidthFromOuterHeight,
      ),
    ),
    workAreaHeight: workArea.height,
    frameHeight,
    topInset,
    dockOverlap: CONTROL_PANEL_DOCK_OVERLAP,
    minimumContentWidth: PLAYER_MIN_CONTENT_WIDTH,
    minimumControlHeight: CONTROL_PANEL_MIN_EXPANDED_HEIGHT,
    maximumControlHeight: CONTROL_PANEL_MAX_EXPANDED_HEIGHT,
    scaleControlHeight,
  });
  const targetContentX = edge.includes('left')
    ? contentBounds.x + contentBounds.width - size.contentWidth
    : contentBounds.x;
  const targetContentY = source === 'player' && edge.startsWith('top')
    ? contentBounds.y + contentBounds.height - size.contentHeight
    : contentBounds.y;

  synchronizingDockedWindows = true;
  // Release the constraints from the previous display before applying the
  // dimensions calculated for the display currently under the window.
  window.setMinimumSize(100, 100);
  window.setMaximumSize(100_000, 100_000);
  window.setContentBounds({
    x: targetContentX,
    y: targetContentY,
    width: size.contentWidth,
    height: size.contentHeight,
  });

  let adjustedOuterBounds = window.getBounds();
  let adjustedContentBounds = window.getContentBounds();
  let controlBounds = getDockedControlBounds(
    adjustedContentBounds,
    size.controlHeight,
  );
  const groupLeft = Math.min(adjustedOuterBounds.x, controlBounds.x);
  const groupTop = Math.min(adjustedOuterBounds.y, controlBounds.y);
  const groupRight = Math.max(
    adjustedOuterBounds.x + adjustedOuterBounds.width,
    controlBounds.x + controlBounds.width,
  );
  const groupBottom = Math.max(
    adjustedOuterBounds.y + adjustedOuterBounds.height,
    controlBounds.y + controlBounds.height,
  );
  let offsetX = 0;
  let offsetY = 0;
  if (groupLeft < playerArea.x) offsetX = playerArea.x - groupLeft;
  if (groupRight + offsetX > playerArea.x + playerArea.width) {
    offsetX += playerArea.x + playerArea.width - (groupRight + offsetX);
  }
  if (groupTop < workArea.y) offsetY = workArea.y - groupTop;
  if (groupBottom + offsetY > workArea.y + workArea.height) {
    offsetY += workArea.y + workArea.height - (groupBottom + offsetY);
  }
  if (offsetX !== 0 || offsetY !== 0) {
    window.setPosition(
      adjustedOuterBounds.x + offsetX,
      adjustedOuterBounds.y + offsetY,
    );
    adjustedOuterBounds = window.getBounds();
    adjustedContentBounds = window.getContentBounds();
    controlBounds = getDockedControlBounds(
      adjustedContentBounds,
      size.controlHeight,
    );
  }

  if (controlWindow && !controlWindow.isDestroyed()) {
    controlWindow.setBounds(controlBounds);
  }

  const adjustedFrameWidth = Math.max(
    0,
    adjustedOuterBounds.width - adjustedContentBounds.width,
  );
  const adjustedFrameHeight = Math.max(
    0,
    adjustedOuterBounds.height - adjustedContentBounds.height,
  );
  const minimumOuterWidth = size.minimumContentWidth + adjustedFrameWidth;
  const minimumOuterHeight =
    Math.round(size.minimumContentWidth * (9 / 16)) + adjustedFrameHeight;
  const maximumOuterWidth = size.maximumContentWidth + adjustedFrameWidth;
  const maximumOuterHeight =
    Math.round(size.maximumContentWidth * (9 / 16)) + adjustedFrameHeight;
  window.setMinimumSize(minimumOuterWidth, minimumOuterHeight);
  window.setMaximumSize(maximumOuterWidth, maximumOuterHeight);
  synchronizingDockedWindows = false;

  if (!controlPanelMinimized) {
    controlPanelExpandedHeight = size.controlHeight;
  }
  return size;
};

const constrainPlayerForControl = (
  window: BrowserWindow,
  controlHeight: number,
  display = screen.getDisplayMatching(window.getBounds()),
) => {
  const contentBounds = window.getContentBounds();
  applyDockedGroupGeometry(
    window,
    contentBounds.width,
    controlHeight,
    display,
    'bottom-right',
    'player',
    !controlPanelMinimized,
  );
};

const resizeDockedGroup = (
  requestedBounds: Electron.Rectangle,
  details: Electron.WillResizeDetails,
  source: DockedResizeSource,
) => {
  if (
    !playerWindow ||
    playerWindow.isDestroyed() ||
    !controlWindow ||
    controlWindow.isDestroyed()
  ) return;

  const playerOuterBounds = playerWindow.getBounds();
  const playerContentBounds = playerWindow.getContentBounds();
  const frameWidth = Math.max(
    0,
    playerOuterBounds.width - playerContentBounds.width,
  );
  const requestedContentWidth = source === 'player'
    ? Math.max(1, requestedBounds.width - frameWidth)
    : Math.max(1, requestedBounds.width);
  const display = screen.getDisplayMatching(requestedBounds);
  applyDockedGroupGeometry(
    playerWindow,
    requestedContentWidth,
    controlPanelMinimized
      ? CONTROL_PANEL_MINIMIZED_HEIGHT
      : controlPanelExpandedHeight,
    display,
    details.edge,
    source,
    !controlPanelMinimized,
  );
};

const nativeWindowHandle = (window: BrowserWindow) => {
  const nativeHandle = window.getNativeWindowHandle();
  return nativeHandle.length >= 8
    ? nativeHandle.readBigUInt64LE(0).toString()
    : nativeHandle.readUInt32LE(0).toString();
};

const configureNativeDockedWindowChrome = () => {
  if (
    process.platform !== 'win32' ||
    !playerWindow ||
    playerWindow.isDestroyed() ||
    !controlWindow ||
    controlWindow.isDestroyed()
  ) return;

  const playerHandle = nativeWindowHandle(playerWindow);
  const controlHandle = nativeWindowHandle(controlWindow);
  const command = [
    "Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class BossBarDwmChrome { [DllImport(\"dwmapi.dll\")] static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size); public static void Configure(IntPtr hwnd) { int cornerPreference = 1; int borderColor = unchecked((int)0xFFFFFFFE); DwmSetWindowAttribute(hwnd, 33, ref cornerPreference, 4); DwmSetWindowAttribute(hwnd, 34, ref borderColor, 4); } }'",
    `[BossBarDwmChrome]::Configure([IntPtr]::new([Int64]${playerHandle}))`,
    `[BossBarDwmChrome]::Configure([IntPtr]::new([Int64]${controlHandle}))`,
  ].join('; ');

  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', command],
    { stdio: 'ignore', timeout: 5000, windowsHide: true },
  );
  if (result.error || result.status !== 0) {
    console.error(
      'Não foi possível configurar a moldura DWM:',
      result.error ?? `processo encerrado com código ${result.status}`,
    );
  }
};

const getInitialWindowLayout = (): {
  player: WindowBounds;
  control: WindowBounds;
  master: WindowBounds;
} => {
  const { workArea } = screen.getPrimaryDisplay();
  const masterWidth = getMasterWidthForWorkArea(workArea);
  const masterHeight = Math.min(
    hostedSessionServer ? 960 : 660,
    workArea.height,
  );
  const controlHeight = Math.min(
    CONTROL_PANEL_PREFERRED_HEIGHT,
    Math.max(CONTROL_PANEL_MIN_EXPANDED_HEIGHT, workArea.height - 450),
  );
  const presentationSize = calculateInitialDockedPresentationSize({
    workAreaWidth: workArea.width,
    workAreaHeight: workArea.height,
    masterWidth,
    gap: DOCKED_WINDOW_GAP,
    controlHeight,
    nativeFrameBudget: PLAYER_NATIVE_FRAME_BUDGET,
    preferredContentWidth: PLAYER_PREFERRED_CONTENT_WIDTH,
  });
  const playerAreaWidth = presentationSize.playerAreaWidth;
  const playerWidth = presentationSize.contentWidth;
  const playerHeight = presentationSize.estimatedOuterHeight;

  const playerX =
    workArea.x + Math.round((playerAreaWidth - playerWidth) / 2);
  const groupHeight = playerHeight + controlHeight;
  const playerY = workArea.y + Math.max(0, Math.round((workArea.height - groupHeight) / 2));
  const masterX = Math.min(
    workArea.x + workArea.width - masterWidth,
    playerX + playerWidth + DOCKED_WINDOW_GAP,
  );

  return {
    player: {
      x: playerX,
      y: playerY,
      width: playerWidth,
      height: playerHeight,
    },
    control: getDockedControlBounds(
      { x: playerX, y: playerY, width: playerWidth, height: playerHeight },
      controlHeight,
    ),
    master: {
      x: masterX,
      y: workArea.y + Math.max(0, Math.round((workArea.height - masterHeight) / 2)),
      width: masterWidth,
      height: masterHeight,
    },
  };
};

const positionMasterBesidePlayer = () => {
  if (
    !masterWindow ||
    masterWindow.isDestroyed() ||
    !playerWindow ||
    playerWindow.isDestroyed()
  ) return;

  const playerBounds = playerWindow.getBounds();
  const masterBounds = masterWindow.getBounds();
  const { workArea } = screen.getDisplayMatching(playerBounds);
  const maximumX = workArea.x + workArea.width - masterBounds.width;
  const maximumY = workArea.y + workArea.height - masterBounds.height;
  masterWindow.setPosition(
    Math.max(
      workArea.x,
      Math.min(
        maximumX,
        playerBounds.x + playerBounds.width + DOCKED_WINDOW_GAP,
      ),
    ),
    Math.max(workArea.y, Math.min(maximumY, playerBounds.y)),
  );
};

const syncControlWindow = () => {
  if (
    synchronizingDockedWindows ||
    !playerWindow ||
    playerWindow.isDestroyed() ||
    !controlWindow ||
    controlWindow.isDestroyed()
  ) return;
  const currentControlBounds = controlWindow.getBounds();
  const synchronizedControlHeight = controlPanelMinimized
    ? CONTROL_PANEL_MINIMIZED_HEIGHT
    : currentControlBounds.height;
  synchronizingDockedWindows = true;
  controlWindow.setBounds(
    getDockedControlBoundsForWindow(playerWindow, synchronizedControlHeight),
  );
  synchronizingDockedWindows = false;
};

const scheduleDockedGroupFit = () => {
  if (dockedMoveFitTimer) clearTimeout(dockedMoveFitTimer);
  dockedMoveFitTimer = setTimeout(() => {
    dockedMoveFitTimer = null;
    if (!playerWindow || playerWindow.isDestroyed()) return;
    const display = screen.getDisplayMatching(playerWindow.getBounds());
    constrainPlayerForControl(
      playerWindow,
      controlPanelMinimized
        ? CONTROL_PANEL_MINIMIZED_HEIGHT
        : controlPanelExpandedHeight,
      display,
    );
    syncControlWindow();
  }, 120);
};

const focusDockedWindowGroup = () => {
  if (
    synchronizingDockedFocus ||
    !playerWindow ||
    playerWindow.isDestroyed() ||
    !controlWindow ||
    controlWindow.isDestroyed()
  ) return;

  synchronizingDockedFocus = true;
  playerWindow.moveTop();
  controlWindow.showInactive();
  controlWindow.moveTop();
  // Windows only supports one foreground HWND at a time. Keeping the owned
  // control window focused makes both it and its player owner form the active
  // native window group, regardless of which one the user clicked.
  controlWindow.focus();
  controlWindow.webContents.focus();
  setTimeout(() => {
    synchronizingDockedFocus = false;
  }, 0);
};

const createControlWindow = (bounds: WindowBounds) => {
  if (controlWindow && !controlWindow.isDestroyed()) {
    controlWindow.setBounds(bounds);
    controlWindow.showInactive();
    return controlWindow;
  }

  const window = new BrowserWindow({
    ...bounds,
    icon: applicationIcon(),
    parent: playerWindow ?? undefined,
    show: false,
    frame: false,
    hasShadow: false,
    minWidth: Math.min(PLAYER_MIN_CONTENT_WIDTH, bounds.width),
    minHeight: CONTROL_PANEL_MINIMIZED_HEIGHT,
    maxHeight: CONTROL_PANEL_MAX_EXPANDED_HEIGHT,
    resizable: true,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    title: 'Painel Privado do Encontro - BossBar T20',
    backgroundColor: '#111117',
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadFile('control'),
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  controlWindow = window;
  allowControlWindowClose = false;
  controlPanelMinimized = false;
  controlPanelExpandedHeight = bounds.height;
  window.setClosable(false);
  configureNativeDockedWindowChrome();
  window.on('focus', focusDockedWindowGroup);
  window.on('will-resize', (event, newBounds, details) => {
    event.preventDefault();
    if (
      !synchronizingDockedWindows &&
      !controlPanelMinimized &&
      isDiagonalResize(details)
    ) {
      resizeDockedGroup(newBounds, details, 'control');
    }
  });
  window.webContents.on('did-finish-load', () => {
    if (!window.isDestroyed()) {
      window.webContents.send('battle:state-changed', battleState);
      if (playerWindowReady) window.showInactive();
    }
  });
  loadRenderer(window, 'control');
  window.on('close', (event) => {
    if (!allowControlWindowClose) event.preventDefault();
  });
  window.on('closed', () => {
    if (controlWindow === window) controlWindow = null;
    allowControlWindowClose = false;
    controlPanelMinimized = false;
  });
  return window;
};

const createPlayerWindow = (
  bounds = {
    ...getInitialWindowLayout().player,
    ...lastPlayerWindowPosition,
  },
) => {
  if (playerWindow && !playerWindow.isDestroyed()) {
    if (!controlWindow || controlWindow.isDestroyed()) {
      const controlHeight = getInitialWindowLayout().control.height;
      createControlWindow(
        getDockedControlBoundsForWindow(playerWindow, controlHeight),
      );
    }
    if (playerWindowReady) {
      if (playerWindow.isMinimized()) {
        playerWindow.restore();
      }
      playerWindow.show();
      playerWindow.focus();
    }
    return playerWindow;
  }

  const window = new BrowserWindow({
    icon: applicationIcon(),
    ...bounds,
    show: false,
    hasShadow: false,
    resizable: true,
    maximizable: false,
    minWidth: Math.min(800, bounds.width),
    minHeight: Math.min(450, bounds.height),
    title: 'Apresentação do Chefão - BossBar T20',
    backgroundColor: '#050408',
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadFile('player'),
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  playerWindow = window;
  broadcastPresentationOpen();
  playerWindowReady = false;
  allowPlayerWindowClose = false;
  playerWindowClosePending = false;
  window.setAspectRatio(16 / 9);
  const contentWidth = Math.max(1, bounds.width);
  window.setContentSize(contentWidth, Math.round(contentWidth * (9 / 16)));

  const initialControlBounds = getInitialWindowLayout().control;
  constrainPlayerForControl(window, initialControlBounds.height);
  createControlWindow(
    getDockedControlBoundsForWindow(window, controlPanelExpandedHeight),
  );

  window.webContents.on('did-finish-load', () => {
    if (!window.isDestroyed()) {
      window.webContents.send('battle:state-changed', battleState);
      window.webContents.send('background:changed', getBackgroundState());
      window.webContents.send('music:state-changed', getMusicState());
    }
  });

  loadRenderer(window, 'player');

  window.on('focus', focusDockedWindowGroup);
  window.on('will-resize', (event, newBounds, details) => {
    event.preventDefault();
    if (!synchronizingDockedWindows && isDiagonalResize(details)) {
      resizeDockedGroup(newBounds, details, 'player');
    }
  });
  window.on('move', () => {
    syncControlWindow();
    scheduleDockedGroupFit();
    if (window.isFocused() && controlWindow && !controlWindow.isDestroyed()) {
      controlWindow.showInactive();
      controlWindow.moveTop();
    }
  });
  window.on('resize', syncControlWindow);
  window.on('resized', () => {
    constrainPlayerForControl(
      window,
      controlPanelMinimized
        ? CONTROL_PANEL_MINIMIZED_HEIGHT
        : controlPanelExpandedHeight,
    );
    syncControlWindow();
  });
  window.on('moved', () => {
    const { x, y } = window.getBounds();
    lastPlayerWindowPosition = { x, y };
    const display = screen.getDisplayMatching(window.getBounds());
    constrainPlayerForControl(
      window,
      controlPanelMinimized
        ? CONTROL_PANEL_MINIMIZED_HEIGHT
        : controlPanelExpandedHeight,
      display,
    );
    syncControlWindow();
  });
  window.on('minimize', () => controlWindow?.hide());
  window.on('hide', () => controlWindow?.hide());
  window.on('restore', () => {
    syncControlWindow();
    controlWindow?.showInactive();
  });
  window.on('show', () => {
    controlWindow?.showInactive();
    broadcastPresentationOpen();
  });

  window.on('close', (event) => {
    const { x, y } = window.getBounds();
    lastPlayerWindowPosition = { x, y };
    // Mantém o renderer local como relógio autoritativo da música hospedada,
    // embora a apresentação pareça fechada para o mestre.
    if (returningToLauncher) return;
    if (hostedSessionServer && !allowAppClose) {
      event.preventDefault();
      window.hide();
      broadcastPresentationOpen();
      return;
    }
    if (!allowPlayerWindowClose && musicState.isPlaying) {
      event.preventDefault();
      if (playerWindowClosePending) return;
      playerWindowClosePending = true;
      window.webContents.send('music:fade-out', 1400);
      playerWindowCloseTimer = setTimeout(() => {
        playerWindowCloseTimer = null;
        if (playerWindow !== window || window.isDestroyed()) return;
        if (musicState.isPlaying) {
          musicState = {
            ...musicState,
            isPlaying: false,
            revision: musicState.revision + 1,
          };
          broadcastMusicState();
        }
        allowPlayerWindowClose = true;
        window.close();
      }, 1500);
    }
  });

  window.on('closed', () => {
    if (playerWindow === window) {
      playerWindow = null;
      playerWindowReady = false;
      allowPlayerWindowClose = false;
      playerWindowClosePending = false;
      soundEffectSources.clear();
      encounterEffectSources.clear();
      clearPendingLocalCombatImpacts();
      if (playerWindowCloseTimer) clearTimeout(playerWindowCloseTimer);
      playerWindowCloseTimer = null;
      if (dockedMoveFitTimer) clearTimeout(dockedMoveFitTimer);
      dockedMoveFitTimer = null;
      if (controlWindow && !controlWindow.isDestroyed()) {
        allowControlWindowClose = true;
        controlWindow.setClosable(true);
        controlWindow.close();
      }
      controlPanelMinimized = false;
      broadcastPresentationOpen();
    }
  });

  return window;
};

const createEncounterWindows = () => {
  if (masterWindow && !masterWindow.isDestroyed()) {
    masterWindow.show();
    createPlayerWindow();
    positionMasterBesidePlayer();
    return;
  }
  const layout = getInitialWindowLayout();
  masterWindow = new BrowserWindow({
    ...layout.master,
    icon: applicationIcon(),
    minWidth: 390,
    maxWidth: 480,
    minHeight: Math.min(600, layout.master.height),
    maxHeight: Math.min(
      hostedSessionServer ? 1040 : 700,
      screen.getPrimaryDisplay().workArea.height,
    ),
    title: 'Controle do Mestre - BossBar T20',
    backgroundColor: '#111117',
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadFile('master'),
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  loadRenderer(masterWindow, 'master');
  createPlayerWindow(layout.player);
  positionMasterBesidePlayer();

  masterWindow.on('close', (event) => {
    if (allowAppClose || returningToLauncher) return;
    event.preventDefault();
    const window = masterWindow;
    if (!window || window.isDestroyed()) return;

    if (window.isMinimized()) window.restore();
    window.show();
    window.setAlwaysOnTop(true, 'pop-up-menu');
    window.moveTop();
    window.focus();
    window.webContents.focus();
    window.webContents.send('app:close-requested');

    if (masterFocusTimer) clearTimeout(masterFocusTimer);
    masterFocusTimer = setTimeout(() => {
      masterFocusTimer = null;
      if (masterWindow === window && !window.isDestroyed()) {
        window.setAlwaysOnTop(false);
      }
    }, 800);
  });

  masterWindow.on('closed', () => {
    if (masterFocusTimer) clearTimeout(masterFocusTimer);
    masterFocusTimer = null;
    masterWindow = null;
    libraryWindow?.close();
    soundboardWindow?.close();
    allowSceneEditorClose = true;
    sceneEditorWindow?.close();
    playerWindow?.close();
    if (controlWindow && !controlWindow.isDestroyed()) {
      allowControlWindowClose = true;
      controlWindow.setClosable(true);
      controlWindow.close();
    }
    returningToLauncher = false;
  });
};

const createLauncherWindow = () => {
  if (launcherWindow && !launcherWindow.isDestroyed()) {
    launcherWindow.show();
    launcherWindow.focus();
    return launcherWindow;
  }

  const { workArea } = screen.getPrimaryDisplay();
  const width = Math.min(780, workArea.width);
  const height = Math.min(450, workArea.height);
  const window = new BrowserWindow({
    icon: applicationIcon(),
    width,
    height,
    x: workArea.x + Math.round((workArea.width - width) / 2),
    y: workArea.y + Math.round((workArea.height - height) / 2),
    minWidth: Math.min(700, width),
    minHeight: Math.min(380, height),
    maxWidth: width,
    maxHeight: height,
    resizable: false,
    title: 'Início - BossBar T20',
    backgroundColor: '#0d0b10',
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadFile('launcher'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  launcherWindow = window;
  loadRenderer(window, 'launcher');
  window.on('closed', () => {
    if (launcherWindow === window) launcherWindow = null;
  });
  return window;
};

const localInitiativeResult = (
  participant: EncounterTurnState['participants'][number],
): EncounterRollResult => ({
  id: `initiative:${participant.id}:${randomUUID()}`,
  participantId: participant.id,
  label: 'Iniciativa',
  expression: `1d20 ${participant.initiativeModifier >= 0 ? '+' : '-'} ${Math.abs(participant.initiativeModifier)}`,
  rolls: [participant.initiativeRoll],
  modifier: participant.initiativeModifier,
  total: participant.initiativeTotal,
  outcome: 'neutral',
  category: 'initiative',
  createdAt: Date.now(),
  retainedByParticipantId: null,
  sequence: ++localEncounterRollSequence,
});

const syncLocalEncounterTurns = () => {
  if (hostedSessionServer) return;
  if (!battleState.battleStarted) {
    if (
      encounterTurnState.participants.length === 0 &&
      !encounterTurnState.started &&
      encounterTurnState.round === 0 &&
      encounterTurnState.activeParticipantId === null
    ) {
      return;
    }
    encounterTurnState = emptyEncounterTurnState();
    localEncounterRollSequence = 0;
    broadcastEncounterTurnState();
    return;
  }
  const actors = battleState.bosses
    .filter((boss) => boss.setupStatus === 'ready' && boss.currentHealth > 0)
    .map((boss) => ({
      id: `boss:${boss.id}`,
      kind: 'boss' as const,
      sourceId: boss.id,
      name: boss.bossName,
      initiativeModifier: boss.skillValues?.iniciativa ?? boss.skills,
      eligibleRound: encounterTurnState.started
        ? encounterTurnState.round + 1
        : 1,
    }));
  const existingById = new Map(
    encounterTurnState.participants.map((participant) => [
      participant.id,
      participant,
    ]),
  );
  let rolledInitiative = false;
  const participants = !encounterTurnState.started
    ? prepareManualInitiative(actors, encounterTurnState.participants)
    : actors.map((actor) => {
      const existing = existingById.get(actor.id);
      return existing
        ? {
          ...existing,
          name: actor.name,
          initiativeModifier: actor.initiativeModifier,
          initiativeTotal: existing.initiativeRoll + actor.initiativeModifier,
        }
        : (() => {
          rolledInitiative = true;
          return rollInitiativeOrder([actor], () => randomInt(1, 21))[0];
        })();
    }).sort((left, right) =>
      right.initiativeTotal - left.initiativeTotal ||
      right.initiativeModifier - left.initiativeModifier ||
      left.id.localeCompare(right.id)
    );
  const nextActiveParticipantId = participants.some(
    ({ id }) => id === encounterTurnState.activeParticipantId,
  )
    ? encounterTurnState.activeParticipantId
    : encounterTurnState.started
      ? participants.find(
        ({ eligibleRound }) => eligibleRound <= encounterTurnState.round,
      )?.id ?? participants[0]?.id ?? null
      : null;
  const participantsUnchanged =
    participants.length === encounterTurnState.participants.length &&
    participants.every((participant, index) => {
      const current = encounterTurnState.participants[index];
      return current &&
        participant.id === current.id &&
        participant.kind === current.kind &&
        participant.sourceId === current.sourceId &&
        participant.name === current.name &&
        participant.initiativeModifier === current.initiativeModifier &&
        participant.initiativeRoll === current.initiativeRoll &&
        participant.initiativeTotal === current.initiativeTotal &&
        participant.eligibleRound === current.eligibleRound;
    });
  if (
    participantsUnchanged &&
    nextActiveParticipantId === encounterTurnState.activeParticipantId
  ) {
    return;
  }
  encounterTurnState = {
    ...encounterTurnState,
    participants,
    activeParticipantId: nextActiveParticipantId,
    initiativeReady: encounterTurnState.started
      ? encounterTurnState.initiativeReady
      : participants.length > 0 &&
        participants.every(({ initiativeRolled }) => initiativeRolled !== false),
    rollResults: encounterTurnState.rollResults,
    revision: encounterTurnState.revision + 1,
  };
  broadcastEncounterTurnState();
  if (rolledInitiative && participants.length > 0) {
    publishDiceRollSound();
  }
};

const rollLocalEncounterInitiative = (
  participantId: string,
  allowedKinds: ReadonlySet<'boss' | 'npc'>,
): EncounterTurnActionResult => {
  const participant = encounterTurnState.participants.find(
    ({ id }) => id === participantId,
  );
  if (!participant || !allowedKinds.has(participant.kind as 'boss' | 'npc')) {
    return { ok: false, error: 'Este participante não pode ser rolado por aqui.' };
  }
  const rolled = rollManualInitiative(
    encounterTurnState,
    participantId,
    () => randomInt(1, 21),
  );
  if (!rolled) {
    return { ok: false, error: 'Esta iniciativa já foi rolada ou não está disponível.' };
  }
  encounterTurnState = {
    ...rolled.state,
    rollResults: [
      ...(encounterTurnState.rollResults ?? []).filter(
        (candidate) =>
          candidate.category !== 'initiative' ||
          candidate.participantId !== participantId,
      ),
      localInitiativeResult(rolled.participant),
    ],
  };
  publishDiceRollSound();
  broadcastEncounterTurnState();
  return {
    ok: true,
    state: encounterTurnState,
    ...(rolled.tiedParticipantIds.length > 0
      ? { error: 'Houve empate. Os participantes empatados devem rolar novamente.' }
      : {}),
  };
};

const broadcastBattleState = (
  publishHosted = true,
  includePlayer = true,
) => {
  for (const window of [
    masterWindow,
    playerWindow,
    controlWindow,
    sceneEditorWindow,
    soundboardWindow,
  ]) {
    if (
      window &&
      !window.isDestroyed() &&
      (includePlayer || window !== playerWindow)
    ) {
      window.webContents.send('battle:state-changed', battleState);
    }
  }
  if (publishHosted) {
    hostedSessionServer?.publishBattleState(toPublicBattleState(battleState));
  }
  if (!hostedSessionServer) syncLocalEncounterTurns();
};

const isPresentationOpen = () =>
  Boolean(playerWindow && !playerWindow.isDestroyed() && playerWindow.isVisible());

const broadcastPresentationOpen = () => {
  if (masterWindow && !masterWindow.isDestroyed()) {
    masterWindow.webContents.send('presentation:open-changed', isPresentationOpen());
  }
};

const broadcastBackground = () => {
  const background = getBackgroundState();

  for (const window of [masterWindow, playerWindow]) {
    if (window && !window.isDestroyed()) {
      window.webContents.send('background:changed', background);
    }
  }
  if (hostedSessionServer) {
    hostedSessionServer.publishBackground(
      createHostedPresentationSnapshot(
        (id) => hostedSessionServer?.mediaUrl(id) ?? '',
      ).background,
    );
  }
};

const sceneMediaKey = (phaseId: string, slot: SceneMediaSlot) =>
  `${phaseId}:${slot}`;

const scenePlaylistTrackKey = (
  phaseId: string,
  slot: SceneAudioSlot,
  trackId: string,
) => `${sceneMediaKey(phaseId, slot)}:${trackId}`;

const scenePlaylistTrackUrl = (
  phaseId: string,
  slot: SceneAudioSlot,
  trackId: string,
) => `boss-media://scene-audio/${encodeURIComponent(
  scenePlaylistTrackKey(phaseId, slot, trackId),
)}`;

const cloneScenePlaylistSummary = (
  summary: ScenePlaylistSummary,
): ScenePlaylistSummary => ({
  ...summary,
  tracks: summary.tracks.map((track) => ({ ...track })),
});

const getScenePlaylistPhase = (phaseId: string) =>
  scenePlan.phases.find((phase) => phase.id === phaseId) ?? null;

const getScenePlaylistSummary = (
  phaseId: string,
  slot: SceneAudioSlot,
) => pendingScenePlaylists.get(sceneMediaKey(phaseId, slot))?.summary ??
  getScenePlaylistPhase(phaseId)?.[slot] ?? null;

const ensurePendingScenePlaylist = (
  phaseId: string,
  slot: SceneAudioSlot,
): PendingScenePlaylist => {
  const key = sceneMediaKey(phaseId, slot);
  const existing = pendingScenePlaylists.get(key);
  if (existing) return existing;
  const source = getScenePlaylistPhase(phaseId)?.[slot];
  const summary: ScenePlaylistSummary = source
    ? cloneScenePlaylistSummary(source)
    : {
        tracks: [],
        currentTrackId: null,
        volume: 0.8,
        muted: false,
        loop: false,
        revision: 0,
      };
  const paths = new Map<string, string>();
  for (const track of summary.tracks) {
    const trackKey = scenePlaylistTrackKey(phaseId, slot, track.id);
    const filePath = scenePlaylistPaths.get(trackKey);
    if (filePath) paths.set(track.id, filePath);
  }
  const pending = { summary, paths };
  pendingScenePlaylists.set(key, pending);
  return pending;
};

const getScenePlaylistState = (
  phaseId: string,
  slot: SceneAudioSlot,
): ScenePlaylistState | null => {
  const summary = getScenePlaylistSummary(phaseId, slot);
  if (!summary) return null;
  const phaseName = getScenePlaylistPhase(phaseId)?.name ?? 'Fase';
  return {
    ...cloneScenePlaylistSummary(summary),
    phaseId,
    phaseName,
    slot,
  };
};

const broadcastScenePlaylist = (phaseId: string, slot: SceneAudioSlot) => {
  const state = getScenePlaylistState(phaseId, slot);
  if (!state) return;
  for (const window of [sceneEditorWindow]) {
    if (window && !window.isDestroyed()) {
      window.webContents.send('scene:playlist-changed', state);
    }
  }
};

const broadcastScenePlan = () => {
  for (const window of [masterWindow, playerWindow, sceneEditorWindow]) {
    if (window && !window.isDestroyed()) {
      window.webContents.send('scene:state-changed', scenePlan);
    }
  }
  hostedSessionServer?.publishScene(toPublicSceneState(scenePlan));
};

const resetScenePlan = () => {
  if (sceneTransitionTimer) clearTimeout(sceneTransitionTimer);
  sceneTransitionTimer = null;
  queuedScenePhaseIndexes.length = 0;
  pendingScenePhaseIndexes.clear();
  sceneTransitioning = false;
  pendingBlackoutPhaseIndex = null;
  resumeMusicAfterManualBlackout = false;
  sceneMediaPaths.clear();
  pendingSceneMediaPaths.clear();
  scenePlaylistPaths.clear();
  pendingScenePlaylists.clear();
  sceneBossArchive.clear();
  battleState.bosses.forEach((boss) => sceneBossArchive.set(boss.id, boss));
  scenePlan = createScenePlan(battleState.bosses);
  broadcastScenePlan();
};

const syncSceneBossSlots = () => {
  let changed = false;
  const nextSlots = [...scenePlan.bossSlots];
  for (const boss of battleState.bosses) {
    sceneBossArchive.set(boss.id, boss);
    const existing = nextSlots.find((slot) => slot.bossId === boss.id);
    if (existing) {
      if (existing.label !== boss.bossName) {
        existing.label = boss.bossName;
        changed = true;
      }
      continue;
    }
    if (nextSlots.length >= 3) continue;
    nextSlots.push({ bossId: boss.id, label: boss.bossName, original: true });
    changed = true;
  }
  if (!changed) return;
  const expandedPhases = scenePlan.phases.map((phase, phaseIndex) => ({
    ...phase,
    bosses: nextSlots.map((slot) =>
      phase.bosses.find((directive) => directive.bossId === slot.bossId) ?? {
        bossId: slot.bossId,
        presence: phaseIndex === 0 ? 'present' as const : 'inherit' as const,
        carryOverflowDamage: true,
        patch: {},
      },
    ),
  }));
  const activePhaseId = scenePlan.phases[scenePlan.activePhaseIndex]?.id ?? null;
  scenePlan = {
    ...scenePlan,
    bossSlots: nextSlots,
    phases: expandedPhases,
    activePhaseIds: Object.fromEntries(
      nextSlots.map((slot) => [slot.bossId, activePhaseId]),
    ),
    revision: scenePlan.revision + 1,
  };
  broadcastScenePlan();
};

const normalizeScenePlaylistSummary = (
  value: unknown,
  phaseId: string,
  slot: SceneAudioSlot,
): ScenePlaylistSummary | null | undefined => {
  if (value === null) return null;
  if (
    !isRecord(value) ||
    !Array.isArray(value.tracks) ||
    value.tracks.length > 200 ||
    typeof value.volume !== 'number' ||
    !Number.isFinite(value.volume) ||
    typeof value.muted !== 'boolean' ||
    typeof value.loop !== 'boolean'
  ) return undefined;
  const tracks = value.tracks.flatMap((track) => {
    if (
      !isRecord(track) ||
      !isSafeSceneIdentifier(track.id) ||
      typeof track.name !== 'string' ||
      typeof track.duration !== 'number' ||
      !Number.isFinite(track.duration) ||
      track.duration < 0
    ) return [];
    const id = track.id.slice(0, 80);
    return [{
      id,
      name: track.name.trim().slice(0, 255) || 'Faixa sem nome',
      duration: Math.min(track.duration, 24 * 60 * 60),
      url: scenePlaylistTrackUrl(phaseId, slot, id),
    }];
  });
  if (
    tracks.length !== value.tracks.length ||
    new Set(tracks.map((track) => track.id)).size !== tracks.length
  ) return undefined;
  const requestedCurrent = typeof value.currentTrackId === 'string'
    ? value.currentTrackId
    : null;
  const currentTrackId = tracks.some((track) => track.id === requestedCurrent)
    ? requestedCurrent
    : tracks[0]?.id ?? null;
  return {
    tracks,
    currentTrackId,
    volume: Math.max(0, Math.min(1, value.volume)),
    muted: value.muted,
    loop: value.loop,
    revision: Number.isInteger(value.revision) && (value.revision as number) >= 0
      ? Math.min(value.revision as number, Number.MAX_SAFE_INTEGER)
      : 0,
  };
};

const normalizeScenePlanDraft = (value: unknown): ScenePlanDraft | null => {
  if (
    !isRecord(value) ||
    !Array.isArray(value.phases) ||
    !Array.isArray(value.bossSlots)
  ) return null;
  const bossSlots = value.bossSlots.flatMap((slot): ScenePlan['bossSlots'] =>
    isRecord(slot) &&
    typeof slot.bossId === 'string' &&
    typeof slot.label === 'string' &&
    typeof slot.original === 'boolean'
      ? [{
          bossId: slot.bossId.slice(0, 80),
          label: slot.label.trim().slice(0, 100) || 'Novo Chefão',
          original: slot.original,
        }]
      : [],
  );
  if (
    bossSlots.length < 1 ||
    bossSlots.length > 3 ||
    bossSlots.length !== value.bossSlots.length ||
    new Set(bossSlots.map((slot) => slot.bossId)).size !== bossSlots.length
  ) return null;
  const knownBossIds = new Set(bossSlots.map((slot) => slot.bossId));
  const normalizeBackground = (rawMedia: unknown) => {
    if (rawMedia === null) return null;
    if (
      !isRecord(rawMedia) ||
      typeof rawMedia.name !== 'string' ||
      rawMedia.configured !== true ||
      !['image', 'video'].includes(String(rawMedia.mediaType))
    ) return undefined;
    return {
      name: rawMedia.name.slice(0, 255),
      configured: true,
      mediaType: rawMedia.mediaType as 'image' | 'video',
    };
  };
  const phases = value.phases.flatMap((rawPhase): ScenePlanDraft['phases'] => {
    if (
      !isRecord(rawPhase) ||
      !isSafeSceneIdentifier(rawPhase.id) ||
      typeof rawPhase.name !== 'string' ||
      typeof rawPhase.triggerBossId !== 'string' ||
      !knownBossIds.has(rawPhase.triggerBossId) ||
      typeof rawPhase.startHealth !== 'number' ||
      typeof rawPhase.endHealth !== 'number' ||
      !['fade', 'fade-blackout', 'blackout'].includes(String(rawPhase.transition)) ||
      !Array.isArray(rawPhase.bosses)
    ) return [];
    const bosses = rawPhase.bosses.flatMap((rawDirective): SceneBossDirective[] => {
      if (
        !isRecord(rawDirective) ||
        typeof rawDirective.bossId !== 'string' ||
        !knownBossIds.has(rawDirective.bossId) ||
        !['inherit', 'present', 'absent'].includes(String(rawDirective.presence)) ||
        !isRecord(rawDirective.patch)
      ) return [];
      return [{
        bossId: rawDirective.bossId,
        presence: rawDirective.presence as SceneBossDirective['presence'],
        carryOverflowDamage: rawDirective.carryOverflowDamage !== false,
        patch: normalizeSceneBossPatch(rawDirective.patch),
      }];
    });
    if (
      bosses.length !== bossSlots.length ||
      new Set(bosses.map((boss) => boss.bossId)).size !== bossSlots.length
    ) return [];
    const phaseId = rawPhase.id.slice(0, 80);
    const background = normalizeBackground(rawPhase.background);
    const transitionSound = normalizeScenePlaylistSummary(
      rawPhase.transitionSound,
      phaseId,
      'transitionSound',
    );
    const music = normalizeScenePlaylistSummary(rawPhase.music, phaseId, 'music');
    if (
      background === undefined ||
      transitionSound === undefined ||
      music === undefined
    ) return [];
    const transition = rawPhase.transition as SceneTransitionKind;
    const requestedDuration = typeof rawPhase.transitionDurationSeconds === 'number' &&
      Number.isFinite(rawPhase.transitionDurationSeconds)
      ? rawPhase.transitionDurationSeconds
      : transition === 'blackout' ? 0 : 2;
    const transitionDurationSeconds = transition === 'blackout'
      ? 0
      : Math.max(0.01, Math.min(10, Math.round(requestedDuration * 100) / 100));
    const requestedDelay = typeof rawPhase.transitionSoundDelaySeconds === 'number' &&
      Number.isFinite(rawPhase.transitionSoundDelaySeconds)
      ? rawPhase.transitionSoundDelaySeconds
      : 0;
    return [{
      id: phaseId,
      name: rawPhase.name.trim().slice(0, 60) || 'Fase',
      triggerBossId: rawPhase.triggerBossId,
      startHealth: Math.round(rawPhase.startHealth),
      endHealth: Math.round(rawPhase.endHealth),
      transition,
      transitionDurationSeconds,
      transitionSoundDelaySeconds: Math.max(
        0,
        Math.min(transitionDurationSeconds, Math.round(requestedDelay * 100) / 100),
      ),
      background,
      transitionSound,
      music,
      bosses,
    }];
  });
  if (phases.length !== value.phases.length) return null;
  if (new Set(phases.map((phase) => phase.id)).size !== phases.length) return null;
  return {
    phases,
    bossSlots,
    showPhaseMarkers: value.showPhaseMarkers === true,
  };
};

const saveScenePlan = (value: unknown): SceneSaveResult => {
  const draft = normalizeScenePlanDraft(value);
  if (!draft) return { ok: false, error: 'Os dados da cena são inválidos.' };
  const rangeError = validateSceneRanges(draft.phases);
  if (rangeError) return { ok: false, error: rangeError };
  const primaryBossId = draft.bossSlots[0]?.bossId;
  if (!primaryBossId || draft.phases.some((phase) => phase.triggerBossId !== primaryBossId)) {
    return { ok: false, error: 'Todas as fases devem seguir a progressão do chefão principal.' };
  }
  const firstPhase = draft.phases[0];
  const firstTriggerDirective = firstPhase.bosses.find(
    (directive) => directive.bossId === primaryBossId,
  );
  const firstTriggerBase = battleState.bosses.find(
    (boss) => boss.id === primaryBossId,
  ) ?? sceneBossArchive.get(primaryBossId) ?? createInitialBoss(primaryBossId);
  const firstTrigger = firstTriggerDirective
    ? applySceneBossPatch(firstTriggerBase, firstTriggerDirective.patch)
    : firstTriggerBase;
  if (firstPhase.startHealth !== firstTrigger.currentHealth) {
    return {
      ok: false,
      error: `A Fase 1 deve começar com a vida atual do chefão (${firstTrigger.currentHealth} PV).`,
    };
  }
  const previousPhases = new Map(scenePlan.phases.map((phase) => [phase.id, phase]));
  const activePhaseId = scenePlan.phases[scenePlan.activePhaseIndex]?.id;
  for (const [index, slot] of draft.bossSlots.entries()) {
    if (!sceneBossArchive.has(slot.bossId)) {
      sceneBossArchive.set(slot.bossId, {
        ...createInitialBoss(slot.bossId, index),
        bossName: slot.label,
        setupStatus: 'ready',
      });
    }
  }
  const committedMediaPaths = new Map(sceneMediaPaths);
  const committedPlaylistPaths = new Map(scenePlaylistPaths);
  scenePlan = {
    ...scenePlan,
    bossSlots: draft.bossSlots.map((slot) => ({
      ...slot,
      label: draft.phases
        .map((phase) => phase.bosses.find(
          (directive) => directive.bossId === slot.bossId,
        )?.patch.bossName)
        .find((name): name is string => Boolean(name)) ?? slot.label,
    })),
    phases: draft.phases.map((phase) => {
      const previous = previousPhases.get(phase.id);
      const backgroundFor = () => {
        const key = sceneMediaKey(phase.id, 'background');
        if (pendingSceneMediaPaths.has(key)) {
          const pendingPath = pendingSceneMediaPaths.get(key);
          if (!pendingPath || !phase.background) {
            committedMediaPaths.delete(key);
            return null;
          }
          committedMediaPaths.set(key, pendingPath);
          return phase.background;
        }
        return previous?.background ?? null;
      };
      const playlistFor = (slot: SceneAudioSlot) => {
        const key = sceneMediaKey(phase.id, slot);
        const pending = pendingScenePlaylists.get(key);
        if (!pending) return previous?.[slot] ?? null;
        const summary = phase[slot];
        const nextPaths = summary?.tracks.map((track) => ({
          track,
          filePath: pending.paths.get(track.id) ??
            scenePlaylistPaths.get(scenePlaylistTrackKey(phase.id, slot, track.id)),
        })) ?? [];
        if (nextPaths.some(({ filePath }) => !filePath)) {
          return previous?.[slot] ?? null;
        }
        for (const existingKey of committedPlaylistPaths.keys()) {
          if (existingKey.startsWith(`${key}:`)) {
            committedPlaylistPaths.delete(existingKey);
          }
        }
        if (!summary || summary.tracks.length === 0) return null;
        for (const { track, filePath } of nextPaths) {
          committedPlaylistPaths.set(
            scenePlaylistTrackKey(phase.id, slot, track.id),
            filePath as string,
          );
        }
        return cloneScenePlaylistSummary(summary);
      };
      return {
        ...phase,
        background: backgroundFor(),
        transitionSound: playlistFor('transitionSound'),
        music: playlistFor('music'),
      };
    }),
    showPhaseMarkers: draft.showPhaseMarkers,
    activePhaseIndex: activePhaseId
      ? Math.max(-1, draft.phases.findIndex((phase) => phase.id === activePhaseId))
      : -1,
    activePhaseIds: Object.fromEntries(draft.bossSlots.map((slot) => {
      return [
        slot.bossId,
        activePhaseId && draft.phases.some((phase) => phase.id === activePhaseId)
          ? activePhaseId
          : null,
      ];
    })),
    revision: scenePlan.revision + 1,
  };
  const retainedIds = new Set(scenePlan.phases.map((phase) => phase.id));
  for (const key of committedMediaPaths.keys()) {
    if (!retainedIds.has(key.split(':')[0])) committedMediaPaths.delete(key);
  }
  for (const key of committedPlaylistPaths.keys()) {
    if (!retainedIds.has(key.split(':')[0])) committedPlaylistPaths.delete(key);
  }
  sceneMediaPaths.clear();
  committedMediaPaths.forEach((filePath, key) => sceneMediaPaths.set(key, filePath));
  scenePlaylistPaths.clear();
  committedPlaylistPaths.forEach((filePath, key) => scenePlaylistPaths.set(key, filePath));
  pendingSceneMediaPaths.clear();
  pendingScenePlaylists.clear();
  applySavedSceneMediaImmediately();
  broadcastScenePlan();
  return { ok: true, state: scenePlan };
};

const activatePhaseMusic = (phase: ScenePhase, playImmediately = true) => {
  const playlist = phase.music;
  if (!playlist || playlist.tracks.length === 0) return;
  const nextTracks = playlist.tracks.flatMap((track): InternalMusicTrack[] => {
    const filePath = scenePlaylistPaths.get(
      scenePlaylistTrackKey(phase.id, 'music', track.id),
    );
    if (!filePath) return [];
    musicTrackSequence += 1;
    return [{
      id: String(musicTrackSequence),
      name: track.name,
      filePath,
      duration: track.duration,
    }];
  });
  if (nextTracks.length === 0) return;
  musicTracks.splice(0, musicTracks.length, ...nextTracks);
  const selectedIndex = Math.max(
    0,
    playlist.tracks.findIndex((track) => track.id === playlist.currentTrackId),
  );
  const track = nextTracks[Math.min(selectedIndex, nextTracks.length - 1)];
  musicState = {
    ...musicState,
    currentTrackId: track.id,
    isPlaying: playImmediately && battleState.battleStarted,
    loop: playlist.loop,
    volume: playlist.volume,
    muted: playlist.muted,
    playbackVersion: musicState.playbackVersion + 1,
    revision: musicState.revision + 1,
  };
  resetMusicPlayback(track.id);
  broadcastMusicState();
};

const resolveSceneMediaPhase = (
  phaseIndex: number,
  slot: SceneMediaSlot,
) => {
  for (let index = phaseIndex; index >= 0; index -= 1) {
    const phase = scenePlan.phases[index];
    const available = slot === 'background'
      ? Boolean(
          phase?.background &&
          sceneMediaPaths.has(sceneMediaKey(phase.id, 'background')),
        )
      : Boolean(
          phase?.[slot]?.tracks.some((track) =>
            scenePlaylistPaths.has(scenePlaylistTrackKey(phase.id, slot, track.id))),
        );
    if (available) {
      return phase;
    }
  }
  return null;
};

const activateSceneMediaForPhase = (
  phaseIndex: number,
  playMusicImmediately: boolean,
) => {
  const backgroundPhase = resolveSceneMediaPhase(phaseIndex, 'background');
  const backgroundPath = backgroundPhase
    ? sceneMediaPaths.get(sceneMediaKey(backgroundPhase.id, 'background')) ?? null
    : configuredBackgroundFilePath;
  const backgroundName = backgroundPhase?.background?.name ??
    (backgroundPath ? configuredBackgroundName ?? path.basename(backgroundPath) : null);
  activeBackgroundFilePath = backgroundPath;
  battleState = {
    ...battleState,
    backgroundName,
    revision: battleState.revision + 1,
  };
  backgroundRevision += 1;
  broadcastBackground();
  broadcastBattleState();

  const musicPhase = resolveSceneMediaPhase(phaseIndex, 'music');
  if (musicPhase) activatePhaseMusic(musicPhase, playMusicImmediately);
};

function applySavedSceneMediaImmediately() {
  const phaseIndex = scenePlan.activePhaseIndex >= 0
    ? scenePlan.activePhaseIndex
    : 0;
  if (!scenePlan.phases[phaseIndex]) return;
  activateSceneMediaForPhase(phaseIndex, battleState.battleStarted);
}

const applyScenePhase = (phaseIndex: number) => {
  const phase = scenePlan.phases[phaseIndex];
  if (!phase) return;
  battleState.bosses.forEach((boss) => sceneBossArchive.set(boss.id, boss));
  const currentById = new Map(battleState.bosses.map((boss) => [boss.id, boss]));
  for (const directive of phase.bosses) {
    if (directive.presence === 'absent') {
      currentById.delete(directive.bossId);
      continue;
    }
    let boss = currentById.get(directive.bossId);
    const entering = !boss && directive.presence === 'present';
    if (!boss && entering) {
      boss = sceneBossArchive.get(directive.bossId) ?? {
        ...createInitialBoss(directive.bossId, currentById.size),
        setupStatus: 'ready',
      };
    }
    if (!boss) {
      const archived = sceneBossArchive.get(directive.bossId);
      if (archived) {
        sceneBossArchive.set(
          directive.bossId,
          applySceneBossPatch(archived, directive.patch),
        );
      }
      continue;
    }
    const patched = applySceneBossPatch(boss, directive.patch);
    const currentHealth = phaseIndex === 0 || entering
      ? patched.currentHealth
      : directive.patch.currentHealth === undefined
        ? patched.currentHealth
        : Math.min(boss.currentHealth, patched.currentHealth);
    currentById.set(directive.bossId, {
      ...patched,
      setupStatus: 'ready',
      identityPrepared: true,
      currentHealth,
    });
  }
  let bosses = scenePlan.bossSlots.flatMap((slot) => {
    const boss = currentById.get(slot.bossId);
    return boss ? [boss] : [];
  }).slice(0, 3);
  if (bosses.length === 0) {
    const fallback = battleState.bosses[0] ?? sceneBossArchive.values().next().value;
    if (fallback) bosses = [{ ...fallback, currentHealth: 0 }];
  }
  bosses.forEach((boss) => sceneBossArchive.set(boss.id, boss));
  battleState = {
    ...battleState,
    bosses,
    activeBossId: bosses.some((boss) => boss.id === battleState.activeBossId)
      ? battleState.activeBossId
      : bosses[0].id,
    revision: battleState.revision + 1,
  };
  activateSceneMediaForPhase(phaseIndex, phaseIndex > 0);
  scenePlan = {
    ...scenePlan,
    activePhaseIndex: phaseIndex,
    activePhaseIds: Object.fromEntries(
      scenePlan.bossSlots.map((slot) => [slot.bossId, phase.id]),
    ),
    bossSlots: scenePlan.bossSlots.map((slot) => {
      const boss = bosses.find((item) => item.id === slot.bossId);
      const patchName = phase.bosses.find((item) => item.bossId === slot.bossId)?.patch.bossName;
      return { ...slot, label: boss?.bossName ?? patchName ?? slot.label };
    }),
    revision: scenePlan.revision + 1,
  };
  broadcastBattleState();
  broadcastScenePlan();
};

const processScenePhaseQueue = () => {
  if (sceneTransitioning) return;
  const phaseIndex = queuedScenePhaseIndexes.shift();
  if (phaseIndex === undefined) return;
  const phase = scenePlan.phases[phaseIndex];
  if (!phase) {
    pendingScenePhaseIndexes.delete(phaseIndex);
    processScenePhaseQueue();
    return;
  }
  sceneTransitioning = true;
  const transitionPhase = scenePlan.phases[phaseIndex - 1] ?? phase;
  const durationMs = transitionPhase.transition === 'blackout'
    ? 0
    : Math.round(transitionPhase.transitionDurationSeconds * 1000);
  sceneTransitionSequence += 1;
  const transitionPlaylist = transitionPhase.transitionSound;
  const selectedTrack = transitionPlaylist?.tracks.find(
    (track) => track.id === transitionPlaylist.currentTrackId,
  ) ?? transitionPlaylist?.tracks[0] ?? null;
  const selectedTrackKey = selectedTrack
    ? scenePlaylistTrackKey(transitionPhase.id, 'transitionSound', selectedTrack.id)
    : null;
  const event: SceneTransitionEvent = {
    id: sceneTransitionSequence,
    phaseId: phase.id,
    kind: transitionPhase.transition,
    stage: 'enter',
    durationMs,
    soundDelayMs: Math.min(
      durationMs,
      Math.max(0, Math.round(transitionPhase.transitionSoundDelaySeconds * 1000)),
    ),
    soundUrl: selectedTrackKey && scenePlaylistPaths.has(selectedTrackKey)
      ? scenePlaylistTrackUrl(
          transitionPhase.id,
          'transitionSound',
          selectedTrack?.id ?? '',
        )
      : null,
    soundVolume: transitionPlaylist?.volume ?? 0.8,
    soundMuted: transitionPlaylist?.muted ?? false,
    soundLoop: transitionPlaylist?.loop ?? false,
    visual: true,
  };
  sendSceneTransition(event);
  if (musicState.isPlaying) {
    if (durationMs > 0 && (
      (playerWindow && !playerWindow.isDestroyed()) || hostedSessionServer
    )) {
      sendMusicFadeOut(Math.max(100, Math.floor(durationMs / 2)));
    } else {
      musicState = {
        ...musicState,
        isPlaying: false,
        revision: musicState.revision + 1,
      };
      broadcastMusicState();
    }
  }

  if (transitionPhase.transition === 'fade') {
    sceneTransitionTimer = setTimeout(() => {
      sceneTransitionTimer = null;
      applyScenePhase(phaseIndex);
      sceneTransitionTimer = setTimeout(() => {
        sceneTransitionTimer = null;
        pendingScenePhaseIndexes.delete(phaseIndex);
        sceneTransitioning = false;
        processScenePhaseQueue();
      }, Math.max(0, durationMs - Math.floor(durationMs / 2)));
    }, Math.floor(durationMs / 2));
    return;
  }

  const enterBlackout = () => {
    sceneTransitionTimer = null;
    pendingBlackoutPhaseIndex = phaseIndex;
    resumeMusicAfterManualBlackout = false;
    if (musicState.isPlaying) {
      musicState = {
        ...musicState,
        isPlaying: false,
        revision: musicState.revision + 1,
      };
      broadcastMusicState();
    }
    scenePlan = {
      ...scenePlan,
      blackoutActive: true,
      revision: scenePlan.revision + 1,
    };
    broadcastScenePlan();
  };
  if (durationMs > 0) {
    sceneTransitionTimer = setTimeout(enterBlackout, durationMs);
  } else {
    enterBlackout();
  }
};

const releaseSceneBlackout = (resumeManualMusic = true) => {
  const phaseIndex = pendingBlackoutPhaseIndex;
  if (!scenePlan.blackoutActive) return false;
  const shouldResumeMusic =
    phaseIndex === null &&
    resumeManualMusic &&
    resumeMusicAfterManualBlackout &&
    battleState.battleStarted &&
    Boolean(musicState.currentTrackId);
  const targetPhase = phaseIndex === null ? null : scenePlan.phases[phaseIndex];
  const sourcePhase = phaseIndex !== null && phaseIndex > 0
    ? scenePlan.phases[phaseIndex - 1]
    : null;
  const durationMs = sourcePhase?.transition === 'fade-blackout'
    ? Math.round(sourcePhase.transitionDurationSeconds * 1000)
    : 0;
  pendingBlackoutPhaseIndex = null;
  resumeMusicAfterManualBlackout = false;
  scenePlan = {
    ...scenePlan,
    blackoutActive: false,
    revision: scenePlan.revision + 1,
  };
  if (phaseIndex !== null) applyScenePhase(phaseIndex);
  if (shouldResumeMusic) {
    musicState = {
      ...musicState,
      isPlaying: true,
      revision: musicState.revision + 1,
    };
    broadcastMusicState();
  }
  sceneTransitionSequence += 1;
  const event: SceneTransitionEvent = {
    id: sceneTransitionSequence,
    phaseId: targetPhase?.id ?? 'manual-blackout',
    kind: sourcePhase?.transition ?? 'blackout',
    stage: 'release',
    durationMs,
    soundDelayMs: 0,
    soundUrl: null,
    soundVolume: 0,
    soundMuted: true,
    soundLoop: false,
    visual: true,
  };
  sendSceneTransition(event);
  const finish = () => {
    sceneTransitionTimer = null;
    if (phaseIndex !== null) {
      pendingScenePhaseIndexes.delete(phaseIndex);
      sceneTransitioning = false;
    }
    broadcastScenePlan();
    if (phaseIndex !== null) processScenePhaseQueue();
  };
  if (durationMs > 0) sceneTransitionTimer = setTimeout(finish, durationMs);
  else finish();
  return true;
};

const activateSceneBlackout = () => {
  if (scenePlan.blackoutActive) return false;
  pendingBlackoutPhaseIndex = null;
  resumeMusicAfterManualBlackout = musicState.isPlaying;
  sceneTransitionSequence += 1;
  const event: SceneTransitionEvent = {
    id: sceneTransitionSequence,
    phaseId: 'manual-blackout',
    kind: 'blackout',
    stage: 'enter',
    durationMs: 0,
    soundDelayMs: 0,
    soundUrl: null,
    soundVolume: 0,
    soundMuted: true,
    soundLoop: false,
    visual: true,
  };
  sendSceneTransition(event);
  if (musicState.isPlaying) {
    musicState = {
      ...musicState,
      isPlaying: false,
      revision: musicState.revision + 1,
    };
    broadcastMusicState();
  }
  scenePlan = {
    ...scenePlan,
    blackoutActive: true,
    revision: scenePlan.revision + 1,
  };
  broadcastScenePlan();
  return true;
};

const queueScenePhase = (phaseIndex: number) => {
  if (
    phaseIndex <= scenePlan.activePhaseIndex ||
    pendingScenePhaseIndexes.has(phaseIndex) ||
    !scenePlan.phases[phaseIndex]
  ) return;
  pendingScenePhaseIndexes.add(phaseIndex);
  queuedScenePhaseIndexes.push(phaseIndex);
  queuedScenePhaseIndexes.sort((left, right) => left - right);
  processScenePhaseQueue();
};

const queueCrossedScenePhases = (
  bossId: string,
  previousHealth: number,
  nextHealth: number,
) => {
  if (nextHealth >= previousHealth) return;
  scenePlan.phases.forEach((phase, index) => {
    if (
      index > scenePlan.activePhaseIndex &&
      phase.triggerBossId === bossId &&
      previousHealth > phase.startHealth &&
      nextHealth <= phase.startHealth
    ) queueScenePhase(index);
  });
};

const isMasterSender = (senderId: number) =>
  Boolean(masterWindow && senderId === masterWindow.webContents.id);

const isControlSender = (senderId: number) =>
  Boolean(controlWindow && senderId === controlWindow.webContents.id);

const isPlayerSender = (senderId: number) =>
  Boolean(playerWindow && senderId === playerWindow.webContents.id);

const isLauncherSender = (senderId: number) =>
  Boolean(launcherWindow && senderId === launcherWindow.webContents.id);

const isEncounterControllerSender = (senderId: number) =>
  isMasterSender(senderId) || isControlSender(senderId);

const isLibrarySender = (senderId: number) =>
  Boolean(libraryWindow && senderId === libraryWindow.webContents.id);

const isSceneEditorSender = (senderId: number) =>
  Boolean(sceneEditorWindow && senderId === sceneEditorWindow.webContents.id);

const isSoundboardSender = (senderId: number) =>
  Boolean(soundboardWindow && senderId === soundboardWindow.webContents.id);

const assertAuthorizedIpcSender = (authorized: boolean) => {
  if (!authorized) throw new Error('Ação não autorizada.');
};

const isBattleStateReader = (senderId: number) =>
  isEncounterControllerSender(senderId) ||
  isPlayerSender(senderId) ||
  isSoundboardSender(senderId) ||
  isSceneEditorSender(senderId);

const isMusicStateReader = (senderId: number) =>
  isMasterSender(senderId) ||
  isControlSender(senderId) ||
  isPlayerSender(senderId);

ipcMain.handle('battle:get-state', (event) => {
  assertAuthorizedIpcSender(isBattleStateReader(event.sender.id));
  return battleState;
});
ipcMain.handle('multiplayer:get-player-huds', (event) => {
  assertAuthorizedIpcSender(
    isMasterSender(event.sender.id) ||
      isPlayerSender(event.sender.id) ||
      isControlSender(event.sender.id),
  );
  return playerHudState;
});
ipcMain.handle('multiplayer:get-turn-state', (event) => {
  assertAuthorizedIpcSender(
    isPlayerSender(event.sender.id) ||
      isControlSender(event.sender.id) ||
      isMasterSender(event.sender.id),
  );
  return encounterTurnState;
});
ipcMain.handle(
  'multiplayer:advance-turn',
  (
    event,
    expectedParticipantId: unknown,
  ): EncounterTurnActionResult => {
    if (!isControlSender(event.sender.id)) {
      return { ok: false, error: 'Ação não autorizada.' };
    }
    const expected = typeof expectedParticipantId === 'string'
      ? expectedParticipantId
      : null;
    if (hostedSessionServer) {
      return hostedSessionServer.advanceTurnAsHost(expected);
    }
    if (!battleState.battleStarted) {
      return { ok: false, error: 'Inicie a batalha primeiro.' };
    }
    if (
      expected &&
      encounterTurnState.activeParticipantId &&
      expected !== encounterTurnState.activeParticipantId
    ) {
      return { ok: false, error: 'O turno ativo mudou. Tente novamente.' };
    }
    if (
      !encounterTurnState.started &&
      encounterTurnState.initiativeReady === false
    ) {
      return {
        ok: false,
        error: 'Aguarde todos os testes de Iniciativa terminarem.',
      };
    }
    const previousActive = encounterTurnState.activeParticipantId;
    const nextTurnState = encounterTurnState.started
      ? advanceEncounterTurns(encounterTurnState)
      : beginEncounterTurns(encounterTurnState);
    if (nextTurnState === encounterTurnState) {
      return { ok: false, error: 'Nenhum participante pode iniciar o turno.' };
    }
    localEncounterRollSequence = 0;
    encounterTurnState = nextTurnState;
    broadcastEncounterTurnState();
    const active = encounterTurnState.participants.find(
      ({ id }) => id === encounterTurnState.activeParticipantId,
    );
    if (
      active &&
      active.id !== previousActive &&
      active.kind === 'boss'
    ) {
      beginBossStatusTurn(active.sourceId);
    }
    return { ok: true, state: encounterTurnState };
  },
);
ipcMain.handle(
  'multiplayer:roll-initiative',
  (
    event,
    participantId: unknown,
  ): EncounterTurnActionResult => {
    if (typeof participantId !== 'string' || participantId.length > 160) {
      return { ok: false, error: 'Participante inválido.' };
    }
    if (isControlSender(event.sender.id)) {
      return hostedSessionServer
        ? hostedSessionServer.rollInitiativeAsHost(participantId)
        : rollLocalEncounterInitiative(
          participantId,
          new Set(['boss', 'npc']),
        );
    }
    if (isPlayerSender(event.sender.id)) {
      return hostedSessionServer
        ? hostedSessionServer.rollInitiativeAsHost(participantId)
        : rollLocalEncounterInitiative(participantId, new Set(['npc']));
    }
    return { ok: false, error: 'Ação não autorizada.' };
  },
);
ipcMain.handle(
  'multiplayer:roll-formula',
  (
    event,
    requested: unknown,
  ): EncounterFormulaRollResult => {
    if (!isControlSender(event.sender.id)) {
      return { ok: false, error: 'Ação não autorizada.' };
    }
    const request = normalizeEncounterFormulaRequest(requested);
    if (!request) return { ok: false, error: 'Informe uma fórmula de dados válida.' };
    const participant = encounterTurnState.participants.find(
      ({ id, kind }) =>
        id === request.participantId && (kind === 'boss' || kind === 'npc'),
    );
    if (!participant) {
      return { ok: false, error: 'O participante não está no encontro.' };
    }
    const parsed = parseDamageFormula(request.formula);
    if (!parsed) return { ok: false, error: 'A fórmula de dados é inválida.' };
    const rolled = rollDamageFormulaDetailed(
      parsed,
      (minimum, maximumExclusive) => randomInt(minimum, maximumExclusive),
    );
    const result: EncounterRollResult = {
      id: `formula:${participant.id}:${randomUUID()}`,
      participantId: participant.id,
      label: request.label,
      expression: request.formula,
      rolls: rolled.rolls,
      modifier: rolled.modifier,
      total: rolled.total,
      outcome: 'neutral',
      category: request.category,
      createdAt: Date.now(),
      retainedByParticipantId: encounterTurnState.activeParticipantId,
      ...(request.correlationId === undefined
        ? {}
        : { correlationId: request.correlationId }),
    };
    if (hostedSessionServer) {
      hostedSessionServer.publishRollResult(result);
    } else {
      const previousResults = linkEncounterRollCorrelation(
        encounterTurnState.rollResults ?? [],
        request.correlationId,
      );
      const orderedResult = {
        ...result,
        sequence: ++localEncounterRollSequence,
      };
      encounterTurnState = {
        ...encounterTurnState,
        rollResults: [
          ...previousResults,
          orderedResult,
        ],
        revision: encounterTurnState.revision + 1,
      };
      broadcastEncounterTurnState();
    }
    publishDiceRollSound();
    return { ok: true, total: rolled.total };
  },
);
ipcMain.handle('app:get-version', (event) => {
  assertAuthorizedIpcSender(isMasterSender(event.sender.id));
  return app.getVersion();
});
ipcMain.handle('app:undo', (event) => {
  assertAuthorizedIpcSender(
    isEncounterControllerSender(event.sender.id) ||
      isPlayerSender(event.sender.id) ||
      isSoundboardSender(event.sender.id) ||
      isLibrarySender(event.sender.id) ||
      isSceneEditorSender(event.sender.id),
  );
  return restoreLastAppChange();
});

ipcMain.handle('presentation:is-open', (event) => {
  assertAuthorizedIpcSender(isMasterSender(event.sender.id));
  return isPresentationOpen();
});

ipcMain.handle('control:set-minimized', (event, minimized: unknown) => {
  if (
    !isControlSender(event.sender.id) ||
    typeof minimized !== 'boolean' ||
    !controlWindow ||
    controlWindow.isDestroyed() ||
    !playerWindow ||
    playerWindow.isDestroyed()
  ) return false;

  const controlBounds = controlWindow.getBounds();
  if (!controlPanelMinimized) {
    controlPanelExpandedHeight = Math.max(
      CONTROL_PANEL_MIN_EXPANDED_HEIGHT,
      controlBounds.height,
    );
  }
  controlPanelMinimized = minimized;
  const targetControlHeight = minimized
    ? CONTROL_PANEL_MINIMIZED_HEIGHT
    : controlPanelExpandedHeight;
  constrainPlayerForControl(playerWindow, targetControlHeight);
  controlWindow.setBounds(getDockedControlBoundsForWindow(
    playerWindow,
    controlPanelMinimized
      ? CONTROL_PANEL_MINIMIZED_HEIGHT
      : controlPanelExpandedHeight,
  ));
  return true;
});

ipcMain.on('app:confirm-close', (event) => {
  if (!isMasterSender(event.sender.id) || !masterWindow) return;
  const window = masterWindow;
  void stopHostedSession('host-ended-session').finally(() => {
    if (!window.isDestroyed()) {
      allowAppClose = true;
      window.close();
    }
  });
});

ipcMain.handle('app:return-to-launcher', async (event) => {
  if (!isMasterSender(event.sender.id) || !masterWindow) return false;
  const encounterWindow = masterWindow;
  returningToLauncher = true;
  try {
    await stopHostedSession('host-ended-session');
    createLauncherWindow();
    if (!encounterWindow.isDestroyed()) encounterWindow.close();
    return true;
  } catch {
    returningToLauncher = false;
    return false;
  }
});

ipcMain.handle(
  'background:get',
  (event): BackgroundState => {
    assertAuthorizedIpcSender(isPlayerSender(event.sender.id));
    return getBackgroundState();
  },
);

ipcMain.handle(
  'background:choose',
  async (event): Promise<BackgroundSelectionResult> => {
    if (!masterWindow || !isMasterSender(event.sender.id)) {
      return { ok: false, error: 'Ação não autorizada.' };
    }

    const selection = await dialog.showOpenDialog(masterWindow, {
      title: 'Escolher imagem, GIF ou vídeo de fundo',
      defaultPath: defaultMediaDirectory('Imagens', 'pictures'),
      properties: ['openFile'],
      filters: [
        {
          name: 'Imagens, GIFs e vídeos',
          extensions: [...supportedBackgroundExtensions].map(
            (extension) => extension.slice(1),
          ),
        },
      ],
    });

    if (selection.canceled || selection.filePaths.length === 0) {
      return { ok: false, canceled: true };
    }

    const filePath = selection.filePaths[0];
    const extension = path.extname(filePath).toLowerCase();

    if (!supportedBackgroundExtensions.has(extension)) {
      return { ok: false, error: 'Formato de fundo não suportado.' };
    }

    try {
      const fileInfo = await stat(filePath);
      if (!fileInfo.isFile()) {
        return { ok: false, error: 'O item selecionado não é um arquivo.' };
      }
      if (fileInfo.size > MAX_USER_MEDIA_BYTES) {
        return { ok: false, error: 'O arquivo deve ter no máximo 100 MB.' };
      }
    } catch {
      return { ok: false, error: 'Não foi possível ler o arquivo selecionado.' };
    }

    const name = path.basename(filePath);
    pendingBackgroundChange = { type: 'set', filePath, name };

    return { ok: true, name };
  },
);

ipcMain.handle('background:clear', (event) => {
  if (!isMasterSender(event.sender.id)) {
    return false;
  }

  pendingBackgroundChange = { type: 'clear' };
  return true;
});

ipcMain.handle('presentation:open', (event) => {
  if (!isMasterSender(event.sender.id)) {
    return false;
  }

  if (isPresentationOpen()) return false;
  createPlayerWindow();
  positionMasterBesidePlayer();
  return true;
});

ipcMain.handle('scene:open-window', (event) => {
  if (!isMasterSender(event.sender.id)) return false;
  createSceneEditorWindow();
  return true;
});

ipcMain.handle('scene:open-active-playlist', (event) => {
  if (!isControlSender(event.sender.id)) return false;
  const activeIndex = scenePlan.activePhaseIndex >= 0
    ? scenePlan.activePhaseIndex
    : 0;
  const musicPhase = resolveSceneMediaPhase(activeIndex, 'music');
  if (!musicPhase?.music?.tracks.length) return false;
  pendingActivePlaylistPhaseId = musicPhase.id;
  const editor = createSceneEditorWindow();
  if (!editor.webContents.isLoadingMainFrame()) {
    editor.webContents.send(
      'scene:open-active-playlist-requested',
      musicPhase.id,
    );
    pendingActivePlaylistPhaseId = null;
  }
  return true;
});

ipcMain.handle('scene:release-blackout', (event) =>
  isMasterSender(event.sender.id)
    ? (() => {
        if (!scenePlan.blackoutActive) return false;
        rememberAppChange();
        return releaseSceneBlackout();
      })()
    : false,
);

ipcMain.handle('scene:activate-blackout', (event) =>
  isMasterSender(event.sender.id)
    ? (() => {
        if (scenePlan.blackoutActive) return false;
        rememberAppChange();
        return activateSceneBlackout();
      })()
    : false,
);

ipcMain.handle(
  'scene:open-playlist',
  (
    event,
    phaseId: unknown,
    slot: unknown,
    phaseName: unknown,
    initial: unknown,
  ) => {
    if (
      !isSceneEditorSender(event.sender.id) ||
      !isSafeSceneIdentifier(phaseId) ||
      !['transitionSound', 'music'].includes(String(slot)) ||
      typeof phaseName !== 'string'
    ) return null;
    const audioSlot = slot as SceneAudioSlot;
    const normalizedInitial = normalizeScenePlaylistSummary(
      initial,
      phaseId,
      audioSlot,
    );
    if (normalizedInitial === undefined) return null;
    const key = sceneMediaKey(phaseId, audioSlot);
    if (!pendingScenePlaylists.has(key)) {
      const pending = ensurePendingScenePlaylist(phaseId, audioSlot);
      if (!getScenePlaylistPhase(phaseId) && normalizedInitial) {
        pending.summary = cloneScenePlaylistSummary(normalizedInitial);
      }
    }
    const state = getScenePlaylistState(phaseId, audioSlot);
    return state ? {
      ...state,
      phaseName: phaseName.trim().slice(0, 60) || 'Fase',
    } : null;
  },
);

ipcMain.on('scene:confirm-close', (event) => {
  if (!isSceneEditorSender(event.sender.id) || !sceneEditorWindow) return;
  pendingSceneMediaPaths.clear();
  pendingScenePlaylists.clear();
  allowSceneEditorClose = true;
  sceneEditorWindow.close();
});

ipcMain.handle('scene:get-state', (event) => {
  assertAuthorizedIpcSender(
    isSceneEditorSender(event.sender.id) ||
      isPlayerSender(event.sender.id) ||
      isMasterSender(event.sender.id),
  );
  return scenePlan;
});

ipcMain.handle('scene:reset-draft', (event): ScenePlanDraft | null => {
  if (!isSceneEditorSender(event.sender.id)) return null;
  const defaults = createScenePlan(battleState.bosses);
  pendingSceneMediaPaths.clear();
  pendingScenePlaylists.clear();
  for (const phase of defaults.phases) {
    pendingSceneMediaPaths.set(sceneMediaKey(phase.id, 'background'), null);
    for (const slot of ['transitionSound', 'music'] as const) {
      pendingScenePlaylists.set(sceneMediaKey(phase.id, slot), {
        summary: {
          tracks: [],
          currentTrackId: null,
          volume: 0.8,
          muted: false,
          loop: false,
          revision: 1,
        },
        paths: new Map(),
      });
    }
  }
  return {
    phases: defaults.phases,
    bossSlots: defaults.bossSlots,
    showPhaseMarkers: defaults.showPhaseMarkers,
  };
});

ipcMain.handle('scene:save', (event, value: unknown): SceneSaveResult => {
  if (!isSceneEditorSender(event.sender.id)) {
    return { ok: false, error: 'Ação não autorizada.' };
  }
  const snapshot = captureAppUndoSnapshot();
  const result = saveScenePlan(value);
  if (result.ok) rememberAppChange(snapshot);
  return result;
});

ipcMain.handle(
  'scene:choose-media',
  async (
    event,
    phaseId: unknown,
    slot: unknown,
  ): Promise<SceneMediaSelectionResult> => {
    if (
      !isSceneEditorSender(event.sender.id) ||
      typeof phaseId !== 'string' ||
      !['background', 'transitionSound', 'music'].includes(String(slot)) ||
      !sceneEditorWindow ||
      sceneEditorWindow.isDestroyed()
    ) return { ok: false, error: 'Ação não autorizada.' };
    if (!isSafeSceneIdentifier(phaseId)) {
      return { ok: false, error: 'Fase não encontrada.' };
    }
    const mediaSlot = slot as SceneMediaSlot;
    const background = mediaSlot === 'background';
    const selection = await dialog.showOpenDialog(sceneEditorWindow, {
      title: background
        ? 'Escolher imagem, GIF ou vídeo da fase'
        : mediaSlot === 'music'
          ? 'Escolher música da fase'
          : 'Escolher som da transição',
      defaultPath: background
        ? defaultMediaDirectory('Imagens', 'pictures')
        : defaultMediaDirectory(mediaSlot === 'music' ? 'Musica' : 'SFX', 'music'),
      properties: ['openFile'],
      filters: background
        ? [{
            name: 'Imagens, GIFs e vídeos',
            extensions: [...supportedBackgroundExtensions].map((extension) => extension.slice(1)),
          }]
        : [{ name: 'Áudio MP3', extensions: ['mp3'] }],
    });
    if (selection.canceled || selection.filePaths.length === 0) {
      return { ok: false, canceled: true };
    }
    const filePath = selection.filePaths[0];
    const extension = path.extname(filePath).toLowerCase();
    if (
      (background && !supportedBackgroundExtensions.has(extension)) ||
      (!background && extension !== '.mp3')
    ) return { ok: false, error: 'Formato de arquivo não suportado.' };
    let audioDuration = 0;
    try {
      const info = await stat(filePath);
      if (!info.isFile() || info.size > MAX_USER_MEDIA_BYTES) {
        return { ok: false, error: 'O arquivo deve ter no máximo 100 MB.' };
      }
      if (!background) {
        const metadata = await parseFile(filePath, { duration: true });
        audioDuration = metadata.format.duration ?? 0;
      }
    } catch {
      return { ok: false, error: 'Não foi possível ler o arquivo selecionado.' };
    }
    const name = path.basename(filePath);
    if (!background) {
      const audioSlot = mediaSlot as SceneAudioSlot;
      const id = randomUUID();
      const playlist: ScenePlaylistSummary = {
        tracks: [{
          id,
          name: path.basename(filePath),
          duration: audioDuration,
          url: scenePlaylistTrackUrl(phaseId, audioSlot, id),
        }],
        currentTrackId: id,
        volume: 0.8,
        muted: false,
        loop: false,
        revision: 1,
      };
      pendingScenePlaylists.set(sceneMediaKey(phaseId, audioSlot), {
        summary: playlist,
        paths: new Map([[id, filePath]]),
      });
      broadcastScenePlaylist(phaseId, audioSlot);
      return { ok: true, playlist };
    }
    pendingSceneMediaPaths.set(sceneMediaKey(phaseId, mediaSlot), filePath);
    const media = {
      name,
      configured: true,
      mediaType: backgroundMediaTypeForFile(filePath) ?? 'image',
    };
    return { ok: true, media };
  },
);

ipcMain.handle(
  'scene:clear-media',
  (event, phaseId: unknown, slot: unknown): SceneSaveResult => {
    if (
      !isSceneEditorSender(event.sender.id) ||
      typeof phaseId !== 'string' ||
      !['background', 'transitionSound', 'music'].includes(String(slot))
    ) return { ok: false, error: 'Ação não autorizada.' };
    if (!isSafeSceneIdentifier(phaseId)) {
      return { ok: false, error: 'Fase não encontrada.' };
    }
    const mediaSlot = slot as SceneMediaSlot;
    const key = sceneMediaKey(phaseId, mediaSlot);
    if (mediaSlot !== 'background') {
      const audioSlot = mediaSlot as SceneAudioSlot;
      pendingScenePlaylists.set(key, {
        summary: {
          tracks: [],
          currentTrackId: null,
          volume: 0.8,
          muted: false,
          loop: false,
          revision: (getScenePlaylistSummary(phaseId, audioSlot)?.revision ?? 0) + 1,
        },
        paths: new Map(),
      });
      broadcastScenePlaylist(phaseId, audioSlot);
      return { ok: true };
    }
    pendingSceneMediaPaths.set(key, null);
    return { ok: true };
  },
);

ipcMain.handle('soundboard:open-window', (event) => {
  if (!isControlSender(event.sender.id) && !isMasterSender(event.sender.id)) return false;
  createSoundboardWindow();
  return true;
});

ipcMain.handle(
  'scene-playlist:add-tracks',
  async (
    event,
    phaseIdValue: unknown,
    slotValue: unknown,
  ): Promise<ScenePlaylistSelectionResult> => {
    if (
      !isSceneEditorSender(event.sender.id) ||
      !sceneEditorWindow ||
      sceneEditorWindow.isDestroyed() ||
      !isSafeSceneIdentifier(phaseIdValue) ||
      !['transitionSound', 'music'].includes(String(slotValue))
    ) return { ok: false, error: 'Ação não autorizada.' };
    const phaseId = phaseIdValue;
    const slot = slotValue as SceneAudioSlot;
    const selection = await dialog.showOpenDialog(sceneEditorWindow, {
      title: slot === 'music'
        ? 'Adicionar músicas à fase'
        : 'Adicionar sons à transição',
      defaultPath: defaultMediaDirectory(
        slot === 'music' ? 'Musica' : 'SFX',
        'music',
      ),
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Áudio MP3', extensions: ['mp3'] }],
    });
    if (selection.canceled || selection.filePaths.length === 0) {
      return { ok: false, canceled: true };
    }
    const pending = ensurePendingScenePlaylist(phaseId, slot);
    const additions: ScenePlaylistSummary['tracks'] = [];
    for (const filePath of selection.filePaths) {
      if (path.extname(filePath).toLowerCase() !== '.mp3') continue;
      try {
        const info = await stat(filePath);
        if (!info.isFile() || info.size > MAX_USER_MEDIA_BYTES) continue;
        const metadata = await parseFile(filePath, { duration: true });
        const id = randomUUID();
        additions.push({
          id,
          name: path.basename(filePath),
          duration: metadata.format.duration ?? 0,
          url: scenePlaylistTrackUrl(phaseId, slot, id),
        });
        pending.paths.set(id, filePath);
      } catch {
        // Arquivos inválidos são ignorados sem afetar as demais seleções.
      }
    }
    if (additions.length === 0) {
      return {
        ok: false,
        error: 'Nenhum MP3 válido de até 100 MB foi selecionado.',
      };
    }
    pending.summary = {
      ...pending.summary,
      tracks: [...pending.summary.tracks, ...additions],
      currentTrackId: pending.summary.currentTrackId ?? additions[0].id,
      revision: pending.summary.revision + 1,
    };
    broadcastScenePlaylist(phaseId, slot);
    return {
      ok: true,
      added: additions.length,
      state: getScenePlaylistState(phaseId, slot) ?? undefined,
    };
  },
);

ipcMain.on('scene-playlist:dispatch', (
  event,
  phaseIdValue: unknown,
  slotValue: unknown,
  value: unknown,
) => {
  if (
    !isSceneEditorSender(event.sender.id) ||
    !isSafeSceneIdentifier(phaseIdValue) ||
    !['transitionSound', 'music'].includes(String(slotValue)) ||
    !isRecord(value) ||
    typeof value.type !== 'string'
  ) return;
  const command = value as ScenePlaylistCommand;
  const phaseId = phaseIdValue;
  const slot = slotValue as SceneAudioSlot;
  const pending = ensurePendingScenePlaylist(phaseId, slot);
  const commandSnapshot = captureAppUndoSnapshot();
  const tracks = [...pending.summary.tracks];
  const next = cloneScenePlaylistSummary(pending.summary);
  let changed = false;
  switch (command.type) {
    case 'previous':
      if (tracks.length > 1) {
        next.currentTrackId = adjacentScenePlaylistTrackId(next, -1);
        changed = true;
      }
      break;
    case 'next':
      if (tracks.length > 1) {
        next.currentTrackId = adjacentScenePlaylistTrackId(next, 1);
        changed = true;
      }
      break;
    case 'select-track':
      if (tracks.some((track) => track.id === command.trackId)) {
        changed = next.currentTrackId !== command.trackId;
        next.currentTrackId = command.trackId;
      } else return;
      break;
    case 'remove-track': {
      const removedIndex = tracks.findIndex((track) => track.id === command.trackId);
      if (removedIndex < 0) return;
      pending.paths.delete(command.trackId);
      next.tracks = tracks.filter((track) => track.id !== command.trackId);
      changed = true;
      if (next.currentTrackId === command.trackId) {
        next.currentTrackId = next.tracks[Math.min(removedIndex, next.tracks.length - 1)]?.id ?? null;
      }
      break;
    }
    case 'clear':
      pending.paths.clear();
      next.tracks = [];
      next.currentTrackId = null;
      changed = tracks.length > 0;
      break;
    case 'set-volume':
      if (typeof command.volume !== 'number' || !Number.isFinite(command.volume)) return;
      next.volume = Math.max(0, Math.min(1, command.volume));
      changed = next.volume !== pending.summary.volume;
      break;
    case 'set-muted':
      if (typeof command.muted !== 'boolean') return;
      next.muted = command.muted;
      changed = next.muted !== pending.summary.muted;
      break;
    case 'set-loop':
      if (typeof command.loop !== 'boolean') return;
      next.loop = command.loop;
      changed = next.loop !== pending.summary.loop;
      break;
    default:
      return;
  }
  if (!changed) return;
  next.revision += 1;
  pending.summary = next;
  const activeSceneIndex = scenePlan.activePhaseIndex >= 0
    ? scenePlan.activePhaseIndex
    : 0;
  const activeMusicPhaseId = resolveSceneMediaPhase(
    activeSceneIndex,
    'music',
  )?.id;
  if (
    slot === 'music' &&
    activeMusicPhaseId === phaseId &&
    ['set-volume', 'set-muted', 'set-loop'].includes(command.type)
  ) {
    musicState = {
      ...musicState,
      volume: next.volume,
      muted: next.muted,
      loop: next.loop,
      revision: musicState.revision + 1,
    };
    broadcastMusicState();
  }
  const committed = scenePlan.phases.find((phase) => phase.id === phaseId)?.[slot];
  const playbackOnly = [
    'previous',
    'next',
    'select-track',
    'set-volume',
    'set-muted',
    'set-loop',
  ].includes(command.type);
  const sameCommittedTracks = Boolean(
    committed && JSON.stringify(committed.tracks) === JSON.stringify(next.tracks),
  );
  if (playbackOnly && sameCommittedTracks) {
    rememberAppChange(
      commandSnapshot,
      command.type === 'set-volume'
        ? `scene-volume:${phaseId}:${slot}`
        : undefined,
    );
    scenePlan = {
      ...scenePlan,
      phases: scenePlan.phases.map((phase) => phase.id === phaseId
        ? { ...phase, [slot]: cloneScenePlaylistSummary(next) }
        : phase),
      revision: scenePlan.revision + 1,
    };
    if (
      slot === 'music' &&
      activeMusicPhaseId === phaseId &&
      ['previous', 'next', 'select-track'].includes(command.type)
    ) {
      const updatedPhase = scenePlan.phases.find((phase) => phase.id === phaseId);
      if (updatedPhase) activatePhaseMusic(updatedPhase, true);
    }
    broadcastScenePlan();
  }
  broadcastScenePlaylist(phaseId, slot);
});

ipcMain.handle('library:open-window', (event) => {
  if (!isMasterSender(event.sender.id) && !isLauncherSender(event.sender.id)) {
    return false;
  }
  return Boolean(createLibraryWindow());
});

ipcMain.handle('library:has-entries', (event) => {
  assertAuthorizedIpcSender(isLauncherSender(event.sender.id));
  return bossLibraryEntries.length > 0;
});

const prepareFreshEncounter = () => {
  appUndoHistory.length = 0;
  lastAppUndoKey = null;
  lastAppUndoRecordedAt = 0;
  battleState = {
    ...initialBattleState,
    bosses: [createInitialBoss('boss-1')],
    revision: battleState.revision + 1,
  };
  linkedLibraryEntryId = null;
  activeBackgroundFilePath = null;
  configuredBackgroundFilePath = null;
  configuredBackgroundName = null;
  resetScenePlan();
};

ipcMain.handle('launcher:new-encounter', (event) => {
  if (!isLauncherSender(event.sender.id)) return false;
  prepareFreshEncounter();
  createEncounterWindows();
  launcherWindow?.close();
  return true;
});

ipcMain.handle('custom-status-library:get', async (event) => {
  assertAuthorizedIpcSender(isControlSender(event.sender.id));
  return (await getCustomStatusLibraryStore()).list();
});

ipcMain.handle(
  'custom-status-library:create',
  async (
    event,
    draft: unknown,
  ): Promise<CustomStatusLibraryMutationResult> => {
    if (!isControlSender(event.sender.id)) {
      return { ok: false, error: 'Ação não autorizada.' };
    }
    try {
      const preset = await (await getCustomStatusLibraryStore()).create(
        draft,
      );
      return { ok: true, preset };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error
          ? error.message
          : 'Não foi possível salvar o status personalizado.',
      };
    }
  },
);

ipcMain.handle(
  'custom-status-library:delete',
  async (
    event,
    presetId: unknown,
  ): Promise<CustomStatusLibraryMutationResult> => {
    if (
      !isControlSender(event.sender.id) ||
      typeof presetId !== 'string' ||
      !isCustomStatusPresetId(presetId)
    ) return { ok: false, error: 'Ação solicitada é inválida.' };
    try {
      const deleted = await (await getCustomStatusLibraryStore()).delete(presetId);
      return deleted
        ? { ok: true }
        : { ok: false, error: 'O status personalizado não foi encontrado.' };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error
          ? error.message
          : 'Não foi possível excluir o status personalizado.',
      };
    }
  },
);

ipcMain.handle(
  'launcher:host-encounter',
  async (event): Promise<HostedEncounterStartResult> => {
    if (!isLauncherSender(event.sender.id)) {
      return { ok: false, error: 'Ação não autorizada.' };
    }
    prepareFreshEncounter();
    const result = await startHostedSession();
    if (!result.ok) return result;
    createEncounterWindows();
    launcherWindow?.close();
    return result;
  },
);

ipcMain.handle('multiplayer:get-session', (event): HostedSessionState => {
  assertAuthorizedIpcSender(isMasterSender(event.sender.id));
  return getHostedSessionState();
});

const isValidJoinRequestId = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(value);

ipcMain.handle('multiplayer:approve-player', (event, requestId: unknown) => {
  if (!isMasterSender(event.sender.id) || !isValidJoinRequestId(requestId)) {
    return false;
  }
  return hostedSessionServer?.approveJoinRequest(requestId) ?? false;
});

ipcMain.handle(
  'multiplayer:approve-action-point',
  async (event, requestId: unknown): Promise<PlayerCombatActionResult> => {
    if (!isMasterSender(event.sender.id) || typeof requestId !== 'string') {
      return { ok: false, error: 'Ação não autorizada.' };
    }
    return hostedSessionServer
      ? await hostedSessionServer.approveActionPointRequest(requestId)
      : {
      ok: false,
      error: 'Não há uma sala hospedada.',
        };
  },
);

ipcMain.handle(
  'multiplayer:reject-action-point',
  (event, requestId: unknown): PlayerCombatActionResult => {
    if (!isMasterSender(event.sender.id) || typeof requestId !== 'string') {
      return { ok: false, error: 'Ação não autorizada.' };
    }
    return hostedSessionServer?.rejectActionPointRequest(requestId) ?? {
      ok: false,
      error: 'Não há uma sala hospedada.',
    };
  },
);

ipcMain.handle(
  'multiplayer:grant-action-point',
  (event, playerId: unknown): PlayerCombatActionResult => {
    if (!isMasterSender(event.sender.id) || typeof playerId !== 'string') {
      return { ok: false, error: 'Ação não autorizada.' };
    }
    return hostedSessionServer?.grantActionPoint(playerId) ?? {
      ok: false,
      error: 'Não há uma sala hospedada.',
    };
  },
);

ipcMain.handle(
  'multiplayer:grant-hero-point',
  (event, playerId: unknown): PlayerCombatActionResult => {
    if (!isMasterSender(event.sender.id) || typeof playerId !== 'string') {
      return { ok: false, error: 'Ação não autorizada.' };
    }
    return hostedSessionServer?.grantHeroPoint(playerId) ?? {
      ok: false,
      error: 'Não há uma sala hospedada.',
    };
  },
);

ipcMain.handle(
  'multiplayer:revoke-action-point',
  (event, playerId: unknown): PlayerCombatActionResult => {
    if (!isMasterSender(event.sender.id) || typeof playerId !== 'string') {
      return { ok: false, error: 'Ação não autorizada.' };
    }
    return hostedSessionServer?.revokeActionPoint(playerId) ?? {
      ok: false,
      error: 'Não há uma sala hospedada.',
    };
  },
);

ipcMain.handle(
  'multiplayer:revoke-hero-point',
  (event, playerId: unknown): PlayerCombatActionResult => {
    if (!isMasterSender(event.sender.id) || typeof playerId !== 'string') {
      return { ok: false, error: 'Ação não autorizada.' };
    }
    return hostedSessionServer?.revokeHeroPoint(playerId) ?? {
      ok: false,
      error: 'Não há uma sala hospedada.',
    };
  },
);

ipcMain.handle(
  'multiplayer:set-unarmed-strike-enabled',
  (
    event,
    playerId: unknown,
    enabled: unknown,
  ): PlayerCombatActionResult => {
    if (
      !isMasterSender(event.sender.id) ||
      typeof playerId !== 'string' ||
      typeof enabled !== 'boolean'
    ) {
      return { ok: false, error: 'Ação não autorizada.' };
    }
    return hostedSessionServer?.setUnarmedStrikeEnabled(playerId, enabled) ?? {
      ok: false,
      error: 'Não há uma sala hospedada.',
    };
  },
);

ipcMain.handle('multiplayer:reject-player', (event, requestId: unknown) => {
  if (!isMasterSender(event.sender.id) || !isValidJoinRequestId(requestId)) {
    return false;
  }
  return hostedSessionServer?.rejectJoinRequest(requestId) ?? false;
});

ipcMain.handle(
  'multiplayer:set-public-url',
  (event, value: unknown): HostedSessionPublicUrlResult => {
    if (!isMasterSender(event.sender.id)) {
      return { ok: false, error: 'Ação não autorizada.' };
    }
    const server = hostedSessionServer;
    if (!server) return { ok: false, error: 'Nenhuma sala está hospedada.' };
    if (value === null || (typeof value === 'string' && !value.trim())) {
      server.clearPublicInviteUrl();
      hostedPublicBaseUrl = null;
      hostedPublicInviteUrl = null;
      broadcastHostedSessionState();
      return { ok: true, session: getHostedSessionState() };
    }
    if (typeof value !== 'string' || value.length > 2_048) {
      return { ok: false, error: 'O endereço público informado é inválido.' };
    }
    try {
      const publicInvite = server.publicInviteUrl(value);
      hostedPublicBaseUrl = publicInvite.baseUrl;
      hostedPublicInviteUrl = publicInvite.inviteUrl;
      broadcastHostedSessionState();
      return { ok: true, session: getHostedSessionState() };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error
          ? error.message
          : 'Não foi possível configurar o endereço público.',
      };
    }
  },
);

ipcMain.handle('multiplayer:copy-link', (event, requestedLink: unknown) => {
  if (!isMasterSender(event.sender.id)) return false;
  const state = getHostedSessionState();
  const availableLinks = [state.shareUrl].filter(
    (link): link is string => Boolean(link),
  );
  const link = typeof requestedLink === 'string' &&
    availableLinks.includes(requestedLink)
    ? requestedLink
    : state.shareUrl;
  if (!state.active || !link) return false;
  clipboard.writeText(link);
  return true;
});

ipcMain.handle('multiplayer:open-local-player', async (event) => {
  if (!isMasterSender(event.sender.id)) return false;
  const { active, localUrl } = getHostedSessionState();
  if (!active || !localUrl) return false;
  try {
    await shell.openExternal(localUrl, { activate: true });
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('multiplayer:open-player-sheet', async (event, playerId: unknown) => {
  if (!isMasterSender(event.sender.id) || !isValidJoinRequestId(playerId)) return false;
  const sheet = await hostedSessionServer?.playerSheet(playerId);
  if (!sheet) return false;
  return (await shell.openPath(sheet.filePath)) === '';
});

ipcMain.handle(
  'multiplayer:reset-player-password',
  async (
    event,
    playerId: unknown,
    password: unknown,
  ): Promise<HostedPlayerPasswordResetResult> => {
    if (
      !isMasterSender(event.sender.id) ||
      !isValidJoinRequestId(playerId) ||
      typeof password !== 'string' ||
      password.length < 3 ||
      password.length > 128
    ) return { ok: false, error: 'Ação ou a nova senha é inválida.' };
    if (!hostedSessionServer) return { ok: false, error: 'Nenhuma sala está hospedada.' };
    try {
      await hostedSessionServer.resetPlayerPassword(playerId, password);
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Não foi possível redefinir a senha.',
      };
    }
  },
);

ipcMain.handle(
  'multiplayer:delete-player-account',
  async (
    event,
    playerId: unknown,
  ): Promise<PlayerProfileDeleteResult> => {
    if (!isMasterSender(event.sender.id) || !isValidJoinRequestId(playerId)) {
      return { ok: false, error: 'Ação inválida.' };
    }
    if (!hostedSessionServer) {
      return { ok: false, error: 'Nenhuma sala está hospedada.' };
    }
    try {
      await hostedSessionServer.deletePlayerProfile(playerId);
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error
          ? error.message
          : 'Não foi possível excluir o usuário.',
      };
    }
  },
);

ipcMain.handle('multiplayer:get-player-profiles', async (event) => {
  assertAuthorizedIpcSender(isMasterSender(event.sender.id));
  return (await getPlayerProfileStore()).listProfiles();
});

ipcMain.handle('multiplayer:open-profile-sheet', async (event, profileId: unknown) => {
  if (!isMasterSender(event.sender.id) || !isValidJoinRequestId(profileId)) return false;
  const sheet = await (await getPlayerProfileStore()).readSheet(profileId);
  if (!sheet) return false;
  return (await shell.openPath(sheet.filePath)) === '';
});

ipcMain.handle(
  'multiplayer:reset-profile-password',
  async (
    event,
    profileId: unknown,
    password: unknown,
  ): Promise<HostedPlayerPasswordResetResult> => {
    if (
      !isMasterSender(event.sender.id) ||
      !isValidJoinRequestId(profileId) ||
      typeof password !== 'string' ||
      password.length < 3 ||
      password.length > 128
    ) return { ok: false, error: 'Ação ou a nova senha é inválida.' };
    try {
      if (hostedSessionServer) {
        await hostedSessionServer.resetProfilePassword(profileId, password);
      } else {
        await (await getPlayerProfileStore()).resetPassword(profileId, password);
      }
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Não foi possível redefinir a senha.',
      };
    }
  },
);

ipcMain.handle(
  'multiplayer:delete-profile',
  async (
    event,
    profileId: unknown,
  ): Promise<PlayerProfileDeleteResult> => {
    if (!isMasterSender(event.sender.id) || !isValidJoinRequestId(profileId)) {
      return { ok: false, error: 'Ação inválida.' };
    }
    try {
      if (hostedSessionServer) {
        await hostedSessionServer.deleteProfile(profileId);
      } else {
        await (await getPlayerProfileStore()).deleteProfile(profileId);
      }
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error
          ? error.message
          : 'Não foi possível excluir o usuário.',
      };
    }
  },
);

ipcMain.handle('notes:get-master', async (event) => {
  assertAuthorizedIpcSender(isMasterSender(event.sender.id));
  try {
    return await readFile(masterNotesPath(), 'utf8');
  } catch (error) {
    if (isRecord(error) && error.code === 'ENOENT') return '';
    throw error;
  }
});

ipcMain.handle(
  'notes:save-master',
  async (event, content: unknown): Promise<NotesSaveResult> => {
    if (
      !isMasterSender(event.sender.id) ||
      typeof content !== 'string' ||
      content.length > 100_000
    ) return { ok: false, error: 'O texto das notas é inválido.' };
    const destination = masterNotesPath();
    const temporary = `${destination}.${randomUUID()}.tmp`;
    try {
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(temporary, content, 'utf8');
      try {
        await rename(temporary, destination);
      } catch (error) {
        if (!isRecord(error) || (error.code !== 'EEXIST' && error.code !== 'EPERM')) throw error;
        await rm(destination, { force: true });
        await rename(temporary, destination);
      }
      return { ok: true, content };
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Não foi possível salvar as notas.',
      };
    }
  },
);

ipcMain.handle(
  'library:save-boss',
  async (
    event,
    rawDraft: unknown,
    mode: unknown,
  ): Promise<BossLibrarySaveResult> => {
    if (
      !isMasterSender(event.sender.id) ||
      (mode !== 'prompt' && mode !== 'new' && mode !== 'overwrite')
    ) return { ok: false, error: 'Ação não autorizada.' };

    const draft = normalizeLibraryDraft(rawDraft);
    if (!draft) return { ok: false, error: 'Os dados do encontro são inválidos.' };

    const linkedEntry = linkedLibraryEntryId
      ? bossLibraryEntries.find(
          (entry) => entry.id === linkedLibraryEntryId && !entry.isAutosave,
        ) ?? null
      : null;

    if (mode === 'prompt' && linkedEntry) {
      return {
        ok: false,
        requiresOverwrite: true,
        entryId: linkedEntry.id,
        existingName: libraryEntryLabel(linkedEntry),
      };
    }
    if (mode === 'overwrite' && !linkedEntry) {
      return {
        ok: false,
        error: 'O encontro original não está mais disponível na biblioteca.',
      };
    }

    const entry = captureLibraryEntry(
      draft,
      mode === 'overwrite' ? linkedEntry : null,
      false,
    );
    const previousEntries = bossLibraryEntries;
    bossLibraryEntries = linkedEntry && mode === 'overwrite'
      ? bossLibraryEntries.map((item) => item.id === linkedEntry.id ? entry : item)
      : [...bossLibraryEntries, entry];

    try {
      await persistBossLibrary();
    } catch {
      bossLibraryEntries = previousEntries;
      return { ok: false, error: 'Não foi possível gravar a biblioteca no disco.' };
    }

    linkedLibraryEntryId = entry.id;
    notifyLibraryChanged();
    return { ok: true, entryId: entry.id };
  },
);

ipcMain.handle(
  'library:autosave',
  async (event, rawDraft: unknown): Promise<BossLibrarySaveResult> => {
    if (!isMasterSender(event.sender.id)) {
      return { ok: false, error: 'Ação não autorizada.' };
    }
    const draft = normalizeLibraryDraft(rawDraft);
    if (!draft) return { ok: false, error: 'Os dados do encontro são inválidos.' };

    const currentAutosave =
      bossLibraryEntries.find((entry) => entry.isAutosave) ?? null;
    const entry = captureLibraryEntry(draft, currentAutosave, true);
    const previousEntries = bossLibraryEntries;
    bossLibraryEntries = currentAutosave
      ? bossLibraryEntries.map((item) => item.id === currentAutosave.id ? entry : item)
      : [entry, ...bossLibraryEntries];

    try {
      await persistBossLibrary();
    } catch {
      bossLibraryEntries = previousEntries;
      return { ok: false, error: 'Não foi possível criar o salvamento automático.' };
    }
    notifyLibraryChanged();
    return { ok: true, entryId: entry.id };
  },
);

ipcMain.handle('library:get-entries', (event): BossLibraryEntrySummary[] => {
  assertAuthorizedIpcSender(isLibrarySender(event.sender.id));
  return getBossLibrarySummaries();
});

ipcMain.handle(
  'library:delete-entry',
  async (event, entryId: unknown): Promise<BossLibraryDeleteResult> => {
    if (!isLibrarySender(event.sender.id) || typeof entryId !== 'string') {
      return { ok: false, error: 'Ação não autorizada.' };
    }
    if (!bossLibraryEntries.some((entry) => entry.id === entryId)) {
      return { ok: false, error: 'Encontro salvo não encontrado.' };
    }

    const previousEntries = bossLibraryEntries;
    bossLibraryEntries = bossLibraryEntries.filter(
      (entry) => entry.id !== entryId,
    );
    try {
      await persistBossLibrary();
    } catch {
      bossLibraryEntries = previousEntries;
      return { ok: false, error: 'Não foi possível excluir o encontro salvo.' };
    }

    if (linkedLibraryEntryId === entryId) linkedLibraryEntryId = null;
    notifyLibraryChanged();
    return { ok: true };
  },
);

const restoreLibraryEntry = (
  entry: BossLibraryEntry,
  missingKeys: Set<string>,
): BossLibraryLoaded => {
  pendingHealthTimers.forEach(clearTimeout);
  pendingHealthTimers.clear();
  clearPendingLocalCombatImpacts();
  if (battleMusicStartTimer) {
    clearTimeout(battleMusicStartTimer);
    battleMusicStartTimer = null;
  }
  stopSoundboardPlayback();
  soundEffectSources.clear();

  const loadedBosses = entry.bosses.map((storedBoss) => {
    const maxHealth = clampInteger(storedBoss.maxHealth, 1, 1_000_000);
    const skillBase = clampInteger(storedBoss.skills, -999, 999);
    const rawSkillValues = normalizeBossSkillValues(storedBoss.skillValues, skillBase);
    const skillOverrides = normalizeBossSkillOverrides(
      storedBoss.skillOverrides,
      skillBase,
      rawSkillValues,
    );
    return {
      id: storedBoss.bossId,
      setupStatus: 'ready' as const,
      identityPrepared: true,
      actionPrepared: storedBoss.description.trim().length > 0,
      bossName: storedBoss.bossName.trim().slice(0, 100) || 'Chefão Sem Nome',
      controlAmount: storedBoss.amount,
      applyDamageReduction: true,
      maxHealth,
      currentHealth: clampInteger(storedBoss.currentHealth, 0, maxHealth),
      attack: clampInteger(storedBoss.attack, -999, 999),
      rangedAttack: clampInteger(storedBoss.rangedAttack, -999, 999),
      defense: clampInteger(storedBoss.defense, 0, 999),
      rangedDefense: clampInteger(storedBoss.rangedDefense, 0, 999),
      shield: clampInteger(storedBoss.shield ?? 0, 0, 999),
      skills: skillBase,
      skillValues: resolveBossSkillValues(skillBase, rawSkillValues, skillOverrides),
      skillOverrides,
      damageReduction: clampInteger(storedBoss.damageReduction, 0, 999),
      nextAction: storedBoss.description.trim().slice(0, 100),
      actionSeverity: storedBoss.actionSeverity,
      turnCount: clampInteger(storedBoss.turnCount, 0, 1_000_000),
      activeStatuses: reconcileStatusIncompatibilities(
        normalizeActiveStatuses(storedBoss.activeStatuses),
      ),
    };
  });
  const activeBossIndex = Math.min(
    entry.activeBossIndex,
    loadedBosses.length - 1,
  );
  const loadedBoss = loadedBosses[activeBossIndex];

  battleState = {
    ...battleState,
    bosses: loadedBosses,
    activeBossId: loadedBoss.id,
    backgroundName:
      entry.background && !missingKeys.has('background')
        ? entry.background.name
        : null,
    battleStarted: false,
    hudVisible: true,
    revision: battleState.revision + 1,
  };
  configuredBackgroundFilePath =
    entry.background && !missingKeys.has('background')
      ? entry.background.filePath
      : null;
  configuredBackgroundName = battleState.backgroundName;
  activeBackgroundFilePath = configuredBackgroundFilePath;
  pendingBackgroundChange = null;
  backgroundRevision += 1;
  resetScenePlan();
  sceneMediaPaths.clear();
  scenePlaylistPaths.clear();
  const restoredScenePhases: ScenePhase[] = entry.scene.phases.map((phase) => {
    const restoreBackground = (): ScenePhase['background'] => {
      const media = phase.background;
      if (!media || missingKeys.has(`scene:${phase.id}:background`)) return null;
      sceneMediaPaths.set(sceneMediaKey(phase.id, 'background'), media.filePath);
      return {
        name: media.name,
        configured: true,
        mediaType: media.mediaType,
      };
    };
    const restorePlaylist = (
      slot: SceneAudioSlot,
      playlist: StoredScenePlaylist | null,
    ): ScenePlaylistSummary | null => {
      if (!playlist) return null;
      const tracks = playlist.tracks.flatMap((track) => {
        if (missingKeys.has(`scene:${phase.id}:${slot}:${track.id}`)) return [];
        scenePlaylistPaths.set(
          scenePlaylistTrackKey(phase.id, slot, track.id),
          track.filePath,
        );
        return [{
          id: track.id,
          name: track.name,
          duration: track.duration,
          url: scenePlaylistTrackUrl(phase.id, slot, track.id),
        }];
      });
      if (tracks.length === 0) return null;
      return {
        tracks,
        currentTrackId: tracks.some((track) => track.id === playlist.currentTrackId)
          ? playlist.currentTrackId
          : tracks[0].id,
        volume: playlist.volume,
        muted: playlist.muted,
        loop: playlist.loop,
        revision: playlist.revision ?? 0,
      };
    };
    return {
      ...phase,
      bosses: phase.bosses.map((directive) => ({
        ...directive,
        patch: { ...directive.patch },
      })),
      background: restoreBackground(),
      transitionSound: restorePlaylist('transitionSound', phase.transitionSound),
      music: restorePlaylist('music', phase.music),
    };
  });
  scenePlan = {
    bossSlots: entry.scene.bossSlots.map((slot) => ({ ...slot })),
    phases: restoredScenePhases,
    showPhaseMarkers: entry.scene.showPhaseMarkers,
    activePhaseIndex: -1,
    activePhaseIds: Object.fromEntries(entry.scene.bossSlots.map((slot) => [slot.bossId, null])),
    blackoutActive: false,
    revision: scenePlan.revision + 1,
  };
  sceneBossArchive.clear();
  loadedBosses.forEach((boss) => sceneBossArchive.set(boss.id, boss));
  for (const slot of scenePlan.bossSlots) {
    if (!sceneBossArchive.has(slot.bossId)) {
      const template = entry.scene.templates.find((item) => item.bossId === slot.bossId);
      const maxHealth = clampInteger(template?.maxHealth ?? 500, 1, 1_000_000);
      sceneBossArchive.set(slot.bossId, template ? {
        id: template.bossId,
        setupStatus: 'ready',
        identityPrepared: true,
        actionPrepared: template.description.trim().length > 0,
        bossName: template.bossName,
        controlAmount: template.amount,
        applyDamageReduction: true,
        maxHealth,
        currentHealth: clampInteger(template.currentHealth, 0, maxHealth),
        attack: clampInteger(template.attack, -999, 999),
        rangedAttack: clampInteger(template.rangedAttack, -999, 999),
        defense: clampInteger(template.defense, 0, 999),
        rangedDefense: clampInteger(template.rangedDefense, 0, 999),
        shield: clampInteger(template.shield, 0, 999),
        ...(() => {
          const skillBase = clampInteger(template.skills, -999, 999);
          const rawSkillValues = normalizeBossSkillValues(
            template.skillValues,
            skillBase,
          );
          const skillOverrides = normalizeBossSkillOverrides(
            template.skillOverrides,
            skillBase,
            rawSkillValues,
          );
          return {
            skills: skillBase,
            skillValues: resolveBossSkillValues(
              skillBase,
              rawSkillValues,
              skillOverrides,
            ),
            skillOverrides,
          };
        })(),
        damageReduction: clampInteger(template.damageReduction, 0, 999),
        nextAction: template.description,
        actionSeverity: template.actionSeverity,
        turnCount: clampInteger(template.turnCount, 0, 1_000_000),
        activeStatuses: reconcileStatusIncompatibilities(
          normalizeActiveStatuses(template.activeStatuses),
        ),
      } : {
        ...createInitialBoss(slot.bossId, sceneBossArchive.size),
        bossName: slot.label,
        setupStatus: 'ready',
      });
    }
  }

  const restoredTracks = entry.music.tracks.flatMap((track, index) => {
    if (missingKeys.has(`music:${index}`)) return [];
    musicTrackSequence += 1;
    return [{ ...track, id: String(musicTrackSequence) }];
  });
  musicTracks.splice(0, musicTracks.length, ...restoredTracks);
  const restoredCurrentTrack = restoredTracks.find(
    (track) => track.filePath === entry.music.currentTrackFilePath,
  ) ?? restoredTracks[0] ?? null;
  musicState = {
    currentTrackId: restoredCurrentTrack?.id ?? null,
    isPlaying: false,
    loop: Boolean(entry.music.loop),
    volume: Math.max(0, Math.min(1, entry.music.volume)),
    muted: Boolean(entry.music.muted),
    universalMuted: musicState.universalMuted,
    playbackVersion: musicState.playbackVersion + 1,
    revision: musicState.revision + 1,
  };
  musicPlaybackState = {
    trackId: restoredCurrentTrack?.id ?? null,
    currentTime: 0,
    duration: restoredCurrentTrack?.duration ?? 0,
  };

  soundboardSlots.fill(null);
  for (const slot of entry.soundboard.slots) {
    if (
      missingKeys.has(`soundboard:${slot.index}`) ||
      !Number.isInteger(slot.index) ||
      slot.index < 1 ||
      slot.index > 20
    ) continue;
    soundboardSlots[slot.index - 1] = { ...slot };
  }
  soundboardAudioState = {
    volume: Math.max(0, Math.min(1, entry.soundboard.volume)),
    muted: Boolean(entry.soundboard.muted),
    loop: Boolean(entry.soundboard.loop),
  };
  soundboardRevision += 1;

  linkedLibraryEntryId = entry.isAutosave ? null : entry.id;

  broadcastBattleState();
  broadcastBackground();
  broadcastMusicState();
  broadcastSoundboardState();
  broadcastScenePlan();

  return {
    boss: loadedBoss,
    amount: entry.bosses[activeBossIndex].amount,
    bossCount: loadedBosses.length,
  };
};

ipcMain.handle(
  'library:load-boss',
  async (
    event,
    entryId: unknown,
    continueWithoutMissing: unknown,
  ): Promise<BossLibraryLoadResult> => {
    if (
      !isLibrarySender(event.sender.id) ||
      typeof entryId !== 'string' ||
      typeof continueWithoutMissing !== 'boolean'
    ) return { ok: false, error: 'Ação não autorizada.' };

    const entry = bossLibraryEntries.find((item) => item.id === entryId);
    if (!entry) return { ok: false, error: 'Encontro salvo não encontrado.' };
    const missingFiles = await findMissingLibraryFiles(entry);
    if (missingFiles.length > 0 && !continueWithoutMissing) {
      return { ok: false, missingFiles };
    }

    const snapshot = captureAppUndoSnapshot();
    const loaded = restoreLibraryEntry(
      entry,
      new Set(missingFiles.map((file) => file.key)),
    );
    rememberAppChange(snapshot);
    if (!masterWindow || masterWindow.isDestroyed()) {
      createEncounterWindows();
      launcherWindow?.close();
    }
    if (masterWindow && !masterWindow.isDestroyed()) {
      masterWindow.webContents.send('library:boss-loaded', loaded);
      masterWindow.show();
      masterWindow.focus();
    }
    return { ok: true };
  },
);

ipcMain.handle(
  'library:replace-file',
  async (
    event,
    entryId: unknown,
    key: unknown,
  ): Promise<BossLibraryReplaceResult> => {
    if (
      !libraryWindow ||
      !isLibrarySender(event.sender.id) ||
      typeof entryId !== 'string' ||
      typeof key !== 'string'
    ) return { ok: false, error: 'Ação não autorizada.' };

    const entryIndex = bossLibraryEntries.findIndex((item) => item.id === entryId);
    if (entryIndex < 0) return { ok: false, error: 'Encontro salvo não encontrado.' };
    const entry = bossLibraryEntries[entryIndex];
    const missingFile = (await findMissingLibraryFiles(entry)).find(
      (file) => file.key === key,
    );
    if (!missingFile) {
      return { ok: false, error: 'Este arquivo não está mais ausente.' };
    }

    const isBackground = missingFile.kind === 'background';
    const dialogOwner = libraryWindow;
    const selection = await dialog.showOpenDialog(dialogOwner, {
      title: `Localizar substituto para ${missingFile.label}`,
      properties: ['openFile'],
      filters: isBackground
        ? [{ name: 'Imagens, GIFs e vídeos', extensions: [...supportedBackgroundExtensions].map((extension) => extension.slice(1)) }]
        : [{ name: 'Arquivos MP3', extensions: ['mp3'] }],
    });
    if (!dialogOwner.isDestroyed()) {
      dialogOwner.show();
      dialogOwner.focus();
      dialogOwner.webContents.focus();
    }
    if (selection.canceled || selection.filePaths.length === 0) {
      return { ok: false, canceled: true };
    }

    const replacementPath = selection.filePaths[0];
    try {
      const fileInfo = await stat(replacementPath);
      if (!fileInfo.isFile()) throw new Error('not-file');
      if (fileInfo.size > MAX_USER_MEDIA_BYTES) {
        return { ok: false, error: 'O arquivo deve ter no máximo 100 MB.' };
      }
    } catch {
      return { ok: false, error: 'Não foi possível ler o arquivo selecionado.' };
    }
    if (!(await fileIsAvailable(replacementPath, missingFile.kind))) {
      return {
        ok: false,
        error: isBackground
          ? 'Selecione uma imagem, GIF ou vídeo compatível.'
          : 'Selecione um arquivo MP3 compatível.',
      };
    }

    let replacementDuration = 0;
    if (!isBackground) {
      try {
        const metadata = await parseFile(replacementPath, { duration: true });
        const container = metadata.format.container?.toLowerCase() ?? '';
        const codec = metadata.format.codec?.toLowerCase() ?? '';
        if (
          !container.includes('mpeg') &&
          !codec.includes('layer 3') &&
          !codec.includes('mp3')
        ) throw new Error('invalid-codec');
        replacementDuration = Number.isFinite(metadata.format.duration)
          ? metadata.format.duration ?? 0
          : 0;
      } catch {
        return { ok: false, error: 'O arquivo MP3 não pôde ser decodificado.' };
      }
    }

    let updatedEntry: BossLibraryEntry;
    if (key === 'background') {
      updatedEntry = {
        ...entry,
        background: {
          filePath: replacementPath,
          name: path.basename(replacementPath),
        },
        updatedAt: new Date().toISOString(),
      };
    } else if (key.startsWith('music:')) {
      const trackIndex = Number(key.slice('music:'.length));
      if (!Number.isInteger(trackIndex) || !entry.music.tracks[trackIndex]) {
        return { ok: false, error: 'Faixa salva inválida.' };
      }
      const tracks = [...entry.music.tracks];
      const previousTrackPath = tracks[trackIndex].filePath;
      tracks[trackIndex] = {
        filePath: replacementPath,
        name: path.basename(replacementPath, path.extname(replacementPath)),
        duration: replacementDuration,
      };
      updatedEntry = {
        ...entry,
        music: {
          ...entry.music,
          tracks,
          currentTrackFilePath:
            entry.music.currentTrackFilePath === previousTrackPath
              ? replacementPath
              : entry.music.currentTrackFilePath,
        },
        updatedAt: new Date().toISOString(),
      };
    } else if (key.startsWith('scene:')) {
      const [, phaseId, rawSlot, trackId] = key.split(':');
      if (!['background', 'transitionSound', 'music'].includes(rawSlot)) {
        return { ok: false, error: 'Mídia de fase inválida.' };
      }
      const mediaSlot = rawSlot as SceneMediaSlot;
      const phaseExists = entry.scene.phases.some((phase) => phase.id === phaseId);
      if (!phaseExists) return { ok: false, error: 'Fase salva inválida.' };
      const phases = entry.scene.phases.map((phase): StoredScenePhase => {
        if (phase.id !== phaseId) return phase;
        if (mediaSlot === 'background') {
          return {
            ...phase,
            background: {
              filePath: replacementPath,
              name: path.basename(replacementPath),
              mediaType: backgroundMediaTypeForFile(replacementPath) ?? 'image',
            },
          };
        }
        if (!trackId) return phase;
        const playlist = phase[mediaSlot];
        if (!playlist) return phase;
        return {
          ...phase,
          [mediaSlot]: {
            ...playlist,
            tracks: playlist.tracks.map((track) => track.id === trackId
              ? {
                  ...track,
                  filePath: replacementPath,
                  name: path.basename(replacementPath),
                  duration: replacementDuration,
                }
              : track),
          },
        };
      });
      updatedEntry = {
        ...entry,
        scene: { ...entry.scene, phases },
        updatedAt: new Date().toISOString(),
      };
    } else {
      const slotIndex = Number(key.slice('soundboard:'.length));
      const slots = entry.soundboard.slots.map((slot) =>
        slot.index === slotIndex ? { ...slot, filePath: replacementPath } : slot,
      );
      updatedEntry = {
        ...entry,
        soundboard: { ...entry.soundboard, slots },
        updatedAt: new Date().toISOString(),
      };
    }

    const previousEntry = bossLibraryEntries[entryIndex];
    bossLibraryEntries = bossLibraryEntries.map((item, index) =>
      index === entryIndex ? updatedEntry : item,
    );
    try {
      await persistBossLibrary();
    } catch {
      bossLibraryEntries = bossLibraryEntries.map((item, index) =>
        index === entryIndex ? previousEntry : item,
      );
      return { ok: false, error: 'Não foi possível atualizar a biblioteca.' };
    }
    notifyLibraryChanged();
    return { ok: true };
  },
);

ipcMain.on('library:close-window', (event) => {
  if (isLibrarySender(event.sender.id)) libraryWindow?.close();
});

ipcMain.handle('music:get-state', (event): MusicState => {
  assertAuthorizedIpcSender(isMusicStateReader(event.sender.id));
  return getMusicState();
});
ipcMain.on('music:control', (event, value: unknown) => {
  if (!isEncounterControllerSender(event.sender.id) || !isMusicControlCommand(value)) {
    return;
  }
  const command = value as MusicControlCommand;
  const nextVolume = command.type === 'set-volume'
    ? Math.max(0, Math.min(1, command.volume))
    : musicState.volume;
  const nextMuted = command.type === 'set-muted' ? command.muted : musicState.muted;
  const nextLoop = command.type === 'set-loop' ? command.loop : musicState.loop;
  if (
    nextVolume === musicState.volume &&
    nextMuted === musicState.muted &&
    nextLoop === musicState.loop
  ) return;
  rememberAppChange(undefined, command.type === 'set-volume' ? 'music-volume' : undefined);
  musicState = {
    ...musicState,
    volume: nextVolume,
    muted: nextMuted,
    loop: nextLoop,
    revision: musicState.revision + 1,
  };
  const activeIndex = scenePlan.activePhaseIndex >= 0
    ? scenePlan.activePhaseIndex
    : 0;
  const musicPhase = resolveSceneMediaPhase(activeIndex, 'music');
  if (musicPhase?.music) {
    const playlistKey = sceneMediaKey(musicPhase.id, 'music');
    const pendingPlaylist = pendingScenePlaylists.get(playlistKey);
    if (pendingPlaylist) {
      pendingPlaylist.summary = {
        ...pendingPlaylist.summary,
        volume: nextVolume,
        muted: nextMuted,
        loop: nextLoop,
        revision: pendingPlaylist.summary.revision + 1,
      };
    }
    scenePlan = {
      ...scenePlan,
      phases: scenePlan.phases.map((phase) => phase.id === musicPhase.id
        ? {
            ...phase,
            music: phase.music ? {
              ...phase.music,
              volume: nextVolume,
              muted: nextMuted,
              loop: nextLoop,
              revision: phase.music.revision + 1,
            } : null,
          }
        : phase),
      revision: scenePlan.revision + 1,
    };
    broadcastScenePlan();
    broadcastScenePlaylist(musicPhase.id, 'music');
  }
  broadcastMusicState();
  persistEncounterEffectsSettingsSafely();
});
ipcMain.handle('soundboard:get-state', (event): SoundboardState => {
  assertAuthorizedIpcSender(
    isSoundboardSender(event.sender.id) ||
      isControlSender(event.sender.id) ||
      isPlayerSender(event.sender.id),
  );
  return getSoundboardState();
});
ipcMain.handle('encounter-effects:get-state', (event) => {
  assertAuthorizedIpcSender(
    isEncounterControllerSender(event.sender.id) ||
      isPlayerSender(event.sender.id),
  );
  return getEncounterEffectsState();
});
ipcMain.handle('encounter-sounds:get-state', (event) => {
  assertAuthorizedIpcSender(isMasterSender(event.sender.id));
  return getEncounterSoundCustomizationState();
});
ipcMain.handle(
  'encounter-sounds:add',
  async (
    event,
    kind: unknown,
  ): Promise<EncounterSoundCustomizationResult> => {
    if (
      !masterWindow ||
      !isMasterSender(event.sender.id) ||
      !isEncounterSoundEffectKind(kind)
    ) return { ok: false, error: 'Ação não autorizada.' };

    const selection = await dialog.showOpenDialog(masterWindow, {
      title: 'Adicionar efeito sonoro personalizado',
      defaultPath: defaultMediaDirectory('SFX', 'music'),
      properties: ['openFile'],
      filters: [{ name: 'Arquivos MP3', extensions: ['mp3'] }],
    });
    if (selection.canceled || selection.filePaths.length === 0) {
      return { ok: false, canceled: true };
    }

    const sourcePath = selection.filePaths[0];
    if (path.extname(sourcePath).toLowerCase() !== '.mp3') {
      return { ok: false, error: 'Selecione um arquivo MP3 válido.' };
    }
    try {
      const fileInfo = await stat(sourcePath);
      if (!fileInfo.isFile() || fileInfo.size > MAX_USER_MEDIA_BYTES) {
        return { ok: false, error: 'O arquivo deve ter no máximo 100 MB.' };
      }
      const metadata = await parseFile(sourcePath, { duration: true });
      const container = metadata.format.container?.toLowerCase() ?? '';
      const codec = metadata.format.codec?.toLowerCase() ?? '';
      if (
        !container.includes('mpeg') &&
        !codec.includes('layer 3') &&
        !codec.includes('mp3')
      ) throw new Error('invalid-codec');
    } catch {
      return {
        ok: false,
        error: 'O arquivo não pôde ser decodificado como MP3 (MPEG Layer III).',
      };
    }

    const fileId = randomUUID();
    const destinationDirectory = path.join(customEncounterSoundsDirectory(), kind);
    const destinationPath = path.join(destinationDirectory, `${fileId}.mp3`);
    const customSoundName = path
      .basename(sourcePath, path.extname(sourcePath))
      .trim()
      .slice(0, 100) || 'Efeito personalizado';
    const option: InternalEncounterSoundOption = {
      id: `custom:${fileId}`,
      kind,
      name: customSoundName,
      isDefault: false,
      enabled: true,
      filePath: destinationPath,
    };
    try {
      await mkdir(destinationDirectory, { recursive: true });
      await copyFile(sourcePath, destinationPath);
      encounterSoundOptions.push(option);
      encounterSoundCustomizationRevision += 1;
      previousEncounterSoundIndex.delete(kind);
      encounterSoundGroupLastPlayedAt.delete(kind);
      await persistEncounterSoundCustomization();
      broadcastHostedEncounterSoundLibrary();
      return { ok: true, state: getEncounterSoundCustomizationState() };
    } catch (error) {
      const optionIndex = encounterSoundOptions.findIndex(
        (item) => item.id === option.id,
      );
      if (optionIndex >= 0) encounterSoundOptions.splice(optionIndex, 1);
      await rm(destinationPath, { force: true }).catch(() => undefined);
      console.error('Não foi possível adicionar o efeito sonoro.', error);
      return { ok: false, error: 'Não foi possível salvar o efeito sonoro.' };
    }
  },
);
ipcMain.handle(
  'encounter-sounds:set-enabled',
  async (
    event,
    optionId: unknown,
    enabled: unknown,
  ): Promise<EncounterSoundCustomizationResult> => {
    if (
      !isMasterSender(event.sender.id) ||
      typeof optionId !== 'string' ||
      typeof enabled !== 'boolean'
    ) return { ok: false, error: 'Ação não autorizada.' };
    const option = encounterSoundOptions.find((item) => item.id === optionId);
    if (!option) return { ok: false, error: 'Efeito sonoro não encontrado.' };
    if (option.enabled === enabled) {
      return { ok: true, state: getEncounterSoundCustomizationState() };
    }
    const previousEnabled = option.enabled;
    option.enabled = enabled;
    if (option.isDefault) defaultEncounterSoundEnabled.set(option.id, enabled);
    encounterSoundCustomizationRevision += 1;
    previousEncounterSoundIndex.delete(option.kind);
    encounterSoundGroupLastPlayedAt.delete(option.kind);
    try {
      await persistEncounterSoundCustomization();
      broadcastHostedEncounterSoundLibrary();
      return { ok: true, state: getEncounterSoundCustomizationState() };
    } catch (error) {
      option.enabled = previousEnabled;
      if (option.isDefault) {
        defaultEncounterSoundEnabled.set(option.id, previousEnabled);
      }
      console.error('Não foi possível atualizar o efeito sonoro.', error);
      return { ok: false, error: 'Não foi possível salvar esta alteração.' };
    }
  },
);
ipcMain.handle(
  'encounter-sounds:remove',
  async (
    event,
    optionId: unknown,
  ): Promise<EncounterSoundCustomizationResult> => {
    if (!isMasterSender(event.sender.id) || typeof optionId !== 'string') {
      return { ok: false, error: 'Ação não autorizada.' };
    }
    const optionIndex = encounterSoundOptions.findIndex(
      (item) => item.id === optionId,
    );
    const option = encounterSoundOptions[optionIndex];
    if (!option) return { ok: false, error: 'Efeito sonoro não encontrado.' };
    if (option.isDefault) {
      return { ok: false, error: 'Os efeitos sonoros padrão não podem ser removidos.' };
    }
    encounterSoundOptions.splice(optionIndex, 1);
    encounterSoundCustomizationRevision += 1;
    previousEncounterSoundIndex.delete(option.kind);
    encounterSoundGroupLastPlayedAt.delete(option.kind);
    try {
      await persistEncounterSoundCustomization();
    } catch (error) {
      encounterSoundOptions.splice(optionIndex, 0, option);
      encounterSoundCustomizationRevision += 1;
      console.error('Não foi possível remover o efeito sonoro.', error);
      return { ok: false, error: 'Não foi possível remover o efeito sonoro.' };
    }
    try {
      await rm(option.filePath, { force: true });
    } catch (error) {
      console.error('O cadastro foi removido, mas o arquivo não pôde ser excluído.', error);
    }
    broadcastHostedEncounterSoundLibrary();
    return { ok: true, state: getEncounterSoundCustomizationState() };
  },
);
ipcMain.on('audio:set-universal-muted', (event, muted: unknown) => {
  if (!isMasterSender(event.sender.id) || typeof muted !== 'boolean') return;
  if (musicState.universalMuted === muted) return;
  rememberAppChange();
  musicState = {
    ...musicState,
    universalMuted: muted,
    revision: musicState.revision + 1,
  };
  soundboardRevision += 1;
  broadcastMusicState();
  broadcastSoundboardState();
  broadcastEncounterEffectsState();
});
ipcMain.on('encounter-effects:set-volume', (event, volume: unknown) => {
  if (
    !isMasterSender(event.sender.id) ||
    typeof volume !== 'number' ||
    !Number.isFinite(volume)
  ) return;
  const nextVolume = Math.max(0, Math.min(1, volume));
  if (encounterEffectsAudioState.volume === nextVolume) return;
  rememberAppChange(undefined, 'encounter-effects-volume');
  encounterEffectsAudioState = {
    ...encounterEffectsAudioState,
    volume: nextVolume,
    revision: encounterEffectsAudioState.revision + 1,
  };
  broadcastEncounterEffectsState();
  persistEncounterEffectsSettingsSafely();
});
const encounterSoundSettings = new Set<EncounterSoundSetting>([
  'heal',
  'damage',
  'shield',
  'dice',
]);
const encounterGeneralSettings = new Set<EncounterGeneralSetting>([
  'automaticStatusEffects',
  'phaseMarkers',
]);
const encounterVisualEffectSettings = new Set<EncounterVisualEffectSetting>([
  'screenShake',
  'healthBarShake',
  'damageEffect',
  'healEffect',
  'particles',
  'floatingDamageNumbers',
  'healthNumbers',
]);
ipcMain.on(
  'encounter-effects:set-general-enabled',
  (event, setting: unknown, enabled: unknown) => {
    if (
      !isMasterSender(event.sender.id) ||
      typeof setting !== 'string' ||
      !encounterGeneralSettings.has(setting as EncounterGeneralSetting) ||
      typeof enabled !== 'boolean'
    ) return;
    const typedSetting = setting as EncounterGeneralSetting;
    if (encounterEffectsAudioState.general[typedSetting] === enabled) return;
    rememberAppChange();
    encounterEffectsAudioState = {
      ...encounterEffectsAudioState,
      general: {
        ...encounterEffectsAudioState.general,
        [typedSetting]: enabled,
      },
      revision: encounterEffectsAudioState.revision + 1,
    };
    broadcastEncounterEffectsState();
    persistEncounterEffectsSettingsSafely();
  },
);
ipcMain.on(
  'encounter-effects:set-sound-enabled',
  (event, setting: unknown, enabled: unknown) => {
    if (
      !isMasterSender(event.sender.id) ||
      typeof setting !== 'string' ||
      !encounterSoundSettings.has(setting as EncounterSoundSetting) ||
      typeof enabled !== 'boolean'
    ) return;
    const typedSetting = setting as EncounterSoundSetting;
    if (encounterEffectsAudioState.sounds[typedSetting] === enabled) return;
    rememberAppChange();
    encounterEffectsAudioState = {
      ...encounterEffectsAudioState,
      sounds: {
        ...encounterEffectsAudioState.sounds,
        [typedSetting]: enabled,
      },
      revision: encounterEffectsAudioState.revision + 1,
    };
    broadcastEncounterEffectsState();
    persistEncounterEffectsSettingsSafely();
  },
);
ipcMain.on(
  'encounter-effects:set-visual-enabled',
  (event, setting: unknown, enabled: unknown) => {
    if (
      !isMasterSender(event.sender.id) ||
      typeof setting !== 'string' ||
      !encounterVisualEffectSettings.has(
        setting as EncounterVisualEffectSetting,
      ) ||
      typeof enabled !== 'boolean'
    ) return;
    const typedSetting = setting as EncounterVisualEffectSetting;
    if (encounterEffectsAudioState.visuals[typedSetting] === enabled) return;
    rememberAppChange();
    encounterEffectsAudioState = {
      ...encounterEffectsAudioState,
      visuals: {
        ...encounterEffectsAudioState.visuals,
        [typedSetting]: enabled,
      },
      revision: encounterEffectsAudioState.revision + 1,
    };
    broadcastEncounterEffectsState();
    persistEncounterEffectsSettingsSafely();
  },
);
ipcMain.handle(
  'soundboard:assign',
  async (
    event,
    index: unknown,
    name: unknown,
    keepExistingFile: unknown,
  ): Promise<SoundboardAssignmentResult> => {
    if (
      !isSoundboardSender(event.sender.id) ||
      typeof index !== 'number' ||
      !Number.isInteger(index) ||
      index < 1 ||
      index > 20 ||
      typeof name !== 'string' ||
      typeof keepExistingFile !== 'boolean'
    ) {
      return { ok: false, error: 'Ação não autorizada.' };
    }

    const trimmedName = name.trim() || `Atalho ${index}`;
    if (trimmedName.length > 40) {
      return { ok: false, error: 'Digite um nome de até 40 caracteres.' };
    }

    const existingSlot = soundboardSlots[index - 1];
    if (keepExistingFile && existingSlot) {
      if (existingSlot.name === trimmedName) return { ok: true };
      rememberAppChange();
      soundboardSlots[index - 1] = { ...existingSlot, name: trimmedName };
      soundboardRevision += 1;
      broadcastSoundboardState();
      return { ok: true };
    }

    const dialogOwner = soundboardWindow;
    if (!dialogOwner || dialogOwner.isDestroyed()) {
      return { ok: false, error: 'Ação não autorizada.' };
    }
    const selection = await dialog.showOpenDialog(dialogOwner, {
      title: `Atribuir som ao botão ${index}`,
      defaultPath: defaultMediaDirectory('SFX', 'music'),
      properties: ['openFile'],
      filters: [{ name: 'Arquivos MP3', extensions: ['mp3'] }],
    });
    if (selection.canceled || selection.filePaths.length === 0) {
      return { ok: false, canceled: true };
    }

    const filePath = selection.filePaths[0];
    if (path.extname(filePath).toLowerCase() !== '.mp3') {
      return { ok: false, error: 'Selecione um arquivo MP3 válido.' };
    }
    try {
      const fileInfo = await stat(filePath);
      if (!fileInfo.isFile() || fileInfo.size > MAX_USER_MEDIA_BYTES) {
        return { ok: false, error: 'O arquivo deve ter no máximo 100 MB.' };
      }
    } catch {
      return { ok: false, error: 'Não foi possível ler o arquivo selecionado.' };
    }

    try {
      const metadata = await parseFile(filePath, { duration: true });
      const container = metadata.format.container?.toLowerCase() ?? '';
      const codec = metadata.format.codec?.toLowerCase() ?? '';
      if (
        !container.includes('mpeg') &&
        !codec.includes('layer 3') &&
        !codec.includes('mp3')
      ) {
        return {
          ok: false,
          error: 'O arquivo tem extensão MP3, mas usa um formato de áudio incompatível.',
        };
      }
    } catch {
      return {
        ok: false,
        error: 'O MP3 não pôde ser decodificado. Converta-o novamente para MP3 (MPEG Layer III).',
      };
    }

    stopSoundboardPlayback(index);
    rememberAppChange();
    soundboardSlots[index - 1] = {
      index,
      name: trimmedName,
      filePath,
    };
    soundboardRevision += 1;
    broadcastSoundboardState();
    return { ok: true };
  },
);

ipcMain.on('soundboard:dispatch', (event, command: unknown) => {
  if (
    (!isSoundboardSender(event.sender.id) &&
      !isControlSender(event.sender.id)) ||
    !isSoundboardCommand(command)
  ) return;

  if (command.type === 'play') {
    const slot = soundboardSlots[command.index - 1];
    if (
      !slot ||
      ((!playerWindow || playerWindow.isDestroyed()) && !hostedSessionServer)
    ) return;
    soundEffectSequence += 1;
    soundEffectSources.set(soundEffectSequence, {
      filePath: slot.filePath,
      index: command.index,
    });
    sendSoundEffect({
      id: soundEffectSequence,
      index: command.index,
      url: `boss-media://sfx/${soundEffectSequence}`,
    });
    return;
  }

  if (command.type === 'stop-all') {
    stopSoundboardPlayback();
    return;
  }

  if (command.type === 'set-volume') {
    const nextVolume = Math.max(0, Math.min(1, command.volume));
    if (soundboardAudioState.volume === nextVolume) return;
    rememberAppChange(undefined, 'soundboard-volume');
    soundboardAudioState = {
      ...soundboardAudioState,
      volume: nextVolume,
    };
    soundboardRevision += 1;
    broadcastSoundboardState();
    return;
  }

  if (command.type === 'toggle-mute') {
    rememberAppChange();
    soundboardAudioState = {
      ...soundboardAudioState,
      muted: !soundboardAudioState.muted,
    };
    soundboardRevision += 1;
    broadcastSoundboardState();
    return;
  }

  if (command.type === 'toggle-loop') {
    rememberAppChange();
    soundboardAudioState = {
      ...soundboardAudioState,
      loop: !soundboardAudioState.loop,
    };
    soundboardRevision += 1;
    broadcastSoundboardState();
    return;
  }

  if (command.type === 'remove') {
    if (!soundboardSlots[command.index - 1]) return;
    rememberAppChange();
    stopSoundboardPlayback(command.index);
    soundboardSlots[command.index - 1] = null;
  } else {
    if (!soundboardSlots.some(Boolean)) return;
    rememberAppChange();
    stopSoundboardPlayback();
    soundboardSlots.fill(null);
  }
  soundboardRevision += 1;
  broadcastSoundboardState();
});

ipcMain.on('soundboard:playback-finished', (event, effectId: unknown) => {
  if (
    !playerWindow ||
    event.sender.id !== playerWindow.webContents.id ||
    typeof effectId !== 'number' ||
    !Number.isInteger(effectId)
  ) return;
  soundEffectSources.delete(effectId);
});

ipcMain.on(
  'encounter-effects:playback-started',
  (event, effectId: unknown) => {
    if (
      !isPlayerSender(event.sender.id) ||
      typeof effectId !== 'number' ||
      !Number.isInteger(effectId)
    ) return;
    releaseCurrentLocalCombatImpact(effectId);
  },
);

ipcMain.on(
  'encounter-effects:playback-finished',
  (event, effectId: unknown) => {
    if (
      !isPlayerSender(event.sender.id) ||
      typeof effectId !== 'number' ||
      !Number.isInteger(effectId)
    ) return;
    encounterEffectSources.delete(effectId);
  },
);

ipcMain.on(
  'soundboard:playback-error',
  (event, effectId: unknown, index: unknown) => {
    if (
      !playerWindow ||
      event.sender.id !== playerWindow.webContents.id ||
      typeof effectId !== 'number' ||
      !Number.isInteger(effectId) ||
      typeof index !== 'number' ||
      !Number.isInteger(index)
    ) return;
    soundEffectSources.delete(effectId);
    if (soundboardWindow && !soundboardWindow.isDestroyed()) {
      soundboardWindow.webContents.send(
        'soundboard:error',
        `O Atalho ${index} não pôde ser reproduzido. Verifique se o arquivo usa MP3 (MPEG Layer III).`,
      );
    }
  },
);

const moveMusicTrack = (direction: -1 | 1) => {
  if (musicTracks.length === 0) return;
  const currentIndex = Math.max(
    0,
    musicTracks.findIndex((track) => track.id === musicState.currentTrackId),
  );
  const nextIndex =
    (currentIndex + direction + musicTracks.length) % musicTracks.length;
  musicState = {
    ...musicState,
    currentTrackId: musicTracks[nextIndex].id,
    isPlaying: battleState.battleStarted,
    playbackVersion: musicState.playbackVersion + 1,
    revision: musicState.revision + 1,
  };
  resetMusicPlayback(musicState.currentTrackId);
};

ipcMain.on('music:track-ended', (event) => {
  if (!playerWindow || event.sender.id !== playerWindow.webContents.id) return;
  if (musicState.loop) return;
  moveMusicTrack(1);
  broadcastMusicState();
});

ipcMain.on('music:progress', (event, playback: unknown) => {
  if (!playerWindow || event.sender.id !== playerWindow.webContents.id) return;
  if (!playback || typeof playback !== 'object') return;
  const candidate = playback as Record<string, unknown>;
  if (
    (candidate.trackId !== null && typeof candidate.trackId !== 'string') ||
    typeof candidate.currentTime !== 'number' ||
    !Number.isFinite(candidate.currentTime) ||
    typeof candidate.duration !== 'number' ||
    !Number.isFinite(candidate.duration)
  ) return;

  musicPlaybackState = {
    trackId: candidate.trackId as string | null,
    currentTime: Math.max(0, candidate.currentTime),
    duration: (() => {
      const metadataDuration = musicTracks.find(
        (track) => track.id === candidate.trackId,
      )?.duration;
      if (metadataDuration && metadataDuration > 0) return metadataDuration;
      return candidate.duration > 0
        ? candidate.duration
        : musicPlaybackState.duration;
    })(),
  };
});

ipcMain.on('music:fadeout-complete', (event) => {
  if (!playerWindow || event.sender.id !== playerWindow.webContents.id) return;
  if (sceneTransitioning) return;
  if (!musicState.isPlaying) return;
  musicState = {
    ...musicState,
    isPlaying: false,
    revision: musicState.revision + 1,
  };
  broadcastMusicState();
});

ipcMain.on('presentation:ready', (event) => {
  if (!playerWindow || event.sender.id !== playerWindow.webContents.id) {
    return;
  }

  playerWindowReady = true;
  playerWindow.show();
  playerWindow.focus();
  syncControlWindow();
  controlWindow?.showInactive();
});

ipcMain.on('background:load-error', (event, message: unknown) => {
  if (
    !playerWindow ||
    event.sender.id !== playerWindow.webContents.id ||
    !masterWindow ||
    typeof message !== 'string'
  ) {
    return;
  }

  const normalizedMessage = message.slice(0, 240);
  for (const window of [masterWindow, sceneEditorWindow]) {
    if (window && !window.isDestroyed()) {
      window.webContents.send('background:error', normalizedMessage);
    }
  }
});

const clampSceneOverflowDamage = (
  state: BattleState,
  previousBoss: BossState,
) => {
  if (previousBoss.shield > 0 || !state.battleStarted) return state;
  const activePhase = scenePlan.phases[scenePlan.activePhaseIndex];
  const directive = activePhase?.bosses.find(
    (item) => item.bossId === previousBoss.id,
  );
  if (!activePhase || directive?.carryOverflowDamage !== false) return state;
  const triggerBoss = state.bosses.find(
    (boss) => boss.id === activePhase.triggerBossId,
  ) ?? sceneBossArchive.get(activePhase.triggerBossId);
  const triggerMaximum = Math.max(1, triggerBoss?.maxHealth ?? previousBoss.maxHealth);
  const damagedBoss = state.bosses.find((boss) => boss.id === previousBoss.id);
  if (!damagedBoss) return state;
  const currentHealth = clampSceneOverflowHealth({
    phase: activePhase,
    directive,
    bossId: previousBoss.id,
    bossMaximum: previousBoss.maxHealth,
    triggerMaximum,
    previousHealth: previousBoss.currentHealth,
    nextHealth: damagedBoss.currentHealth,
  });
  if (currentHealth === damagedBoss.currentHealth) return state;
  return {
    ...state,
    bosses: state.bosses.map((boss) => boss.id === previousBoss.id
      ? { ...boss, currentHealth }
      : boss),
  };
};

const restoreLastAppChange = () => {
  const snapshot = appUndoHistory.pop();
  if (!snapshot) return false;
  lastAppUndoKey = null;
  lastAppUndoRecordedAt = 0;

  pendingHealthTimers.forEach(clearTimeout);
  pendingHealthTimers.clear();
  clearPendingLocalCombatImpacts();
  if (battleMusicStartTimer) clearTimeout(battleMusicStartTimer);
  battleMusicStartTimer = null;
  if (sceneTransitionTimer) clearTimeout(sceneTransitionTimer);
  sceneTransitionTimer = null;
  queuedScenePhaseIndexes.length = 0;
  pendingScenePhaseIndexes.clear();
  pendingBlackoutPhaseIndex = null;
  sceneTransitioning = false;
  resumeMusicAfterManualBlackout = false;
  stopSoundboardPlayback();

  const nextBattleRevision = battleState.revision + 1;
  const nextSceneRevision = scenePlan.revision + 1;
  const nextMusicRevision = musicState.revision + 1;
  const nextPlaybackVersion = musicState.playbackVersion + 1;
  const nextSoundboardRevision = soundboardRevision + 1;
  const nextEffectsRevision = encounterEffectsAudioState.revision + 1;

  battleState = {
    ...structuredClone(snapshot.battleState),
    revision: nextBattleRevision,
  };
  scenePlan = {
    ...structuredClone(snapshot.scenePlan),
    revision: nextSceneRevision,
  };
  sceneMediaPaths.clear();
  snapshot.sceneMediaPaths.forEach(([key, value]) => sceneMediaPaths.set(key, value));
  scenePlaylistPaths.clear();
  snapshot.scenePlaylistPaths.forEach(([key, value]) => scenePlaylistPaths.set(key, value));
  sceneBossArchive.clear();
  snapshot.sceneBossArchive.forEach(([key, value]) => sceneBossArchive.set(
    key,
    structuredClone(value),
  ));
  activeBackgroundFilePath = snapshot.activeBackgroundFilePath;
  configuredBackgroundFilePath = snapshot.configuredBackgroundFilePath;
  configuredBackgroundName = snapshot.configuredBackgroundName;
  pendingBackgroundChange = structuredClone(snapshot.pendingBackgroundChange);
  linkedLibraryEntryId = snapshot.linkedLibraryEntryId;
  backgroundRevision += 1;
  musicTracks.splice(
    0,
    musicTracks.length,
    ...structuredClone(snapshot.musicTracks),
  );
  musicState = {
    ...structuredClone(snapshot.musicState),
    playbackVersion: nextPlaybackVersion,
    revision: nextMusicRevision,
  };
  musicPlaybackState = structuredClone(snapshot.musicPlaybackState);
  soundboardSlots.splice(
    0,
    soundboardSlots.length,
    ...structuredClone(snapshot.soundboardSlots),
  );
  soundboardAudioState = structuredClone(snapshot.soundboardAudioState);
  soundboardRevision = nextSoundboardRevision;
  encounterEffectsAudioState = {
    ...structuredClone(snapshot.encounterEffectsAudioState),
    revision: nextEffectsRevision,
  };

  broadcastBattleState();
  broadcastScenePlan();
  broadcastBackground();
  broadcastMusicState();
  broadcastSoundboardState();
  broadcastEncounterEffectsState();
  persistEncounterEffectsSettingsSafely();
  return true;
};

const applyHealthMutation = (
  type: 'damage' | 'heal' | 'reset-health',
  bossId: string,
  amount = 0,
  options: {
    critical?: boolean;
    minimumHealth?: number;
  } = {},
) => {
  const previousBoss = battleState.bosses.find((boss) => boss.id === bossId);
  if (!previousBoss) return;
  const command =
    type === 'reset-health'
      ? ({ type: 'reset-health', bossId } as const)
      : ({ type, bossId, amount } as const);

  battleState = applyBattleCommand(battleState, command);
  if (type === 'damage') {
    battleState = clampSceneOverflowDamage(battleState, previousBoss);
    const minimumHealth = Math.max(
      0,
      Math.min(previousBoss.maxHealth, Math.trunc(options.minimumHealth ?? 0)),
    );
    if (minimumHealth > 0 && previousBoss.currentHealth > 0) {
      battleState = {
        ...battleState,
        bosses: battleState.bosses.map((boss) =>
          boss.id === bossId
            ? {
              ...boss,
              currentHealth: clampDamageToHealthFloor(
                previousBoss.currentHealth,
                boss.currentHealth,
                minimumHealth,
              ),
            }
            : boss
        ),
      };
    }
  }
  const nextBoss = battleState.bosses.find((boss) => boss.id === bossId);
  if (!nextBoss) return;
  broadcastBattleState(false, false);

  if (
    (playerWindow && !playerWindow.isDestroyed()) ||
    hostedSessionServer
  ) {
    healthEffectSequence += 1;
    const effect: HealthEffect = {
      id: healthEffectSequence,
      bossId,
      type: type === 'damage' ? 'damage' : 'heal',
      intensity: type === 'reset-health'
        ? 'full'
        : type === 'damage' && options.critical
          ? 'critical'
          : 'normal',
      from: previousBoss.currentHealth,
      to: nextBoss.currentHealth,
      maximum: nextBoss.maxHealth,
      shieldFrom: previousBoss.shield,
      shieldTo: nextBoss.shield,
    };
    const preparedSound = prepareEncounterMechanicSound(effect);
    if (playerWindow && !playerWindow.isDestroyed()) {
      enqueueLocalCombatImpact(
        battleState,
        effect,
        preparedSound?.encounterEffect ?? null,
      );
    }
    const server = hostedSessionServer;
    if (server) {
      const hostedSoundUrl = preparedSound
        ? rewriteHostedMediaUrl(
            encounterSoundSourceUrl(preparedSound.optionId),
            (id) => server.mediaUrl(id),
          )
        : '';
      server.publishCombatImpact({
        battle: toPublicBattleState(battleState),
        healthEffect: effect,
        soundEffect: preparedSound && hostedSoundUrl
          ? { ...preparedSound.encounterEffect, url: hostedSoundUrl }
          : null,
      });
    }
  }
  queueCrossedScenePhases(
    bossId,
    previousBoss.currentHealth,
    nextBoss.currentHealth,
  );
};

ipcMain.handle(
  'health:sequence',
  (event, request: HealthSequenceRequest): HealthSequenceResult => {
    if (!isEncounterControllerSender(event.sender.id)) {
      return { ok: false, error: 'Ação não autorizada.' };
    }

    if (
      !request ||
      typeof request.bossId !== 'string' ||
      (request.type !== 'damage' && request.type !== 'heal') ||
      !Number.isFinite(request.total) ||
      request.total <= 0 ||
      !Number.isInteger(request.hits) ||
      request.hits < 1 ||
      request.hits > 1000 ||
      (request.ignoreDamageReduction !== undefined &&
        typeof request.ignoreDamageReduction !== 'boolean')
    ) {
      return { ok: false, error: 'Valor ou quantidade de parcelas inválida.' };
    }

    const boss = battleState.bosses.find((item) => item.id === request.bossId);
    if (!boss) return { ok: false, error: 'Chefão não encontrado.' };

    const total = Math.min(1_000_000, Math.ceil(request.total));
    const effectiveAttributes = deriveStatusAttributes(
      {
        attack: boss.attack,
        rangedAttack: boss.rangedAttack,
        skills: boss.skills,
        meleeDefense: boss.defense,
        rangedDefense: boss.rangedDefense,
        damageReduction: boss.damageReduction,
        shield: boss.shield,
      },
      boss.activeStatuses,
      encounterEffectsAudioState.general.automaticStatusEffects,
    );
    const { effectiveAmountPerHit } = calculateHealthSequence({
      type: request.type,
      total,
      hits: request.hits,
      damageReduction: effectiveAttributes.values.damageReduction,
      ignoreDamageReduction: request.ignoreDamageReduction,
    });

    rememberAppChange();
    applyHealthMutation(request.type, request.bossId, effectiveAmountPerHit);

    if (request.hits > 1) {
      const startedAt = Date.now();
      let nextHit = 1;
      const scheduleNextHit = () => {
        const targetDelay = nextHit * 150;
        const remainingDelay = Math.max(0, targetDelay - (Date.now() - startedAt));
        const timer = setTimeout(() => {
          pendingHealthTimers.delete(timer);
          applyHealthMutation(
            request.type,
            request.bossId,
            effectiveAmountPerHit,
          );
          nextHit += 1;
          if (nextHit < request.hits) scheduleNextHit();
        }, remainingDelay);
        pendingHealthTimers.add(timer);
      };
      scheduleNextHit();
    }

    return {
      ok: true,
      hits: request.hits,
      amountPerHit: effectiveAmountPerHit,
    };
  },
);

ipcMain.handle(
  'player-combat:area-damage',
  (event, request: unknown): AreaDamageResult => {
    if (!isEncounterControllerSender(event.sender.id)) {
      return { ok: false, appliedPlayers: 0, skippedPlayers: [], error: 'Ação não autorizada.' };
    }
    if (!isAreaDamageRequest(request)) {
      return { ok: false, appliedPlayers: 0, skippedPlayers: [], error: 'Dano em área inválido.' };
    }
    if (!hostedSessionServer) {
      return {
        ok: false,
        appliedPlayers: 0,
        skippedPlayers: [],
        error: 'Não há uma sessão multiplayer hospedada.',
      };
    }
    return hostedSessionServer.applyAreaDamage(request);
  },
);

ipcMain.handle(
  'player-combat:direct-damage',
  async (
    event,
    request: DirectPlayerDamageRequest,
  ): Promise<PlayerTargetActionResult> => {
    if (!isEncounterControllerSender(event.sender.id)) {
      return {
        ok: false,
        appliedPlayers: 0,
        skippedPlayers: [],
        error: 'Ação não autorizada.',
      };
    }
    if (!isDirectPlayerDamageRequest(request) || !hostedSessionServer) {
      return {
        ok: false,
        appliedPlayers: 0,
        skippedPlayers: [],
        error: hostedSessionServer
          ? 'Dano direcionado inválido.'
          : 'Não há uma sessão multiplayer hospedada.',
      };
    }
    return await hostedSessionServer.applyDirectPlayerDamage(request);
  },
);

ipcMain.handle(
  'player-combat:apply-status',
  (
    event,
    request: PlayerStatusRequest,
  ): PlayerTargetActionResult => {
    if (!isEncounterControllerSender(event.sender.id)) {
      return {
        ok: false,
        appliedPlayers: 0,
        skippedPlayers: [],
        error: 'Ação não autorizada.',
      };
    }
    const status = normalizeActiveStatuses([request?.status])[0];
    if (
      !hostedSessionServer ||
      !request ||
      !Array.isArray(request.playerIds) ||
      request.playerIds.length < 1 ||
      request.playerIds.length > 10 ||
      !status
    ) {
      return {
        ok: false,
        appliedPlayers: 0,
        skippedPlayers: [],
        error: hostedSessionServer
          ? 'Condição direcionada inválida.'
          : 'Não há uma sessão multiplayer hospedada.',
      };
    }
    return hostedSessionServer.applyPlayerStatus({
      playerIds: request.playerIds,
      status,
    });
  },
);

const beginBossStatusTurn = (bossId: string) => {
  if (!battleState.battleStarted) return;
  const previousBoss = battleState.bosses.find((boss) => boss.id === bossId);
  if (
    !previousBoss ||
    previousBoss.setupStatus !== 'ready' ||
    previousBoss.currentHealth <= 0
  ) return;

  rememberAppChange();
  const advancedTurn = advanceBossTurn(battleState, bossId, randomInt);
  battleState = clampSceneOverflowDamage(advancedTurn.state, previousBoss);
  broadcastBattleState(false, false);
  const nextBoss = battleState.bosses.find((boss) => boss.id === bossId);

  if ((playerWindow && !playerWindow.isDestroyed()) || hostedSessionServer) {
    let publishedVisibleImpact = false;
    for (const tick of advancedTurn.ticks) {
      const rolledDice = tick.rolls.length > 0;
      if (rolledDice) {
        const rollResult: EncounterRollResult = {
          id: `status:${bossId}:${tick.statusId}:${randomUUID()}`,
          participantId: `boss:${bossId}`,
          label: tick.statusName,
          expression: tick.formula,
          rolls: tick.rolls,
          modifier: tick.modifier,
          total: tick.damage,
          outcome: 'neutral',
          category: 'status',
          createdAt: Date.now(),
          retainedByParticipantId: encounterTurnState.activeParticipantId,
        };
        if (hostedSessionServer) {
          hostedSessionServer.publishRollResult(rollResult);
        } else {
          encounterTurnState = {
            ...encounterTurnState,
            rollResults: [...(encounterTurnState.rollResults ?? []), rollResult],
            revision: encounterTurnState.revision + 1,
          };
          broadcastEncounterTurnState();
        }
      }
      const visibleFloor = nextBoss?.currentHealth ?? 0;
      const visibleFrom = Math.max(visibleFloor, tick.from);
      const visibleTo = Math.max(visibleFloor, tick.to);
      if (visibleFrom <= visibleTo) {
        if (rolledDice) publishDiceRollSound();
        continue;
      }
      healthEffectSequence += 1;
      const effect: HealthEffect = {
        id: healthEffectSequence,
        bossId,
        type: 'damage',
        intensity: 'normal',
        from: visibleFrom,
        to: visibleTo,
        maximum: previousBoss.maxHealth,
        shieldFrom: previousBoss.shield,
        shieldTo: previousBoss.shield,
        source: {
          kind: 'status',
          statusId: tick.statusId,
          name: tick.statusName,
          formula: tick.formula,
        },
      };
      const preparedDiceSound = rolledDice
        ? prepareEncounterSound('dice-roll')
        : null;
      publishedVisibleImpact = true;
      if (playerWindow && !playerWindow.isDestroyed()) {
        enqueueLocalCombatImpact(
          battleState,
          effect,
          preparedDiceSound?.encounterEffect ?? null,
        );
      }
      const server = hostedSessionServer;
      const hostedDiceUrl = server && preparedDiceSound
        ? rewriteHostedMediaUrl(
          encounterSoundSourceUrl(preparedDiceSound.optionId),
          (id) => server.mediaUrl(id),
        )
        : '';
      hostedSessionServer?.publishCombatImpact({
        battle: toPublicBattleState(battleState),
        healthEffect: effect,
        soundEffect: preparedDiceSound && hostedDiceUrl
          ? { ...preparedDiceSound.encounterEffect, url: hostedDiceUrl }
          : null,
      });
    }
    if (!publishedVisibleImpact) {
      if (playerWindow && !playerWindow.isDestroyed()) {
        playerWindow.webContents.send('battle:state-changed', battleState);
      }
      hostedSessionServer?.publishBattleState(toPublicBattleState(battleState));
    }
  }
  if (nextBoss) {
    queueCrossedScenePhases(
      bossId,
      previousBoss.currentHealth,
      nextBoss.currentHealth,
    );
  }
};

ipcMain.on('battle:dispatch', (event, command: unknown) => {
  if (!isEncounterControllerSender(event.sender.id)) {
    return;
  }

  if (!isBattleCommand(command)) {
    return;
  }

  if (command.type === 'start-turn') {
    beginBossStatusTurn(command.bossId);
    return;
  }

  if (
    command.type === 'damage' ||
    command.type === 'heal' ||
    command.type === 'reset-health'
  ) {
    rememberAppChange();
    applyHealthMutation(
      command.type,
      command.bossId,
      command.type === 'reset-health' ? 0 : command.amount,
    );
    return;
  }

  const commandSnapshot = [
    'select-boss',
    'mark-identity-unprepared',
    'mark-action-unprepared',
  ].includes(command.type)
    ? null
    : captureAppUndoSnapshot();

  if (
    ['start-battle', 'end-battle', 'reset-all'].includes(command.type) &&
    (scenePlan.blackoutActive || sceneTransitioning)
  ) {
    if (sceneTransitionTimer) clearTimeout(sceneTransitionTimer);
    sceneTransitionTimer = null;
    queuedScenePhaseIndexes.length = 0;
    pendingScenePhaseIndexes.clear();
    pendingBlackoutPhaseIndex = null;
    sceneTransitioning = false;
    if (!scenePlan.blackoutActive) {
      scenePlan = { ...scenePlan, blackoutActive: true };
    }
    releaseSceneBlackout(false);
  }

  battleState = applyBattleCommand(battleState, command);
  let backgroundChanged = false;


  if (command.type === 'commit-background' && pendingBackgroundChange) {
    if (pendingBackgroundChange.type === 'set') {
      configuredBackgroundFilePath = pendingBackgroundChange.filePath;
      configuredBackgroundName = pendingBackgroundChange.name;
      activeBackgroundFilePath = configuredBackgroundFilePath;
      battleState = {
        ...battleState,
        backgroundName: configuredBackgroundName,
      };
    } else {
      configuredBackgroundFilePath = null;
      configuredBackgroundName = null;
      activeBackgroundFilePath = null;
      battleState = { ...battleState, backgroundName: null };
    }

    pendingBackgroundChange = null;
    backgroundRevision += 1;
    backgroundChanged = true;
  }

  if (command.type === 'reset-all') {
    linkedLibraryEntryId = null;
    pendingHealthTimers.forEach(clearTimeout);
    pendingHealthTimers.clear();
    clearPendingLocalCombatImpacts();
    activeBackgroundFilePath = null;
    configuredBackgroundFilePath = null;
    configuredBackgroundName = null;
    pendingBackgroundChange = null;
    backgroundRevision += 1;
    backgroundChanged = true;
    resetScenePlan();
  }

  if (command.type === 'start-battle') {
    if (sceneTransitionTimer) clearTimeout(sceneTransitionTimer);
    sceneTransitionTimer = null;
    queuedScenePhaseIndexes.length = 0;
    pendingScenePhaseIndexes.clear();
    sceneTransitioning = false;
    pendingBlackoutPhaseIndex = null;
    scenePlan = {
      ...scenePlan,
      activePhaseIndex: -1,
      activePhaseIds: Object.fromEntries(
        scenePlan.bossSlots.map((slot) => [slot.bossId, null]),
      ),
      blackoutActive: false,
    };
    activeBackgroundFilePath = configuredBackgroundFilePath;
    battleState = { ...battleState, backgroundName: configuredBackgroundName };
    backgroundRevision += 1;
    backgroundChanged = true;
    if (scenePlan.phases[0]) applyScenePhase(0);
    if (battleMusicStartTimer) clearTimeout(battleMusicStartTimer);
    battleMusicStartTimer = setTimeout(() => {
      battleMusicStartTimer = null;
      if (!battleState.battleStarted || !musicState.currentTrackId) return;
      musicState = {
        ...musicState,
        isPlaying: true,
        playbackVersion: musicState.playbackVersion + 1,
        revision: musicState.revision + 1,
      };
      broadcastMusicState();
    }, 1000);
  }

  if (
    command.type === 'configure' ||
    command.type === 'add-boss' ||
    command.type === 'remove-boss'
  ) syncSceneBossSlots();

  if (command.type === 'end-battle' || command.type === 'reset-all') {
    if (sceneTransitionTimer) {
      clearTimeout(sceneTransitionTimer);
      sceneTransitionTimer = null;
    }
    queuedScenePhaseIndexes.length = 0;
    pendingScenePhaseIndexes.clear();
    pendingBlackoutPhaseIndex = null;
    sceneTransitioning = false;
    if (scenePlan.blackoutActive) {
      releaseSceneBlackout();
    }
    if (battleMusicStartTimer) {
      clearTimeout(battleMusicStartTimer);
      battleMusicStartTimer = null;
    }
    if (musicState.isPlaying && (
      (playerWindow && !playerWindow.isDestroyed()) || hostedSessionServer
    )) {
      sendMusicFadeOut(1600);
    } else if (musicState.isPlaying) {
      musicState = {
        ...musicState,
        isPlaying: false,
        revision: musicState.revision + 1,
      };
      broadcastMusicState();
    }
  }

  broadcastBattleState();
  if (backgroundChanged) broadcastBackground();
  if (commandSnapshot) rememberAppChange(commandSnapshot);
});

const createMediaResponse = async (
  request: Request,
  filePath: string,
  contentType: string,
  responseOrigin: string | null,
) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(null, {
      status: 405,
      headers: { Allow: 'GET, HEAD' },
    });
  }

  const fileInfo = await stat(filePath);
  const fileSize = fileInfo.size;
  const rangeHeader = request.headers.get('range');
  const baseHeaders = new Headers({
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store',
    'Content-Type': contentType,
  });
  if (responseOrigin) {
    baseHeaders.set('Access-Control-Allow-Origin', responseOrigin);
    baseHeaders.set('Vary', 'Origin');
  }

  const range = resolveByteRange(rangeHeader, fileSize);
  if (!fileInfo.isFile() || !range) {
    baseHeaders.set('Content-Range', `bytes */${fileSize}`);
    return new Response(null, { status: 416, headers: baseHeaders });
  }

  const { start, end, partial } = range;
  const contentLength = end - start + 1;
  baseHeaders.set('Content-Length', String(contentLength));
  if (partial) {
    baseHeaders.set('Content-Range', `bytes ${start}-${end}/${fileSize}`);
  }

  if (request.method === 'HEAD') {
    return new Response(null, {
      status: partial ? 206 : 200,
      headers: baseHeaders,
    });
  }

  const nodeStream = createReadStream(filePath, { start, end });
  const webStream = Readable.toWeb(nodeStream) as unknown as BodyInit;
  return new Response(webStream, {
    status: partial ? 206 : 200,
    headers: baseHeaders,
  });
};

app.whenReady().then(async () => {
  const [libraryEntries] = await Promise.all([
    loadBossLibrary(),
    loadEncounterMechanicSounds(),
    loadEncounterEffectsSettings(),
  ]);
  bossLibraryEntries = libraryEntries;
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );

  await protocol.handle('boss-asset', async (request) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Método não permitido.', { status: 405 });
    }
    const assetPath = resolveBundledAssetPath(new URL(request.url));
    if (!assetPath) {
      return new Response('Asset não encontrado.', { status: 404 });
    }
    return net.fetch(pathToFileURL(assetPath).toString(), {
      method: request.method,
    });
  });

  await protocol.handle('boss-media', async (request) => {
    try {
      const requestUrl = new URL(request.url);
      const originPolicy = resolveMediaOriginPolicy(
        request.headers.get('origin'),
        rendererOrigin(),
      );
      if (!originPolicy.allowed) {
        return new Response('Origem não autorizada.', { status: 403 });
      }
      let mediaPath: string | null = null;
      let errorLabel = 'mídia';

      if (requestUrl.hostname === 'background') {
        mediaPath = activeBackgroundFilePath;
        errorLabel = 'fundo';
      } else if (requestUrl.hostname === 'audio') {
        const trackId = decodeURIComponent(requestUrl.pathname.slice(1));
        mediaPath =
          musicTracks.find((track) => track.id === trackId)?.filePath ?? null;
        errorLabel = 'faixa';
      } else if (requestUrl.hostname === 'sfx') {
        const effectId = Number(
          decodeURIComponent(requestUrl.pathname.slice(1)),
        );
        mediaPath = Number.isInteger(effectId)
          ? soundEffectSources.get(effectId)?.filePath ?? null
          : null;
        errorLabel = 'efeito sonoro';
      } else if (requestUrl.hostname === 'encounter-sfx') {
        const effectId = Number(
          decodeURIComponent(requestUrl.pathname.slice(1)),
        );
        mediaPath = Number.isInteger(effectId)
          ? encounterEffectSources.get(effectId) ?? null
          : null;
        errorLabel = 'efeito do encontro';
      } else if (requestUrl.hostname === 'encounter-sound-preview') {
        const optionId = decodeURIComponent(requestUrl.pathname.slice(1));
        mediaPath = encounterSoundOptions.find(
          (option) => option.id === optionId,
        )?.filePath ?? null;
        errorLabel = 'amostra do efeito';
      } else if (requestUrl.hostname === 'scene-audio') {
        const mediaKey = decodeURIComponent(requestUrl.pathname.slice(1));
        const [phaseId, rawSlot, trackId] = mediaKey.split(':');
        const pending = ['transitionSound', 'music'].includes(rawSlot)
          ? pendingScenePlaylists.get(sceneMediaKey(
              phaseId,
              rawSlot as SceneAudioSlot,
            ))
          : null;
        mediaPath = (trackId ? pending?.paths.get(trackId) : null) ??
          scenePlaylistPaths.get(mediaKey) ??
          sceneMediaPaths.get(mediaKey) ??
          null;
        errorLabel = 'áudio da transição';
      }

      if (!mediaPath) {
        return new Response(`${errorLabel} não encontrada.`, { status: 404 });
      }

      if (
        requestUrl.hostname === 'audio' ||
        requestUrl.hostname === 'sfx' ||
        requestUrl.hostname === 'encounter-sfx' ||
        requestUrl.hostname === 'encounter-sound-preview' ||
        requestUrl.hostname === 'scene-audio'
      ) {
        return await createMediaResponse(
          request,
          mediaPath,
          'audio/mpeg',
          originPolicy.responseOrigin,
        );
      }
      const backgroundVideoMimeType = backgroundVideoMimeTypeForFile(mediaPath);
      if (backgroundVideoMimeType) {
        return await createMediaResponse(
          request,
          mediaPath,
          backgroundVideoMimeType,
          originPolicy.responseOrigin,
        );
      }
      return await net.fetch(pathToFileURL(mediaPath).toString(), {
        method: request.method,
        headers: request.headers,
      });
    } catch {
      return new Response('Não foi possível carregar a mídia.', {
        status: 500,
      });
    }
  });

  createLauncherWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', (event) => {
  allowAppClose = true;
  allowControlWindowClose = true;
  controlWindow?.setClosable(true);
  pendingHealthTimers.forEach(clearTimeout);
  pendingHealthTimers.clear();
  clearPendingLocalCombatImpacts();
  soundEffectSources.clear();
  encounterEffectSources.clear();
  if (battleMusicStartTimer) clearTimeout(battleMusicStartTimer);
  if (sceneTransitionTimer) clearTimeout(sceneTransitionTimer);
  if (playerWindowCloseTimer) clearTimeout(playerWindowCloseTimer);
  if (masterFocusTimer) clearTimeout(masterFocusTimer);

  if (
    !gracefulQuitCompleted &&
    (hostedSessionServer !== null || hostedSessionStopPromise !== null)
  ) {
    event.preventDefault();
    if (gracefulQuitInProgress) return;
    gracefulQuitInProgress = true;
    void stopHostedSession('server-shutdown').finally(() => {
      gracefulQuitCompleted = true;
      gracefulQuitInProgress = false;
      app.quit();
    });
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createLauncherWindow();
  }
});
