import type { BossState } from './battle';

export const MAX_SCENE_PHASES = 8;
export const MAX_SCENE_BOSSES = 3;

export type SceneTransitionKind = 'fade' | 'blackout' | 'explosion';
export type SceneMediaSlot = 'background' | 'transitionSound' | 'music';
export type SceneAudioSlot = Exclude<SceneMediaSlot, 'background'>;
export type SceneBossPresence = 'inherit' | 'present' | 'absent';

export type SceneMediaSummary = {
  name: string;
  configured: boolean;
  mediaType: 'image' | 'video' | 'audio';
};

export type ScenePlaylistTrack = {
  id: string;
  name: string;
  duration: number;
  url: string;
};

export type ScenePlaylistSummary = {
  tracks: ScenePlaylistTrack[];
  currentTrackId: string | null;
  volume: number;
  muted: boolean;
  loop: boolean;
  revision: number;
};

export type ScenePlaylistState = ScenePlaylistSummary & {
  phaseId: string;
  phaseName: string;
  slot: SceneAudioSlot;
};

export type ScenePlaylistCommand =
  | { type: 'previous' }
  | { type: 'next' }
  | { type: 'select-track'; trackId: string }
  | { type: 'remove-track'; trackId: string }
  | { type: 'clear' }
  | { type: 'set-volume'; volume: number }
  | { type: 'set-muted'; muted: boolean }
  | { type: 'set-loop'; loop: boolean };

export type SceneBossPatch = {
  bossName?: string;
  maxHealth?: number;
  attack?: number;
  rangedAttack?: number;
  skills?: number;
  defense?: number;
  rangedDefense?: number;
  damageReduction?: number;
  shield?: number;
};

export type SceneBossDirective = {
  bossId: string;
  presence: SceneBossPresence;
  patch: SceneBossPatch;
};

export type SceneBossSlot = {
  bossId: string;
  label: string;
  original: boolean;
};

export type ScenePhase = {
  id: string;
  name: string;
  triggerBossId: string;
  startPercent: number;
  endPercent: number;
  transition: SceneTransitionKind;
  background: SceneMediaSummary | null;
  transitionSound: ScenePlaylistSummary | null;
  music: ScenePlaylistSummary | null;
  bosses: SceneBossDirective[];
};

export type ScenePlan = {
  phases: ScenePhase[];
  bossSlots: SceneBossSlot[];
  showPhaseMarkers: boolean;
  activePhaseIndex: number;
  revision: number;
};

export type ScenePhaseDraft = ScenePhase;

export type ScenePlanDraft = {
  phases: ScenePhaseDraft[];
  bossSlots: SceneBossSlot[];
  showPhaseMarkers: boolean;
};

export type SceneSaveResult = {
  ok: boolean;
  state?: ScenePlan;
  error?: string;
};

export type SceneMediaSelectionResult = {
  ok: boolean;
  canceled?: boolean;
  media?: SceneMediaSummary;
  playlist?: ScenePlaylistSummary;
  error?: string;
};

export type ScenePlaylistSelectionResult = {
  ok: boolean;
  canceled?: boolean;
  added?: number;
  state?: ScenePlaylistState;
  error?: string;
};

export type SceneTransitionEvent = {
  id: number;
  phaseId: string;
  kind: SceneTransitionKind;
  durationMs: number;
  soundUrl: string | null;
  soundVolume: number;
  soundMuted: boolean;
  soundLoop: boolean;
};

const clampInteger = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, Math.round(value)));

export const createSceneRanges = (count: number) => {
  const normalizedCount = clampInteger(count, 1, MAX_SCENE_PHASES);
  return Array.from({ length: normalizedCount }, (_, index) => ({
    startPercent: Math.round(100 - (index * 100) / normalizedCount),
    endPercent: index === normalizedCount - 1
      ? 0
      : Math.round(100 - ((index + 1) * 100) / normalizedCount),
  }));
};

export const createScenePlan = (bosses: BossState[]): ScenePlan => {
  const bossSlots = bosses.slice(0, MAX_SCENE_BOSSES).map((boss) => ({
    bossId: boss.id,
    label: boss.bossName,
    original: true,
  }));
  const triggerBossId = bossSlots[0]?.bossId ?? 'boss-1';
  return {
    bossSlots,
    showPhaseMarkers: false,
    phases: [{
      id: 'phase-1',
      name: 'Fase 1',
      triggerBossId,
      startPercent: 100,
      endPercent: 0,
      transition: 'fade',
      background: null,
      transitionSound: null,
      music: null,
      bosses: bossSlots.map((slot) => ({
        bossId: slot.bossId,
        presence: 'inherit',
        patch: {},
      })),
    }],
    activePhaseIndex: -1,
    revision: 0,
  };
};

export const scenePhaseAtHealth = (
  phases: Pick<ScenePhase, 'startPercent' | 'endPercent'>[],
  currentHealth: number,
  maximumHealth: number,
) => {
  if (!Number.isFinite(currentHealth) || !Number.isFinite(maximumHealth) || maximumHealth <= 0) {
    return -1;
  }
  const percent = Math.max(0, Math.min(100, (currentHealth / maximumHealth) * 100));
  return phases.findIndex((phase, index) =>
    percent <= phase.startPercent &&
    (percent > phase.endPercent || (index === phases.length - 1 && percent >= 0)),
  );
};

export const crossedScenePhaseIndexes = (
  phases: Pick<ScenePhase, 'startPercent'>[],
  previousHealth: number,
  nextHealth: number,
  maximumHealth: number,
  activePhaseIndex: number,
) => {
  if (
    maximumHealth <= 0 ||
    nextHealth >= previousHealth ||
    !Number.isFinite(previousHealth) ||
    !Number.isFinite(nextHealth)
  ) return [];
  const previousPercent = (previousHealth / maximumHealth) * 100;
  const nextPercent = (nextHealth / maximumHealth) * 100;
  return phases.flatMap((phase, index) =>
    index > activePhaseIndex &&
    previousPercent > phase.startPercent &&
    nextPercent <= phase.startPercent
      ? [index]
      : [],
  );
};

export const sceneTransitionSourceIndex = (
  targetPhaseIndex: number,
  phaseCount: number,
) => {
  if (
    !Number.isInteger(targetPhaseIndex) ||
    !Number.isInteger(phaseCount) ||
    phaseCount < 1 ||
    targetPhaseIndex < 1 ||
    targetPhaseIndex >= phaseCount
  ) return -1;
  return targetPhaseIndex - 1;
};

export const adjacentScenePlaylistTrackId = (
  playlist: Pick<ScenePlaylistSummary, 'tracks' | 'currentTrackId'>,
  offset: -1 | 1,
) => {
  if (playlist.tracks.length < 2) return playlist.currentTrackId;
  const currentIndex = Math.max(
    0,
    playlist.tracks.findIndex((track) => track.id === playlist.currentTrackId),
  );
  return playlist.tracks[
    (currentIndex + offset + playlist.tracks.length) % playlist.tracks.length
  ].id;
};

export const validateSceneRanges = (
  phases: Pick<ScenePhaseDraft, 'startPercent' | 'endPercent'>[],
) => {
  if (phases.length < 1 || phases.length > MAX_SCENE_PHASES) {
    return `A cena deve ter entre 1 e ${MAX_SCENE_PHASES} fases.`;
  }
  for (let index = 0; index < phases.length; index += 1) {
    const phase = phases[index];
    if (
      !Number.isFinite(phase.startPercent) ||
      !Number.isFinite(phase.endPercent) ||
      phase.startPercent > 100 ||
      phase.endPercent < 0 ||
      phase.startPercent <= phase.endPercent
    ) return `A margem de vida da Fase ${index + 1} é inválida.`;
    if (index === 0 && phase.startPercent !== 100) {
      return 'A primeira fase deve começar em 100% de vida.';
    }
    if (index > 0 && phase.startPercent !== phases[index - 1].endPercent) {
      return `As Fases ${index} e ${index + 1} precisam compartilhar a mesma margem.`;
    }
  }
  if (phases[phases.length - 1].endPercent !== 0) {
    return 'A última fase deve terminar em 0% de vida.';
  }
  return null;
};

export const normalizeSceneBossPatch = (patch: SceneBossPatch): SceneBossPatch => {
  const normalized: SceneBossPatch = {};
  const name = typeof patch.bossName === 'string' ? patch.bossName.trim().slice(0, 100) : '';
  if (name) normalized.bossName = name;
  const numericRanges: Array<[
    Exclude<keyof SceneBossPatch, 'bossName'>,
    number,
    number,
  ]> = [
    ['maxHealth', 1, 1_000_000],
    ['attack', -999, 999],
    ['rangedAttack', -999, 999],
    ['skills', -999, 999],
    ['defense', 0, 999],
    ['rangedDefense', 0, 999],
    ['damageReduction', 0, 999],
    ['shield', 0, 999],
  ];
  for (const [key, minimum, maximum] of numericRanges) {
    const value = patch[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      normalized[key] = clampInteger(value, minimum, maximum);
    }
  }
  return normalized;
};

export const applySceneBossPatch = (
  boss: BossState,
  patch: SceneBossPatch,
): BossState => {
  const normalized = normalizeSceneBossPatch(patch);
  const maxHealth = normalized.maxHealth ?? boss.maxHealth;
  return {
    ...boss,
    bossName: normalized.bossName ?? boss.bossName,
    maxHealth,
    currentHealth: Math.min(boss.currentHealth, maxHealth),
    attack: normalized.attack ?? boss.attack,
    rangedAttack: normalized.rangedAttack ?? boss.rangedAttack,
    skills: normalized.skills ?? boss.skills,
    defense: normalized.defense ?? boss.defense,
    rangedDefense: normalized.rangedDefense ?? boss.rangedDefense,
    damageReduction: normalized.damageReduction ?? boss.damageReduction,
    shield: normalized.shield ?? boss.shield,
  };
};
