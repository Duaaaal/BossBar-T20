import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createBossSkillValues,
  inferManuallyEditedBossSkills,
  normalizeBossSkillOverrides,
  resolveBossSkillValues,
  updateInheritedBossSkillDrafts,
} from '../src/shared/boss-skills.ts';

test('atualiza em tempo real somente as perícias herdadas da base', () => {
  const values = Object.fromEntries(
    Object.entries(createBossSkillValues(10)).map(([id, value]) => [id, String(value)]),
  );
  values.iniciativa = '17';
  const manual = inferManuallyEditedBossSkills(10, {
    ...createBossSkillValues(10),
    iniciativa: 17,
  });

  const updated = updateInheritedBossSkillDrafts('14', values, manual);

  assert.equal(updated.iniciativa, '17');
  assert.equal(updated.luta, '14');
  assert.equal(updated.pontaria, '14');
  assert.equal(updated.vontade, '14');
});

test('preserva uma perícia manual mesmo quando seu valor coincide com a base', () => {
  const values = createBossSkillValues(10);
  const overrides = normalizeBossSkillOverrides(['iniciativa'], 10, values);
  const resolved = resolveBossSkillValues(14, values, overrides);

  assert.equal(resolved.iniciativa, 10);
  assert.equal(resolved.luta, 14);
});
