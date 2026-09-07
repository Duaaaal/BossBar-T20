import { expect, test, type Page } from '@playwright/test';
import { createEditableCharacterSheet, createPublicBattle, joinHostedSession, startHostedTestSession } from '../support/hosted-session';

const upload = async (page: Page, name: string) => {
  await page.getByRole('button', { name: 'Ficha', exact: true }).click();
  await page.locator('#web-player-sheet-input').setInputFiles({ name: `${name}.pdf`, mimeType: 'application/pdf', buffer: await createEditableCharacterSheet({ characterName: name, playerName: name }) });
  await expect(page.locator('#web-player-sheet-status')).toContainText(`${name}.pdf`);
  await page.locator('#web-player-sheet-close').click();
};

test('resistência manual fora do turno, acesso privado, opção automática e múltiplos acertos', async ({ browser }) => {
  const session = await startHostedTestSession({ randomInteger: (min, max) => Math.min(max - 1, Math.max(min, 10)) });
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  try {
    const pages = await Promise.all(contexts.map((context) => context.newPage()));
    for (const [index, page] of pages.entries()) { await joinHostedSession(page, session.inviteUrl, `Resistência ${index}`); await upload(page, `Resistência ${index}`); }
    const [first, second] = session.server.getPlayerHuds();
    const before = first.currentHealth!;
    session.server.applyAreaDamage({ playerIds: [first.id], damage: 4, reflexDc: 999 });
    const pending = session.server.getPlayerHuds()[0].pendingResistances![0];
    expect(session.server.getPlayerHuds()[0].currentHealth).toBe(before);
    expect((await pages[1].evaluate((id) => window.bossAPI.rollResistance(id), pending.id)).ok).toBe(false);
    await pages[0].getByRole('button', { name: 'Reflexos CD 999 · Rolar', exact: true }).click();
    await expect.poll(() => session.server.getPlayerHuds()[0].pendingResistances).toHaveLength(0);
    expect(session.server.getPlayerHuds()[0].currentHealth).toBeLessThan(before);
    expect((await pages[0].evaluate((id) => window.bossAPI.rollResistance(id), pending.id)).ok).toBe(false);
    await pages[0].getByRole('button', { name: 'Configurações', exact: true }).click();
    await pages[0].getByLabel('Rolar resistências automaticamente').check();
    await pages[0].getByRole('dialog', { name: 'Configurações pessoais' }).getByRole('button', { name: 'Fechar', exact: true }).click();
    await expect.poll(() => pages[0].evaluate(async () => window.bossAPI.setAutomaticResistance(true))).toBe(true);
    const autoBefore = session.server.getPlayerHuds()[0].currentHealth!;
    session.server.applyAreaDamage({ playerIds: [first.id], damage: 2, reflexDc: 999 });
    expect(session.server.getPlayerHuds()[0].pendingResistances).toHaveLength(0);
    expect(session.server.getPlayerHuds()[0].currentHealth).toBeLessThan(autoBefore);

    const secondBefore = session.server.getPlayerHuds()[1].currentHealth!;
    const attack = await session.server.applyDirectPlayerDamage({ playerIds: [second.id], damage: 1, damageFormula: '1', hits: 3, independentHits: true, attackType: 'melee', attackBonus: 999, attackerParticipantId: 'boss:boss-e2e', deferDamage: true,
      statusEffects: [{ statusId: 'abalado', resistanceSkill: 'vontade', dc: 999, turns: 2, damageFormula: '0' }] });
    expect(attack.pendingDamageId).toBeTruthy();
    expect(session.server.getPlayerHuds()[1].currentHealth).toBe(secondBefore);
    const stored = session.server.captureEncounter().pendingDirectPlayerDamages![0];
    expect(stored.targets[0].hits).toHaveLength(3);
    const hits = stored.targets[0].hits.filter((hit) => hit.hit).length;
    const resolutions = await Promise.all([
      session.server.resolvePendingDirectPlayerDamage(attack.pendingDamageId!),
      session.server.resolvePendingDirectPlayerDamage(attack.pendingDamageId!),
    ]);
    expect(resolutions.map(({ ok }) => ok)).toEqual([true, false]);
    expect(session.server.getPlayerHuds()[1].currentHealth).toBe(secondBefore - hits);
    expect(session.server.getPlayerHuds()[1].pendingResistances).toHaveLength(1);
    await expect(pages[1].locator('.player-resistance-prompt')).toHaveCount(1);
    await pages[1].locator('.player-resistance-prompt').click();
    await expect.poll(() => session.server.getPlayerHuds()[1].pendingResistances).toHaveLength(0);
    expect(session.server.getPlayerHuds()[1].statuses.some(({ statusId }) => statusId === 'abalado')).toBe(true);
  } finally { await Promise.all(contexts.map((context) => context.close())); await session.close(); }
});

test('bônus adicionais ficam separados da arma e só uma mudança exige nova aprovação', async ({ page }) => {
  const session = await startHostedTestSession({ bossDefense: 1, randomInteger: (min, max) => Math.min(max - 1, Math.max(min, 10)) });
  try {
    await joinHostedSession(page, session.inviteUrl, 'Bônus'); await upload(page, 'Bônus');
    session.server.publishBattleState(createPublicBattle({ battleStarted: true }));
    const saved = session.server.captureEncounter();
    const player = saved.players[0];
    saved.turns.started = true; saved.turns.round = 1; saved.turns.activeParticipantId = `player:${player.playerId}`;
    for (const actor of saved.turns.participants) { actor.initiativeRolled = true; actor.eligibleRound = 1; }
    session.server.restoreEncounter(saved);
    await page.getByRole('button', { name: 'Combate', exact: true }).click();
    const combat = page.getByRole('dialog', { name: 'Realizar ataque' });
    await combat.getByRole('combobox', { name: 'Arma ou ataque', exact: true }).selectOption('0');
    await expect(combat.getByLabel('Dados de dano', { exact: true })).toHaveAttribute('readonly', '');
    await expect(combat.getByLabel('Dados de ataque (arma + perícia)', { exact: true })).toHaveValue('1d20 + 0');
    await combat.getByLabel('Bônus adicional de ataque').fill('-5');
    await expect(combat.getByLabel('Bônus adicional de ataque')).toHaveValue('-5');
    await combat.getByRole('button', { name: 'Fechar', exact: true }).click();
    const request = { kind: 'attack' as const, attackSource: { kind: 'unarmed' as const }, attackType: 'melee' as const, targetBossId: 'boss-e2e', damageFormula: '9999', resource: null, extraAttackModifier: 5, extraDamageModifier: 2 };
    const result = await page.evaluate((request) => window.bossAPI.requestPlayerCombatAction(request), request);
    expect(result.pendingApproval).toBe(true);
    expect(session.server.getTurnState().rollResults).toHaveLength(0);
    expect(session.server.getPendingActionPointRequests()[0].label).toContain('ataque 5; dano 2');
    expect((await session.server.approveActionPointRequest(result.requestId!)).ok).toBe(true);
    const after = session.server.captureEncounter();
    expect(after.pendingPlayerDamages).toHaveLength(1);
    expect(after.pendingPlayerDamages![0].damageFormula).not.toContain('9999');
    after.pendingPlayerDamages = []; after.players[0].actions.standard = true;
    session.server.restoreEncounter(after);
    const repeated = await page.evaluate((request) => window.bossAPI.requestPlayerCombatAction(request), request);
    expect(repeated.pendingApproval).not.toBe(true);
    expect(session.server.getPendingActionPointRequests()).toHaveLength(0);
  } finally { await session.close(); }
});
