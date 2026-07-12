import { app, BrowserWindow, dialog, ipcMain, net, protocol, screen } from 'electron';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import started from 'electron-squirrel-startup';
import {
  applyBattleCommand,
  initialBattleState,
  isBattleCommand,
  type BackgroundSelectionResult,
  type BackgroundState,
  type BattleState,
  type HealthEffect,
  type HealthSequenceRequest,
  type HealthSequenceResult,
  type MusicCommand,
  type MusicSelectionResult,
  type MusicState,
  isMusicCommand,
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
type InternalMusicTrack = { id: string; name: string; filePath: string };
const musicTracks: InternalMusicTrack[] = [];
let musicTrackSequence = 0;
let musicState: Omit<MusicState, 'tracks'> = {
  currentTrackId: null,
  isPlaying: false,
  loop: false,
  volume: 0.8,
  playbackVersion: 0,
  revision: 0,
};
let battleMusicStartTimer: ReturnType<typeof setTimeout> | null = null;
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
  tracks: musicTracks.map(({ id, name }) => ({
    id,
    name,
    url: `boss-media://audio/${id}`,
  })),
});

const broadcastMusicState = () => {
  const nextState = getMusicState();
  for (const window of [musicWindow, playerWindow]) {
    if (window && !window.isDestroyed()) {
      window.webContents.send('music:state-changed', nextState);
    }
  }
};

const createMusicWindow = () => {
  if (musicWindow && !musicWindow.isDestroyed()) {
    if (musicWindow.isMinimized()) musicWindow.restore();
    musicWindow.show();
    musicWindow.focus();
    return musicWindow;
  }

  const window = new BrowserWindow({
    width: 560,
    height: 700,
    minWidth: 470,
    minHeight: 560,
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
  const edge = 12;
  const gap = 12;
  const masterWidth = 460;
  const masterHeight = Math.max(680, Math.min(820, workArea.height - edge * 2));
  const maximumCenteredPlayerWidth =
    workArea.width - (masterWidth + gap + edge) * 2;
  let playerWidth = Math.max(
    800,
    Math.min(1280, maximumCenteredPlayerWidth),
  );
  let playerHeight = Math.round(playerWidth * (9 / 16));
  const maximumPlayerHeight = Math.max(450, workArea.height - edge * 2);

  if (playerHeight > maximumPlayerHeight) {
    playerHeight = maximumPlayerHeight;
    playerWidth = Math.max(800, Math.round(playerHeight * (16 / 9)));
  }

  let playerX =
    workArea.x + Math.round((workArea.width - playerWidth) / 2);
  let masterX = playerX + playerWidth + gap;
  const rightEdge = workArea.x + workArea.width - edge;
  const combinedWidth = playerWidth + gap + masterWidth;

  if (masterX + masterWidth > rightEdge) {
    if (combinedWidth <= workArea.width - edge * 2) {
      const overflow = masterX + masterWidth - rightEdge;
      playerX -= overflow;
      masterX -= overflow;
    } else {
      masterX = rightEdge - masterWidth;
    }
  }

  return {
    player: {
      x: playerX,
      y: workArea.y + Math.round((workArea.height - playerHeight) / 2),
      width: playerWidth,
      height: playerHeight,
    },
    master: {
      x: masterX,
      y: workArea.y + Math.round((workArea.height - masterHeight) / 2),
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
    minWidth: 460,
    minHeight: 680,
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

  masterWindow.on('closed', () => {
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

      musicTrackSequence += 1;
      musicTracks.push({
        id: String(musicTrackSequence),
        name: path.basename(filePath, path.extname(filePath)),
        filePath,
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
    case 'set-volume':
      musicState = {
        ...musicState,
        volume: Math.max(0, Math.min(1, command.volume)),
        revision: musicState.revision + 1,
      };
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
      request.hits > 1000
    ) {
      return { ok: false, error: 'Valor ou quantidade de parcelas inválida.' };
    }

    const boss = battleState.bosses.find((item) => item.id === request.bossId);
    if (!boss) return { ok: false, error: 'Chefão não encontrado.' };

    const total = Math.min(1_000_000, Math.ceil(request.total));
    const amountPerHit = Math.ceil(total / request.hits);
    const reductionPerHit =
      request.type === 'damage'
        ? Math.ceil(boss.damageReduction / request.hits)
        : 0;
    const effectiveAmount =
      request.type === 'damage'
        ? Math.max(1, amountPerHit - reductionPerHit)
        : amountPerHit;

    for (let index = 0; index < request.hits; index += 1) {
      if (index === 0) {
        applyHealthMutation(request.type, request.bossId, effectiveAmount);
        continue;
      }

      const timer = setTimeout(() => {
        pendingHealthTimers.delete(timer);
        applyHealthMutation(request.type, request.bossId, effectiveAmount);
      }, index * 150);
      pendingHealthTimers.add(timer);
    }

    return {
      ok: true,
      hits: request.hits,
      amountPerHit: effectiveAmount,
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
    }

    if (!mediaPath) {
      return new Response(`${errorLabel} não encontrada.`, { status: 404 });
    }

    try {
      return await net.fetch(pathToFileURL(mediaPath).toString());
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
  pendingHealthTimers.forEach(clearTimeout);
  pendingHealthTimers.clear();
  if (battleMusicStartTimer) clearTimeout(battleMusicStartTimer);
  if (playerWindowCloseTimer) clearTimeout(playerWindowCloseTimer);
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindows();
  }
});
