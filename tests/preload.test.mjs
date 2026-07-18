import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { bossApiMethodsByRole } from '../src/shared/preload.ts';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('cada renderer recebe somente os métodos de preload que utiliza', async () => {
  for (const [role, exposedMethods] of Object.entries(bossApiMethodsByRole)) {
    const rendererSource = await readFile(
      path.join(projectRoot, 'src', `${role}.tsx`),
      'utf8',
    );
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
