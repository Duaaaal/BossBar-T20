import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveD20Check } from '../src/shared/d20-rules.ts';
import {
  MEDIA_CACHE_GLOBAL_LIMIT_BYTES,
  MEDIA_CACHE_ITEM_LIMIT_BYTES,
  emptyMediaCacheUsage,
  formatMemoryBytes,
} from '../src/shared/media-cache.ts';
import {
  applyPlayerDamage,
  applyPlayerHealing,
  playerDeathThreshold,
  stabilizePlayer,
} from '../src/shared/player-survival.ts';

const vitalState = (overrides = {}) => ({
  currentHealth: 20,
  maxHealth: 20,
  temporaryHealth: 0,
  statuses: [],
  stabilized: false,
  dead: false,
  revision: 0,
  ...overrides,
});

test('20 natural sempre vence e 1 natural sempre falha independentemente do total', () => {
  assert.equal(resolveD20Check(20, -999, 999).success, true);
  assert.equal(resolveD20Check(1, 999, 0).success, false);
  assert.equal(resolveD20Check(12, 3, 15).success, true);
});

test('aplica inconsciência, indefeso e sangramento ao chegar a zero PV', () => {
  const transition = applyPlayerDamage(vitalState({ currentHealth: 4 }), 4);
  assert.equal(transition.state.currentHealth, 0);
  assert.equal(transition.becameUnconscious, true);
  assert.deepEqual(
    new Set(transition.state.statuses.map(({ statusId }) => statusId)),
    new Set(['inconsciente', 'indefeso', 'sangrando']),
  );
});

test('PV temporário absorve dano antes dos PV reais e não é restaurado por cura', () => {
  const absorbed = applyPlayerDamage(vitalState({ temporaryHealth: 7 }), 5).state;
  assert.equal(absorbed.currentHealth, 20);
  assert.equal(absorbed.temporaryHealth, 2);
  const overflow = applyPlayerDamage(absorbed, 6).state;
  assert.equal(overflow.currentHealth, 16);
  assert.equal(overflow.temporaryHealth, 0);
  assert.equal(applyPlayerHealing(overflow, 3).state.temporaryHealth, 0);
});

test('usa o limiar de morte negativo mais baixo entre menos dez e metade dos PV', () => {
  assert.equal(playerDeathThreshold(12), -10);
  assert.equal(playerDeathThreshold(30), -15);
  assert.equal(playerDeathThreshold(31), -16);
  assert.equal(applyPlayerDamage(vitalState({ maxHealth: 30, currentHealth: 1 }), 16).state.dead, true);
});

test('estabilização remove sangramento sem despertar e qualquer cura encerra sangramento', () => {
  const unconscious = applyPlayerDamage(vitalState({ currentHealth: 1 }), 4).state;
  const stable = stabilizePlayer(unconscious).state;
  assert.equal(stable.currentHealth, -3);
  assert.equal(stable.stabilized, true);
  assert.equal(stable.statuses.some(({ statusId }) => statusId === 'sangrando'), false);
  assert.equal(stable.statuses.some(({ statusId }) => statusId === 'inconsciente'), true);

  const healed = applyPlayerHealing(unconscious, 1).state;
  assert.equal(healed.currentHealth, -2);
  assert.equal(healed.stabilized, true);
  assert.equal(healed.statuses.some(({ statusId }) => statusId === 'sangrando'), false);

  const conscious = applyPlayerHealing(unconscious, 5).state;
  assert.equal(conscious.currentHealth, 2);
  assert.equal(conscious.statuses.some(({ statusId }) => statusId === 'inconsciente'), false);
  assert.equal(conscious.statuses.some(({ statusId }) => statusId === 'indefeso'), false);
});

test('limites transitórios de mídia permanecem em 20 MB por arquivo e 1 GB global', () => {
  const usage = emptyMediaCacheUsage();
  assert.equal(MEDIA_CACHE_ITEM_LIMIT_BYTES, 20 * 1024 * 1024);
  assert.equal(MEDIA_CACHE_GLOBAL_LIMIT_BYTES, 1024 * 1024 * 1024);
  assert.deepEqual(usage, {
    usedBytes: 0,
    itemLimitBytes: MEDIA_CACHE_ITEM_LIMIT_BYTES,
    globalLimitBytes: MEDIA_CACHE_GLOBAL_LIMIT_BYTES,
  });
  assert.equal(formatMemoryBytes(MEDIA_CACHE_ITEM_LIMIT_BYTES), '20.0 MB');
  assert.equal(formatMemoryBytes(MEDIA_CACHE_GLOBAL_LIMIT_BYTES), '1.00 GB');
});
