import { io, type Socket } from 'socket.io-client';
import { rewriteCutsceneMedia } from './multiplayer/public-presentation.ts';
import type { BossAPI } from './shared/api.ts';
import type {
  CharacterSheetUploadResult,
  CharacterPortraitUploadResult,
  CharacterSheetEditorField,
  CharacterSheetEditorResult,
  NotesSaveResult,
  PlayerAccountStatus,
  PlayerAuthenticationResult,
  PlayerCharacterSheetStatus,
  PlayerCharacterPortraitStatus,
} from './shared/character-sheet.ts';
import {
  BOSS_CRITICAL_DUCK_FADE_MS,
  BOSS_CRITICAL_THREAT_DURATION_MS,
  initialBattleState,
  initialEncounterEffectsState,
  type BackgroundState,
  type BattleState,
  type EncounterEffectsState,
  type EncounterSoundEffect,
  type HealthEffect,
  type MusicDuckEvent,
  type MusicState,
  type SoundEffect,
  type SoundboardState,
  type SoundboardStop,
} from './shared/battle.ts';
import { createBossSkillValues } from './shared/boss-skills.ts';
import { createInitialBossAttack } from './shared/boss-attacks.ts';
import {
  MEDIA_CACHE_GLOBAL_LIMIT_BYTES,
  MEDIA_CACHE_ITEM_LIMIT_BYTES,
} from './shared/media-cache.ts';
import {
  MAX_MULTIPLAYER_PLAYERS,
  MULTIPLAYER_PROTOCOL_VERSION,
  type MultiplayerClientToServerEvents,
  type MultiplayerConnectionErrorCode,
  type MultiplayerConnectionErrorData,
  type MultiplayerOccupancy,
  type PublicBattlePresentationState,
  type PublicCombatImpact,
  type PublicMusicPresentationState,
  type PublicScenePresentationState,
  type PublicSoundboardPresentationState,
  type MultiplayerServerToClientEvents,
  type MultiplayerSessionSnapshot,
} from './shared/multiplayer.ts';
import type {
  EncounterTurnActionResult,
  EncounterTurnState,
  PlayerCombatActionRequest,
  PlayerCombatActionResult,
  PlayerAreaDamageImpact,
  PlayerEncounterState,
  PlayerHudState,
  PlayerResourceNotice,
} from './shared/player-combat.ts';
import { emptyEncounterTurnState } from './shared/player-combat.ts';
import {
  createScenePlan,
  cutsceneMediaUrls,
  type ScenePlan,
  type SceneTransitionEvent,
} from './shared/scene.ts';

type Unsubscribe = () => void;
type Listener<Value> = (value: Value) => void;
type OrderedEventTask = (isCurrent: () => boolean) => void | Promise<void>;

export const createOrderedEventQueue = (
  onError: (error: unknown) => void = () => undefined,
) => {
  let generation = 0;
  let tail = Promise.resolve();
  return {
    enqueue(task: OrderedEventTask) {
      const taskGeneration = generation;
      const run = tail.then(async () => {
        const isCurrent = () => generation === taskGeneration;
        if (!isCurrent()) return;
        await task(isCurrent);
      });
      tail = run.catch(onError);
      return run;
    },
    reset() {
      generation += 1;
      tail = Promise.resolve();
    },
  };
};

export type WebPlayerConnectionState =
  | { state: 'connecting'; message: string }
  | { state: 'preloading'; message: string }
  | { state: 'awaiting-approval'; message: string }
  | { state: 'connected'; message: string }
  | { state: 'disconnected'; message: string }
  | { state: 'closed'; message: string }
  | { state: 'error'; message: string };

type PlayerApi = Pick<
  BossAPI,
  | 'undoLastChange'
  | 'getState'
  | 'subscribe'
  | 'getBackground'
  | 'subscribeBackground'
  | 'reportBackgroundError'
  | 'presentationReady'
  | 'reportCutsceneReady'
  | 'reportBackgroundProgress'
  | 'getPresentationTime'
  | 'subscribeHealthEffect'
  | 'getScenePlan'
  | 'subscribeScenePlan'
  | 'subscribeSceneTransition'
  | 'getEncounterEffectsState'
  | 'subscribeEncounterEffects'
  | 'subscribeEncounterEffect'
  | 'encounterEffectStarted'
  | 'encounterEffectFinished'
  | 'getMusicState'
  | 'subscribeMusic'
  | 'subscribeMusicSeek'
  | 'subscribeMusicFadeOut'
  | 'subscribeMusicDuck'
  | 'musicTrackEnded'
  | 'musicFadeoutComplete'
  | 'reportMusicProgress'
  | 'getSoundboardState'
  | 'subscribeSoundboard'
  | 'subscribeSoundboardStop'
  | 'subscribeSoundEffect'
  | 'soundEffectFinished'
  | 'reportSoundEffectError'
  | 'getPlayerHuds'
  | 'subscribePlayerHuds'
  | 'getEncounterTurnState'
  | 'subscribeEncounterTurn'
  | 'advanceEncounterTurn'
  | 'rollEncounterInitiative'
  | 'rollEncounterFormula'
  | 'requestPlayerCombatAction'
  | 'subscribePlayerResourceNotice'
  | 'usePlayerAction'
>;

const createChannel = <Value,>(initialValue: Value) => {
  let currentValue = initialValue;
  const listeners = new Set<Listener<Value>>();
  return {
    current: () => currentValue,
    publish: (value: Value) => {
      currentValue = value;
      listeners.forEach((listener) => listener(value));
    },
    subscribe: (listener: Listener<Value>): Unsubscribe => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};

const createEventChannel = <Value,>() => {
  const listeners = new Set<Listener<Value>>();
  return {
    publish: (value: Value) => listeners.forEach((listener) => listener(value)),
    subscribe: (listener: Listener<Value>): Unsubscribe => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};

const createReplayEventChannel = <Value,>() => {
  let latest: Value | null = null;
  const channel = createEventChannel<Value>();
  return {
    publish: (value: Value) => {
      latest = value;
      channel.publish(value);
    },
    subscribe: (listener: Listener<Value>): Unsubscribe => {
      let active = true;
      const unsubscribe = channel.subscribe(listener);
      if (latest !== null) {
        queueMicrotask(() => {
          if (active && latest !== null) listener(latest);
        });
      }
      return () => {
        active = false;
        unsubscribe();
      };
    },
  };
};

const emptyMusicState: MusicState = {
  tracks: [],
  currentTrackId: null,
  isPlaying: false,
  loop: false,
  volume: 0.8,
  muted: false,
  universalMuted: false,
  playbackVersion: 0,
  revision: 0,
};

const emptySoundboardState: SoundboardState = {
  slots: Array.from({ length: 20 }, (_, index) => ({
    index: index + 1,
    name: null,
    assigned: false,
  })),
  volume: 0.8,
  muted: false,
  loop: false,
  universalMuted: false,
  revision: 0,
};

const emptyBackgroundState: BackgroundState = {
  url: null,
  name: null,
  mediaType: null,
};

export const toBattleState = (
  state: PublicBattlePresentationState,
): BattleState => ({
  bosses: state.bosses.map((boss) => ({
    ...boss,
    identityPrepared: true,
    actionPrepared: true,
    controlAmount: '0',
    applyDamageReduction: false,
    attack: 0,
    rangedAttack: 0,
    defense: 0,
    rangedDefense: 0,
    skills: 0,
    skillValues: createBossSkillValues(0),
    skillOverrides: [],
    damageReduction: 0,
    attacks: [createInitialBossAttack(boss.id)],
    selectedAttackId: `boss-attack:${boss.id}:1`,
  })),
  activeBossId: state.bosses[0]?.id ?? '',
  battleStarted: state.battleStarted,
  hudVisible: state.hudVisible,
  backgroundName: null,
  revision: state.revision,
});

export const toScenePlan = (
  state: PublicScenePresentationState,
  currentBattle: BattleState,
): ScenePlan => {
  const base = createScenePlan(currentBattle.bosses);
  const triggerBossId = state.phaseMarkers[0]?.triggerBossId ??
    currentBattle.bosses[0]?.id ??
    'boss-1';
  const triggerBoss = currentBattle.bosses.find(
    (boss) => boss.id === triggerBossId,
  );
  const maximum = triggerBoss?.maxHealth ?? 1;
  const transitionMarkers = state.phaseMarkers
    .filter((marker) => marker.triggerBossId === triggerBossId)
    .filter((marker) => marker.startHealth > 0 && marker.startHealth < maximum)
    .sort((left, right) => right.startHealth - left.startHealth);
  const firstPhase = {
    ...base.phases[0],
    triggerBossId,
    startHealth: maximum,
  };
  return {
    ...base,
    phases: [
      firstPhase,
      ...transitionMarkers.map((marker, index) => ({
        ...firstPhase,
        id: marker.phaseId,
        name: `Fase ${index + 2}`,
        startHealth: marker.startHealth,
      })),
    ],
    showPhaseMarkers: transitionMarkers.length > 0,
    activePhaseIndex: state.activePhaseIndex,
    blackoutActive: state.blackoutActive,
    cutscenePlayback: state.cutscenePlayback ?? null,
    phaseEntrance: state.phaseEntrance ?? null,
    revision: state.revision,
  };
};

export const toSoundboardState = (
  state: PublicSoundboardPresentationState,
): SoundboardState => ({
  ...state,
  slots: emptySoundboardState.slots,
});

export const publicMediaUrlsFromSnapshot = (
  snapshot: MultiplayerSessionSnapshot,
) => [...new Set([
  snapshot.background.url,
  ...cutsceneMediaUrls(snapshot.scene.cutscenePlayback),
  ...snapshot.music.tracks.map(({ url }) => url),
  ...(snapshot.encounterSoundUrls ?? []),
].filter((url): url is string => Boolean(url)))];

export const criticalMediaUrlsFromSnapshot = (
  snapshot: MultiplayerSessionSnapshot,
) => {
  const currentTrackUrl = snapshot.music.tracks.find(
    ({ id }) => id === snapshot.music.currentTrackId,
  )?.url;
  return [...new Set([
    snapshot.background.url,
    ...cutsceneMediaUrls(snapshot.scene.cutscenePlayback),
    currentTrackUrl,
  ].filter((url): url is string => Boolean(url)))];
};

const connectionErrorMessages: Record<MultiplayerConnectionErrorCode, string> = {
  ACCOUNT_AUTH_REQUIRED: 'Entre novamente com seu usuário e senha.',
  INVALID_AUTH: 'O link desta sessão é inválido.',
  INVALID_CLIENT_ID: 'Não foi possível identificar este navegador.',
  INVALID_NAME: 'O nome deste jogador não é válido.',
  INVALID_TOKEN: 'O convite desta sessão não é mais válido.',
  PROTOCOL_MISMATCH: 'A versão desta apresentação não corresponde à do mestre.',
  ROOM_FULL: `A sala atingiu o limite de ${MAX_MULTIPLAYER_PLAYERS} jogadores.`,
  NAME_IN_USE: 'Este usuário já está conectado nesta sala.',
  ROOM_NOT_FOUND: 'Esta sala não existe ou já foi encerrada.',
};

const queryValue = (parameters: URLSearchParams, ...names: string[]) => {
  for (const name of names) {
    const value = parameters.get(name)?.trim();
    if (value) return value;
  }
  return '';
};

const sessionPathRoom = () => {
  const match = window.location.pathname.match(/\/(?:join|session)\/([^/]+)/i);
  return match ? decodeURIComponent(match[1]) : '';
};

const getOrCreateClientId = () => {
  const storageKey = 'bossbar.multiplayer.client-id';
  const existing = window.sessionStorage.getItem(storageKey);
  if (existing) return existing;
  const id = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  window.sessionStorage.setItem(storageKey, id);
  return id;
};

const resolveConnectionParameters = () => {
  const parameters = new URLSearchParams(window.location.search);
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const roomCode = (queryValue(parameters, 'room', 'roomCode') || sessionPathRoom())
    .toUpperCase();
  const playerToken = queryValue(fragment, 'token', 'playerToken') ||
    queryValue(parameters, 'token', 'playerToken');
  const clientId = getOrCreateClientId();
  const hostToken = queryValue(fragment, 'host');
  return { roomCode, playerToken, clientId, hostToken };
};

const getConnectionErrorCode = (error: Error & { data?: unknown }) => {
  const data = error.data as Partial<MultiplayerConnectionErrorData> | undefined;
  return data?.code && data.code in connectionErrorMessages
    ? data.code as MultiplayerConnectionErrorCode
    : null;
};

export const createWebPlayerApi = ({
  onConnectionState,
  onSessionReady,
  onPlayerState,
  onCharacterSheetChanged,
  onPlayerCombatImpact,
}: {
  onConnectionState: (state: WebPlayerConnectionState) => void;
  onSessionReady?: () => void;
  onPlayerState?: (state: PlayerEncounterState | null) => void;
  onCharacterSheetChanged?: (sheet: PlayerCharacterSheetStatus | null) => void;
  onPlayerCombatImpact?: (impact: PlayerAreaDamageImpact) => void;
}) => {
  const battle = createChannel<BattleState>(initialBattleState);
  const background = createChannel<BackgroundState>(emptyBackgroundState);
  const scenePlan = createChannel<ScenePlan>(
    createScenePlan(initialBattleState.bosses),
  );
  const encounterEffects = createChannel<EncounterEffectsState>(
    initialEncounterEffectsState,
  );
  const music = createChannel<MusicState>(emptyMusicState);
  const soundboard = createChannel<SoundboardState>(emptySoundboardState);
  const healthEffects = createEventChannel<HealthEffect>();
  const sceneTransitions = createReplayEventChannel<SceneTransitionEvent>();
  const musicSeek = createReplayEventChannel<number>();
  const musicFadeOut = createEventChannel<number>();
  // A critical cue can arrive while the React presentation is completing its
  // dynamic mount. Replaying only the latest phase prevents that short race;
  // the subsequent restore phase replaces any stale threat/impact event.
  const musicDuck = createReplayEventChannel<MusicDuckEvent>();
  const soundboardStops = createEventChannel<SoundboardStop>();
  const soundEffects = createEventChannel<SoundEffect>();
  const encounterSoundEffects = createEventChannel<EncounterSoundEffect>();
  const playerHuds = createChannel<PlayerHudState[]>([]);
  const encounterTurn = createChannel<EncounterTurnState>(
    emptyEncounterTurnState(),
  );
  const resourceNotices = createEventChannel<PlayerResourceNotice>();
  const { roomCode, playerToken, clientId, hostToken } =
    resolveConnectionParameters();
  const mediaPreloadPromises = new Map<string, Promise<boolean>>();
  const resolvedMediaUrls = new Map<string, string>();
  let serverClockOffset = 0;
  let bestClockRoundTrip = Number.POSITIVE_INFINITY;
  const maxResidentMediaItemBytes = MEDIA_CACHE_ITEM_LIMIT_BYTES;
  const maxResidentMediaTotalBytes = MEDIA_CACHE_GLOBAL_LIMIT_BYTES;
  const activePreloadControllers = new Set<AbortController>();
  const activePreloadElements = new Set<HTMLImageElement | HTMLMediaElement>();
  const eventQueue = createOrderedEventQueue((error) => {
    console.error('Falha ao processar um evento da sessão na ordem recebida.', error);
  });
  const pendingCombatImpacts: Array<{
    impact: PublicCombatImpact;
    timeout: ReturnType<typeof setTimeout> | null;
  }> = [];
  const musicDuckThreatEndsAt = new Map<number, number>();
  const musicDuckImpactEndsAt = new Map<number, number>();

  let latestOccupancy: MultiplayerOccupancy | null = null;
  let receivedSnapshot = false;
  let latestPublicScene: PublicScenePresentationState | null = null;
  let deferredBattleState: PublicBattlePresentationState | null = null;
  let snapshotLoadSequence = 0;
  let manifestPreloadPromise: Promise<boolean> | null = null;
  let residentMediaBytes = 0;
  let accountToken = '';
  let authenticatedUsername = '';
  let currentSheet: PlayerCharacterSheetStatus | null = null;
  let currentPortrait: PlayerCharacterPortraitStatus | null = null;
  let currentNotes = '';
  let accountStatusCache: {
    username: string;
    expiresAt: number;
    request: Promise<PlayerAccountStatus>;
  } | null = null;
  let sheetViewUrlCache: {
    url: string;
    expiresAt: number;
  } | null = null;
  let sheetViewUrlRequest: Promise<string> | null = null;

  const inviteHeaders = () => ({
    Authorization: `Bearer ${playerToken}`,
    'Content-Type': 'application/json',
    'X-BossBar-Room': roomCode,
  });
  const accountHeaders = (contentType?: string) => ({
    Authorization: `Bearer ${accountToken}`,
    ...(contentType ? { 'Content-Type': contentType } : {}),
    'X-BossBar-Room': roomCode,
  });
  const readError = async (response: Response, fallback: string) => {
    try {
      const payload = await response.json() as { error?: unknown };
      return typeof payload.error === 'string' ? payload.error : fallback;
    } catch {
      return fallback;
    }
  };

  const invalidateCharacterSheetViewUrl = () => {
    sheetViewUrlCache = null;
    sheetViewUrlRequest = null;
  };

  const createCharacterSheetViewUrl = async () => {
    if (sheetViewUrlCache && sheetViewUrlCache.expiresAt > Date.now()) {
      return sheetViewUrlCache.url;
    }
    if (sheetViewUrlRequest) return sheetViewUrlRequest;
    const request = fetch('/api/player/sheet/view-ticket', {
      method: 'POST',
      cache: 'no-store',
      headers: accountHeaders(),
    }).then(async (response) => {
      const result = await response.json() as { ok?: boolean; url?: string; error?: string };
      if (!response.ok || !result.ok || !result.url) {
        throw new Error(result.error ?? 'Não foi possível liberar o acesso à ficha.');
      }
      sheetViewUrlCache = {
        url: result.url,
        expiresAt: Date.now() + 8 * 60_000,
      };
      return result.url;
    }).finally(() => {
      if (sheetViewUrlRequest === request) sheetViewUrlRequest = null;
    });
    sheetViewUrlRequest = request;
    return request;
  };

  const prefetchCharacterSheetViewUrl = async () => {
    if (!accountToken || !currentSheet?.hasSheet) return;
    try {
      await createCharacterSheetViewUrl();
    } catch {
      // Opening the sheet reports the actionable error if the user requests it.
    }
  };

  const getAccountStatus = async (username: string): Promise<PlayerAccountStatus> => {
    const normalizedUsername = username.trim().normalize('NFKC').toLocaleLowerCase('pt-BR');
    if (
      accountStatusCache?.username === normalizedUsername &&
      accountStatusCache.expiresAt > Date.now()
    ) return accountStatusCache.request;
    const request = fetch('/api/player/account-status', {
      method: 'POST',
      cache: 'no-store',
      headers: inviteHeaders(),
      body: JSON.stringify({ username }),
    }).then(async (response) => {
      if (!response.ok) {
        throw new Error(await readError(response, 'Não foi possível verificar este usuário.'));
      }
      return response.json() as Promise<PlayerAccountStatus>;
    }).catch((error) => {
      if (accountStatusCache?.request === request) accountStatusCache = null;
      throw error;
    });
    accountStatusCache = {
      username: normalizedUsername,
      expiresAt: Date.now() + 30_000,
      request,
    };
    return request;
  };

  const authenticateAccount = async (
    username: string,
    password: string,
    createAccount: boolean,
  ): Promise<PlayerAuthenticationResult> => {
    const response = await fetch('/api/player/authenticate', {
      method: 'POST',
      cache: 'no-store',
      headers: inviteHeaders(),
      body: JSON.stringify({ username, password, createAccount, clientId }),
    });
    const result = await response.json() as PlayerAuthenticationResult;
    if (!response.ok || !result.ok || !result.sessionToken || !result.username) {
      return { ok: false, error: result.error ?? 'Não foi possível entrar.' };
    }
    accountToken = result.sessionToken;
    authenticatedUsername = result.username;
    currentSheet = result.sheet ?? null;
    currentPortrait = result.portrait ?? null;
    currentNotes = result.notes ?? '';
    if (currentSheet?.hasSheet) void prefetchCharacterSheetViewUrl();
    return result;
  };

  const uploadCharacterSheet = async (file: File): Promise<CharacterSheetUploadResult> => {
    if (!accountToken) return { ok: false, error: 'Entre novamente para enviar a ficha.' };
    const response = await fetch('/api/player/sheet', {
      method: 'POST',
      cache: 'no-store',
      headers: {
        ...accountHeaders('application/pdf'),
        'X-BossBar-Filename': encodeURIComponent(file.name),
      },
      body: file,
    });
    const result = await response.json() as CharacterSheetUploadResult;
    if (result.sheet) {
      currentSheet = result.sheet;
      invalidateCharacterSheetViewUrl();
      if (currentSheet.hasSheet) void prefetchCharacterSheetViewUrl();
    }
    return result;
  };

  const automaticallyFixCharacterSheet = async (): Promise<CharacterSheetUploadResult> => {
    const response = await fetch('/api/player/sheet/autofix', {
      method: 'POST',
      cache: 'no-store',
      headers: accountHeaders('application/json'),
      body: '{}',
    });
    const result = await response.json() as CharacterSheetUploadResult;
    if (result.sheet) {
      currentSheet = result.sheet;
      invalidateCharacterSheetViewUrl();
      if (currentSheet.hasSheet) void prefetchCharacterSheetViewUrl();
    }
    return result;
  };

  const fetchCharacterSheetBlob = async () => {
    const response = await fetch('/api/player/sheet', {
      cache: 'no-store',
      headers: accountHeaders(),
    });
    if (!response.ok) {
      throw new Error(await readError(response, 'Não foi possível abrir a ficha.'));
    }
    return response.blob();
  };

  const removeCharacterSheet = async (): Promise<CharacterSheetUploadResult> => {
    const response = await fetch('/api/player/sheet', {
      method: 'DELETE',
      cache: 'no-store',
      headers: accountHeaders(),
    });
    const result = await response.json() as CharacterSheetUploadResult;
    if (result.ok) {
      currentSheet = result.sheet ?? null;
      invalidateCharacterSheetViewUrl();
    }
    return result;
  };

  const uploadCharacterPortrait = async (
    file: File,
  ): Promise<CharacterPortraitUploadResult> => {
    if (!accountToken) return { ok: false, error: 'Entre novamente para enviar o retrato.' };
    const response = await fetch('/api/player/portrait', {
      method: 'POST',
      cache: 'no-store',
      headers: {
        ...accountHeaders(file.type),
        'X-BossBar-Filename': encodeURIComponent(file.name),
      },
      body: file,
    });
    const result = await response.json() as CharacterPortraitUploadResult;
    if (result.portrait) currentPortrait = result.portrait;
    return response.ok ? result : {
      ok: false,
      error: result.error ?? 'Não foi possível salvar o retrato.',
    };
  };

  const removeCharacterPortrait = async (): Promise<CharacterPortraitUploadResult> => {
    const response = await fetch('/api/player/portrait', {
      method: 'DELETE',
      cache: 'no-store',
      headers: accountHeaders(),
    });
    const result = await response.json() as CharacterPortraitUploadResult;
    if (result.ok) currentPortrait = result.portrait ?? null;
    return response.ok ? result : {
      ok: false,
      error: result.error ?? 'Não foi possível remover o retrato.',
    };
  };

  const getCharacterSheetEditor = async (): Promise<CharacterSheetEditorResult> => {
    const response = await fetch('/api/player/sheet/editor', {
      cache: 'no-store',
      headers: accountHeaders(),
    });
    const result = await response.json() as CharacterSheetEditorResult;
    return response.ok ? result : {
      ok: false,
      error: result.error ?? 'Não foi possível abrir o editor da ficha.',
    };
  };

  const saveCharacterSheetEditor = async (
    fields: CharacterSheetEditorField[],
  ): Promise<CharacterSheetEditorResult> => {
    const response = await fetch('/api/player/sheet/editor', {
      method: 'PUT',
      cache: 'no-store',
      headers: accountHeaders('application/json'),
      body: JSON.stringify({ fields }),
    });
    const result = await response.json() as CharacterSheetEditorResult;
    return response.ok ? result : {
      ok: false,
      error: result.error ?? 'Não foi possível salvar as alterações da ficha.',
    };
  };

  const saveNotes = async (content: string): Promise<NotesSaveResult> => {
    const response = await fetch('/api/player/notes', {
      method: 'PUT',
      cache: 'no-store',
      headers: accountHeaders('application/json'),
      body: JSON.stringify({ content }),
    });
    const result = await response.json() as NotesSaveResult;
    if (result.ok && typeof result.content === 'string') currentNotes = result.content;
    return result;
  };

  const refreshCharacterSheetStatus = async () => {
    if (!accountToken) return;
    const response = await fetch('/api/player/profile', {
      cache: 'no-store',
      headers: accountHeaders(),
    });
    if (!response.ok) return;
    const profile = await response.json() as {
      sheet?: PlayerCharacterSheetStatus;
      portrait?: PlayerCharacterPortraitStatus;
    };
    currentSheet = profile.sheet ?? null;
    currentPortrait = profile.portrait ?? null;
    invalidateCharacterSheetViewUrl();
    onCharacterSheetChanged?.(currentSheet);
  };

  const verifyMediaCanLoad = (
    url: string,
    contentType: string,
    signal: AbortSignal,
  ) => new Promise<boolean>((resolve) => {
    if (signal.aborted) {
      resolve(false);
      return;
    }
    if (!/^(?:audio|image|video)\//.test(contentType)) {
      resolve(true);
      return;
    }

    const isImage = contentType.startsWith('image/');
    const element = isImage
      ? new Image()
      : document.createElement(contentType.startsWith('video/') ? 'video' : 'audio');
    activePreloadElements.add(element);
    const successEvent = isImage ? 'load' : 'loadeddata';
    let settled = false;
    const finish = (loaded: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal.removeEventListener('abort', handleAbort);
      element.removeEventListener(successEvent, handleSuccess);
      element.removeEventListener('error', handleError);
      activePreloadElements.delete(element);
      if (element instanceof HTMLMediaElement) {
        element.pause();
        element.removeAttribute('src');
        element.load();
      } else {
        element.removeAttribute('src');
      }
      resolve(loaded);
    };
    const handleSuccess = () => finish(true);
    const handleError = () => finish(false);
    const handleAbort = () => finish(false);
    const timeout = setTimeout(() => finish(false), 12_000);
    signal.addEventListener('abort', handleAbort, { once: true });
    element.addEventListener(successEvent, handleSuccess, { once: true });
    element.addEventListener('error', handleError, { once: true });
    if (element instanceof HTMLMediaElement) {
      element.preload = 'auto';
      if (element instanceof HTMLVideoElement) element.muted = true;
      element.src = url;
      element.load();
    } else {
      element.src = url;
    }
  });

  const preloadMediaUrl = (url: string) => {
    if (!url) return Promise.resolve(true);
    const existing = mediaPreloadPromises.get(url);
    if (existing) return existing;
    const controller = new AbortController();
    activePreloadControllers.add(controller);
    const preload: Promise<boolean> = (async () => {
      const response = await fetch(url, {
        cache: 'force-cache',
        credentials: 'same-origin',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const contentType = response.headers.get('content-type') ?? '';
      const contentLengthHeader = response.headers.get('content-length');
      const contentLength = contentLengthHeader === null
        ? Number.NaN
        : Number(contentLengthHeader);
      const canKeepResident = Number.isSafeInteger(contentLength) &&
        contentLength >= 0 &&
        contentLength <= maxResidentMediaItemBytes &&
        residentMediaBytes + contentLength <= maxResidentMediaTotalBytes;
      if (!canKeepResident) {
        const reader = response.body?.getReader();
        if (reader) { try { while (!(await reader.read()).done) { /* stream into the HTTP cache */ } } finally { reader.releaseLock(); } }
        return verifyMediaCanLoad(url, contentType, controller.signal);
      }

      residentMediaBytes += contentLength;
      let reservationHeld = true;
      try {
        const mediaBlob = await response.blob();
        if (controller.signal.aborted) return false;
        const localUrl = URL.createObjectURL(mediaBlob);
        const loaded = await verifyMediaCanLoad(
          localUrl,
          contentType || mediaBlob.type,
          controller.signal,
        );
        if (!loaded || controller.signal.aborted) {
          URL.revokeObjectURL(localUrl);
          return false;
        }
        resolvedMediaUrls.set(url, localUrl);
        reservationHeld = false;
        return true;
      } finally {
        if (reservationHeld) residentMediaBytes -= contentLength;
      }
    })().catch((error: unknown) => {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        console.warn('Não foi possível pré-carregar uma mídia da sessão.', error);
      }
      return false;
    }).then((loaded) => {
      if (!loaded && mediaPreloadPromises.get(url) === preload) {
        mediaPreloadPromises.delete(url);
      }
      return loaded;
    }).finally(() => {
      activePreloadControllers.delete(controller);
    });
    mediaPreloadPromises.set(url, preload);
    return preload;
  };

  const preloadMediaUrls = async (urls: Array<string | null | undefined>) => {
    const queue = [...new Set(urls.filter((url): url is string => Boolean(url)))];
    let loaded = true;
    const workers = Array.from(
      { length: Math.min(4, queue.length) },
      async () => {
        while (queue.length > 0) {
          const url = queue.shift();
          if (url && !(await preloadMediaUrl(url))) loaded = false;
        }
      },
    );
    await Promise.all(workers);
    return loaded;
  };

  const waitForMediaUrls = async (
    urls: Array<string | null | undefined>,
    isCurrent: () => boolean = () => true,
  ) => {
    for (let attempt = 0; attempt < 3 && isCurrent(); attempt += 1) {
      if (await preloadMediaUrls(urls)) return true;
      if (attempt < 2 && isCurrent()) {
        await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
      }
    }
    return false;
  };

  const resolvedMediaUrl = (url: string | null | undefined) =>
    url ? resolvedMediaUrls.get(url) ?? url : url;

  const withResolvedBackground = (state: BackgroundState): BackgroundState => ({
    ...state,
    url: resolvedMediaUrl(state.url) ?? null,
  });

  const withResolvedMusic = (
    state: PublicMusicPresentationState,
  ): PublicMusicPresentationState => ({
    ...state,
    tracks: state.tracks.map((track) => ({
      ...track,
      url: resolvedMediaUrl(track.url) ?? track.url,
    })),
  });

  const withResolvedCombatImpact = (
    impact: PublicCombatImpact,
  ): PublicCombatImpact => ({
    ...impact,
    soundEffect: impact.soundEffect ? {
      ...impact.soundEffect,
      url: resolvedMediaUrl(impact.soundEffect.url) ?? impact.soundEffect.url,
    } : null,
  });

  const preloadSessionManifest = () => {
    if (manifestPreloadPromise) return manifestPreloadPromise;
    manifestPreloadPromise = roomCode && playerToken
      ? fetch('/api/preload', {
        cache: 'no-store',
        credentials: 'same-origin',
        headers: {
          Authorization: `Bearer ${playerToken}`,
          'X-BossBar-Room': roomCode,
        },
      })
        .then(async (response) => {
          if (!response.ok) return false;
          const manifest = await response.json() as {
            protocolVersion?: unknown;
            urls?: unknown;
          };
          if (
            manifest.protocolVersion !== MULTIPLAYER_PROTOCOL_VERSION ||
            !Array.isArray(manifest.urls)
          ) return false;
          const urls = manifest.urls.flatMap((candidate) => {
            if (typeof candidate !== 'string' || candidate.length > 2_048) return [];
            try {
              const parsed = new URL(candidate, window.location.href);
              return parsed.origin === window.location.origin &&
                parsed.pathname.startsWith('/session-media/')
                ? [candidate]
                : [];
            } catch {
              return [];
            }
          }).slice(0, 8192);
          return waitForMediaUrls(urls);
        })
        .catch(() => false)
      : Promise.resolve(false);
    return manifestPreloadPromise;
  };

  const clearTransientMediaCache = () => {
    snapshotLoadSequence += 1;
    eventQueue.reset();
    musicDuckThreatEndsAt.clear();
    musicDuckImpactEndsAt.clear();
    activePreloadControllers.forEach((controller) => controller.abort());
    activePreloadControllers.clear();
    activePreloadElements.forEach((element) => {
      if (element instanceof HTMLMediaElement) {
        element.pause();
        element.removeAttribute('src');
        element.load();
      } else {
        element.removeAttribute('src');
      }
    });
    activePreloadElements.clear();
    resolvedMediaUrls.forEach((localUrl) => URL.revokeObjectURL(localUrl));
    resolvedMediaUrls.clear();
    residentMediaBytes = 0;
    mediaPreloadPromises.clear();
    manifestPreloadPromise = null;
  };

  const requestBrowserCacheClear = async () => {
    if (!roomCode || !playerToken) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1_400);
    try {
      await fetch('/api/session-cache/clear', {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: {
          Authorization: `Bearer ${playerToken}`,
          'X-BossBar-Room': roomCode,
        },
        signal: controller.signal,
      });
    } catch {
      // The room may already be closing. Its unique media URLs become unusable
      // as soon as the temporary server and tunnel stop.
    } finally {
      clearTimeout(timeout);
    }
  };

  void preloadSessionManifest();

  const publishBattle = (nextBattle: PublicBattlePresentationState) => {
    const fullBattle = toBattleState(nextBattle);
    battle.publish(fullBattle);
    if (latestPublicScene) {
      scenePlan.publish(toScenePlan(latestPublicScene, fullBattle));
    }
  };

  const publishScene = (nextScene: PublicScenePresentationState) => {
    latestPublicScene = { ...nextScene, cutscenePlayback: nextScene.cutscenePlayback
      ? rewriteCutsceneMedia(nextScene.cutscenePlayback, (url) => resolvedMediaUrl(url) ?? url) : null };
    scenePlan.publish(toScenePlan(latestPublicScene, battle.current()));
  };

  const preloadEncounterSounds = (urls: string[]) => {
    return preloadMediaUrls(urls);
  };

  const releaseCurrentCombatImpact = (soundEffectId?: number) => {
    const pending = pendingCombatImpacts[0];
    if (!pending) return;
    const expectedSoundId = pending.impact.soundEffect?.id;
    if (
      expectedSoundId !== undefined &&
      soundEffectId !== undefined &&
      soundEffectId !== expectedSoundId
    ) return;
    if (pending.timeout) clearTimeout(pending.timeout);
    pendingCombatImpacts.shift();
    healthEffects.publish(pending.impact.healthEffect);
    publishBattle(pending.impact.battle);
    const next = pendingCombatImpacts[0];
    if (next) {
      startCurrentCombatImpact();
    } else if (deferredBattleState) {
      const nextBattle = deferredBattleState;
      deferredBattleState = null;
      publishBattle(nextBattle);
    }
  };

  function startCurrentCombatImpact() {
    const pending = pendingCombatImpacts[0];
    if (!pending) return;
    const soundEffect = pending.impact.soundEffect;
    if (!soundEffect) {
      releaseCurrentCombatImpact();
      return;
    }
    pending.timeout = setTimeout(() => {
      releaseCurrentCombatImpact(soundEffect.id);
    }, 4_000);
    encounterSoundEffects.publish(soundEffect);
  }

  const enqueueCombatImpact = (impact: PublicCombatImpact) => {
    pendingCombatImpacts.push({ impact, timeout: null });
    if (pendingCombatImpacts.length === 1) startCurrentCombatImpact();
  };

  const clearPendingCombatImpacts = () => {
    pendingCombatImpacts.forEach(({ timeout }) => {
      if (timeout) clearTimeout(timeout);
    });
    pendingCombatImpacts.length = 0;
    deferredBattleState = null;
  };

  const applySnapshot = async (snapshot: MultiplayerSessionSnapshot) => {
    const loadSequence = ++snapshotLoadSequence;
    onConnectionState({
      state: 'preloading',
      message: 'Carregando a cena e os sons do encontro…',
    });
    void preloadSessionManifest();
    const currentMediaLoaded = await waitForMediaUrls(
      criticalMediaUrlsFromSnapshot(snapshot),
      () => loadSequence === snapshotLoadSequence,
    );
    if (loadSequence !== snapshotLoadSequence) return;
    if (!currentMediaLoaded) {
      onConnectionState({
        state: 'error',
        message: 'Uma mídia necessária não pôde ser carregada. Atualize a página para tentar novamente.',
      });
      return;
    }
    clearPendingCombatImpacts();
    receivedSnapshot = true;
    publishBattle(snapshot.battle);
    background.publish(withResolvedBackground(snapshot.background));
    publishScene(snapshot.scene);
    encounterEffects.publish(snapshot.encounterEffects);
    music.publish(withResolvedMusic(snapshot.music));
    const currentTrack = snapshot.music.tracks.find(
      ({ id }) => id === snapshot.music.currentTrackId,
    );
    const elapsed = snapshot.music.isPlaying
      ? Math.max(0, Date.now() - snapshot.music.synchronizedAt) / 1000
      : 0;
    musicSeek.publish(Math.min(
      currentTrack?.duration ?? Number.POSITIVE_INFINITY,
      Math.max(0, snapshot.music.currentTime + elapsed),
    ));
    soundboard.publish(toSoundboardState(snapshot.soundboard));
    void preloadEncounterSounds(snapshot.encounterSoundUrls ?? []);
    if (snapshot.scene.blackoutActive) {
      sceneTransitions.publish({
        id: -(snapshot.scene.revision + 1),
        phaseId: 'remote-blackout',
        kind: 'blackout',
        stage: 'enter',
        durationMs: 0,
        soundDelayMs: 0,
        soundUrl: null,
        soundVolume: 0,
        soundMuted: true,
        soundLoop: false,
        visual: true,
      });
    }
    onConnectionState({
      state: 'connected',
      message: latestOccupancy
        ? `Conectado à sala ${roomCode} · ${latestOccupancy.connectedPlayers}/${latestOccupancy.maxPlayers}`
        : `Conectado à sala ${roomCode}`,
    });
    onSessionReady?.();
  };

  let endOwnTurnHandler = async (): Promise<EncounterTurnActionResult> => ({
    ok: false,
    error: 'O jogador ainda não está conectado.',
  });
  let rollInitiativeHandler = async (
    extremeAdvantage = false,
  ): Promise<EncounterTurnActionResult> => {
    void extremeAdvantage;
    return {
      ok: false,
      error: 'O jogador ainda não está conectado.',
    };
  };
  let usePlayerActionHandler: BossAPI['usePlayerAction'] = async () => ({
    ok: false,
    error: 'O jogador ainda não está conectado.',
  });
  let requestPlayerCombatActionHandler: BossAPI['requestPlayerCombatAction'] =
    async () => ({
      ok: false,
      error: 'O jogador ainda não está conectado.',
    });
  const api: PlayerApi = {
    undoLastChange: async () => false,
    getState: async () => battle.current(),
    subscribe: battle.subscribe,
    getBackground: async () => background.current(),
    subscribeBackground: background.subscribe,
    reportBackgroundError: (message) => console.warn(message),
    presentationReady: () => undefined,
    getPresentationTime: () => Date.now() + serverClockOffset,
    reportCutsceneReady: (id, duration) => socket.emit('presentation:cutscene-ready', id, duration),
    reportBackgroundProgress: () => undefined,
    subscribeHealthEffect: healthEffects.subscribe,
    getScenePlan: async () => scenePlan.current(),
    subscribeScenePlan: scenePlan.subscribe,
    subscribeSceneTransition: sceneTransitions.subscribe,
    getEncounterEffectsState: async () => encounterEffects.current(),
    subscribeEncounterEffects: encounterEffects.subscribe,
    subscribeEncounterEffect: encounterSoundEffects.subscribe,
    encounterEffectStarted: releaseCurrentCombatImpact,
    encounterEffectFinished: () => undefined,
    getMusicState: async () => music.current(),
    subscribeMusic: music.subscribe,
    subscribeMusicSeek: musicSeek.subscribe,
    subscribeMusicFadeOut: musicFadeOut.subscribe,
    subscribeMusicDuck: musicDuck.subscribe,
    musicTrackEnded: () => undefined,
    musicFadeoutComplete: () => undefined,
    reportMusicProgress: () => undefined,
    getSoundboardState: async () => soundboard.current(),
    subscribeSoundboard: soundboard.subscribe,
    subscribeSoundboardStop: soundboardStops.subscribe,
    subscribeSoundEffect: soundEffects.subscribe,
    soundEffectFinished: () => undefined,
    reportSoundEffectError: () => undefined,
    getPlayerHuds: async () => playerHuds.current(),
    subscribePlayerHuds: (listener) => {
      const unsubscribe = playerHuds.subscribe(listener);
      listener(playerHuds.current());
      return unsubscribe;
    },
    getEncounterTurnState: async () => encounterTurn.current(),
    subscribeEncounterTurn: (listener) => {
      const unsubscribe = encounterTurn.subscribe(listener);
      listener(encounterTurn.current());
      return unsubscribe;
    },
    advanceEncounterTurn: () => endOwnTurnHandler(),
    rollEncounterInitiative: (_participantId, extremeAdvantage = false) =>
      rollInitiativeHandler(extremeAdvantage),
    rollEncounterFormula: async () => ({
      ok: false,
      error: 'Somente o mestre pode rolar fórmulas pelo painel.',
    }),
    requestPlayerCombatAction: (request) =>
      requestPlayerCombatActionHandler(request),
    subscribePlayerResourceNotice: resourceNotices.subscribe,
    usePlayerAction: (action) => usePlayerActionHandler(action),
  };

  if (!roomCode || !playerToken) {
    onConnectionState({
      state: 'error',
      message: 'O link da sessão está incompleto. Solicite um novo convite ao mestre.',
    });
    return {
      api: api as BossAPI,
      canConnect: false,
      getAccountStatus,
      connect: async () => ({ ok: false, error: 'O link da sessão está incompleto.' }),
      leave: () => undefined,
      dispose: () => undefined,
      socket: null,
      uploadCharacterSheet,
      uploadCharacterPortrait,
      removeCharacterPortrait,
      automaticallyFixCharacterSheet,
      fetchCharacterSheetBlob,
      createCharacterSheetViewUrl,
      removeCharacterSheet,
      getCharacterSheetEditor,
      saveCharacterSheetEditor,
      setCharacterSheetEditorOpen: async () => ({
        ok: false,
        error: 'O jogador ainda não está conectado.',
      }),
      blankCharacterSheetUrl: '/api/player/blank-sheet',
      saveNotes,
      setCharacterPrivate: async () => ({
        ok: false,
        error: 'O link da sessão está incompleto.',
      }),
      usePlayerAction: async () => ({
        ok: false,
        error: 'O link da sessão está incompleto.',
      }),
      endOwnTurn: async () => ({
        ok: false,
        error: 'O link da sessão está incompleto.',
      }),
      getPlayerToolsState: () => ({
        username: authenticatedUsername,
        sheet: currentSheet,
        portrait: currentPortrait,
        notes: currentNotes,
      }),
    };
  }

  const socket: Socket<
    MultiplayerServerToClientEvents,
    MultiplayerClientToServerEvents
  > = io({
    autoConnect: false,
    transports: ['websocket'],
    timeout: 10_000,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5_000,
  });

  const synchronizeClock = () => {
    bestClockRoundTrip = Number.POSITIVE_INFINITY;
    for (let sample = 0; sample < 3; sample += 1) {
      const sentAt = Date.now();
      socket.emit('session:clock', (serverTime) => {
        const receivedAt = Date.now();
        const rtt = receivedAt - sentAt;
        if (Number.isFinite(serverTime) && rtt < bestClockRoundTrip) {
          bestClockRoundTrip = rtt;
          serverClockOffset = serverTime - (sentAt + receivedAt) / 2;
        }
      });
    }
  };
  socket.on('connect', () => {
    synchronizeClock();
    onConnectionState({
      state: 'connecting',
      message: receivedSnapshot
        ? 'Reconectado. Atualizando o encontro…'
        : 'Conectado. Preparando o encontro…',
    });
  });
  socket.on('connect_error', (error) => {
    const code = getConnectionErrorCode(error);
    onConnectionState({
      state: 'error',
      message: code
        ? connectionErrorMessages[code]
        : 'Não foi possível conectar. Tentando novamente…',
    });
  });
  socket.on('disconnect', (reason) => {
    if (reason === 'io client disconnect') return;
    onConnectionState({
      state: 'disconnected',
      message: 'Conexão interrompida. Tentando reconectar…',
    });
  });
  socket.on('session:snapshot', (snapshot) => {
    // Approval can happen long after the transport connects. Sample again
    // now that the authenticated player handlers are definitely registered.
    synchronizeClock();
    eventQueue.reset();
    void eventQueue.enqueue(() => applySnapshot(snapshot));
  });
  socket.on('session:occupancy', (occupancy) => {
    latestOccupancy = occupancy;
  });
  socket.on('session:join-pending', () => {
    onConnectionState({
      state: 'awaiting-approval',
      message: 'A batalha já começou. Aguardando aprovação do mestre…',
    });
  });
  socket.on('session:join-rejected', (message, acknowledge) => {
    acknowledge();
    void (async () => {
      clearPendingCombatImpacts();
      clearTransientMediaCache();
      await requestBrowserCacheClear();
      socket.disconnect();
      onConnectionState({ state: 'error', message });
    })();
  });
  socket.on('session:closed', (_notice, acknowledge) => {
    void (async () => {
      clearPendingCombatImpacts();
      clearTransientMediaCache();
      onConnectionState({
        state: 'closed',
        message: 'O mestre encerrou a sala.',
      });
      await requestBrowserCacheClear();
      acknowledge();
      socket.disconnect();
    })();
  });
  socket.on('session:latency-probe', (probe, acknowledge) => {
    acknowledge({ id: probe.id });
  });
  socket.on('battle:state', (nextBattle) => {
    void eventQueue.enqueue(() => {
      if (pendingCombatImpacts.length > 0) {
        deferredBattleState = nextBattle;
        return;
      }
      publishBattle(nextBattle);
    });
  });
  socket.on('battle:health-effect', (effect) => {
    void eventQueue.enqueue(() => healthEffects.publish(effect));
  });
  socket.on('battle:impact', (impact) => {
    void eventQueue.enqueue(async (isCurrent) => {
      const loaded = await waitForMediaUrls([impact.soundEffect?.url], isCurrent);
      if (loaded && isCurrent()) enqueueCombatImpact(withResolvedCombatImpact(impact));
    });
  });
  socket.on('player:state', (state) => {
    void eventQueue.enqueue(() => onPlayerState?.(state));
  });
  socket.on('players:hud-state', (state) => {
    void eventQueue.enqueue(() => {
      // Keep party bars in the same ordered stream as critical impact audio.
      // Otherwise observers could see another player's PV change while the
      // associated SFX was still waiting for its cached media.
      playerHuds.publish(state);
    });
  });
  socket.on('encounter:turn-state', (state) => {
    encounterTurn.publish(state);
  });
  socket.on('player:combat-impact', (impact) => {
    void eventQueue.enqueue(() => {
      // Life, check result and temporary modifiers are delivered in the same
      // private event so this browser paints them in one ordered update.
      onPlayerCombatImpact?.(impact);
    });
  });
  socket.on('player:resource-notice', (notice) => {
    resourceNotices.publish(notice);
    if (notice.id.startsWith('sheet-change:')) {
      if (notice.tone === 'approved') void refreshCharacterSheetStatus();
      else if (notice.tone === 'rejected') onCharacterSheetChanged?.(currentSheet);
    }
  });
  socket.on('presentation:background', (nextBackground) => {
    void eventQueue.enqueue(async (isCurrent) => {
      const loaded = await waitForMediaUrls([nextBackground.url], isCurrent);
      if (loaded && isCurrent()) background.publish(withResolvedBackground(nextBackground));
    });
  });
  socket.on('presentation:scene', (nextScene) => {
    if (nextScene.mediaRevision !== latestPublicScene?.mediaRevision) {
      manifestPreloadPromise = null;
      void preloadSessionManifest();
    }
    void eventQueue.enqueue(async (isCurrent) => {
      const loaded = await waitForMediaUrls(cutsceneMediaUrls(nextScene.cutscenePlayback), isCurrent);
      if (loaded && isCurrent()) publishScene(nextScene);
    });
  });
  socket.on('presentation:scene-transition', (transition) => {
    void eventQueue.enqueue(async (isCurrent) => {
      const loaded = await waitForMediaUrls([transition.soundUrl], isCurrent);
      if (loaded && isCurrent()) sceneTransitions.publish({
        ...transition,
        soundUrl: resolvedMediaUrl(transition.soundUrl) ?? null,
      });
    });
  });
  socket.on('presentation:effects', (effects) => {
    void eventQueue.enqueue(() => encounterEffects.publish(effects));
  });
  socket.on('presentation:music', (nextMusic) => {
    void eventQueue.enqueue(async (isCurrent) => {
      const loaded = await waitForMediaUrls(
        nextMusic.tracks.map(({ url }) => url),
        isCurrent,
      );
      if (loaded && isCurrent()) music.publish(withResolvedMusic(nextMusic));
    });
  });
  socket.on('presentation:music-seek', (time) => {
    void eventQueue.enqueue(() => musicSeek.publish(time));
  });
  socket.on('presentation:music-fade-out', (duration) => {
    void eventQueue.enqueue(() => musicFadeOut.publish(duration));
  });
  socket.on('presentation:music-duck', (event) => {
    void eventQueue.enqueue(async (isCurrent) => {
      const soundUrl = event.phase !== 'restore'
        ? event.soundEffect?.url
        : null;
      const loaded = soundUrl
        ? await waitForMediaUrls([soundUrl], isCurrent)
        : true;
      if (!loaded || !isCurrent()) return;
      if (event.phase === 'restore') {
        const remaining = (musicDuckImpactEndsAt.get(event.id) ?? 0) - Date.now();
        if (remaining > 0) {
          await new Promise((resolve) => setTimeout(resolve, remaining));
          if (!isCurrent()) return;
        }
        musicDuckThreatEndsAt.delete(event.id);
        musicDuckImpactEndsAt.delete(event.id);
      } else if (event.phase === 'impact') {
        const remainingThreat =
          (musicDuckThreatEndsAt.get(event.id) ?? 0) - Date.now();
        if (remainingThreat > 0) {
          await new Promise((resolve) => setTimeout(resolve, remainingThreat));
          if (!isCurrent()) return;
        }
        musicDuckThreatEndsAt.delete(event.id);
        musicDuckImpactEndsAt.set(
          event.id,
          Date.now() + Math.max(0, event.duration),
        );
      } else {
        musicDuckThreatEndsAt.clear();
        musicDuckImpactEndsAt.clear();
        if (
          event.duration >= BOSS_CRITICAL_DUCK_FADE_MS
        ) {
          musicDuckThreatEndsAt.set(
            event.id,
            Date.now() + BOSS_CRITICAL_THREAT_DURATION_MS,
          );
        }
      }
      musicDuck.publish({
        ...event,
        soundEffect: event.soundEffect
          ? {
            ...event.soundEffect,
            url: resolvedMediaUrl(event.soundEffect.url) ?? event.soundEffect.url,
          }
          : null,
      });
    });
  });
  socket.on('presentation:soundboard', (state) => {
    void eventQueue.enqueue(() => soundboard.publish(toSoundboardState(state)));
  });
  socket.on('presentation:soundboard-stop', (stop) => {
    void eventQueue.enqueue(() => soundboardStops.publish(stop));
  });
  socket.on('presentation:sound-effect', (effect) => {
    void eventQueue.enqueue(async (isCurrent) => {
      const loaded = await waitForMediaUrls([effect.url], isCurrent);
      if (loaded && isCurrent()) soundEffects.publish({
        ...effect,
        url: resolvedMediaUrl(effect.url) ?? effect.url,
      });
    });
  });
  socket.on('presentation:encounter-effect', (effect) => {
    void eventQueue.enqueue(async (isCurrent) => {
      const loaded = await waitForMediaUrls([effect.url], isCurrent);
      if (loaded && isCurrent()) encounterSoundEffects.publish({
        ...effect,
        url: resolvedMediaUrl(effect.url) ?? effect.url,
      });
    });
  });
  socket.on('presentation:encounter-sound-library', (urls) => {
    void eventQueue.enqueue(async () => {
      await preloadEncounterSounds(urls);
    });
  });

  const setCharacterPrivate = (privateMode: boolean) =>
    new Promise<{ ok: boolean; error?: string }>((resolve) => {
      if (!socket.connected) {
        resolve({ ok: false, error: 'O jogador não está conectado.' });
        return;
      }
      const timeout = window.setTimeout(() => {
        resolve({ ok: false, error: 'A sala não confirmou a alteração.' });
      }, 5_000);
      socket.emit('player:set-private', privateMode, (result) => {
        window.clearTimeout(timeout);
        resolve(result);
      });
    });

  const setCharacterSheetEditorOpen = (open: boolean) =>
    new Promise<{ ok: boolean; error?: string }>((resolve) => {
      if (!socket.connected) {
        resolve({ ok: false, error: 'O jogador não está conectado.' });
        return;
      }
      const timeout = window.setTimeout(() => {
        resolve({ ok: false, error: 'A sala não confirmou o estado da ficha.' });
      }, 5_000);
      socket.emit('player:set-sheet-editor-open', open, (result) => {
        window.clearTimeout(timeout);
        resolve(result);
      });
    });

  const endOwnTurn = () =>
    new Promise<EncounterTurnActionResult>((resolve) => {
      if (!socket.connected) {
        resolve({ ok: false, error: 'O jogador não está conectado.' });
        return;
      }
      const timeout = window.setTimeout(() => {
        resolve({ ok: false, error: 'A sala não confirmou o fim do turno.' });
      }, 5_000);
      socket.emit('encounter:end-own-turn', (result) => {
        window.clearTimeout(timeout);
        resolve(result);
      });
    });
  endOwnTurnHandler = endOwnTurn;
  const rollInitiative = (extremeAdvantage = false) =>
    new Promise<EncounterTurnActionResult>((resolve) => {
      if (!socket.connected) {
        resolve({ ok: false, error: 'O jogador não está conectado.' });
        return;
      }
      const timeout = window.setTimeout(() => {
        resolve({ ok: false, error: 'A sala não confirmou a iniciativa.' });
      }, 5_000);
      socket.emit('encounter:roll-initiative', extremeAdvantage, (result) => {
        window.clearTimeout(timeout);
        resolve(result);
      });
    });
  rollInitiativeHandler = rollInitiative;
  const usePlayerAction: BossAPI['usePlayerAction'] = (action) =>
    new Promise((resolve) => {
      if (!socket.connected) {
        resolve({ ok: false, error: 'O jogador não está conectado.' });
        return;
      }
      const timeout = window.setTimeout(() => {
        resolve({ ok: false, error: 'A sala não confirmou a ação.' });
      }, 5_000);
      socket.emit('player:use-action', action, (result) => {
        window.clearTimeout(timeout);
        resolve(result);
      });
    });
  usePlayerActionHandler = usePlayerAction;
  const requestPlayerCombatAction = (
    request: PlayerCombatActionRequest,
  ) => new Promise<PlayerCombatActionResult>((resolve) => {
    if (!socket.connected) {
      resolve({ ok: false, error: 'O jogador não está conectado.' });
      return;
    }
    const timeout = window.setTimeout(() => {
      resolve({ ok: false, error: 'A sala não confirmou a ação de combate.' });
    }, 8_000);
    socket.emit('encounter:combat-action', request, (result) => {
      window.clearTimeout(timeout);
      resolve(result);
    });
  });
  requestPlayerCombatActionHandler = requestPlayerCombatAction;

  const connect = async (
    requestedName: string,
    password: string,
    createAccount: boolean,
  ): Promise<PlayerAuthenticationResult> => {
    const playerName = requestedName.trim().slice(0, 40);
    if (!playerName) {
      onConnectionState({
        state: 'error',
        message: 'Informe seu nome para entrar na sessão.',
      });
      return { ok: false, error: 'Informe seu usuário para entrar na sessão.' };
    }
    const authentication = await authenticateAccount(playerName, password, createAccount);
    if (!authentication.ok || !authentication.sessionToken || !authentication.username) {
      return authentication;
    }
    window.localStorage.setItem('bossbar.multiplayer.player-name', authentication.username);
    void preloadSessionManifest();
    if (socket.connected) socket.disconnect();
    socket.auth = {
      roomCode,
      playerToken,
      playerName: authentication.username,
      accountToken: authentication.sessionToken,
      clientId,
      protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      ...(hostToken ? { hostToken } : {}),
    };
    onConnectionState({
      state: 'connecting',
      message: `Conectando à sala ${roomCode}…`,
    });
    socket.connect();
    return authentication;
  };
  const leave = () => {
    snapshotLoadSequence += 1;
    eventQueue.reset();
    musicDuckThreatEndsAt.clear();
    musicDuckImpactEndsAt.clear();
    clearPendingCombatImpacts();
    socket.disconnect();
  };
  const dispose = () => {
    clearPendingCombatImpacts();
    clearTransientMediaCache();
    socket.disconnect();
  };
  return {
    api: api as BossAPI,
    canConnect: true,
    getAccountStatus,
    connect,
    leave,
    dispose,
    socket,
    uploadCharacterSheet,
    uploadCharacterPortrait,
    removeCharacterPortrait,
    automaticallyFixCharacterSheet,
    fetchCharacterSheetBlob,
    createCharacterSheetViewUrl,
    removeCharacterSheet,
    getCharacterSheetEditor,
    saveCharacterSheetEditor,
    setCharacterSheetEditorOpen,
    blankCharacterSheetUrl: '/api/player/blank-sheet',
    saveNotes,
    setCharacterPrivate,
    usePlayerAction,
    endOwnTurn,
    getPlayerToolsState: () => ({
      username: authenticatedUsername,
      sheet: currentSheet,
      portrait: currentPortrait,
      notes: currentNotes,
    }),
  };
};
