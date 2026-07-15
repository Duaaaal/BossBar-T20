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
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pathToFileURL } from 'node:url';
import started from 'electron-squirrel-startup';
// O resolvedor do ESLint ainda não reconhece o export condicional "node" do pacote.
// eslint-disable-next-line import/no-unresolved
import { parseFile } from 'music-metadata';
import {
  applyBattleCommand,
  calculateHealthSequence,
  createInitialBoss,
  initialBattleState,
  isBattleCommand,
  type BackgroundSelectionResult,
  type BackgroundState,
  type BattleState,
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
} from './shared/media';

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
let playerWindowReady = false;
let battleState: BattleState = initialBattleState;
let activeBackgroundFilePath: string | null = null;
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
let musicTrackSequence = 0;
let soundEffectSequence = 0;
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
let masterFocusTimer: ReturnType<typeof setTimeout> | null = null;
let battleMusicStartTimer: ReturnType<typeof setTimeout> | null = null;
let allowAppClose = false;
let allowPlayerWindowClose = false;
let playerWindowClosePending = false;
let playerWindowCloseTimer: ReturnType<typeof setTimeout> | null = null;
let allowControlWindowClose = false;
let synchronizingDockedWindows = false;
let synchronizingDockedFocus = false;
const CONTROL_PANEL_MINIMIZED_HEIGHT = 32;
const CONTROL_PANEL_DOCK_OVERLAP = 1;
let controlPanelMinimized = false;
let controlPanelExpandedHeight = 300;
let pendingBackgroundChange:
  | { type: 'set'; filePath: string; name: string }
  | { type: 'clear' }
  | null = null;

type StoredMediaFile = {
  name: string;
  filePath: string;
};

type StoredLibraryBoss = Omit<
  BossLibraryBossDraft,
  'bossId' | 'shield'
> & { shield?: number };

type BossLibraryEntry = {
  schemaVersion: 2;
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
};

let bossLibraryEntries: BossLibraryEntry[] = [];
let linkedLibraryEntryId: string | null = null;
let libraryWriteQueue: Promise<void> = Promise.resolve();

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

type RendererPage =
  | 'launcher'
  | 'master'
  | 'player'
  | 'control'
  | 'music'
  | 'library';

const rendererFile = (page: RendererPage) =>
  path.join(
    __dirname,
    `../renderer/${MAIN_WINDOW_VITE_NAME}/${page}.html`,
  );

const applicationIcon = () => app.isPackaged
  ? path.join(process.resourcesPath, 'assets', 'bossbar-icon.ico')
  : path.join(app.getAppPath(), 'assets', 'bossbar-icon.ico');

const defaultMediaDirectory = (
  projectFolder: 'Imagens' | 'Musica' | 'SFX',
  systemFolder: 'music' | 'pictures',
) => app.isPackaged
  ? app.getPath(systemFolder)
  : path.join(app.getAppPath(), projectFolder);

const rendererUrl = (page: RendererPage) => {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    const baseUrl = MAIN_WINDOW_VITE_DEV_SERVER_URL.endsWith('/')
      ? MAIN_WINDOW_VITE_DEV_SERVER_URL
      : `${MAIN_WINDOW_VITE_DEV_SERVER_URL}/`;
    return new URL(`${page}.html`, baseUrl).toString();
  }

  return pathToFileURL(rendererFile(page)).toString();
};

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

const bossLibraryPath = () =>
  path.join(app.getPath('userData'), 'boss-library.json');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object');

const isStoredMediaFile = (value: unknown): value is StoredMediaFile =>
  isRecord(value) &&
  typeof value.name === 'string' &&
  typeof value.filePath === 'string';

const isFiniteStoredNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

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

const isStoredLibraryBoss = (value: unknown): value is StoredLibraryBoss =>
  isRecord(value) &&
  typeof value.bossName === 'string' &&
  typeof value.amount === 'string' &&
  isFiniteStoredNumber(value.maxHealth) &&
  isFiniteStoredNumber(value.currentHealth) &&
  isFiniteStoredNumber(value.attack) &&
  isFiniteStoredNumber(value.rangedAttack) &&
  isFiniteStoredNumber(value.defense) &&
  (value.shield === undefined || isFiniteStoredNumber(value.shield)) &&
  isFiniteStoredNumber(value.skills) &&
  isFiniteStoredNumber(value.damageReduction) &&
  typeof value.description === 'string' &&
  (value.actionSeverity === 'normal' || value.actionSeverity === 'grave');

const normalizeStoredLibraryEntry = (
  value: unknown,
): BossLibraryEntry | null => {
  if (!isStoredLibraryEnvelope(value)) return null;

  if (
    value.schemaVersion === 2 &&
    Array.isArray(value.bosses) &&
    value.bosses.length >= 1 &&
    value.bosses.length <= 3 &&
    value.bosses.every(isStoredLibraryBoss) &&
    Number.isInteger(value.activeBossIndex) &&
    (value.activeBossIndex as number) >= 0 &&
    (value.activeBossIndex as number) < value.bosses.length
  ) {
    return {
      schemaVersion: 2,
      id: value.id,
      isAutosave: value.isAutosave,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      bosses: value.bosses,
      activeBossIndex: value.activeBossIndex as number,
      background: value.background,
      music: value.music,
      soundboard: value.soundboard,
    };
  }

  if (value.schemaVersion === 1 && isStoredLibraryBoss(value.boss)) {
    return {
      schemaVersion: 2,
      id: value.id,
      isAutosave: value.isAutosave,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      bosses: [value.boss],
      activeBossIndex: 0,
      background: value.background,
      music: value.music,
      soundboard: value.soundboard,
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
    { schemaVersion: 2, entries: bossLibraryEntries },
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
    'shield',
    'skills',
    'damageReduction',
  ] as const;
    if (numericFields.some((field) => !Number.isFinite(rawBoss[field]))) return [];
  if (
      typeof rawBoss.bossName !== 'string' ||
      typeof rawBoss.amount !== 'string' ||
      typeof rawBoss.description !== 'string' ||
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
      attack: clampInteger(rawBoss.attack as number, 0, 999),
      rangedAttack: clampInteger(rawBoss.rangedAttack as number, 0, 999),
      defense: clampInteger(rawBoss.defense as number, 0, 999),
      shield: clampInteger(rawBoss.shield as number, 0, 999),
      skills: clampInteger(rawBoss.skills as number, 0, 999),
      damageReduction: clampInteger(rawBoss.damageReduction as number, 0, 999),
      description: rawBoss.description.trim().slice(0, 100),
      actionSeverity: rawBoss.actionSeverity,
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
    bossName: boss.bossName,
    amount: boss.amount,
    maxHealth: boss.maxHealth,
    currentHealth: boss.currentHealth,
    attack: boss.attack,
    rangedAttack: boss.rangedAttack,
    defense: boss.defense,
    shield: boss.shield,
    skills: boss.skills,
    damageReduction: boss.damageReduction,
    description: boss.description,
    actionSeverity: boss.actionSeverity,
  }));
  return {
    schemaVersion: 2,
    id: existingEntry?.id ?? (isAutosave ? 'autosave' : randomUUID()),
    isAutosave,
    createdAt: existingEntry?.createdAt ?? now,
    updatedAt: now,
    bosses,
    activeBossIndex: Math.max(
      0,
      draft.bosses.findIndex((boss) => boss.bossId === draft.activeBossId),
    ),
    background: activeBackgroundFilePath
      ? {
          filePath: activeBackgroundFilePath,
          name: battleState.backgroundName ?? path.basename(activeBackgroundFilePath),
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
      preload: path.join(__dirname, 'preload.js'),
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
      preload: path.join(__dirname, 'preload.js'),
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
  const gap = 12;
  const masterWidth = Math.min(430, Math.max(390, Math.round(workArea.width * 0.25)));
  const masterHeight = Math.min(660, workArea.height);
  const controlHeight = Math.min(300, Math.max(250, Math.round(workArea.height * 0.28)));
  const playerAreaWidth = Math.max(720, workArea.width - masterWidth - gap);
  const maximumPlayerHeight = Math.max(405, workArea.height - controlHeight);
  let playerWidth = Math.min(1180, playerAreaWidth, Math.floor(maximumPlayerHeight * (16 / 9)));
  let playerHeight = Math.round(playerWidth * (9 / 16));

  if (playerHeight > maximumPlayerHeight) {
    playerHeight = maximumPlayerHeight;
    playerWidth = Math.max(720, Math.round(playerHeight * (16 / 9)));
  }

  const playerX =
    workArea.x + Math.round((playerAreaWidth - playerWidth) / 2);
  const groupHeight = playerHeight + controlHeight;
  const playerY = workArea.y + Math.max(0, Math.round((workArea.height - groupHeight) / 2));
  const masterX = workArea.x + workArea.width - masterWidth;

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

const syncControlWindow = () => {
  if (
    synchronizingDockedWindows ||
    !playerWindow ||
    playerWindow.isDestroyed() ||
    !controlWindow ||
    controlWindow.isDestroyed()
  ) return;
  const currentControlBounds = controlWindow.getBounds();
  synchronizingDockedWindows = true;
  controlWindow.setBounds(
    getDockedControlBoundsForWindow(playerWindow, currentControlBounds.height),
  );
  synchronizingDockedWindows = false;
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
    minWidth: 720,
    minHeight: CONTROL_PANEL_MINIMIZED_HEIGHT,
    maxHeight: 340,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    title: 'Painel Privado do Encontro - BossBar T20',
    backgroundColor: '#111117',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
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
  window.setContentProtection(true);
  configureNativeDockedWindowChrome();
  window.on('focus', focusDockedWindowGroup);
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

const createPlayerWindow = (bounds = getInitialWindowLayout().player) => {
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
    maximizable: false,
    minWidth: 800,
    minHeight: 450,
    title: 'Apresentação do Chefão - BossBar T20',
    backgroundColor: '#050408',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
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
  const outerBounds = window.getBounds();
  const contentBounds = window.getContentBounds();
  const frameWidth = Math.max(0, outerBounds.width - contentBounds.width);
  const contentWidth = Math.max(1, bounds.width - frameWidth);
  window.setContentSize(contentWidth, Math.round(contentWidth * (9 / 16)));

  const initialControlBounds = getInitialWindowLayout().control;
  createControlWindow(
    getDockedControlBoundsForWindow(window, initialControlBounds.height),
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
  window.on('move', () => {
    syncControlWindow();
    if (window.isFocused() && controlWindow && !controlWindow.isDestroyed()) {
      controlWindow.showInactive();
      controlWindow.moveTop();
    }
  });
  window.on('resize', syncControlWindow);
  window.on('minimize', () => controlWindow?.hide());
  window.on('hide', () => controlWindow?.hide());
  window.on('restore', () => {
    syncControlWindow();
    controlWindow?.showInactive();
  });
  window.on('show', () => controlWindow?.showInactive());

  window.on('close', (event) => {
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
      if (playerWindowCloseTimer) clearTimeout(playerWindowCloseTimer);
      playerWindowCloseTimer = null;
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
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  loadRenderer(masterWindow, 'master');
  createPlayerWindow(layout.player);

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
      preload: path.join(__dirname, 'preload.js'),
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
  for (const window of [masterWindow, playerWindow, controlWindow]) {
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

const isMasterSender = (senderId: number) =>
  Boolean(masterWindow && senderId === masterWindow.webContents.id);

const isControlSender = (senderId: number) =>
  Boolean(controlWindow && senderId === controlWindow.webContents.id);

const isLauncherSender = (senderId: number) =>
  Boolean(launcherWindow && senderId === launcherWindow.webContents.id);

const isEncounterControllerSender = (senderId: number) =>
  isMasterSender(senderId) || isControlSender(senderId);

const isMusicSender = (senderId: number) =>
  Boolean(musicWindow && senderId === musicWindow.webContents.id);

const isLibrarySender = (senderId: number) =>
  Boolean(libraryWindow && senderId === libraryWindow.webContents.id);

ipcMain.handle('battle:get-state', () => battleState);
ipcMain.handle('app:get-version', () => app.getVersion());

ipcMain.handle('presentation:is-open', (event) =>
  isMasterSender(event.sender.id) ? isPresentationOpen() : false,
);

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
    controlPanelExpandedHeight = Math.max(240, controlBounds.height);
  }
  controlPanelMinimized = minimized;
  controlWindow.setBounds(getDockedControlBoundsForWindow(
    playerWindow,
    minimized ? CONTROL_PANEL_MINIMIZED_HEIGHT : controlPanelExpandedHeight,
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
  (): BackgroundState => getBackgroundState(),
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
  return true;
});

ipcMain.handle('music:open-window', (event) => {
  if (!isMasterSender(event.sender.id)) return false;
  createMusicWindow();
  return true;
});

ipcMain.handle('library:open-window', (event) => {
  if (!isMasterSender(event.sender.id) && !isLauncherSender(event.sender.id)) {
    return false;
  }
  return Boolean(createLibraryWindow());
});

ipcMain.handle('library:has-entries', (event) =>
  isLauncherSender(event.sender.id) && bossLibraryEntries.length > 0,
);

ipcMain.handle('launcher:new-encounter', (event) => {
  if (!isLauncherSender(event.sender.id)) return false;
  battleState = {
    ...initialBattleState,
    bosses: [createInitialBoss('boss-1')],
    revision: battleState.revision + 1,
  };
  linkedLibraryEntryId = null;
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

ipcMain.handle('library:get-entries', (event): BossLibraryEntrySummary[] =>
  isLibrarySender(event.sender.id) ? getBossLibrarySummaries() : [],
);

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

  const loadedBosses = entry.bosses.map((storedBoss, index) => {
    const maxHealth = clampInteger(storedBoss.maxHealth, 1, 1_000_000);
    return {
      id: `boss-${index + 1}`,
      setupStatus: 'ready' as const,
      identityPrepared: true,
      actionPrepared: storedBoss.description.trim().length > 0,
      bossName: storedBoss.bossName.trim().slice(0, 100) || 'Chefão Sem Nome',
      controlAmount: storedBoss.amount,
      applyDamageReduction: true,
      maxHealth,
      currentHealth: clampInteger(storedBoss.currentHealth, 0, maxHealth),
      attack: clampInteger(storedBoss.attack, 0, 999),
      rangedAttack: clampInteger(storedBoss.rangedAttack, 0, 999),
      defense: clampInteger(storedBoss.defense, 0, 999),
      shield: clampInteger(storedBoss.shield ?? 0, 0, 999),
      skills: clampInteger(storedBoss.skills, 0, 999),
      damageReduction: clampInteger(storedBoss.damageReduction, 0, 999),
      nextAction: storedBoss.description.trim().slice(0, 100),
      actionSeverity: storedBoss.actionSeverity,
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
  activeBackgroundFilePath =
    entry.background && !missingKeys.has('background')
      ? entry.background.filePath
      : null;
  pendingBackgroundChange = null;
  backgroundRevision += 1;

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

ipcMain.handle('music:get-state', (): MusicState => getMusicState());
ipcMain.handle(
  'music:get-playback',
  (): MusicPlaybackState => musicPlaybackState,
);
ipcMain.handle('soundboard:get-state', (): SoundboardState => getSoundboardState());
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
});
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

  masterWindow.webContents.send('background:error', message.slice(0, 240));
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
    const { effectiveAmountPerHit } = calculateHealthSequence({
      type: request.type,
      total,
      hits: request.hits,
      damageReduction: boss.damageReduction,
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
      activeBackgroundFilePath = pendingBackgroundChange.filePath;
      battleState = {
        ...battleState,
        backgroundName: pendingBackgroundChange.name,
      };
    } else {
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
    pendingBackgroundChange = null;
    backgroundRevision += 1;
    backgroundChanged = true;
  }

  if (command.type === 'start-battle') {
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
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
    'Content-Type': contentType,
  });

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
  bossLibraryEntries = await loadBossLibrary();
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );

  await protocol.handle('boss-media', async (request) => {
    try {
      const requestUrl = new URL(request.url);
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
      }

      if (!mediaPath) {
        return new Response(`${errorLabel} não encontrada.`, { status: 404 });
      }

      if (requestUrl.hostname === 'audio' || requestUrl.hostname === 'sfx') {
        return await createMediaResponse(request, mediaPath, 'audio/mpeg');
      }
      const backgroundVideoMimeType = backgroundVideoMimeTypeForFile(mediaPath);
      if (backgroundVideoMimeType) {
        return await createMediaResponse(
          request,
          mediaPath,
          backgroundVideoMimeType,
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
  if (battleMusicStartTimer) clearTimeout(battleMusicStartTimer);
  if (playerWindowCloseTimer) clearTimeout(playerWindowCloseTimer);
  if (masterFocusTimer) clearTimeout(masterFocusTimer);
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createLauncherWindow();
  }
});
