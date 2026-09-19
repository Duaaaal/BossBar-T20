import { test, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ReferenceVariantStore } from '../../../src/reference-variant-store';
import { createEditableCharacterSheet, createPublicBattle, joinHostedSession, startHostedTestSession } from '../support/hosted-session';

test('jogador propõe variante sem aprovar e solicita cura para qualquer alvo', async ({ page }, info) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'variants-web-'));
  const store = await ReferenceVariantStore.open(directory); const bossHeals: number[] = [];
  const session = await startHostedTestSession({ referenceVariantStore: store, applyBossHealing: (_id, amount) => { bossHeals.push(amount); return { ok: true, applied: amount }; }, randomInteger: (min, max) => Math.min(max - 1, Math.max(min, 4)) });
  try {
    await joinHostedSession(page, session.inviteUrl, 'Curador da mesa');
    await page.getByRole('button', { name: 'Ficha', exact: true }).click();
    await page.getByRole('button', { name: 'Criar ficha vazia', exact: true }).click();
    await page.getByRole('button', { name: 'Consultar catálogo', exact: true }).first().click();
    const catalog = page.getByRole('dialog', { name: 'Poderes e magias', exact: true });
    await catalog.locator('.rules-catalog-kind').selectOption('');
    await catalog.getByRole('searchbox').fill('Olhar Atordoante');
    await catalog.getByText('Propor variante ao mestre', { exact: true }).click();
    const form = catalog.locator('.rules-catalog-variant-form');
    await form.getByLabel('Revisão', { exact: true }).fill('Nimb revisão da mesa');
    await form.getByLabel('Descrição', { exact: true }).fill('Texto proposto pelo jogador para revisão.');
    await form.getByRole('button', { name: 'Enviar proposta', exact: true }).click();
    await expect(catalog.locator('.rules-catalog-variants')).toContainText('Proposta pendente');
    await expect(catalog.getByRole('button', { name: 'Aprovar variante', exact: true })).toHaveCount(0);
    expect(store.list()[0].status).toBe('pending');
    await page.screenshot({ path: info.outputPath('proposta-variante.png') });
    await catalog.getByRole('button', { name: 'Fechar catálogo', exact: true }).click();
    await page.getByRole('button', { name: 'Descartar importação', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Ajustar ficha', exact: true })).toBeHidden();
    await page.getByRole('button', { name: 'Ficha', exact: true }).click();
    await page.locator('#web-player-sheet-input').setInputFiles({ name: 'curador.pdf', mimeType: 'application/pdf', buffer: await createEditableCharacterSheet({ characterName: 'Curador da mesa' }) });
    await expect(page.locator('#web-player-character-slots [role=tab][aria-selected=true]')).toContainText('Curador da mesa');
    if (await page.locator('#web-player-sheet-close').isVisible()) await page.locator('#web-player-sheet-close').click();
    await expect.poll(() => page.evaluate(async () => (await window.bossAPI.getMusicState()).tracks.length)).toBeGreaterThan(0);
    session.server.publishBattleState(createPublicBattle({ battleStarted: true, revision: 2 }));
    await expect.poll(() => page.evaluate(async () => (await window.bossAPI.getState()).battleStarted)).toBe(true);
    const saved = session.server.captureEncounter(); saved.turns.started = true; saved.turns.round = 1; saved.turns.activeParticipantId = `player:${saved.players[0].playerId}`;
    for (const actor of saved.turns.participants) { actor.initiativeRolled = true; actor.eligibleRound = 1; }
    session.server.restoreEncounter(saved);
    await page.getByRole('button', { name: 'Realizar cura', exact: true }).click();
    const healing = page.getByRole('dialog', { name: 'Realizar cura', exact: true });
    await expect(healing.getByLabel('Alvo da cura').locator('option')).toHaveCount(2);
    await healing.getByLabel('Alvo da cura').selectOption('boss:boss-e2e');
    await healing.getByLabel('Cura em PV').fill('2d8 + 3');
    await page.screenshot({ path: info.outputPath('cura-jogador.png') });
    await healing.getByRole('button', { name: 'Solicitar ao mestre', exact: true }).click();
    await expect.poll(() => session.server.getPendingActionPointRequests().length).toBe(1);
    expect(bossHeals).toHaveLength(0); expect(session.server.getPlayerHuds()[0].actions.standard).toBe(true);
    expect((await session.server.approveActionPointRequest(session.server.getPendingActionPointRequests()[0].id)).ok).toBe(true);
    expect(bossHeals).toEqual([11]); expect(session.server.getPlayerHuds()[0].actions.standard).toBe(false);
  } finally { await session.close(); await rm(directory, { recursive: true, force: true }); }
});
