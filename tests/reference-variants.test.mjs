import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ReferenceVariantStore } from '../src/reference-variant-store.ts';
import { T20_CATALOG } from '../src/shared/rules-catalog.ts';

test('variantes persistem por livro/revisão, propostas não se autoaprovam nem vazam para outros jogadores', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'bossbar-variants-'));
  try {
    let store = await ReferenceVariantStore.open(directory);
    const reference = T20_CATALOG.spells[0]; const original = reference.description;
    const draft = { referenceId: reference.id, sourceId: reference.sourceId, revision: 'Revisão teste', page: 123, description: 'Texto revisado da mesa.' };
    await store.create({ ...draft, status: 'approved', id: 'forged' }, 'player-a');
    assert.equal(store.list('player-a')[0].status, 'pending');
    assert.equal(store.list('player-b').length, 0);
    await store.review(store.list()[0].id, true);
    assert.equal(store.list('player-b')[0].status, 'approved');
    assert.equal(reference.description, original);
    await assert.rejects(store.create(draft), /já tem/);
    await store.create({ ...draft, revision: 'Revisão 2' });
    store = await ReferenceVariantStore.open(directory);
    assert.deepEqual(store.list().map((v) => v.revision), ['Revisão teste', 'Revisão 2']);
    await assert.rejects(store.create({ ...draft, referenceId: 'inventado' }), /válidos/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
