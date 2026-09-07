import type {
  BackgroundState,
  EncounterSoundEffect,
  EncounterEffectsState,
  HealthEffect,
  MusicDuckEvent,
  MusicTrack,
  SoundEffect,
  SoundboardStop,
} from './battle';
import type { SceneTransitionEvent } from './scene';
import type { ActiveBossStatus } from './status';
import type {
  EncounterTurnActionResult,
  EncounterTurnState,
  PendingActionPointRequest,
  PlayerActionKind,
  PlayerAreaDamageImpact,
  PlayerCombatActionRequest,
  PlayerCombatActionResult,
  PlayerEncounterState,
  PlayerHudState,
  PlayerResourceNotice,
} from './player-combat';
import type { PlayerSheetChangeRequest } from './character-sheet';

export const MULTIPLAYER_PROTOCOL_VERSION = 12;
export const MAX_MULTIPLAYER_PLAYERS = 10;

export type ConnectionQuality =
  | 'unknown'
  | 'excellent'
  | 'good'
  | 'unstable'
  | 'poor';

export type MultiplayerPlayer = {
  id: string;
  name: string;
  isHost: boolean;
  connectedAt: number;
  lastSeenAt: number;
  latencyMs: number | null;
  connectionQuality: ConnectionQuality;
  hasConnectionIssue: boolean;
  hasCharacterSheet: boolean;
};

export type MultiplayerJoinRequest = {
  id: string;
  name: string;
  requestedAt: number;
};

export type HostedSessionStartupProgress = {
  percent: number;
  stage: string;
};

export type MultiplayerPresence = {
  waitingPlayers?: Array<{ id: string; name: string }>;
  roomCode: string;
  connectedPlayers: number;
  maxPlayers: number;
  players: MultiplayerPlayer[];
};

export type HostedSessionState = {
  waitingPlayers?: Array<{ id: string; name: string }>;
  active: boolean;
  roomCode: string | null;
  tunnelProvider: 'cloudflare-quick' | null;
  tunnelStatus: 'inactive' | 'online' | 'error';
  publicBaseUrl: string | null;
  shareUrl: string | null;
  localUrl: string | null;
  lanUrls: string[];
  connectedPlayers: number;
  maxPlayers: number;
  players: MultiplayerPlayer[];
  pendingJoinRequests: MultiplayerJoinRequest[];
  pendingActionPointRequests: PendingActionPointRequest[];
  pendingSheetChangeRequests: PlayerSheetChangeRequest[];
  error: string | null;
};

export type HostedEncounterStartResult = {
  ok: boolean;
  session?: HostedSessionState;
  error?: string;
};

export type HostedSessionPublicUrlResult = {
  ok: boolean;
  session?: HostedSessionState;
  error?: string;
};

export type MultiplayerOccupancy = Pick<
  MultiplayerPresence,
  'connectedPlayers' | 'maxPlayers'
>;

export type PublicBossPresentationState = {
  id: string;
  setupStatus: 'ready';
  bossName: string;
  maxHealth: number;
  currentHealth: number;
  shield: number;
  initiative: number;
  nextAction: string;
  actionSeverity: 'normal' | 'grave';
  actionVersion: number;
  turnCount: number;
  activeStatuses: ActiveBossStatus[];
};

export type PublicBattlePresentationState = {
  bosses: PublicBossPresentationState[];
  battleStarted: boolean;
  hudVisible: boolean;
  revision: number;
};

export type PublicScenePhaseMarker = {
  phaseId: string;
  triggerBossId: string;
  startHealth: number;
};

export type PublicScenePresentationState = {
  phaseEntrance?: import('./scene').ScenePlan['phaseEntrance'];
  mediaRevision?: number;
  cutscenePlayback?: import('./scene').CutscenePlayback | null;
  phaseMarkers: PublicScenePhaseMarker[];
  activePhaseIndex: number;
  blackoutActive: boolean;
  revision: number;
};

export type PublicMusicPresentationState = {
  externalPlayback?: boolean;
  sceneOwnerId?: string | null;
  resumeTime?: number;
  tracks: MusicTrack[];
  currentTrackId: string | null;
  isPlaying: boolean;
  loop: boolean;
  volume: number;
  muted: boolean;
  universalMuted: boolean;
  playbackVersion: number;
  currentTime: number;
  synchronizedAt: number;
  revision: number;
};

export type PublicSoundboardPresentationState = {
  volume: number;
  muted: boolean;
  loop: boolean;
  universalMuted: boolean;
  revision: number;
};

export type MultiplayerSessionSnapshot = {
  protocolVersion: typeof MULTIPLAYER_PROTOCOL_VERSION;
  revision: number;
  battle: PublicBattlePresentationState;
  background: BackgroundState;
  scene: PublicScenePresentationState;
  encounterEffects: EncounterEffectsState;
  music: PublicMusicPresentationState;
  soundboard: PublicSoundboardPresentationState;
  encounterSoundUrls: string[];
};

export type MultiplayerPlayerAuth = {
  roomCode: string;
  playerToken: string;
  playerName: string;
  accountToken: string;
  clientId: string;
  protocolVersion: number;
  hostToken?: string;
};

export type PublicCombatImpact = {
  battle: PublicBattlePresentationState;
  healthEffect: HealthEffect;
  soundEffect: EncounterSoundEffect | null;
};

export type LatencyProbe = {
  id: string;
  sentAt: number;
};

export type LatencyProbeAcknowledgement = {
  id: string;
};

export type SessionClosedNotice = {
  reason: 'host-ended-session' | 'server-shutdown';
};

export type MultiplayerConnectionErrorCode =
  | 'INVALID_AUTH'
  | 'INVALID_CLIENT_ID'
  | 'INVALID_NAME'
  | 'INVALID_TOKEN'
  | 'ACCOUNT_AUTH_REQUIRED'
  | 'PROTOCOL_MISMATCH'
  | 'ROOM_FULL'
  | 'NAME_IN_USE'
  | 'ROOM_NOT_FOUND';

export type MultiplayerConnectionErrorData = {
  code: MultiplayerConnectionErrorCode;
};

export interface MultiplayerServerToClientEvents {
  'session:snapshot': (snapshot: MultiplayerSessionSnapshot) => void;
  'session:occupancy': (occupancy: MultiplayerOccupancy) => void;
  'session:join-pending': (request: MultiplayerJoinRequest) => void;
  'session:join-rejected': (message: string, acknowledge: () => void) => void;
  'session:closed': (
    notice: SessionClosedNotice,
    acknowledge: () => void,
  ) => void;
  'session:latency-probe': (
    probe: LatencyProbe,
    acknowledge: (response: LatencyProbeAcknowledgement) => void,
  ) => void;
  'battle:state': (state: PublicBattlePresentationState) => void;
  'battle:health-effect': (effect: HealthEffect) => void;
  'battle:impact': (impact: PublicCombatImpact) => void;
  'player:state': (state: PlayerEncounterState | null) => void;
  'players:hud-state': (state: PlayerHudState[]) => void;
  'encounter:turn-state': (state: EncounterTurnState) => void;
  'player:combat-impact': (impact: PlayerAreaDamageImpact) => void;
  'player:resource-notice': (notice: PlayerResourceNotice) => void;
  'presentation:background': (background: BackgroundState) => void;
  'presentation:scene': (scene: PublicScenePresentationState) => void;
  'presentation:scene-transition': (transition: SceneTransitionEvent) => void;
  'presentation:effects': (effects: EncounterEffectsState) => void;
  'presentation:music': (music: PublicMusicPresentationState) => void;
  'presentation:music-seek': (time: number) => void;
  'presentation:music-fade-out': (duration: number) => void;
  'presentation:music-duck': (event: MusicDuckEvent) => void;
  'presentation:soundboard': (soundboard: PublicSoundboardPresentationState) => void;
  'presentation:soundboard-stop': (stop: SoundboardStop) => void;
  'presentation:sound-effect': (effect: SoundEffect) => void;
  'presentation:encounter-effect': (effect: EncounterSoundEffect) => void;
  'presentation:encounter-sound-library': (urls: string[]) => void;
}

export interface MultiplayerClientToServerEvents {
  'player:roll-resistance': (id: string, acknowledge: (result: { ok: boolean; error?: string }) => void) => void;
  'player:auto-resistance': (enabled: boolean, acknowledge: (ok: boolean) => void) => void;
  'presentation:cutscene-ready': (id: string, duration: number | null) => void;
  'session:clock': (acknowledge: (serverTime: number) => void) => void;
  'player:set-sheet-editor-open': (
    open: boolean,
    acknowledge: (result: { ok: boolean; error?: string }) => void,
  ) => void;
  'player:set-private': (
    privateMode: boolean,
    acknowledge: (result: { ok: boolean; error?: string }) => void,
  ) => void;
  'player:use-action': (
    action: PlayerActionKind,
    acknowledge: (result: { ok: boolean; error?: string }) => void,
  ) => void;
  'encounter:end-own-turn': (
    acknowledge: (result: EncounterTurnActionResult) => void,
  ) => void;
  'encounter:roll-initiative': (
    extremeAdvantage: boolean,
    acknowledge: (result: EncounterTurnActionResult) => void,
  ) => void;
  'encounter:combat-action': (
    request: PlayerCombatActionRequest,
    acknowledge: (result: PlayerCombatActionResult) => void,
  ) => void;
}

export type MultiplayerInterServerEvents = Record<never, never>;

export type MultiplayerSocketData = {
  playerId: string;
  playerName: string;
  profileId: string;
  clientId: string;
  isHost: boolean;
  connectedAt: number;
};
