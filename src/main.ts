import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  net,
  protocol,
  screen,
  session,
} from 'electron';
import { randomInt, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
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
  chooseEncounterSoundIndex,
  createInitialBoss,
  getEncounterSoundEffectKind,
  initialEncounterEffectsState,
  initialBattleState,
  isEncounterSoundEnabled,
  isEncounterSoundEffectKind,
  isBattleCommand,
  type BackgroundSelectionResult,
  type BackgroundState,
  type BattleState,
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
  type MusicCommand,
  type MusicPlaybackState,
  type MusicSelectionResult,
  type MusicState,
  type SoundboardAssignmentResult,
  type SoundboardState,
  isMusicCommand,
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
import {
  backgroundImageExtensions,
  backgroundMediaTypeForFile,
  backgroundVideoExtensions,
  backgroundVideoMimeTypeForFile,
  resolveByteRange,
  resolveMediaOriginPolicy,
} from './shared/media';
import type { RendererRole } from './shared/preload';
import {
  normalizeActiveStatuses,
  type ActiveBossStatus,
} from './shared/status';
import {
  deriveStatusAttributes,
  reconcileStatusIncompatibilities,
} from './shared/status-rules';
import {
  adjacentScenePlaylistTrackId,
  applySceneBossPatch,
  createScenePlan,
  normalizeSceneBossPatch,
  sceneTransitionSourceIndex,
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

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let masterWindow: BrowserWindow | null = null;
let playerWindow: BrowserWindow | null = null;
let controlWindow: BrowserWindow | null = null;
let launcherWindow: BrowserWindow | null = null;
let musicWindow: BrowserWindow | null = null;
let libraryWindow: BrowserWindow | null = null;
let sceneEditorWindow: BrowserWindow | null = null;
let scenePlaylistWindow: BrowserWindow | null = null;
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
let scenePlaylistContext: {
  phaseId: string;
  phaseName: string;
  slot: SceneAudioSlot;
} | null = null;
const sceneBossArchive = new Map(battleState.bosses.map((boss) => [boss.id, boss]));
const queuedScenePhaseIndexes: number[] = [];
const pendingScenePhaseIndexes = new Set<number>();
let sceneTransitioning = false;
let sceneTransitionSequence = 0;
let sceneTransitionTimer: ReturnType<typeof setTimeout> | null = null;
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
};
let encounterEffectsAudioState = {
  volume: initialEncounterEffectsState.volume,
  general: { ...initialEncounterEffectsState.general },
  sounds: { ...initialEncounterEffectsState.sounds },
  visuals: { ...initialEncounterEffectsState.visuals },
  revision: initialEncounterEffectsState.revision,
};
let masterFocusTimer: ReturnType<typeof setTimeout> | null = null;
let battleMusicStartTimer: ReturnType<typeof setTimeout> | null = null;
let allowAppClose = false;
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
const CONTROL_PANEL_MIN_EXPANDED_HEIGHT = 350;
const CONTROL_PANEL_PREFERRED_HEIGHT = 360;
const CONTROL_PANEL_MAX_EXPANDED_HEIGHT = 430;
const PLAYER_MIN_CONTENT_WIDTH = 960;
const PLAYER_PREFERRED_CONTENT_WIDTH = 1280;
const PLAYER_MAX_OUTER_WIDTH = 1920;
const PLAYER_MAX_OUTER_HEIGHT = 1040;
const PLAYER_NATIVE_FRAME_BUDGET = 48;
const DOCKED_WINDOW_GAP = 12;
let controlPanelMinimized = false;
let controlPanelExpandedHeight = 390;
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
  'bossSlots' | 'showPhaseMarkers' | 'activePhaseIndex'
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
        const filePath = await findPersonalSfxFile(path.join(directory, fileName));
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
      schemaVersion: 2,
      volume: encounterEffectsAudioState.volume,
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
    typeof value.soundboard.muted === 'boolean'
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
    templates: bosses.map((boss) => ({ ...boss })),
    phases: [{
      id: 'phase-1',
      name: 'Fase 1',
      triggerBossId: slots[0]?.bossId ?? 'boss-1',
      startPercent: 100,
      endPercent: 0,
      transition: 'fade',
      background: null,
      transitionSound: null,
      music: null,
      bosses: slots.map((slot) => ({
        bossId: slot.bossId,
        presence: 'inherit',
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
  const phases = value.phases.flatMap((rawPhase): StoredScenePhase[] => {
    if (
      !isRecord(rawPhase) ||
      !isSafeSceneIdentifier(rawPhase.id) ||
      typeof rawPhase.name !== 'string' ||
      typeof rawPhase.triggerBossId !== 'string' ||
      !knownIds.has(rawPhase.triggerBossId) ||
      !isFiniteStoredNumber(rawPhase.startPercent) ||
      !isFiniteStoredNumber(rawPhase.endPercent) ||
      !['fade', 'blackout', 'explosion'].includes(String(rawPhase.transition)) ||
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
    return [{
      id: rawPhase.id,
      name: rawPhase.name,
      triggerBossId: rawPhase.triggerBossId,
      startPercent: rawPhase.startPercent,
      endPercent: rawPhase.endPercent,
      transition: rawPhase.transition as SceneTransitionKind,
      background,
      transitionSound,
      music,
      bosses: directives,
    }];
  });
  if (phases.length !== value.phases.length || validateSceneRanges(phases)) return null;
  const activePhaseIndex = Number.isInteger(value.activePhaseIndex)
    ? clampInteger(value.activePhaseIndex as number, -1, phases.length - 1)
    : -1;
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
    phases,
    showPhaseMarkers: value.showPhaseMarkers === true,
    activePhaseIndex,
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
      skills: clampInteger(rawBoss.skills as number, -999, 999),
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
  for (const window of [masterWindow, musicWindow, playerWindow]) {
    if (window && !window.isDestroyed()) {
      window.webContents.send('music:state-changed', nextState);
    }
  }
};

const broadcastMusicPlayback = () => {
  if (musicWindow && !musicWindow.isDestroyed()) {
    musicWindow.webContents.send('music:playback-changed', musicPlaybackState);
  }
};

const broadcastSoundboardState = () => {
  const state = getSoundboardState();
  for (const window of [musicWindow, playerWindow]) {
    if (window && !window.isDestroyed()) {
      window.webContents.send('soundboard:state-changed', state);
    }
  }
};

const broadcastEncounterEffectsState = () => {
  const state = getEncounterEffectsState();
  for (const window of [masterWindow, playerWindow, controlWindow]) {
    if (window && !window.isDestroyed()) {
      window.webContents.send('encounter-effects:state-changed', state);
    }
  }
};

const playEncounterMechanicSound = (effect: HealthEffect) => {
  const soundKind = getEncounterSoundEffectKind(effect);
  if (
    !soundKind ||
    !playerWindow ||
    playerWindow.isDestroyed() ||
    musicState.universalMuted ||
    encounterEffectsAudioState.volume <= 0 ||
    !isEncounterSoundEnabled(encounterEffectsAudioState, soundKind)
  ) return;

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
  const filePath = availableSounds[soundIndex]?.filePath ?? null;
  if (!filePath) return;
  previousEncounterSoundIndex.set(soundKind, soundIndex);
  encounterSoundGroupLastPlayedAt.set(soundKind, playbackTime);

  encounterEffectSequence += 1;
  encounterEffectSources.set(encounterEffectSequence, filePath);
  const encounterEffect: EncounterSoundEffect = {
    id: encounterEffectSequence,
    kind: soundKind,
    url: `boss-media://encounter-sfx/${encounterEffectSequence}`,
  };
  playerWindow.webContents.send('encounter-effects:play', encounterEffect);
};

const stopSoundboardPlayback = (index?: number) => {
  if (playerWindow && !playerWindow.isDestroyed()) {
    playerWindow.webContents.send('soundboard:stop', { index });
  }
};

const resizeMusicWindow = (soundboardOpen: boolean) => {
  if (!musicWindow || musicWindow.isDestroyed()) return;
  const currentBounds = musicWindow.getBounds();
  const { workArea } = screen.getDisplayMatching(currentBounds);
  const availableWidth = Math.max(
    musicWindow.getMinimumSize()[0],
    workArea.x + workArea.width - currentBounds.x,
  );
  const width = Math.min(soundboardOpen ? 1080 : 590, availableWidth);
  musicWindow.setBounds({
    x: currentBounds.x,
    y: currentBounds.y,
    width,
    height: currentBounds.height,
  });
};

const resetMusicPlayback = (trackId = musicState.currentTrackId) => {
  const duration =
    musicTracks.find((track) => track.id === trackId)?.duration ?? 0;
  musicPlaybackState = { trackId, currentTime: 0, duration };
  broadcastMusicPlayback();
};

const createMusicWindow = () => {
  if (musicWindow && !musicWindow.isDestroyed()) {
    if (musicWindow.isMinimized()) musicWindow.restore();
    musicWindow.show();
    musicWindow.focus();
    return musicWindow;
  }

  const { workArea } = screen.getPrimaryDisplay();
  const width = Math.min(590, workArea.width);
  const height = Math.min(750, workArea.height);
  const minimumHeight = Math.min(560, height);
  const window = new BrowserWindow({
    icon: applicationIcon(),
    height,
    x: workArea.x + Math.round((workArea.width - width) / 2),
    y: workArea.y + Math.round((workArea.height - height) / 2),
    width,
    minWidth: 470,
    minHeight: minimumHeight,
    maxHeight: height,
    title: 'Trilha Sonora - BossBar T20',
    backgroundColor: '#111117',
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadFile('music'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  musicWindow = window;
  window.webContents.on('did-finish-load', () => {
    if (!window.isDestroyed()) {
      window.webContents.send('music:state-changed', getMusicState());
      window.webContents.send('music:playback-changed', musicPlaybackState);
      window.webContents.send('soundboard:state-changed', getSoundboardState());
    }
  });
  loadRenderer(window, 'music');
  window.on('closed', () => {
    if (musicWindow === window) musicWindow = null;
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
    }
  });
  loadRenderer(window, 'scene-editor');
  window.on('closed', () => {
    if (sceneEditorWindow === window) {
      scenePlaylistWindow?.close();
      scenePlaylistContext = null;
      sceneEditorWindow = null;
      allowSceneEditorClose = false;
      pendingSceneMediaPaths.clear();
      pendingScenePlaylists.clear();
    }
  });
  return window;
};

const createScenePlaylistWindow = () => {
  if (!scenePlaylistContext) return null;
  const title = scenePlaylistContext.slot === 'music'
    ? 'Playlist da Fase - BossBar T20'
    : 'Playlist da Transição - BossBar T20';
  if (scenePlaylistWindow && !scenePlaylistWindow.isDestroyed()) {
    scenePlaylistWindow.setTitle(title);
    if (scenePlaylistWindow.isMinimized()) scenePlaylistWindow.restore();
    scenePlaylistWindow.show();
    scenePlaylistWindow.focus();
    const state = getScenePlaylistState(
      scenePlaylistContext.phaseId,
      scenePlaylistContext.slot,
    );
    if (state) scenePlaylistWindow.webContents.send('scene:playlist-changed', state);
    return scenePlaylistWindow;
  }

  const { workArea } = screen.getDisplayMatching(
    sceneEditorWindow?.getBounds() ?? screen.getPrimaryDisplay().bounds,
  );
  const width = Math.min(640, workArea.width);
  const height = Math.min(720, workArea.height);
  const window = new BrowserWindow({
    icon: applicationIcon(),
    width,
    height,
    x: workArea.x + Math.round((workArea.width - width) / 2),
    y: workArea.y + Math.round((workArea.height - height) / 2),
    minWidth: Math.min(500, width),
    minHeight: Math.min(540, height),
    maxHeight: workArea.height,
    title,
    backgroundColor: '#100d13',
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadFile('scene-playlist'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  scenePlaylistWindow = window;
  window.webContents.on('did-finish-load', () => {
    if (window.isDestroyed() || !scenePlaylistContext) return;
    const state = getScenePlaylistState(
      scenePlaylistContext.phaseId,
      scenePlaylistContext.slot,
    );
    if (state) window.webContents.send('scene:playlist-changed', state);
  });
  loadRenderer(window, 'scene-playlist');
  window.on('closed', () => {
    if (scenePlaylistWindow === window) scenePlaylistWindow = null;
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
  const masterHeight = Math.min(660, workArea.height);
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
  window.on('show', () => controlWindow?.showInactive());

  window.on('close', (event) => {
    const { x, y } = window.getBounds();
    lastPlayerWindowPosition = { x, y };
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
    maxHeight: Math.min(700, screen.getPrimaryDisplay().workArea.height),
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
    if (allowAppClose) return;
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
    musicWindow?.close();
    allowSceneEditorClose = true;
    sceneEditorWindow?.close();
    playerWindow?.close();
    if (controlWindow && !controlWindow.isDestroyed()) {
      allowControlWindowClose = true;
      controlWindow.setClosable(true);
      controlWindow.close();
    }
  });
};

const createLauncherWindow = () => {
  if (launcherWindow && !launcherWindow.isDestroyed()) {
    launcherWindow.show();
    launcherWindow.focus();
    return launcherWindow;
  }

  const { workArea } = screen.getPrimaryDisplay();
  const width = Math.min(660, workArea.width);
  const height = Math.min(430, workArea.height);
  const window = new BrowserWindow({
    icon: applicationIcon(),
    width,
    height,
    x: workArea.x + Math.round((workArea.width - width) / 2),
    y: workArea.y + Math.round((workArea.height - height) / 2),
    minWidth: Math.min(580, width),
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

const broadcastBattleState = () => {
  for (const window of [
    masterWindow,
    playerWindow,
    controlWindow,
    sceneEditorWindow,
    scenePlaylistWindow,
  ]) {
    if (window && !window.isDestroyed()) {
      window.webContents.send('battle:state-changed', battleState);
    }
  }
};

const isPresentationOpen = () =>
  Boolean(playerWindow && !playerWindow.isDestroyed());

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
  const phaseName = scenePlaylistContext?.phaseId === phaseId
    ? scenePlaylistContext.phaseName
    : getScenePlaylistPhase(phaseId)?.name ?? 'Fase';
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
  for (const window of [sceneEditorWindow, scenePlaylistWindow]) {
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
};

const resetScenePlan = () => {
  if (sceneTransitionTimer) clearTimeout(sceneTransitionTimer);
  sceneTransitionTimer = null;
  queuedScenePhaseIndexes.length = 0;
  pendingScenePhaseIndexes.clear();
  sceneTransitioning = false;
  sceneMediaPaths.clear();
  pendingSceneMediaPaths.clear();
  scenePlaylistPaths.clear();
  pendingScenePlaylists.clear();
  scenePlaylistContext = null;
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
  scenePlan = {
    ...scenePlan,
    bossSlots: nextSlots,
    phases: scenePlan.phases.map((phase) => ({
      ...phase,
      bosses: nextSlots.map((slot) =>
        phase.bosses.find((directive) => directive.bossId === slot.bossId) ?? {
          bossId: slot.bossId,
          presence: 'inherit',
          patch: {},
        },
      ),
    })),
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
      typeof rawPhase.startPercent !== 'number' ||
      typeof rawPhase.endPercent !== 'number' ||
      !['fade', 'blackout', 'explosion'].includes(String(rawPhase.transition)) ||
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
    return [{
      id: phaseId,
      name: rawPhase.name.trim().slice(0, 60) || 'Fase',
      triggerBossId: rawPhase.triggerBossId,
      startPercent: Math.round(rawPhase.startPercent),
      endPercent: Math.round(rawPhase.endPercent),
      transition: rawPhase.transition as SceneTransitionKind,
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

const sceneTransitionDuration = (kind: SceneTransitionKind) =>
  kind === 'blackout' ? 1800 : kind === 'explosion' ? 1600 : 1400;

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
    if (!boss) continue;
    const patched = applySceneBossPatch(boss, directive.patch);
    currentById.set(directive.bossId, {
      ...patched,
      setupStatus: 'ready',
      identityPrepared: true,
      currentHealth: entering && directive.patch.maxHealth !== undefined
        ? patched.maxHealth
        : patched.currentHealth,
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
  const transitionSourceIndex = sceneTransitionSourceIndex(
    phaseIndex,
    scenePlan.phases.length,
  );
  const transitionPhase = scenePlan.phases[transitionSourceIndex] ?? phase;
  const durationMs = sceneTransitionDuration(transitionPhase.transition);
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
    durationMs,
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
  };
  if (playerWindow && !playerWindow.isDestroyed()) {
    playerWindow.webContents.send('scene:transition', event);
  }
  sceneTransitionTimer = setTimeout(() => {
    sceneTransitionTimer = null;
    applyScenePhase(phaseIndex);
    sceneTransitionTimer = setTimeout(() => {
      sceneTransitionTimer = null;
      pendingScenePhaseIndexes.delete(phaseIndex);
      sceneTransitioning = false;
      processScenePhaseQueue();
    }, Math.ceil(durationMs / 2));
  }, Math.floor(durationMs / 2));
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
  maximumHealth: number,
) => {
  if (nextHealth >= previousHealth || maximumHealth <= 0) return;
  const previousPercent = (previousHealth / maximumHealth) * 100;
  const nextPercent = (nextHealth / maximumHealth) * 100;
  scenePlan.phases.forEach((phase, index) => {
    if (
      index > scenePlan.activePhaseIndex &&
      phase.triggerBossId === bossId &&
      previousPercent > phase.startPercent &&
      nextPercent <= phase.startPercent
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

const isMusicSender = (senderId: number) =>
  Boolean(musicWindow && senderId === musicWindow.webContents.id);

const isLibrarySender = (senderId: number) =>
  Boolean(libraryWindow && senderId === libraryWindow.webContents.id);

const isSceneEditorSender = (senderId: number) =>
  Boolean(sceneEditorWindow && senderId === sceneEditorWindow.webContents.id);

const isScenePlaylistSender = (senderId: number) =>
  Boolean(scenePlaylistWindow && senderId === scenePlaylistWindow.webContents.id);

const assertAuthorizedIpcSender = (authorized: boolean) => {
  if (!authorized) throw new Error('Ação não autorizada.');
};

const isBattleStateReader = (senderId: number) =>
  isEncounterControllerSender(senderId) ||
  isPlayerSender(senderId) ||
  isMusicSender(senderId) ||
  isSceneEditorSender(senderId) ||
  isScenePlaylistSender(senderId);

const isMusicStateReader = (senderId: number) =>
  isMasterSender(senderId) ||
  isMusicSender(senderId) ||
  isPlayerSender(senderId);

ipcMain.handle('battle:get-state', (event) => {
  assertAuthorizedIpcSender(isBattleStateReader(event.sender.id));
  return battleState;
});
ipcMain.handle('app:get-version', (event) => {
  assertAuthorizedIpcSender(isMasterSender(event.sender.id));
  return app.getVersion();
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
  allowAppClose = true;
  masterWindow.close();
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
      if (fileInfo.size > 25 * 1024 * 1024) {
        return { ok: false, error: 'O arquivo deve ter no máximo 25 MB.' };
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

ipcMain.handle('music:open-window', (event) => {
  if (!isMasterSender(event.sender.id)) return false;
  createMusicWindow();
  return true;
});

ipcMain.handle('scene:open-window', (event) => {
  if (!isMasterSender(event.sender.id)) return false;
  createSceneEditorWindow();
  return true;
});

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
    ) return false;
    const audioSlot = slot as SceneAudioSlot;
    const normalizedInitial = normalizeScenePlaylistSummary(
      initial,
      phaseId,
      audioSlot,
    );
    if (normalizedInitial === undefined) return false;
    scenePlaylistContext = {
      phaseId,
      phaseName: phaseName.trim().slice(0, 60) || 'Fase',
      slot: audioSlot,
    };
    const key = sceneMediaKey(phaseId, audioSlot);
    if (!pendingScenePlaylists.has(key)) {
      const pending = ensurePendingScenePlaylist(phaseId, audioSlot);
      if (!getScenePlaylistPhase(phaseId) && normalizedInitial) {
        pending.summary = cloneScenePlaylistSummary(normalizedInitial);
      }
    }
    return Boolean(createScenePlaylistWindow());
  },
);

ipcMain.on('scene:confirm-close', (event) => {
  if (!isSceneEditorSender(event.sender.id) || !sceneEditorWindow) return;
  pendingSceneMediaPaths.clear();
  pendingScenePlaylists.clear();
  scenePlaylistWindow?.close();
  scenePlaylistContext = null;
  allowSceneEditorClose = true;
  sceneEditorWindow.close();
});

ipcMain.handle('scene:get-state', (event) => {
  assertAuthorizedIpcSender(
    isSceneEditorSender(event.sender.id) || isPlayerSender(event.sender.id),
  );
  return scenePlan;
});

ipcMain.handle('scene:save', (event, value: unknown): SceneSaveResult =>
  isSceneEditorSender(event.sender.id)
    ? saveScenePlan(value)
    : { ok: false, error: 'Ação não autorizada.' },
);

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
      if (!info.isFile() || info.size > 25 * 1024 * 1024) {
        return { ok: false, error: 'O arquivo deve ter no máximo 25 MB.' };
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

ipcMain.handle('scene-playlist:get-state', (event) => {
  assertAuthorizedIpcSender(isScenePlaylistSender(event.sender.id));
  if (!scenePlaylistContext) return null;
  return getScenePlaylistState(
    scenePlaylistContext.phaseId,
    scenePlaylistContext.slot,
  );
});

ipcMain.handle(
  'scene-playlist:add-tracks',
  async (event): Promise<ScenePlaylistSelectionResult> => {
    if (
      !isScenePlaylistSender(event.sender.id) ||
      !scenePlaylistWindow ||
      scenePlaylistWindow.isDestroyed() ||
      !scenePlaylistContext
    ) return { ok: false, error: 'Ação não autorizada.' };
    const selection = await dialog.showOpenDialog(scenePlaylistWindow, {
      title: scenePlaylistContext.slot === 'music'
        ? 'Adicionar músicas à fase'
        : 'Adicionar sons à transição',
      defaultPath: defaultMediaDirectory(
        scenePlaylistContext.slot === 'music' ? 'Musica' : 'SFX',
        'music',
      ),
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Áudio MP3', extensions: ['mp3'] }],
    });
    if (selection.canceled || selection.filePaths.length === 0) {
      return { ok: false, canceled: true };
    }
    const { phaseId, slot } = scenePlaylistContext;
    const pending = ensurePendingScenePlaylist(phaseId, slot);
    const additions: ScenePlaylistSummary['tracks'] = [];
    for (const filePath of selection.filePaths) {
      if (path.extname(filePath).toLowerCase() !== '.mp3') continue;
      try {
        const info = await stat(filePath);
        if (!info.isFile() || info.size > 25 * 1024 * 1024) continue;
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
        error: 'Nenhum MP3 válido de até 25 MB foi selecionado.',
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
    (!isScenePlaylistSender(event.sender.id) && !isSceneEditorSender(event.sender.id)) ||
    !isSafeSceneIdentifier(phaseIdValue) ||
    !['transitionSound', 'music'].includes(String(slotValue)) ||
    !isRecord(value) ||
    typeof value.type !== 'string'
  ) return;
  const command = value as ScenePlaylistCommand;
  const phaseId = phaseIdValue;
  const slot = slotValue as SceneAudioSlot;
  if (
    isScenePlaylistSender(event.sender.id) &&
    (scenePlaylistContext?.phaseId !== phaseId || scenePlaylistContext.slot !== slot)
  ) return;
  const pending = ensurePendingScenePlaylist(phaseId, slot);
  const tracks = [...pending.summary.tracks];
  const next = cloneScenePlaylistSummary(pending.summary);
  switch (command.type) {
    case 'previous':
      if (tracks.length > 1) {
        next.currentTrackId = adjacentScenePlaylistTrackId(next, -1);
      }
      break;
    case 'next':
      if (tracks.length > 1) {
        next.currentTrackId = adjacentScenePlaylistTrackId(next, 1);
      }
      break;
    case 'select-track':
      if (tracks.some((track) => track.id === command.trackId)) {
        next.currentTrackId = command.trackId;
      } else return;
      break;
    case 'remove-track': {
      const removedIndex = tracks.findIndex((track) => track.id === command.trackId);
      if (removedIndex < 0) return;
      pending.paths.delete(command.trackId);
      next.tracks = tracks.filter((track) => track.id !== command.trackId);
      if (next.currentTrackId === command.trackId) {
        next.currentTrackId = next.tracks[Math.min(removedIndex, next.tracks.length - 1)]?.id ?? null;
      }
      break;
    }
    case 'clear':
      pending.paths.clear();
      next.tracks = [];
      next.currentTrackId = null;
      break;
    case 'set-volume':
      if (typeof command.volume !== 'number' || !Number.isFinite(command.volume)) return;
      next.volume = Math.max(0, Math.min(1, command.volume));
      break;
    case 'set-muted':
      if (typeof command.muted !== 'boolean') return;
      next.muted = command.muted;
      break;
    case 'set-loop':
      if (typeof command.loop !== 'boolean') return;
      next.loop = command.loop;
      break;
    default:
      return;
  }
  next.revision += 1;
  pending.summary = next;
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

ipcMain.handle('launcher:new-encounter', (event) => {
  if (!isLauncherSender(event.sender.id)) return false;
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
  createEncounterWindows();
  launcherWindow?.close();
  return true;
});

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
  if (battleMusicStartTimer) {
    clearTimeout(battleMusicStartTimer);
    battleMusicStartTimer = null;
  }
  stopSoundboardPlayback();
  soundEffectSources.clear();

  const loadedBosses = entry.bosses.map((storedBoss) => {
    const maxHealth = clampInteger(storedBoss.maxHealth, 1, 1_000_000);
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
      skills: clampInteger(storedBoss.skills, -999, 999),
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
        skills: clampInteger(template.skills, -999, 999),
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
  };
  soundboardRevision += 1;

  linkedLibraryEntryId = entry.isAutosave ? null : entry.id;

  broadcastBattleState();
  broadcastBackground();
  broadcastMusicState();
  broadcastMusicPlayback();
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

    const loaded = restoreLibraryEntry(
      entry,
      new Set(missingFiles.map((file) => file.key)),
    );
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
      if (isBackground && fileInfo.size > 25 * 1024 * 1024) {
        return { ok: false, error: 'O fundo deve ter no máximo 25 MB.' };
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
ipcMain.handle(
  'music:get-playback',
  (event): MusicPlaybackState => {
    assertAuthorizedIpcSender(isMusicSender(event.sender.id));
    return musicPlaybackState;
  },
);
ipcMain.handle('soundboard:get-state', (event): SoundboardState => {
  assertAuthorizedIpcSender(
    isMusicSender(event.sender.id) || isPlayerSender(event.sender.id),
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
      if (!fileInfo.isFile()) throw new Error('not-file');
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
    return { ok: true, state: getEncounterSoundCustomizationState() };
  },
);
ipcMain.on('audio:set-universal-muted', (event, muted: unknown) => {
  if (!isMasterSender(event.sender.id) || typeof muted !== 'boolean') return;
  if (musicState.universalMuted === muted) return;
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
  encounterEffectsAudioState = {
    ...encounterEffectsAudioState,
    volume: Math.max(0, Math.min(1, volume)),
    revision: encounterEffectsAudioState.revision + 1,
  };
  broadcastEncounterEffectsState();
  persistEncounterEffectsSettingsSafely();
});
const encounterSoundSettings = new Set<EncounterSoundSetting>([
  'heal',
  'damage',
  'shield',
]);
const encounterGeneralSettings = new Set<EncounterGeneralSetting>([
  'automaticStatusEffects',
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
ipcMain.handle('music:set-soundboard-open', (event, open: unknown) => {
  if (!isMusicSender(event.sender.id) || typeof open !== 'boolean') return false;
  resizeMusicWindow(open);
  return true;
});

ipcMain.handle(
  'soundboard:assign',
  async (
    event,
    index: unknown,
    name: unknown,
    keepExistingFile: unknown,
  ): Promise<SoundboardAssignmentResult> => {
    if (
      !musicWindow ||
      !isMusicSender(event.sender.id) ||
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
      soundboardSlots[index - 1] = { ...existingSlot, name: trimmedName };
      soundboardRevision += 1;
      broadcastSoundboardState();
      return { ok: true };
    }

    const selection = await dialog.showOpenDialog(musicWindow, {
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
      if (!fileInfo.isFile()) throw new Error('not-file');
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
  if (!isMusicSender(event.sender.id) || !isSoundboardCommand(command)) return;

  if (command.type === 'play') {
    const slot = soundboardSlots[command.index - 1];
    if (!slot || !playerWindow || playerWindow.isDestroyed()) return;
    soundEffectSequence += 1;
    soundEffectSources.set(soundEffectSequence, {
      filePath: slot.filePath,
      index: command.index,
    });
    playerWindow.webContents.send('soundboard:play', {
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
    soundboardAudioState = {
      ...soundboardAudioState,
      volume: Math.max(0, Math.min(1, command.volume)),
    };
    soundboardRevision += 1;
    broadcastSoundboardState();
    return;
  }

  if (command.type === 'toggle-mute') {
    soundboardAudioState = {
      ...soundboardAudioState,
      muted: !soundboardAudioState.muted,
    };
    soundboardRevision += 1;
    broadcastSoundboardState();
    return;
  }

  if (command.type === 'remove') {
    stopSoundboardPlayback(command.index);
    soundboardSlots[command.index - 1] = null;
  } else {
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
    if (musicWindow && !musicWindow.isDestroyed()) {
      musicWindow.webContents.send(
        'soundboard:error',
        `O Atalho ${index} não pôde ser reproduzido. Verifique se o arquivo usa MP3 (MPEG Layer III).`,
      );
    }
  },
);

ipcMain.handle(
  'music:add-tracks',
  async (event): Promise<MusicSelectionResult> => {
    if (!musicWindow || !isMusicSender(event.sender.id)) {
      return { ok: false, error: 'Ação não autorizada.' };
    }

    const selection = await dialog.showOpenDialog(musicWindow, {
      title: 'Adicionar faixas à playlist',
      defaultPath: defaultMediaDirectory('Musica', 'music'),
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Arquivos MP3', extensions: ['mp3'] }],
    });

    if (selection.canceled || selection.filePaths.length === 0) {
      return { ok: false, canceled: true };
    }

    let added = 0;
    const knownTrackPaths = new Set(
      musicTracks.map((track) => track.filePath),
    );
    for (const filePath of selection.filePaths) {
      if (path.extname(filePath).toLowerCase() !== '.mp3') continue;
      if (knownTrackPaths.has(filePath)) continue;

      try {
        const fileInfo = await stat(filePath);
        if (!fileInfo.isFile()) continue;
      } catch {
        continue;
      }

      let duration = 0;
      try {
        const metadata = await parseFile(filePath, { duration: true });
        duration = Number.isFinite(metadata.format.duration)
          ? metadata.format.duration ?? 0
          : 0;
      } catch {
        duration = 0;
      }

      musicTrackSequence += 1;
      musicTracks.push({
        id: String(musicTrackSequence),
        name: path.basename(filePath, path.extname(filePath)),
        filePath,
        duration,
      });
      knownTrackPaths.add(filePath);
      added += 1;
    }

    if (added === 0) {
      return {
        ok: false,
        error: 'Nenhuma faixa MP3 nova e válida foi encontrada.',
      };
    }

    if (!musicState.currentTrackId) {
      musicState = { ...musicState, currentTrackId: musicTracks[0].id };
      resetMusicPlayback(musicTracks[0].id);
    }
    musicState = { ...musicState, revision: musicState.revision + 1 };
    broadcastMusicState();
    return { ok: true, added };
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

const applyMusicCommand = (command: MusicCommand) => {
  if (
    command.type !== 'toggle-loop' &&
    command.type !== 'set-volume' &&
    musicTracks.length === 0
  ) return;

  switch (command.type) {
    case 'toggle-play':
      if (!battleState.battleStarted) break;
      musicState = {
        ...musicState,
        isPlaying: !musicState.isPlaying,
        revision: musicState.revision + 1,
      };
      break;
    case 'restart':
      musicState = {
        ...musicState,
        playbackVersion: musicState.playbackVersion + 1,
        revision: musicState.revision + 1,
      };
      resetMusicPlayback();
      break;
    case 'previous':
      moveMusicTrack(-1);
      break;
    case 'next':
      moveMusicTrack(1);
      break;
    case 'toggle-loop':
      musicState = {
        ...musicState,
        loop: !musicState.loop,
        revision: musicState.revision + 1,
      };
      break;
    case 'toggle-mute':
      musicState = {
        ...musicState,
        muted: !musicState.muted,
        revision: musicState.revision + 1,
      };
      break;
    case 'set-volume':
      musicState = {
        ...musicState,
        volume: Math.max(0, Math.min(1, command.volume)),
        revision: musicState.revision + 1,
      };
      break;
    case 'seek': {
      const duration = Math.max(0, musicPlaybackState.duration);
      const time = Math.max(0, Math.min(command.time, duration || command.time));
      musicPlaybackState = {
        ...musicPlaybackState,
        trackId: musicState.currentTrackId,
        currentTime: time,
      };
      if (playerWindow && !playerWindow.isDestroyed()) {
        playerWindow.webContents.send('music:seek', time);
      }
      broadcastMusicPlayback();
      return;
    }
    case 'remove-track': {
      const removedIndex = musicTracks.findIndex(
        (track) => track.id === command.trackId,
      );
      if (removedIndex < 0) return;
      const removingCurrent = musicState.currentTrackId === command.trackId;
      musicTracks.splice(removedIndex, 1);

      if (removingCurrent) {
        const replacement =
          musicTracks[Math.min(removedIndex, musicTracks.length - 1)] ?? null;
        musicState = {
          ...musicState,
          currentTrackId: replacement?.id ?? null,
          isPlaying: Boolean(replacement) && musicState.isPlaying,
          playbackVersion: musicState.playbackVersion + 1,
          revision: musicState.revision + 1,
        };
        resetMusicPlayback(replacement?.id ?? null);
      } else {
        musicState = { ...musicState, revision: musicState.revision + 1 };
      }
      break;
    }
    case 'clear-tracks':
      musicTracks.splice(0, musicTracks.length);
      musicState = {
        ...musicState,
        currentTrackId: null,
        isPlaying: false,
        playbackVersion: musicState.playbackVersion + 1,
        revision: musicState.revision + 1,
      };
      resetMusicPlayback(null);
      break;
    case 'play-track':
      if (!musicTracks.some((track) => track.id === command.trackId)) return;
      musicState = {
        ...musicState,
        currentTrackId: command.trackId,
        isPlaying: battleState.battleStarted,
        playbackVersion: musicState.playbackVersion + 1,
        revision: musicState.revision + 1,
      };
      resetMusicPlayback(command.trackId);
      break;
  }

  broadcastMusicState();
};

ipcMain.on('music:dispatch', (event, command: unknown) => {
  if (!isMusicSender(event.sender.id) || !isMusicCommand(command)) return;
  applyMusicCommand(command);
});

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
  broadcastMusicPlayback();
});

ipcMain.on('music:fadeout-complete', (event) => {
  if (!playerWindow || event.sender.id !== playerWindow.webContents.id) return;
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

const applyHealthMutation = (
  type: 'damage' | 'heal' | 'reset-health',
  bossId: string,
  amount = 0,
) => {
  const previousBoss = battleState.bosses.find((boss) => boss.id === bossId);
  if (!previousBoss) return;
  const command =
    type === 'reset-health'
      ? ({ type: 'reset-health', bossId } as const)
      : ({ type, bossId, amount } as const);

  battleState = applyBattleCommand(battleState, command);
  const nextBoss = battleState.bosses.find((boss) => boss.id === bossId);
  if (!nextBoss) return;
  broadcastBattleState();
  queueCrossedScenePhases(
    bossId,
    previousBoss.currentHealth,
    nextBoss.currentHealth,
    previousBoss.maxHealth,
  );

  if (playerWindow && !playerWindow.isDestroyed()) {
    healthEffectSequence += 1;
    const effect: HealthEffect = {
      id: healthEffectSequence,
      bossId,
      type: type === 'damage' ? 'damage' : 'heal',
      intensity: type === 'reset-health' ? 'full' : 'normal',
      from: previousBoss.currentHealth,
      to: nextBoss.currentHealth,
      maximum: nextBoss.maxHealth,
      shieldFrom: previousBoss.shield,
      shieldTo: nextBoss.shield,
    };
    playerWindow.webContents.send('health:effect', effect);
    playEncounterMechanicSound(effect);
  }
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

ipcMain.on('battle:dispatch', (event, command: unknown) => {
  if (!isEncounterControllerSender(event.sender.id)) {
    return;
  }

  if (!isBattleCommand(command)) {
    return;
  }

  if (command.type === 'start-turn') {
    if (!battleState.battleStarted) return;
    const previousBoss = battleState.bosses.find(
      (boss) => boss.id === command.bossId,
    );
    if (
      !previousBoss ||
      previousBoss.setupStatus !== 'ready' ||
      previousBoss.currentHealth <= 0
    ) return;

    const advancedTurn = advanceBossTurn(
      battleState,
      command.bossId,
      randomInt,
    );
    battleState = advancedTurn.state;
    broadcastBattleState();
    const nextBoss = battleState.bosses.find((boss) => boss.id === command.bossId);
    if (nextBoss) {
      queueCrossedScenePhases(
        command.bossId,
        previousBoss.currentHealth,
        nextBoss.currentHealth,
        previousBoss.maxHealth,
      );
    }

    if (playerWindow && !playerWindow.isDestroyed()) {
      for (const tick of advancedTurn.ticks) {
        healthEffectSequence += 1;
        const effect: HealthEffect = {
          id: healthEffectSequence,
          bossId: command.bossId,
          type: 'damage',
          intensity: 'normal',
          from: tick.from,
          to: tick.to,
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
        playerWindow.webContents.send('health:effect', effect);
      }
    }
    return;
  }

  if (
    command.type === 'damage' ||
    command.type === 'heal' ||
    command.type === 'reset-health'
  ) {
    applyHealthMutation(
      command.type,
      command.bossId,
      command.type === 'reset-health' ? 0 : command.amount,
    );
    return;
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
    scenePlan = { ...scenePlan, activePhaseIndex: -1 };
    activeBackgroundFilePath = configuredBackgroundFilePath;
    battleState = { ...battleState, backgroundName: configuredBackgroundName };
    backgroundRevision += 1;
    backgroundChanged = true;
    applyScenePhase(0);
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
    if (battleMusicStartTimer) {
      clearTimeout(battleMusicStartTimer);
      battleMusicStartTimer = null;
    }
    if (musicState.isPlaying && playerWindow && !playerWindow.isDestroyed()) {
      playerWindow.webContents.send('music:fade-out', 1600);
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

app.on('before-quit', () => {
  allowAppClose = true;
  allowControlWindowClose = true;
  controlWindow?.setClosable(true);
  pendingHealthTimers.forEach(clearTimeout);
  pendingHealthTimers.clear();
  soundEffectSources.clear();
  encounterEffectSources.clear();
  if (battleMusicStartTimer) clearTimeout(battleMusicStartTimer);
  if (sceneTransitionTimer) clearTimeout(sceneTransitionTimer);
  if (playerWindowCloseTimer) clearTimeout(playerWindowCloseTimer);
  if (masterFocusTimer) clearTimeout(masterFocusTimer);
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createLauncherWindow();
  }
});
