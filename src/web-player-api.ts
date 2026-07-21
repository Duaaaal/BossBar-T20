import { io, type Socket } from 'socket.io-client';
import type { BossAPI } from './shared/api.ts';
import {
  initialBattleState,
  initialEncounterEffectsState,
  type BackgroundState,
  type BattleState,
  type EncounterEffectsState,
  type EncounterSoundEffect,
  type HealthEffect,
  type MusicState,
  type SoundEffect,
  type SoundboardState,
  type SoundboardStop,
} from './shared/battle.ts';
import {
  MAX_MULTIPLAYER_PLAYERS,
  MULTIPLAYER_PROTOCOL_VERSION,
  type MultiplayerClientToServerEvents,
  type MultiplayerConnectionErrorCode,
  type MultiplayerConnectionErrorData,
  type MultiplayerOccupancy,
  type PublicBattlePresentationState,
  type PublicScenePresentationState,
  type PublicSoundboardPresentationState,
  type MultiplayerServerToClientEvents,
  type MultiplayerSessionSnapshot,
} from './shared/multiplayer.ts';
import {
  createScenePlan,
  type ScenePlan,
  type SceneTransitionEvent,
} from './shared/scene.ts';

type Unsubscribe = () => void;
type Listener<Value> = (value: Value) => void;

export type WebPlayerConnectionState =
  | { state: 'connecting'; message: string }
  | { state: 'connected'; message: string }
  | { state: 'disconnected'; message: string }
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
  | 'subscribeHealthEffect'
  | 'getScenePlan'
  | 'subscribeScenePlan'
  | 'subscribeSceneTransition'
  | 'getEncounterEffectsState'
  | 'subscribeEncounterEffects'
  | 'subscribeEncounterEffect'
  | 'encounterEffectFinished'
  | 'getMusicState'
  | 'subscribeMusic'
  | 'subscribeMusicSeek'
  | 'subscribeMusicFadeOut'
  | 'musicTrackEnded'
  | 'musicFadeoutComplete'
  | 'reportMusicProgress'
  | 'getSoundboardState'
  | 'subscribeSoundboard'
  | 'subscribeSoundboardStop'
  | 'subscribeSoundEffect'
  | 'soundEffectFinished'
  | 'reportSoundEffectError'
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
    damageReduction: 0,
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
    revision: state.revision,
  };
};

export const toSoundboardState = (
  state: PublicSoundboardPresentationState,
): SoundboardState => ({
  ...state,
  slots: emptySoundboardState.slots,
});

const connectionErrorMessages: Record<MultiplayerConnectionErrorCode, string> = {
  INVALID_AUTH: 'O link desta sessão é inválido.',
  INVALID_CLIENT_ID: 'Não foi possível identificar este navegador.',
  INVALID_NAME: 'O nome deste jogador não é válido.',
  INVALID_TOKEN: 'O convite desta sessão não é mais válido.',
  PROTOCOL_MISMATCH: 'A versão desta apresentação não corresponde à do mestre.',
  ROOM_FULL: `A sala atingiu o limite de ${MAX_MULTIPLAYER_PLAYERS} jogadores.`,
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
}: {
  onConnectionState: (state: WebPlayerConnectionState) => void;
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
  const soundboardStops = createEventChannel<SoundboardStop>();
  const soundEffects = createEventChannel<SoundEffect>();
  const encounterSoundEffects = createEventChannel<EncounterSoundEffect>();
  const { roomCode, playerToken, clientId, hostToken } =
    resolveConnectionParameters();
  const preloadedEncounterSounds = new Map<string, HTMLAudioElement>();

  let latestOccupancy: MultiplayerOccupancy | null = null;
  let receivedSnapshot = false;
  let latestPublicScene: PublicScenePresentationState | null = null;

  const publishBattle = (nextBattle: PublicBattlePresentationState) => {
    const fullBattle = toBattleState(nextBattle);
    battle.publish(fullBattle);
    if (latestPublicScene) {
      scenePlan.publish(toScenePlan(latestPublicScene, fullBattle));
    }
  };

  const publishScene = (nextScene: PublicScenePresentationState) => {
    latestPublicScene = nextScene;
    scenePlan.publish(toScenePlan(nextScene, battle.current()));
  };

  const preloadEncounterSounds = (urls: string[]) => {
    const nextUrls = new Set(urls);
    for (const [url, audio] of preloadedEncounterSounds) {
      if (nextUrls.has(url)) continue;
      audio.removeAttribute('src');
      audio.load();
      preloadedEncounterSounds.delete(url);
    }
    for (const url of nextUrls) {
      if (preloadedEncounterSounds.has(url)) continue;
      const audio = new Audio();
      audio.crossOrigin = 'anonymous';
      audio.preload = 'auto';
      audio.src = url;
      audio.load();
      preloadedEncounterSounds.set(url, audio);
    }
  };

  const applySnapshot = (snapshot: MultiplayerSessionSnapshot) => {
    receivedSnapshot = true;
    publishBattle(snapshot.battle);
    background.publish(snapshot.background);
    publishScene(snapshot.scene);
    encounterEffects.publish(snapshot.encounterEffects);
    music.publish(snapshot.music);
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
    preloadEncounterSounds(snapshot.encounterSoundUrls ?? []);
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
  };

  const api: PlayerApi = {
    undoLastChange: async () => false,
    getState: async () => battle.current(),
    subscribe: battle.subscribe,
    getBackground: async () => background.current(),
    subscribeBackground: background.subscribe,
    reportBackgroundError: (message) => console.warn(message),
    presentationReady: () => undefined,
    subscribeHealthEffect: healthEffects.subscribe,
    getScenePlan: async () => scenePlan.current(),
    subscribeScenePlan: scenePlan.subscribe,
    subscribeSceneTransition: sceneTransitions.subscribe,
    getEncounterEffectsState: async () => encounterEffects.current(),
    subscribeEncounterEffects: encounterEffects.subscribe,
    subscribeEncounterEffect: encounterSoundEffects.subscribe,
    encounterEffectFinished: () => undefined,
    getMusicState: async () => music.current(),
    subscribeMusic: music.subscribe,
    subscribeMusicSeek: musicSeek.subscribe,
    subscribeMusicFadeOut: musicFadeOut.subscribe,
    musicTrackEnded: () => undefined,
    musicFadeoutComplete: () => undefined,
    reportMusicProgress: () => undefined,
    getSoundboardState: async () => soundboard.current(),
    subscribeSoundboard: soundboard.subscribe,
    subscribeSoundboardStop: soundboardStops.subscribe,
    subscribeSoundEffect: soundEffects.subscribe,
    soundEffectFinished: () => undefined,
    reportSoundEffectError: () => undefined,
  };

  if (!roomCode || !playerToken) {
    onConnectionState({
      state: 'error',
      message: 'O link da sessão está incompleto. Solicite um novo convite ao mestre.',
    });
    return {
      api: api as BossAPI,
      canConnect: false,
      connect: () => false,
      socket: null,
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

  socket.on('connect', () => {
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
  socket.on('session:snapshot', applySnapshot);
  socket.on('session:occupancy', (occupancy) => {
    latestOccupancy = occupancy;
  });
  socket.on('session:closed', () => {
    socket.disconnect();
    onConnectionState({
      state: 'error',
      message: 'O mestre encerrou esta sessão.',
    });
  });
  socket.on('session:latency-probe', (probe, acknowledge) => {
    acknowledge({ id: probe.id });
  });
  socket.on('battle:state', publishBattle);
  socket.on('battle:health-effect', healthEffects.publish);
  socket.on('battle:impact', ({ battle: nextBattle, healthEffect, soundEffect }) => {
    if (soundEffect) encounterSoundEffects.publish(soundEffect);
    healthEffects.publish(healthEffect);
    publishBattle(nextBattle);
  });
  socket.on('presentation:background', background.publish);
  socket.on('presentation:scene', publishScene);
  socket.on('presentation:scene-transition', sceneTransitions.publish);
  socket.on('presentation:effects', encounterEffects.publish);
  socket.on('presentation:music', music.publish);
  socket.on('presentation:music-seek', musicSeek.publish);
  socket.on('presentation:music-fade-out', musicFadeOut.publish);
  socket.on('presentation:soundboard', (state) => {
    soundboard.publish(toSoundboardState(state));
  });
  socket.on('presentation:soundboard-stop', soundboardStops.publish);
  socket.on('presentation:sound-effect', soundEffects.publish);
  socket.on('presentation:encounter-effect', encounterSoundEffects.publish);
  socket.on('presentation:encounter-sound-library', preloadEncounterSounds);

  const connect = (requestedName: string) => {
    const playerName = requestedName.trim().slice(0, 40);
    if (!playerName) {
      onConnectionState({
        state: 'error',
        message: 'Informe seu nome para entrar na sessão.',
      });
      return false;
    }
    window.localStorage.setItem('bossbar.multiplayer.player-name', playerName);
    socket.auth = {
      roomCode,
      playerToken,
      playerName,
      clientId,
      protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
      ...(hostToken ? { hostToken } : {}),
    };
    onConnectionState({
      state: 'connecting',
      message: `Conectando à sala ${roomCode}…`,
    });
    socket.connect();
    return true;
  };
  return { api: api as BossAPI, canConnect: true, connect, socket };
};
