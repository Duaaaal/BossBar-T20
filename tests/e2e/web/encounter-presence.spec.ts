import { test, expect, type Page } from '@playwright/test';
import { createEditableCharacterSheet, createPublicBattle, joinHostedSession, startHostedTestSession } from '../support/hosted-session';
import { normalizeEncounterCheckpoint } from '../../../src/shared/encounter-checkpoint';

const upload = async (page: Page, name: string) => {
  await page.getByRole('button', { name: 'Ficha', exact: true }).click();
  await page.locator('#web-player-sheet-input').setInputFiles({ name: `${name}.pdf`, mimeType: 'application/pdf', buffer: await createEditableCharacterSheet({ characterName: name, playerName: name }) });
  await expect(page.locator('#web-player-sheet-status')).toContainText(`${name}.pdf`);
  await page.locator('#web-player-sheet-close').click();
};

test('restaura apenas jogadores presentes, preserva quedas como alvos e aguarda a reconexão no turno', async ({ browser }) => {
  const session = await startHostedTestSession();
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  try {
    const pages = await Promise.all(contexts.map((context) => context.newPage()));
    for (const [index, page] of pages.entries()) { await joinHostedSession(page, session.inviteUrl, `Retorno ${index}`); await upload(page, `Retorno ${index}`); }
    session.server.publishBattleState(createPublicBattle({ battleStarted: true }));
    const saved = session.server.captureEncounter();
    const [first, second] = saved.players;
    saved.turns.started = true; saved.turns.round = 3; saved.turns.activeParticipantId = `player:${first.playerId}`;
    const order = [`player:${first.playerId}`, `player:${second.playerId}`, 'boss:boss-e2e'];
    saved.turns.participants.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    for (const participant of saved.turns.participants) { participant.initiativeRolled = true; participant.eligibleRound = 1; participant.initiativeRoll = participant.kind === 'boss' ? 1 : participant.sourceId === first.playerId ? 20 : 15; participant.initiativeTotal = participant.initiativeRoll + participant.initiativeModifier; }
    session.server.restoreEncounter(saved);
    await pages[0].locator('[data-action-point-slot="1"]').click();
    await expect(pages[0].getByRole('dialog', { name: 'Ponto de Ação' })).toBeVisible();
    await pages[0].getByRole('dialog', { name: 'Ponto de Ação' }).getByRole('button', { name: 'Fechar', exact: true }).click();
    session.server.publishScene({ phaseMarkers: [], activePhaseIndex: 1, blackoutActive: false, revision: 2,
      phaseEntrance: { phaseId: 'hud-phase', startedAt: Date.now() + 300, visualSeconds: 0, audioSeconds: 0, hudDelaySeconds: 0.3, hudFadeInSeconds: 0.6 } });
    for (const page of pages) await expect(page.locator('html')).toHaveClass(/phase-hud-hidden/);
    for (const page of pages) await expect.poll(() => page.evaluate(() => Number(document.documentElement.style.getPropertyValue('--phase-hud-opacity')))).toBe(1);
    await pages[1].goto('about:blank');
    await expect.poll(() => session.server.getPresence().connectedPlayers).toBe(1);
    await expect(pages[0].locator(`[data-player-hud-id="${second.playerId}"] .player-reconnection-label`)).toHaveText('Aguardando reconexão');
    expect(session.server.getConnectionPause()).toBeNull();
    const pending = await session.server.applyDirectPlayerDamage({ playerIds: [second.playerId], damage: 3, deferDamage: true });
    expect(pending.pendingDamageId).toBeTruthy();
    expect(normalizeEncounterCheckpoint({ savedAt: Date.now(), battleStarted: true, hudVisible: true,
      musicPlaying: false, musicTime: 0, backgroundTime: 0, activeBackgroundPath: null,
      pendingBlackoutPhaseIndex: null, queuedPhaseIndexes: [], resumeMusicAfterBlackout: false,
      multiplayer: session.server.captureEncounter() })).not.toBeNull();
    const result = await session.server.resolvePendingDirectPlayerDamage(pending.pendingDamageId!);
    expect(result.ok).toBe(true); expect(result.appliedPlayers).toBe(1);
    const damaged = session.server.captureEncounter().players.find(({ profileId }) => profileId === second.profileId)!;
    expect(damaged.state.currentHealth).toBe(second.state.currentHealth - 3);
    expect(session.server.advanceTurnAsHost()).toMatchObject({ ok: true });
    expect(session.server.getConnectionPause()?.reason).toBe('reconnecting');
    expect(session.server.advanceTurnAsHost().ok).toBe(false);

    const checkpoint = session.server.captureEncounter();
    session.server.restoreEncounter(checkpoint);
    expect(session.server.getPlayerHuds().map(({ id }) => id)).not.toContain(second.playerId);
    expect(session.server.getPresence().waitingPlayers).toHaveLength(1);
    expect(session.server.getConnectionPause()?.reason).toBe('restoring');
    await pages[1].goto(session.inviteUrl);
    await pages[1].locator('#web-player-name').fill('Retorno 1');
    await pages[1].locator('#web-player-password').fill('test-password');
    await pages[1].getByRole('button', { name: 'Entrar', exact: true }).click();
    await pages[1].getByRole('button', { name: 'Confirmar', exact: true }).click();
    await expect.poll(() => session.server.getPresence().connectedPlayers).toBe(2);
    expect(session.server.getConnectionPause()).toBeNull();
    expect(session.server.getPresence().waitingPlayers).toHaveLength(0);
    await expect(pages[0].locator(`[data-player-hud-id="${second.playerId}"] .player-reconnection-label`)).toHaveCount(0);
    expect(session.server.captureEncounter().players.find(({ profileId }) => profileId === second.profileId)?.state.currentHealth).toBe(damaged.state.currentHealth);
    expect(session.server.kickPlayer(second.playerId)).toBe(true);
    expect(session.server.getPresence().connectedPlayers).toBe(1);
    expect(session.server.captureEncounter().players).toHaveLength(1);
    expect(await session.server.readEncounterSheet(second.profileId)).not.toBeNull();

    // A saved participant can also be removed while absent, releasing the gate.
    session.server.restoreEncounter(checkpoint);
    expect(session.server.getConnectionPause()?.reason).toBe('restoring');
    expect(session.server.kickPlayer(second.playerId)).toBe(true);
    expect(session.server.getConnectionPause()).toBeNull();
    session.server.restoreEncounter(checkpoint);
    session.server.forgetSavedParticipants();
    expect(session.server.getPresence().waitingPlayers).toHaveLength(0);
    expect(session.server.getConnectionPause()).toBeNull();
  } finally { await Promise.all(contexts.map((context) => context.close())); await session.close(); }
});

test('a retomada também espera um usuário salvo sem ficha e permite dispensá-lo', async ({ page }) => {
  const session = await startHostedTestSession();
  try {
    await joinHostedSession(page, session.inviteUrl, 'Sem ficha');
    const saved = session.server.captureEncounter();
    expect(saved.players).toHaveLength(0);
    expect(saved.members).toHaveLength(1);
    await page.goto('about:blank');
    await expect.poll(() => session.server.getPresence().connectedPlayers).toBe(0);
    session.server.restoreEncounter(saved);
    expect(session.server.getPlayerHuds()).toHaveLength(0);
    expect(session.server.getPresence().waitingPlayers).toEqual([{ id: saved.members![0].playerId, name: 'Sem ficha' }]);
    expect(session.server.getConnectionPause()?.reason).toBe('restoring');
    expect(session.server.kickPlayer(saved.members![0].playerId)).toBe(true);
    expect(session.server.getConnectionPause()).toBeNull();
  } finally { await session.close(); }
});
