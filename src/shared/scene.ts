import type { BossState } from './battle';

export const MAX_SCENE_PHASES = 8;
export const MAX_SCENE_BOSSES = 3;

export type SceneTransitionKind = 'fade' | 'fade-blackout' | 'blackout';
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
  currentHealth?: number;
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
  startHealth: number;
  endHealth: number;
  transition: SceneTransitionKind;
  transitionDurationSeconds: number;
  transitionSoundDelaySeconds: number;
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
  activePhaseIds: Record<string, string | null>;
  blackoutActive: boolean;
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
  stage: 'enter' | 'release';
  durationMs: number;
  soundDelayMs: number;
  soundUrl: string | null;
  soundVolume: number;
  soundMuted: boolean;
  soundLoop: boolean;
  visual: boolean;
};

const clampInteger = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, Math.round(value)));

export const createSceneRanges = (count: number, initialHealth = 100) => {
  const normalizedCount = clampInteger(count, 1, MAX_SCENE_PHASES);
  const normalizedHealth = clampInteger(initialHealth, 1, 1_000_000);
  return Array.from({ length: normalizedCount }, (_, index) => ({
    startHealth: Math.round(normalizedHealth - (index * normalizedHealth) / normalizedCount),
    endHealth: index === normalizedCount - 1
      ? 0
      : Math.round(normalizedHealth - ((index + 1) * normalizedHealth) / normalizedCount),
  }));
};

export const createScenePlan = (bosses: BossState[]): ScenePlan => {
  const bossSlots = bosses.slice(0, MAX_SCENE_BOSSES).map((boss) => ({
    bossId: boss.id,
    label: boss.bossName,
    original: true,
  }));
  const primaryBoss = bosses[0];
  return {
    bossSlots,
    showPhaseMarkers: false,
    phases: [{
      id: 'phase-1',
      name: 'Fase 1',
      triggerBossId: bossSlots[0]?.bossId ?? 'boss-1',
      startHealth: primaryBoss?.currentHealth ?? primaryBoss?.maxHealth ?? 500,
      endHealth: 0,
      transition: 'fade',
      transitionDurationSeconds: 2,
      transitionSoundDelaySeconds: 0,
      background: null,
      transitionSound: null,
      music: null,
      bosses: bossSlots.map((bossSlot) => ({
        bossId: bossSlot.bossId,
        presence: 'inherit',
        patch: {},
      })),
    }],
    activePhaseIndex: -1,
    activePhaseIds: Object.fromEntries(bossSlots.map((slot) => [slot.bossId, null])),
    blackoutActive: false,
    revision: 0,
  };
};

export const scenePhaseAtHealth = (
  phases: Pick<ScenePhase, 'startHealth' | 'endHealth'>[],
  currentHealth: number,
) => {
  if (!Number.isFinite(currentHealth)) {
    return -1;
  }
  return phases.findIndex((phase, index) =>
    currentHealth <= phase.startHealth &&
    (currentHealth > phase.endHealth || (index === phases.length - 1 && currentHealth >= 0)),
  );
};

export const crossedScenePhaseIndexes = (
  phases: Pick<ScenePhase, 'startHealth'>[],
  previousHealth: number,
  nextHealth: number,
  activePhaseIndex: number,
) => {
  if (
    nextHealth >= previousHealth ||
    !Number.isFinite(previousHealth) ||
    !Number.isFinite(nextHealth)
  ) return [];
  return phases.flatMap((phase, index) =>
    index > activePhaseIndex &&
    previousHealth > phase.startHealth &&
    nextHealth <= phase.startHealth
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
  phases: Pick<ScenePhaseDraft, 'startHealth' | 'endHealth'>[],
) => {
  if (phases.length < 1 || phases.length > MAX_SCENE_PHASES) {
    return `A cena deve ter entre 1 e ${MAX_SCENE_PHASES} fases.`;
  }
  for (let index = 0; index < phases.length; index += 1) {
    const phase = phases[index];
    if (
      !Number.isFinite(phase.startHealth) ||
      !Number.isFinite(phase.endHealth) ||
      phase.startHealth > 1_000_000 ||
      phase.endHealth < 0 ||
      phase.startHealth <= phase.endHealth
    ) return `A margem de vida da Fase ${index + 1} é inválida.`;
    if (index > 0 && phase.startHealth !== phases[index - 1].endHealth) {
      return `As Fases ${index} e ${index + 1} precisam compartilhar a mesma margem.`;
    }
  }
  if (phases[phases.length - 1].endHealth !== 0) {
    return 'A última fase deve terminar em 0 PV.';
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
    ['currentHealth', 0, 1_000_000],
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
  const currentHealth = normalized.currentHealth === undefined
    ? Math.min(boss.currentHealth, maxHealth)
    : Math.min(normalized.currentHealth, maxHealth);
  return {
    ...boss,
    bossName: normalized.bossName ?? boss.bossName,
    maxHealth,
    currentHealth,
    attack: normalized.attack ?? boss.attack,
    rangedAttack: normalized.rangedAttack ?? boss.rangedAttack,
    skills: normalized.skills ?? boss.skills,
    defense: normalized.defense ?? boss.defense,
    rangedDefense: normalized.rangedDefense ?? boss.rangedDefense,
    damageReduction: normalized.damageReduction ?? boss.damageReduction,
    shield: normalized.shield ?? boss.shield,
  };
};
