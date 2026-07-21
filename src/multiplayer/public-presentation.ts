import type {
  BackgroundState,
  BattleState,
  EncounterEffectsState,
  MusicPlaybackState,
  MusicState,
  SoundboardState,
} from '../shared/battle.ts';
import {
  MULTIPLAYER_PROTOCOL_VERSION,
  type MultiplayerSessionSnapshot,
  type PublicBattlePresentationState,
  type PublicMusicPresentationState,
  type PublicScenePresentationState,
} from '../shared/multiplayer.ts';
import type { ScenePlan } from '../shared/scene.ts';

export type PublicPresentationSource = {
  battle: BattleState;
  background: BackgroundState;
  scenePlan: ScenePlan;
  encounterEffects: EncounterEffectsState;
  music: MusicState;
  musicPlayback?: MusicPlaybackState;
  soundboard: SoundboardState;
};

export type PublicPresentationOptions = {
  rewriteMediaUrl: (url: string) => string;
};

export const toPublicBattleState = (
  state: BattleState,
): PublicBattlePresentationState => ({
  bosses: state.bosses
    .filter(({ setupStatus }) => setupStatus === 'ready')
    .map((boss) => ({
      id: boss.id,
      setupStatus: 'ready',
      bossName: boss.bossName,
      maxHealth: boss.maxHealth,
      currentHealth: boss.currentHealth,
      shield: boss.shield,
      nextAction: boss.nextAction,
      actionSeverity: boss.actionSeverity,
      turnCount: boss.turnCount,
      activeStatuses: boss.activeStatuses,
    })),
  battleStarted: state.battleStarted,
  hudVisible: state.hudVisible,
  revision: state.revision,
});

export const toPublicSceneState = (
  state: ScenePlan,
): PublicScenePresentationState => ({
  phaseMarkers: state.showPhaseMarkers
    ? state.phases.map(({ id, triggerBossId, startHealth }) => ({
      phaseId: id,
      triggerBossId,
      startHealth,
    }))
    : [],
  activePhaseIndex: state.activePhaseIndex,
  blackoutActive: state.blackoutActive,
  revision: state.revision,
});

const rewriteBackground = (
  background: BackgroundState,
  rewriteMediaUrl: (url: string) => string,
): BackgroundState => ({
  ...background,
  name: null,
  url: background.url ? rewriteMediaUrl(background.url) : null,
});

const rewriteMusic = (
  music: MusicState,
  playback: MusicPlaybackState | undefined,
  rewriteMediaUrl: (url: string) => string,
): PublicMusicPresentationState => {
  const currentTrack = music.tracks.find(
    ({ id }) => id === music.currentTrackId,
  );
  return {
    ...music,
    tracks: currentTrack ? [{
      ...currentTrack,
      name: 'Trilha atual',
      url: rewriteMediaUrl(currentTrack.url),
    }] : [],
    currentTime: playback?.currentTime ?? 0,
    synchronizedAt: Date.now(),
  };
};

export const createPublicPresentationSnapshot = (
  source: PublicPresentationSource,
  { rewriteMediaUrl }: PublicPresentationOptions,
): MultiplayerSessionSnapshot => ({
  protocolVersion: MULTIPLAYER_PROTOCOL_VERSION,
  revision: Math.max(
    source.battle.revision,
    source.background.url ? 1 : 0,
    source.scenePlan.revision,
    source.encounterEffects.revision,
    source.music.revision,
    source.soundboard.revision,
  ),
  battle: toPublicBattleState(source.battle),
  background: rewriteBackground(source.background, rewriteMediaUrl),
  scene: toPublicSceneState(source.scenePlan),
  encounterEffects: source.encounterEffects,
  music: rewriteMusic(source.music, source.musicPlayback, rewriteMediaUrl),
  soundboard: {
    volume: source.soundboard.volume,
    muted: source.soundboard.muted,
    loop: source.soundboard.loop,
    universalMuted: source.soundboard.universalMuted,
    revision: source.soundboard.revision,
  },
  encounterSoundUrls: [],
});
