import type {
  BackgroundState,
  EncounterSoundEffect,
  EncounterEffectsState,
  HealthEffect,
  MusicTrack,
  SoundEffect,
  SoundboardStop,
} from './battle';
import type { SceneTransitionEvent } from './scene';
import type { ActiveBossStatus } from './status';
import type { PlayerAreaDamageImpact, PlayerEncounterState } from './player-combat';

export const MULTIPLAYER_PROTOCOL_VERSION = 4;
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
  roomCode: string;
  connectedPlayers: number;
  maxPlayers: number;
  players: MultiplayerPlayer[];
};

export type HostedSessionState = {
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
  nextAction: string;
  actionSeverity: 'normal' | 'grave';
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
  phaseMarkers: PublicScenePhaseMarker[];
  activePhaseIndex: number;
  blackoutActive: boolean;
  revision: number;
};

export type PublicMusicPresentationState = {
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
  'player:combat-impact': (impact: PlayerAreaDamageImpact) => void;
  'presentation:background': (background: BackgroundState) => void;
  'presentation:scene': (scene: PublicScenePresentationState) => void;
  'presentation:scene-transition': (transition: SceneTransitionEvent) => void;
  'presentation:effects': (effects: EncounterEffectsState) => void;
  'presentation:music': (music: PublicMusicPresentationState) => void;
  'presentation:music-seek': (time: number) => void;
  'presentation:music-fade-out': (duration: number) => void;
  'presentation:soundboard': (soundboard: PublicSoundboardPresentationState) => void;
  'presentation:soundboard-stop': (stop: SoundboardStop) => void;
  'presentation:sound-effect': (effect: SoundEffect) => void;
  'presentation:encounter-effect': (effect: EncounterSoundEffect) => void;
  'presentation:encounter-sound-library': (urls: string[]) => void;
}

// Player actions will be added explicitly as interactive features are introduced.
// Keeping this map empty makes the first client read-only by construction.
export type MultiplayerClientToServerEvents = Record<never, never>;

export type MultiplayerInterServerEvents = Record<never, never>;

export type MultiplayerSocketData = {
  playerId: string;
  playerName: string;
  profileId: string;
  clientId: string;
  isHost: boolean;
  connectedAt: number;
};
