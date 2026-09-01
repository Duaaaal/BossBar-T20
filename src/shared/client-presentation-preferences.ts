export const PLAYER_PRESENTATION_SETTINGS_KEY =
  'bossbar.player.presentation-settings.v1';

export type ClientPresentationPreferences = {
  musicVolume: number;
  effectsVolume: number;
  soundboardVolume: number;
  sounds: {
    damage: boolean;
    heal: boolean;
    shield: boolean;
  };
  visuals: {
    screenShake: boolean;
    healthBarShake: boolean;
    damageEffect: boolean;
    healEffect: boolean;
    particles: boolean;
    floatingDamageNumbers: boolean;
  };
};

export const defaultClientPresentationPreferences =
  (): ClientPresentationPreferences => ({
    musicVolume: 1,
    effectsVolume: 1,
    soundboardVolume: 1,
    sounds: { damage: true, heal: true, shield: true },
    visuals: {
      screenShake: true,
      healthBarShake: true,
      damageEffect: true,
      healEffect: true,
      particles: true,
      floatingDamageNumbers: true,
    },
  });

const boundedVolume = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : 1;

const booleanOr = (value: unknown, fallback: boolean) =>
  typeof value === 'boolean' ? value : fallback;

export const parseClientPresentationPreferences = (
  value: unknown,
): ClientPresentationPreferences => {
  const defaults = defaultClientPresentationPreferences();
  if (!value || typeof value !== 'object') return defaults;
  const source = value as Partial<ClientPresentationPreferences>;
  const sounds = source.sounds ?? {} as ClientPresentationPreferences['sounds'];
  const visuals = source.visuals ?? {} as ClientPresentationPreferences['visuals'];
  return {
    musicVolume: boundedVolume(source.musicVolume),
    effectsVolume: boundedVolume(source.effectsVolume),
    soundboardVolume: boundedVolume(source.soundboardVolume),
    sounds: {
      damage: booleanOr(sounds.damage, true),
      heal: booleanOr(sounds.heal, true),
      shield: booleanOr(sounds.shield, true),
    },
    visuals: {
      screenShake: booleanOr(visuals.screenShake, true),
      healthBarShake: booleanOr(visuals.healthBarShake, true),
      damageEffect: booleanOr(visuals.damageEffect, true),
      healEffect: booleanOr(visuals.healEffect, true),
      particles: booleanOr(visuals.particles, true),
      floatingDamageNumbers: booleanOr(visuals.floatingDamageNumbers, true),
    },
  };
};

export const loadClientPresentationPreferences = () => {
  try {
    return parseClientPresentationPreferences(JSON.parse(
      window.localStorage.getItem(PLAYER_PRESENTATION_SETTINGS_KEY) ?? 'null',
    ));
  } catch {
    return defaultClientPresentationPreferences();
  }
};

export const saveClientPresentationPreferences = (
  preferences: ClientPresentationPreferences,
) => {
  try {
    window.localStorage.setItem(
      PLAYER_PRESENTATION_SETTINGS_KEY,
      JSON.stringify(preferences),
    );
  } catch {
    // Keep the current session functional when storage is blocked by the
    // browser; persistence is best-effort and never gates presentation.
  }
};

export const clientSoundCategoryEnabled = (
  preferences: ClientPresentationPreferences,
  kind: string,
) => {
  if (kind.includes('heal')) return preferences.sounds.heal;
  if (kind.includes('shield')) return preferences.sounds.shield;
  if (
    kind.includes('damage') ||
    kind.includes('critical') ||
    kind.includes('natural-success') ||
    kind.includes('natural-failure')
  ) return preferences.sounds.damage;
  return true;
};
