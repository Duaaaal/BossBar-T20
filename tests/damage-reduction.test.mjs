import assert from 'node:assert/strict';
import test from 'node:test';
import { RD_FIELD, RD_TARGETS, damageReductionError, damageContextError, normalizeDamageReduction, resolveDamageReduction, reduceDamage } from '../src/shared/damage-reduction.ts';
import { CHARACTER_SIZES, characterSize } from '../src/shared/character-size.ts';
import { applyPlayerDamage } from '../src/shared/player-survival.ts';
import { applyBattleCommand, initialBattleState, calculateHealthSequence } from '../src/shared/battle.ts';
import { createNimbCharacterSheet } from './fixtures/character-sheet-nimb.ts';
import { applyCharacterSheetEditorFields, readCharacterSheetEditorFields, inspectCharacterSheetPdf } from '../src/multiplayer/character-sheet-pdf.ts';

const row = (id, target, amount, source = 'ability', name = id, bypass = []) => ({ id, target, amount, source, name, bypass });
const profile = (...entries) => ({ version: 1, entries });

test('imunidade por tipo/origem causa exatamente 1, preserva zero, exceções e perda de vida', () => {
  const rd = profile({ ...row('immune', 'Fogo', 999, 'ability', 'Proteção', ['divine']), immune: true });
  assert.equal(reduceDamage(5, rd, { damageType: 'Fogo', damageOrigin: 'arcane' }), 1);
  assert.equal(reduceDamage(0, rd, { damageType: 'Fogo' }), 0);
  assert.equal(reduceDamage(5, rd, { damageType: 'Fogo', damageOrigin: 'divine' }), 5);
  assert.equal(reduceDamage(5, rd, { damageType: 'Frio' }), 5);
  assert.equal(reduceDamage(5, rd, { lossOfLife: true, damageType: 'Fogo' }), 5);
  const state = { currentHealth: 20, maxHealth: 20, temporaryHealth: 2, statuses: [], stabilized: false, dead: false, revision: 0, damageReduction: rd };
  assert.equal(applyPlayerDamage(state, 50, { damageType: 'Fogo' }).state.temporaryHealth, 1);
  const origins = { version: 1, entries: [], categories: { origins: { amount: 0, name: 'Imunidade', bypass: [], immune: true } } };
  assert.equal(reduceDamage(999, origins, { damageOrigin: 'mundane' }), 1);
  assert.match(damageContextError(origins), /origem/);
  assert.equal(normalizeDamageReduction(origins).categories.origins.immune, true);
  assert.ok(damageReductionError(profile({ ...row('bad', 'Fogo', 0), immune: 'true' })));
});

test('RD: começa em zero e migra o antigo escalar como total sem duplicar fontes', () => {
  assert.equal(RD_TARGETS.length, 19);
  assert.equal(resolveDamageReduction(normalizeDamageReduction()), 0);
  const migrated = normalizeDamageReduction(undefined, 5);
  assert.equal(resolveDamageReduction(migrated), 5);
  migrated.entries.push(row('vigor', 'universal', 3));
  assert.equal(resolveDamageReduction(migrated), 5);
});
test('RD: universal, categoria e tipo seguem a fonte, sem somar a mesma habilidade duas vezes', () => {
  const rd = profile(row('a', 'universal', 5, 'ability', 'Vigor'), row('b', 'physical', 3, 'ability', 'Casca'), row('c', 'Corte', 2, 'ability', 'vigor'));
  assert.equal(resolveDamageReduction(rd, { damageType: 'Corte' }), 8);
  assert.equal(resolveDamageReduction(rd, { damageType: 'Impacto' }), 8);
  assert.equal(resolveDamageReduction(rd, { damageType: 'Fogo' }), 5);
});
test('RD: itens, magias, parceiros e ambiente usam cada maior bônus; habilidades e perícias distintas somam', () => {
  const rd = profile(...['item', 'spell', 'partner', 'environment'].flatMap((source) => [row(`${source}-1`, 'universal', 2, source), row(`${source}-2`, 'Fogo', 4, source)]), row('skill1', 'Fogo', 1, 'skill'), row('skill2', 'Fogo', 2, 'skill'));
  assert.equal(resolveDamageReduction(rd, { damageType: 'Fogo' }), 19);
  assert.equal(resolveDamageReduction(rd, { damageType: 'Frio' }), 8);
});
test('RD: fogo divino combina tipo, elemento e origem sem confundir luz com divino', () => {
  const rd = profile(row('a', 'elemental', 2), row('b', 'magical', 3), row('c', 'divine', 4));
  assert.equal(resolveDamageReduction(rd, { damageType: 'Fogo', damageOrigin: 'divine' }), 9);
  assert.equal(resolveDamageReduction(rd, { damageType: 'Fogo', damageOrigin: 'arcane' }), 5);
  assert.equal(resolveDamageReduction(rd, { damageType: 'Luz', damageOrigin: 'mundane' }), 0);
});
test('RD: exceções desativam apenas sua linha e perda de vida ignora todas as proteções', () => {
  const rd = profile(row('a', 'universal', 10, 'ability', 'Casca', ['magical']), row('b', 'Fogo', 2));
  assert.equal(reduceDamage(12, rd, { damageType: 'Fogo', damageOrigin: 'mundane' }), 0);
  assert.equal(reduceDamage(12, rd, { damageType: 'Fogo', damageOrigin: 'divine' }), 10);
  assert.equal(reduceDamage(12, rd, { lossOfLife: true }, 8), 12);
  assert.equal(reduceDamage(12, rd, { ignoreDamageReduction: true }, 8), 12);
});
test('RD: tipos e origens necessários devem ser informados; não inventa dados para ataques antigos', () => {
  assert.equal(damageContextError(profile(row('a', 'universal', 5)), {}), null);
  assert.match(damageContextError(profile(row('a', 'Corte', 5)), {}), /Tipo/);
  assert.match(damageContextError(profile(row('a', 'universal', 5, 'ability', 'Casca', ['magical'])), { damageType: 'Corte' }), /Origem/);
});
test('RD: rejeita fonte sem nome, valores negativos, frações, linhas repetidas e versão inválida', () => {
  for (const value of [profile(row('a', 'Fogo', 1, 'ability', '')), profile(row('a', 'Fogo', -1)), profile(row('a', 'Fogo', 1.5)), profile(row('a', 'Fogo', 1), row('a', 'Frio', 1)), { version: 2, entries: [] }]) assert.ok(damageReductionError(value));
});
test('RD: absorção completa mantém PV temporários e estabilização; hits independentes reduzem separadamente', () => {
  const state = { currentHealth: 20, maxHealth: 20, temporaryHealth: 3, statuses: [], stabilized: true, dead: false, revision: 0, damageReduction: profile(row('a', 'physical', 5)) };
  assert.equal(applyPlayerDamage(state, 5, { damageType: 'Corte' }).state, state);
  const hit1 = applyPlayerDamage(state, 10, { damageType: 'Impacto' }).state;
  const hit2 = applyPlayerDamage(hit1, 10, { damageType: 'Impacto' }).state;
  assert.equal(hit2.currentHealth, 13);
  assert.equal(hit2.temporaryHealth, 0);
});
test('RD: parcelamento preserva o total exato após redução e pode zerar todos os impactos', () => {
  assert.deepEqual(calculateHealthSequence({ type: 'damage', total: 10, hits: 3, damageReduction: 2 }).amounts, [3, 3, 2]);
  assert.deepEqual(calculateHealthSequence({ type: 'damage', total: 2, hits: 3, damageReduction: 5 }).amounts, [0, 0, 0]);
});
test('RD: configuração do chefão preserva o perfil ao editar outros atributos', () => {
  const original = structuredClone(initialBattleState); const boss = original.bosses[0];
  const rd = normalizeDamageReduction({ ...profile(row('fogo', 'Fogo', 8, 'item', 'Manto')), categories: { universal: { amount: 2, name: 'Base', bypass: [] } } });
  let state = applyBattleCommand(original, { ...boss, type: 'configure', bossId: boss.id, damageReductions: rd });
  state = applyBattleCommand(state, { ...boss, type: 'configure', bossId: boss.id, bossName: 'Novo nome' });
  assert.deepEqual(state.bosses[0].damageReductions, rd);
});
test('Tamanho: seis categorias oficiais, sem deslocamento ou dano de arma inferidos', () => {
  assert.deepEqual(CHARACTER_SIZES.map(({ stealth, maneuvers }) => [stealth, maneuvers]), [[5, -5], [2, -2], [0, 0], [-2, 2], [-5, 5], [-10, 10]]);
  assert.equal(characterSize('medio').name, 'Médio');
  assert.equal(characterSize('Gigante'), undefined);
});
test('Ficha: persiste RD e origem no PDF Nimb; calcula Defesa e tamanho sem alterar arma ou recursos', async () => {
  const bytes = await createNimbCharacterSheet({ vidaAtual: '20', manaAtual: '10', ataque1: 'Espada', dano1: '1d8+3' });
  const fields = await readCharacterSheetEditorFields(bytes);
  const rd = normalizeDamageReduction({ ...profile(row('a', 'physical', 3, 'ability', 'Casca')), categories: { origins: { amount: 2, name: 'Origens', bypass: ['divine'] } } });
  const updates = { [RD_FIELD]: JSON.stringify(rd), SeleTamanho: 'Grande', CA: '999', 'BossBar.Ataque.1.Origem': 'divine' };
  const updated = await applyCharacterSheetEditorFields(bytes, fields.map((field) => ({ ...field, value: updates[field.name] ?? field.value })), true);
  const inspected = await inspectCharacterSheetPdf(updated.bytes);
  const summary = inspected.validation.summary;
  assert.deepEqual(summary.damageReduction, rd);
  assert.equal(summary.size, 'Grande');
  assert.notEqual(summary.defense, 999);
  assert.equal(summary.skills.find(({ id }) => id === '110').sizeModifier, -2);
  assert.equal(summary.attacks[0].damage, '1d8+3');
  assert.equal(summary.attacks[0].damageOrigin, 'divine');
  assert.equal(summary.currentHealth, 20); assert.equal(summary.currentMana, 10);
});

const base = (amount, name = 'Base', bypass = []) => ({ amount, name, bypass });

test('RD: cinco bases adicionais somam entre si e com fontes e totais revisados', () => {
  const rd = { ...profile(row('old', 'universal', 6, 'total'), row('item1', 'Corte', 2, 'item'), row('item2', 'Corte', 3, 'item')), categories: { universal: base(5), physical: base(3), origins: base(2), elemental: base(4), other: base(1) } };
  assert.equal(resolveDamageReduction(rd, { damageType: 'Corte', damageOrigin: 'mundane' }), 16);
  assert.equal(resolveDamageReduction(rd, { damageType: 'Fogo', damageOrigin: 'divine' }), 17);
  assert.equal(resolveDamageReduction(rd, { damageType: 'Trevas', damageOrigin: 'arcane' }), 14);
  rd.entries = [row('item1', 'Corte', 2, 'item'), row('item2', 'Corte', 3, 'item')];
  assert.equal(resolveDamageReduction(rd, { damageType: 'Corte', damageOrigin: 'mundane' }), 13);
});

test('RD: Origens inclui todas as conhecidas e exige informação; exceções das bases são locais', () => {
  const rd = { ...profile(), categories: { origins: base(2), physical: base(3, 'Casca', ['magical']), universal: base(1) } };
  for (const damageOrigin of ['mundane', 'magical', 'arcane', 'divine']) assert.equal(resolveDamageReduction({ ...profile(), categories: { origins: base(2) } }, { damageOrigin }), 2);
  assert.match(damageContextError(rd, { damageType: 'Corte' }), /Origem/);
  assert.equal(resolveDamageReduction(rd, { damageType: 'Corte', damageOrigin: 'mundane' }), 6);
  assert.equal(resolveDamageReduction(rd, { damageType: 'Corte', damageOrigin: 'arcane' }), 3);
  assert.equal(resolveDamageReduction(rd, { damageType: 'Corte', damageOrigin: 'unknown' }), 4);
  assert.equal(resolveDamageReduction(rd, { lossOfLife: true }), 0);
});

test('RD: normalização preserva fontes antigas, materializa cinco bases zero e rejeita bases malformadas', () => {
  const old = profile(row('old', 'physical', 7, 'item', 'Armadura'));
  assert.deepEqual(normalizeDamageReduction(JSON.stringify(old)), old);
  const current = normalizeDamageReduction({ ...old, categories: {} });
  assert.equal(Object.keys(current.categories).length, 5);
  assert.equal(resolveDamageReduction(current, { damageType: 'Corte' }), 7);
  assert.deepEqual(current.entries, old.entries);
  for (const categories of [null, [], { madeup: base(1) }, { universal: base(-1) }, { physical: base(2.5) }, { other: base(1, '') }, { origins: base(2, 'Origem', ['invalid']) }]) assert.ok(damageReductionError({ ...old, categories }));
  current.categories.universal.amount = 1;
  assert.equal(old.categories, undefined);
});
