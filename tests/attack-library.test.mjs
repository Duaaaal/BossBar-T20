import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { AttackLibraryStore } from '../src/attack-library-store.ts';
import { createInitialBossAttack, normalizeBossAttack, isAttackStatusEffect } from '../src/shared/boss-attacks.ts';
import { applySceneBossPatch, playlistPosition } from '../src/shared/scene.ts';
import { createInitialBoss } from '../src/shared/battle.ts';
import { DAMAGE_TYPES, parseAttackRange } from '../src/shared/attack-options.ts';

test('biblioteca mantém cópias por fase, tags, ataques múltiplos e resistência após reabrir', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'bossbar-attack-library-'));
  try {
    const store = await AttackLibraryStore.open(root);
    const attack = { ...createInitialBossAttack('dragon'), name: 'Garras', attackCount: 3, tags: ['Dragão', 'Fase 2'], statusEffects: [{ statusId: 'abalado', resistanceSkill: 'vontade', dc: 15, turns: 3, damageFormula: '0' }] };
    await store.mutate(attack);
    const reopened = await AttackLibraryStore.open(root);
    assert.equal(reopened.list()[0].attackCount, 3);
    assert.deepEqual(reopened.list()[0].statusEffects, attack.statusEffects);
    const phase = applySceneBossPatch(createInitialBoss('dragon'), { attacks: reopened.list(), selectedAttackId: attack.id });
    await reopened.mutate({ ...attack, name: 'Outra garra' });
    assert.equal(phase.attacks[0].name, 'Garras');
    const external = reopened.list(); external[0].tags.push('Não persistir');
    assert.equal(reopened.list()[0].tags.length, 2);
    await reopened.mutate(attack, true);
    assert.deepEqual((await AttackLibraryStore.open(root)).list(), []);
    assert.equal(phase.attacks.length, 1);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('limita ataques e rejeita fórmulas e efeitos inválidos', () => {
  const attack = createInitialBossAttack('test');
  assert.equal(normalizeBossAttack({ ...attack, attackCount: 999 }, 'test').attackCount, 20);
  assert.equal(normalizeBossAttack({ ...attack, damageFormula: 'eval(1)' }, 'test'), null);
  assert.equal(isAttackStatusEffect({ statusId: 'abalado', resistanceSkill: 'vontade', dc: 15, turns: 2, damageFormula: '0' }), true);
  assert.equal(isAttackStatusEffect({ statusId: 'fake', resistanceSkill: 'vontade', dc: -1, turns: 0, damageFormula: '0' }), false);
  assert.equal(DAMAGE_TYPES.length, 11);
  assert.deepEqual(parseAttackRange('Cone 12m'), { kind: 'Cone', meters: 12 });
});

test('playlist chega à faixa marcada e repete só essa faixa; avançar libera a seguinte', () => {
  const playlist = { tracks: [{ id: 'intro', duration: 5 }, { id: 'battle', duration: 10, loop: true }, { id: 'end', duration: 3 }], currentTrackId: 'intro', loop: false };
  assert.equal(playlistPosition(playlist, 4).track.id, 'intro');
  assert.deepEqual(playlistPosition(playlist, 27), { track: playlist.tracks[1], time: 2 });
  assert.deepEqual(playlistPosition({ ...playlist, loop: true }, 27), { track: playlist.tracks[1], time: 2 });
  assert.equal(playlistPosition({ ...playlist, currentTrackId: 'end' }, 1).track.id, 'end');
});
