import { app, BrowserWindow, dialog, ipcMain, net, protocol, screen } from 'electron';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
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

const rendererFile = (page: 'master' | 'player' | 'music') =>
  path.join(
    __dirname,
    `../renderer/${MAIN_WINDOW_VITE_NAME}/${page}.html`,
  );

const loadRenderer = (
  window: BrowserWindow,
  page: 'master' | 'player' | 'music',
) => {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void window.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}/${page}.html`);
    return;
  }

  void window.loadFile(rendererFile(page));
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
  revision: soundboardRevision,
});

const broadcastMusicState = () => {
  const nextState = getMusicState();
  for (const window of [musicWindow, playerWindow]) {
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
  const { workArea } = screen.getDisplayMatching(musicWindow.getBounds());
  const width = Math.min(soundboardOpen ? 1080 : 590, workArea.width);
  const height = Math.min(777, workArea.height);
  musicWindow.setBounds({
    x: workArea.x + Math.round((workArea.width - width) / 2),
    y: workArea.y + Math.round((workArea.height - height) / 2),
    width,
    height,
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
    height,
    x: workArea.x + Math.round((workArea.width - width) / 2),
    y: workArea.y + Math.round((workArea.height - height) / 2),
    width,
    minWidth: 470,
    minHeight: minimumHeight,
    maxHeight: height,
    title: 'Trilha Sonora',
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
  const masterHeight = Math.min(1320, workArea.height);
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
    ...bounds,
    show: false,
    minWidth: 800,
    minHeight: 450,
    title: 'Apresentação do Chefão',
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
    minWidth: 450,
    minHeight: Math.min(680, layout.master.height),
    maxHeight: Math.min(1320, screen.getPrimaryDisplay().workArea.height),
    title: 'Controle do Mestre',
    backgroundColor: '#111117',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
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

ipcMain.handle('music:get-state', (): MusicState => getMusicState());
ipcMain.handle(
  'music:get-playback',
  (): MusicPlaybackState => musicPlaybackState,
);
ipcMain.handle('soundboard:get-state', (): SoundboardState => getSoundboardState());
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
    for (const filePath of selection.filePaths) {
      if (path.extname(filePath).toLowerCase() !== '.mp3') continue;
      if (musicTracks.some((track) => track.filePath === filePath)) continue;

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

    for (let index = 0; index < request.hits; index += 1) {
      if (index === 0) {
        applyHealthMutation(request.type, request.bossId, effectiveAmountPerHit);
        continue;
      }

      const timer = setTimeout(() => {
        pendingHealthTimers.delete(timer);
        applyHealthMutation(request.type, request.bossId, effectiveAmountPerHit);
      }, index * 150);
      pendingHealthTimers.add(timer);
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
  const fileInfo = await stat(filePath);
  const fileSize = fileInfo.size;
  const rangeHeader = request.headers.get('range');
  const baseHeaders = new Headers({
    'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
    'Content-Type': 'audio/mpeg',
  });

  let start = 0;
  let end = Math.max(0, fileSize - 1);
  let partial = false;

  if (rangeHeader) {
    const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
    if (!match || (!match[1] && !match[2])) {
      baseHeaders.set('Content-Range', `bytes */${fileSize}`);
      return new Response(null, { status: 416, headers: baseHeaders });
    }

    partial = true;
    if (!match[1]) {
      const suffixLength = Number(match[2]);
      start = Math.max(0, fileSize - suffixLength);
    } else {
      start = Number(match[1]);
    }
    end = match[2] ? Number(match[2]) : fileSize - 1;
    end = Math.min(end, fileSize - 1);

    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      start >= fileSize ||
      end < start
    ) {
      baseHeaders.set('Content-Range', `bytes */${fileSize}`);
      return new Response(null, { status: 416, headers: baseHeaders });
    }
  }

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
  await protocol.handle('boss-media', async (request) => {
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
      const effectId = Number(decodeURIComponent(requestUrl.pathname.slice(1)));
      mediaPath = Number.isInteger(effectId)
        ? soundEffectSources.get(effectId)?.filePath ?? null
        : null;
      errorLabel = 'efeito sonoro';
    }

    if (!mediaPath) {
      return new Response(`${errorLabel} não encontrada.`, { status: 404 });
    }

    try {
      if (requestUrl.hostname === 'audio' || requestUrl.hostname === 'sfx') {
        return await createAudioResponse(request, mediaPath);
      }
      return await net.fetch(pathToFileURL(mediaPath).toString(), {
        method: request.method,
        headers: request.headers,
      });
    } catch {
      return new Response(`Não foi possível carregar a ${errorLabel}.`, {
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
