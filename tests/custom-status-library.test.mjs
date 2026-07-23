import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { CustomStatusLibraryStore } from '../src/custom-status-library-store.ts';
import {
  normalizeCustomStatusLibrary,
  normalizeCustomStatusPresetDraft,
} from '../src/shared/custom-status-library.ts';
import {
  applyBattleCommand,
  initialBattleState,
  isBattleCommand,
} from '../src/shared/battle.ts';
import { normalizeActiveStatuses } from '../src/shared/status.ts';

const draft = (overrides = {}) => ({
  name: 'Marca da tormenta',
  description: 'Enfraquece as defesas de quem carrega a marca.',
  inflictedStatusId: 'vulneravel',
  affectedTarget: 'meleeDefense',
  ...overrides,
});

test('normaliza somente definições personalizadas seguras e limitadas', () => {
  assert.deepEqual(normalizeCustomStatusPresetDraft(draft()), draft());
  assert.equal(normalizeCustomStatusPresetDraft(draft({ name: '' })), null);
  assert.equal(
    normalizeCustomStatusPresetDraft(draft({ inflictedStatusId: 'coringa' })),
    null,
  );
  assert.equal(
    normalizeCustomStatusPresetDraft(draft({ affectedTarget: 'arquivoLocal' })),
    null,
  );
  assert.deepEqual(normalizeCustomStatusLibrary([{ ...draft(), id: '../fora' }]), []);
});

test('persiste, reabre e exclui presets da biblioteca de status', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'bossbar-custom-status-'));
  t.after(() => rm(directory, { recursive: true, force: true }));

  const store = await CustomStatusLibraryStore.open(directory);
  const second = await store.create(draft({ name: 'Zéfiro sombrio' }));
  const first = await store.create(draft({
    name: 'Armadura rompida',
    inflictedStatusId: null,
    affectedTarget: 'rangedDefense',
  }));

  assert.deepEqual(store.list().map(({ name }) => name), [
    'Armadura rompida',
    'Zéfiro sombrio',
  ]);
  const onDisk = JSON.parse(await readFile(
    path.join(directory, 'custom-status-library.json'),
    'utf8',
  ));
  assert.equal(onDisk.schemaVersion, 1);
  assert.equal(onDisk.presets.length, 2);

  const reopened = await CustomStatusLibraryStore.open(directory);
  assert.deepEqual(reopened.list(), store.list());
  assert.equal(await reopened.delete(first.id), true);
  assert.equal(await reopened.delete(first.id), false);
  assert.deepEqual(reopened.list().map(({ id }) => id), [second.id]);
});

test('aplica o preset Coringa e inflige a condição secundária pelos mesmos turnos', () => {
  const command = {
    type: 'apply-status',
    bossId: 'boss-1',
    statusId: 'coringa',
    damageFormula: '2d6 + 3',
    turns: 4,
    customName: 'Marca da tormenta',
    customDescription: 'Enfraquece as defesas de quem carrega a marca.',
    customPresetId: '8db7762f-0ba8-47a7-9c9b-52ca1da682d0',
    customInflictedStatusId: 'vulneravel',
    customAffectedTarget: 'meleeDefense',
  };
  assert.equal(isBattleCommand(command), true);
  assert.equal(isBattleCommand({
    ...command,
    customInflictedStatusId: 'coringa',
  }), false);
  assert.equal(isBattleCommand({
    ...command,
    customAffectedTarget: 'arquivoLocal',
  }), false);

  const next = applyBattleCommand(structuredClone(initialBattleState), command);
  assert.deepEqual(next.bosses[0].activeStatuses, [
    {
      statusId: 'coringa',
      damageFormula: '2d6 + 3',
      turnsRemaining: 4,
      customName: 'Marca da tormenta',
      customDescription: 'Enfraquece as defesas de quem carrega a marca.',
      customPresetId: '8db7762f-0ba8-47a7-9c9b-52ca1da682d0',
      customInflictedStatusId: 'vulneravel',
      customAffectedTarget: 'meleeDefense',
    },
    {
      statusId: 'vulneravel',
      damageFormula: null,
      turnsRemaining: 4,
    },
  ]);
  assert.deepEqual(
    normalizeActiveStatuses(next.bosses[0].activeStatuses),
    next.bosses[0].activeStatuses,
  );
});
