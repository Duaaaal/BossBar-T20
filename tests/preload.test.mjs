import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { bossApiMethodsByRole } from '../src/shared/preload.ts';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('cada renderer recebe somente os métodos de preload que utiliza', async () => {
  for (const [role, exposedMethods] of Object.entries(bossApiMethodsByRole)) {
    let rendererSource = await readFile(
      path.join(projectRoot, 'src', `${role}.tsx`),
      'utf8',
    );
    if (role === 'player') rendererSource += await readFile(path.join(projectRoot, 'src', 'CutscenePlayer.tsx'), 'utf8');
    if (['attack-library', 'control', 'scene-editor'].includes(role)) rendererSource += await readFile(path.join(projectRoot, 'src', 'AttackLibrary.tsx'), 'utf8');
    const usedMethods = Array.from(
      new Set(
        Array.from(rendererSource.matchAll(/window\.bossAPI\.([A-Za-z0-9_]+)/g))
          .map((match) => match[1]),
      ),
    ).sort();

    assert.deepEqual(
      [...exposedMethods].sort(),
      usedMethods,
      `API inesperada para o renderer ${role}`,
    );
  }
});

test('mantém controles administrativos de personagens restritos ao mestre', () => {
  const administrativeMethods = [
    'grantHostedActionPoint',
    'grantHostedHeroPoint',
    'revokeHostedActionPoint',
    'revokeHostedHeroPoint',
    'setHostedUnarmedStrikeEnabled',
  ];

  for (const method of administrativeMethods) {
    assert.ok(
      bossApiMethodsByRole.master.includes(method),
      `${method} precisa estar disponível para o mestre`,
    );

    for (const [role, exposedMethods] of Object.entries(bossApiMethodsByRole)) {
      if (role === 'master') continue;
      assert.equal(
        exposedMethods.includes(method),
        false,
        `${method} não pode ser exposto ao renderer ${role}`,
      );
    }
  }
});

test('permite ao mestre observar os HUDs sem ampliar a superfície do launcher', () => {
  assert.ok(bossApiMethodsByRole.master.includes('getPlayerHuds'));
  assert.ok(bossApiMethodsByRole.master.includes('subscribePlayerHuds'));
  assert.equal(bossApiMethodsByRole.launcher.includes('getPlayerHuds'), false);
  assert.equal(
    bossApiMethodsByRole.launcher.includes('subscribePlayerHuds'),
    false,
  );
});
