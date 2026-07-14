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
  BossLibraryDraft,
  BossLibraryEntrySummary,
  BossLibraryLoadResult,
  BossLibraryLoaded,
  BossLibraryReplaceResult,
  BossLibrarySaveResult,
  MissingLibraryFile,
} from './shared/library';
import { resolveByteRange } from './shared/media';

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
let musicWindow: BrowserWindow | null = null;
let libraryWindow: BrowserWindow | null = null;
let libraryTargetBossId: string | null = null;
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
let pendingBackgroundChange:
  | { type: 'set'; filePath: string; name: string }
  | { type: 'clear' }
  | null = null;

type StoredMediaFile = {
  name: string;
  filePath: string;
};

type BossLibraryEntry = {
  schemaVersion: 1;
  id: string;
  isAutosave: boolean;
  createdAt: string;
  updatedAt: string;
  boss: Omit<BossLibraryDraft, 'bossId' | 'shield'> & { shield?: number };
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
const linkedLibraryEntries = new Map<string, string>();
let libraryWriteQueue: Promise<void> = Promise.resolve();

const supportedBackgroundExtensions = new Set([
  '.avif',
  '.bmp',
  '.gif',
  '.jfif',
  '.jpeg',
  '.jpg',
  '.png',
  '.webp',
]);

const getBackgroundState = (): BackgroundState => ({
  url: activeBackgroundFilePath
    ? `boss-media://background/current?v=${backgroundRevision}`
    : null,
  name: battleState.backgroundName,
});

type RendererPage = 'master' | 'player' | 'music' | 'library';

const rendererFile = (page: RendererPage) =>
  path.join(
    __dirname,
    `../renderer/${MAIN_WINDOW_VITE_NAME}/${page}.html`,
  );

const applicationIcon = () => app.isPackaged
  ? path.join(process.resourcesPath, 'bossbar-icon.ico')
  : path.join(app.getAppPath(), 'assets', 'bossbar-icon.ico');

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

const isStoredLibraryEntry = (value: unknown): value is BossLibraryEntry => {
  if (!isRecord(value) || value.schemaVersion !== 1) return false;
  if (
    typeof value.id !== 'string' ||
    typeof value.isAutosave !== 'boolean' ||
    typeof value.createdAt !== 'string' ||
    typeof value.updatedAt !== 'string' ||
    !isRecord(value.boss) ||
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
    typeof value.boss.bossName === 'string' &&
    typeof value.boss.amount === 'string' &&
    isFiniteStoredNumber(value.boss.maxHealth) &&
    isFiniteStoredNumber(value.boss.currentHealth) &&
    isFiniteStoredNumber(value.boss.attack) &&
    isFiniteStoredNumber(value.boss.rangedAttack) &&
    isFiniteStoredNumber(value.boss.defense) &&
    (value.boss.shield === undefined ||
      isFiniteStoredNumber(value.boss.shield)) &&
    isFiniteStoredNumber(value.boss.skills) &&
    isFiniteStoredNumber(value.boss.damageReduction) &&
    typeof value.boss.description === 'string' &&
    (value.boss.actionSeverity === 'normal' ||
      value.boss.actionSeverity === 'grave') &&
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

const loadBossLibrary = async () => {
  try {
    const contents = await readFile(bossLibraryPath(), 'utf8');
    const parsed = JSON.parse(contents) as unknown;
    if (!isRecord(parsed) || !Array.isArray(parsed.entries)) return [];
    return parsed.entries.filter(isStoredLibraryEntry);
  } catch (error) {
    if (isRecord(error) && error.code !== 'ENOENT') {
      console.error('Não foi possível ler a biblioteca de chefões.', error);
    }
    return [];
  }
};

const persistBossLibrary = () => {
  const filePath = bossLibraryPath();
  const temporaryPath = `${filePath}.tmp`;
  const contents = JSON.stringify(
    { schemaVersion: 1, entries: bossLibraryEntries },
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
  if (libraryWindow && !libraryWindow.isDestroyed()) {
    libraryWindow.webContents.send('library:entries-changed');
  }
};

const clampInteger = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, Math.round(value)));

const normalizeLibraryDraft = (value: unknown): BossLibraryDraft | null => {
  if (!isRecord(value) || typeof value.bossId !== 'string') return null;
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
  if (numericFields.some((field) => !Number.isFinite(value[field]))) return null;
  if (
    typeof value.bossName !== 'string' ||
    typeof value.amount !== 'string' ||
    typeof value.description !== 'string' ||
    (value.actionSeverity !== 'normal' && value.actionSeverity !== 'grave')
  ) return null;

  const maxHealth = clampInteger(value.maxHealth as number, 1, 1_000_000);
  const amount = /^[0-9.,/]{1,24}$/.test(value.amount.trim())
    ? value.amount.trim()
    : '50';
  return {
    bossId: value.bossId,
    bossName: value.bossName.trim().slice(0, 100) || 'O Chefão Sem Nome',
    amount,
    maxHealth,
    currentHealth: clampInteger(value.currentHealth as number, 0, maxHealth),
    attack: clampInteger(value.attack as number, 0, 999),
    rangedAttack: clampInteger(value.rangedAttack as number, 0, 999),
    defense: clampInteger(value.defense as number, 0, 999),
    shield: clampInteger(value.shield as number, 0, 999),
    skills: clampInteger(value.skills as number, 0, 999),
    damageReduction: clampInteger(value.damageReduction as number, 0, 999),
    description: value.description.trim().slice(0, 100),
    actionSeverity: value.actionSeverity,
  };
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
  const boss: Omit<BossLibraryDraft, 'bossId'> = {
    bossName: draft.bossName,
    amount: draft.amount,
    maxHealth: draft.maxHealth,
    currentHealth: draft.currentHealth,
    attack: draft.attack,
    rangedAttack: draft.rangedAttack,
    defense: draft.defense,
    shield: draft.shield,
    skills: draft.skills,
    damageReduction: draft.damageReduction,
    description: draft.description,
    actionSeverity: draft.actionSeverity,
  };
  return {
    schemaVersion: 1,
    id: existingEntry?.id ?? (isAutosave ? 'autosave' : randomUUID()),
    isAutosave,
    createdAt: existingEntry?.createdAt ?? now,
    updatedAt: now,
    boss,
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
      bossName: entry.boss.bossName,
      amount: entry.boss.amount,
      maxHealth: entry.boss.maxHealth,
      currentHealth: entry.boss.currentHealth,
      attack: entry.boss.attack,
      rangedAttack: entry.boss.rangedAttack,
      defense: entry.boss.defense,
      shield: entry.boss.shield ?? 0,
      skills: entry.boss.skills,
      damageReduction: entry.boss.damageReduction,
      updatedAt: entry.updatedAt,
    }));

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
  const height = Math.min(777, workArea.height);
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

const createLibraryWindow = (bossId: string) => {
  if (!battleState.bosses.some((boss) => boss.id === bossId)) return null;
  libraryTargetBossId = bossId;

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
    title: 'Biblioteca de Chefões - BossBar T20',
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
      libraryTargetBossId = null;
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

const getInitialWindowLayout = (): {
  player: WindowBounds;
  master: WindowBounds;
} => {
  const { workArea } = screen.getPrimaryDisplay();
  const gap = 12;
  const masterWidth = 500;
  const masterHeight = Math.min(1380, workArea.height);
  const playerAreaWidth = Math.max(800, workArea.width - masterWidth - gap);
  let playerWidth = Math.min(1280, playerAreaWidth);
  let playerHeight = Math.round(playerWidth * (9 / 16));
  const maximumPlayerHeight = Math.max(450, workArea.height);

  if (playerHeight > maximumPlayerHeight) {
    playerHeight = maximumPlayerHeight;
    playerWidth = Math.max(800, Math.round(playerHeight * (16 / 9)));
  }

  const playerX =
    workArea.x + Math.round((playerAreaWidth - playerWidth) / 2);
  const masterX = workArea.x + workArea.width - masterWidth;

  return {
    player: {
      x: playerX,
      y: workArea.y + Math.round((workArea.height - playerHeight) / 2),
      width: playerWidth,
      height: playerHeight,
    },
    master: {
      x: masterX,
      y: workArea.y,
      width: masterWidth,
      height: masterHeight,
    },
  };
};

const createPlayerWindow = (bounds = getInitialWindowLayout().player) => {
  if (playerWindow && !playerWindow.isDestroyed()) {
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
  playerWindowReady = false;
  allowPlayerWindowClose = false;
  playerWindowClosePending = false;

  window.webContents.on('did-finish-load', () => {
    if (!window.isDestroyed()) {
      window.webContents.send('battle:state-changed', battleState);
      window.webContents.send('background:changed', getBackgroundState());
      window.webContents.send('music:state-changed', getMusicState());
    }
  });

  loadRenderer(window, 'player');

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
    }
  });

  return window;
};

const createWindows = () => {
  const layout = getInitialWindowLayout();
  masterWindow = new BrowserWindow({
    ...layout.master,
    icon: applicationIcon(),
    minWidth: 450,
    minHeight: Math.min(680, layout.master.height),
    maxHeight: Math.min(1380, screen.getPrimaryDisplay().workArea.height),
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
  });
};

const broadcastBattleState = () => {
  for (const window of [masterWindow, playerWindow]) {
    if (window && !window.isDestroyed()) {
      window.webContents.send('battle:state-changed', battleState);
    }
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

const isMusicSender = (senderId: number) =>
  Boolean(musicWindow && senderId === musicWindow.webContents.id);

const isLibrarySender = (senderId: number) =>
  Boolean(libraryWindow && senderId === libraryWindow.webContents.id);

ipcMain.handle('battle:get-state', () => battleState);
ipcMain.handle('app:get-version', () => app.getVersion());

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
      title: 'Escolher imagem ou GIF de fundo',
      properties: ['openFile'],
      filters: [
        {
          name: 'Imagens e GIFs',
          extensions: ['png', 'jpg', 'jpeg', 'jfif', 'webp', 'gif', 'bmp', 'avif'],
        },
      ],
    });

    if (selection.canceled || selection.filePaths.length === 0) {
      return { ok: false, canceled: true };
    }

    const filePath = selection.filePaths[0];
    const extension = path.extname(filePath).toLowerCase();

    if (!supportedBackgroundExtensions.has(extension)) {
      return { ok: false, error: 'Formato de imagem não suportado.' };
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

  createPlayerWindow();
  return true;
});

ipcMain.handle('music:open-window', (event) => {
  if (!isMasterSender(event.sender.id)) return false;
  createMusicWindow();
  return true;
});

ipcMain.handle('library:open-window', (event, bossId: unknown) => {
  if (!isMasterSender(event.sender.id) || typeof bossId !== 'string') {
    return false;
  }
  return Boolean(createLibraryWindow(bossId));
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
    if (!draft) return { ok: false, error: 'Os dados do chefão são inválidos.' };

    const linkedEntryId = linkedLibraryEntries.get(draft.bossId);
    const linkedEntry = linkedEntryId
      ? bossLibraryEntries.find(
          (entry) => entry.id === linkedEntryId && !entry.isAutosave,
        ) ?? null
      : null;

    if (mode === 'prompt' && linkedEntry) {
      return {
        ok: false,
        requiresOverwrite: true,
        entryId: linkedEntry.id,
        existingName: linkedEntry.boss.bossName,
      };
    }
    if (mode === 'overwrite' && !linkedEntry) {
      return {
        ok: false,
        error: 'O chefão original não está mais disponível na biblioteca.',
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

    linkedLibraryEntries.set(draft.bossId, entry.id);
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
    if (!draft) return { ok: false, error: 'Os dados do chefão são inválidos.' };

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
      return { ok: false, error: 'Chefão salvo não encontrado.' };
    }

    const previousEntries = bossLibraryEntries;
    bossLibraryEntries = bossLibraryEntries.filter(
      (entry) => entry.id !== entryId,
    );
    try {
      await persistBossLibrary();
    } catch {
      bossLibraryEntries = previousEntries;
      return { ok: false, error: 'Não foi possível excluir o chefão salvo.' };
    }

    for (const [bossId, linkedEntryId] of linkedLibraryEntries) {
      if (linkedEntryId === entryId) linkedLibraryEntries.delete(bossId);
    }
    notifyLibraryChanged();
    return { ok: true };
  },
);

const restoreLibraryEntry = (
  entry: BossLibraryEntry,
  targetBossId: string,
  missingKeys: Set<string>,
): BossLibraryLoaded | null => {
  const targetBoss = battleState.bosses.find((boss) => boss.id === targetBossId);
  if (!targetBoss) return null;

  pendingHealthTimers.forEach(clearTimeout);
  pendingHealthTimers.clear();
  if (battleMusicStartTimer) {
    clearTimeout(battleMusicStartTimer);
    battleMusicStartTimer = null;
  }
  stopSoundboardPlayback();
  soundEffectSources.clear();

  const loadedBoss = {
    id: targetBossId,
    setupStatus: 'ready' as const,
    bossName: entry.boss.bossName,
    maxHealth: entry.boss.maxHealth,
    currentHealth: Math.min(entry.boss.currentHealth, entry.boss.maxHealth),
    attack: entry.boss.attack,
    rangedAttack: entry.boss.rangedAttack,
    defense: entry.boss.defense,
    shield: entry.boss.shield ?? 0,
    skills: entry.boss.skills,
    damageReduction: entry.boss.damageReduction,
    nextAction: entry.boss.description,
    actionSeverity: entry.boss.actionSeverity,
  };

  battleState = {
    ...battleState,
    bosses: battleState.bosses.map((boss) =>
      boss.id === targetBossId ? loadedBoss : boss,
    ),
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

  if (entry.isAutosave) linkedLibraryEntries.delete(targetBossId);
  else linkedLibraryEntries.set(targetBossId, entry.id);

  broadcastBattleState();
  broadcastBackground();
  broadcastMusicState();
  broadcastMusicPlayback();
  broadcastSoundboardState();

  return { boss: loadedBoss, amount: entry.boss.amount };
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
      typeof continueWithoutMissing !== 'boolean' ||
      !libraryTargetBossId
    ) return { ok: false, error: 'Ação não autorizada.' };

    const entry = bossLibraryEntries.find((item) => item.id === entryId);
    if (!entry) return { ok: false, error: 'Chefão salvo não encontrado.' };
    const missingFiles = await findMissingLibraryFiles(entry);
    if (missingFiles.length > 0 && !continueWithoutMissing) {
      return { ok: false, missingFiles };
    }

    const loaded = restoreLibraryEntry(
      entry,
      libraryTargetBossId,
      new Set(missingFiles.map((file) => file.key)),
    );
    if (!loaded) {
      return { ok: false, error: 'A aba de destino não está mais disponível.' };
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
    if (entryIndex < 0) return { ok: false, error: 'Chefão salvo não encontrado.' };
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
        ? [{ name: 'Imagens e GIFs', extensions: [...supportedBackgroundExtensions].map((extension) => extension.slice(1)) }]
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
        return { ok: false, error: 'A imagem deve ter no máximo 25 MB.' };
      }
    } catch {
      return { ok: false, error: 'Não foi possível ler o arquivo selecionado.' };
    }
    if (!(await fileIsAvailable(replacementPath, missingFile.kind))) {
      return {
        ok: false,
        error: isBackground
          ? 'Selecione uma imagem ou GIF compatível.'
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
    if (!isMasterSender(event.sender.id)) {
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
  if (!isMasterSender(event.sender.id)) {
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

  if (command.type === 'remove-boss') {
    linkedLibraryEntries.delete(command.bossId);
  }

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
    linkedLibraryEntries.clear();
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

const createAudioResponse = async (request: Request, filePath: string) => {
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
    'Content-Type': 'audio/mpeg',
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
        errorLabel = 'imagem';
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
        return await createAudioResponse(request, mediaPath);
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

  createWindows();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  allowAppClose = true;
  pendingHealthTimers.forEach(clearTimeout);
  pendingHealthTimers.clear();
  if (battleMusicStartTimer) clearTimeout(battleMusicStartTimer);
  if (playerWindowCloseTimer) clearTimeout(playerWindowCloseTimer);
  if (masterFocusTimer) clearTimeout(masterFocusTimer);
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindows();
  }
});
