import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialBoss } from '../src/shared/battle.ts';
import {
  isEncounterDebugOverrideRequest,
  normalizeDebugBoss,
  normalizeDebugNpc,
  normalizeDebugPlayer,
} from '../src/shared/encounter-debugger.ts';

test('valida e limita sobrescritas administrativas sem trocar identidades', () => {
  const boss = createInitialBoss('boss-1');
  const updatedBoss = normalizeDebugBoss({
    ...boss,
    id: 'forged',
    bossName: '  Senhor das Cinzas  ',
    maxHealth: 800,
    currentHealth: 900,
    damageReduction: -10,
    shield: 12,
  }, boss);
  assert.ok(updatedBoss);
  assert.equal(updatedBoss.id, 'boss-1');
  assert.equal(updatedBoss.bossName, 'Senhor das Cinzas');
  assert.equal(updatedBoss.currentHealth, 800);
  assert.equal(updatedBoss.damageReduction, 0);

  const player = {
    clientId: 'client-1',
    characterName: 'Valora',
    currentHealth: 30,
    maxHealth: 30,
    currentMana: 10,
    maxMana: 10,
    defenseMelee: 18,
    defenseRanged: 17,
    reflex: 8,
    statuses: [],
    actionPoints: 1,
    heroPoints: 1,
    actionPointAvailable: true,
    heroPointAvailable: true,
    unarmedStrikeEnabled: true,
    temporaryDefenseBonus: 0,
    protectionExpiresAtRound: null,
    criticalImpactId: null,
    stabilized: false,
    dead: false,
    revision: 4,
  };
  const updatedPlayer = normalizeDebugPlayer({
    ...player,
    clientId: 'forged-client',
    currentHealth: -24,
    actionPoints: 99,
    heroPoints: -2,
  }, player);
  assert.ok(updatedPlayer);
  assert.equal(updatedPlayer.clientId, 'client-1');
  assert.equal(updatedPlayer.currentHealth, -24);
  assert.equal(updatedPlayer.actionPoints, 5);
  assert.equal(updatedPlayer.heroPoints, 0);
  assert.equal(updatedPlayer.revision, 5);
});

test('permite ajustar somente os dados mutáveis de um NPC presente', () => {
  const npc = {
    id: 'npc:1',
    kind: 'npc',
    sourceId: '1',
    name: 'Guarda',
    faction: 'players',
    initiativeModifier: 3,
    initiativeRoll: 10,
    initiativeTotal: 13,
    initiativeRolled: true,
    eligibleRound: 1,
    isSelf: false,
  };
  const updated = normalizeDebugNpc({
    ...npc,
    id: 'forged',
    name: 'Capitão',
    initiativeModifier: 7,
    initiativeRoll: 20,
    initiativeTotal: 27,
  }, npc);
  assert.ok(updated);
  assert.equal(updated.id, 'npc:1');
  assert.equal(updated.name, 'Capitão');
  assert.equal(updated.initiativeTotal, 27);
  assert.equal(isEncounterDebugOverrideRequest({
    id: 'npc:1',
    kind: 'npc',
    data: updated,
  }), true);
  assert.equal(isEncounterDebugOverrideRequest({
    id: 'npc:1',
    kind: 'invalid',
    data: updated,
  }), false);
});
