import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { applyCharacterSheetEditorFields, readCharacterSheetEditorFields } from '../../../src/multiplayer/character-sheet-pdf';
import { createEditableCharacterSheet, createPublicBattle, startHostedTestSession } from '../support/hosted-session';

// Independent arithmetic oracle: every warrior has CON 1, STR 2, level 1,
// PV 20 + 1, PM 3, imported weapon adjustment +5 and Luta +2.
// Initiative dice differ to avoid ties; combat dice return 4. Each character has a different weapon and RD.
for (const count of [1, 3, 5, 10]) {
  test(`revisão final: ${count} jogadores com fichas, ataques, RD e cura`, async ({ browser }) => {
    test.setTimeout(60_000 + count * 20_000);
    const contexts: BrowserContext[] = [];
    const pages: Page[] = [];
    const bossDamage: number[] = [];
    let die = 4;
    const names = Array.from({ length: count }, (_, index) => `Herói ${index + 1}`);
    const session = await startHostedTestSession({
      bossDefense: 1,
      randomInteger: (min, max) => Math.min(max - 1, Math.max(min, die)),
      applyBossDamage: (_id, amount) => { bossDamage.push(amount); return { ok: true, appliedDamage: amount }; },
      // Returning users, each with their own persisted, validated PDF. Do not
      // disable the upload abuse limit just to upload ten files from one IP.
      prepareProfiles: async (store) => {
        for (const [index, name] of names.entries()) {
          const profile = await store.register(name, 'test-password');
          const source = await createEditableCharacterSheet({ characterName: name, playerName: name });
          const changes: Record<string, string> = {
            'Ataque 1': `Espada ${index + 1}`, 'Dano 1': `1d8+${2 + index}`,
            'BossBar.RD': JSON.stringify({ version: 1, entries: [], categories: {
              physical: { amount: index % 3, name: 'Proteção da mesa', bypass: [] },
            } }),
          };
          const fields = (await readCharacterSheetEditorFields(source)).map(field => ({ ...field, value: changes[field.name] ?? field.value }));
          const prepared = await applyCharacterSheetEditorFields(source, fields, true);
          expect(prepared.validation.issues.filter(issue => issue.severity === 'error')).toEqual([]);
          await store.saveSheet(profile.id, `heroi-${index + 1}.pdf`, prepared.bytes, prepared.validation);
        }
      },
    });
    try {
      for (const name of names) {
        const context = await browser.newContext(); contexts.push(context);
        const page = await context.newPage(); pages.push(page);
        await page.goto(session.inviteUrl);
        await page.locator('#web-player-name').fill(name);
        await page.locator('#web-player-password').fill('test-password');
        await page.getByRole('button', { name: 'Entrar', exact: true }).click();
        await page.getByRole('dialog', { name: 'Confirmar usuário' }).getByRole('button', { name: 'Confirmar', exact: true }).click();
        await expect(page.getByRole('button', { name: 'Ficha', exact: true })).toBeVisible();
        await expect.poll(() => page.evaluate(async () => (await window.bossAPI.getPlayerHuds()).find(player => player.isSelf)?.characterName)).toBe(name);
      }
      const players = session.server.getPlayerHuds();
      expect(players).toHaveLength(count);
      for (const player of players) {
        expect(player.currentHealth).toBe(21);
        expect(player.currentMana).toBe(3);
      }
      const pageById = new Map(players.map((player, index) => [player.id, pages[index]]));
      session.server.publishBattleState(createPublicBattle({ battleStarted: true, revision: 2 }));
      for (const [index, page] of pages.entries()) {
        die = index + 1;
        await page.getByRole('button', { name: 'Teste de perícia', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: 'Teste de perícia', exact: true });
        await dialog.locator('.player-skill-table button.is-initiative').click();
        await dialog.getByRole('button', { name: 'Rolar', exact: true }).click();
        await expect.poll(() => session.server.getTurnState().participants.find(actor => actor.sourceId === players[index].id)?.initiativeRolled).toBe(true);
      }
      die = 20;
      expect(session.server.rollInitiativeAsHost('boss:boss-e2e').ok).toBe(true);
      await expect.poll(() => session.server.getTurnState().initiativeReady).toBe(true);
      expect(session.server.getTurnState().rollResults.filter(roll => roll.category === 'initiative' && roll.participantId.startsWith('player:')).map(roll => roll.total)).toEqual(Array.from({ length: count }, (_, index) => index + 1));
      die = 4;
      // Real turn progression, without rewriting encounter actions/initiative.
      const activate = (playerId: string) => {
        for (let step = 0; step <= count + 1; step += 1) {
          if (session.server.getTurnState().activeParticipantId === `player:${playerId}`) return;
          expect(session.server.advanceTurnAsHost().ok).toBe(true);
        }
        throw new Error(`Turno não alcançado: ${playerId}`);
      };
      for (const [index, player] of players.entries()) {
        activate(player.id);
        const page = pageById.get(player.id)!;
        await page.getByRole('button', { name: 'Combate', exact: true }).click();
        const combat = page.getByRole('dialog', { name: 'Realizar ataque', exact: true });
        await combat.getByRole('combobox', { name: 'Arma ou ataque', exact: true }).selectOption('0');
        await expect(combat.getByLabel('Dados do ataque', { exact: true })).toHaveValue('1d20 + 5 + 2');
        await combat.getByLabel('Bônus adicional de ataque').fill('1d4 + 1');
        await combat.getByLabel('Bônus adicional de dano').fill('1d4 - 1');
        await combat.getByRole('button', { name: 'Rolar', exact: true }).click();
        await expect.poll(() => session.server.getPendingActionPointRequests().length).toBe(1);
        expect(session.server.getPlayerHuds()[index].actions.standard).toBe(true);
        const approval = session.server.getPendingActionPointRequests()[0].id;
        expect((await session.server.approveActionPointRequest(approval)).ok).toBe(true);
        expect((await session.server.approveActionPointRequest(approval)).ok).toBe(false);
        await page.getByRole('button', { name: `Rolar dano de Espada ${index + 1}`, exact: true }).click();
        await expect.poll(() => bossDamage.length).toBe(index + 1);
        expect(bossDamage[index]).toBe(4 + 2 + index + 4 - 1);
        const rolls = session.server.getTurnState().rollResults.filter(roll => roll.participantId === `player:${player.id}` && roll.category === 'attack');
        expect(rolls.at(-1)?.total).toBe(4 + 5 + 2 + 4 + 1);
        expect(session.server.getPlayerHuds()[index].actions.standard).toBe(false);
        expect(session.server.getPlayerHuds()[index].currentMana).toBe(3);
      }
      expect((await session.server.applyDirectPlayerDamage({ playerIds: players.map(player => player.id), damage: 11, damageType: 'Corte', damageOrigin: 'mundane' })).ok).toBe(true);
      for (const [index, player] of session.server.getPlayerHuds().entries()) expect(player.currentHealth).toBe(21 - 11 + index % 3);
      // Each player heals the next participant; one-player rooms heal self.
      for (const [index, player] of players.entries()) {
        // Advance at least once so a solo player gets a fresh standard action.
        expect(session.server.advanceTurnAsHost().ok).toBe(true);
        activate(player.id);
        const targetIndex = (index + 1) % count;
        const before = session.server.getPlayerHuds()[targetIndex].currentHealth!;
        const page = pageById.get(player.id)!;
        await page.getByRole('button', { name: 'Realizar cura', exact: true }).click();
        const healing = page.getByRole('dialog', { name: 'Realizar cura', exact: true });
        await healing.getByLabel('Alvo da cura').selectOption(`player:${players[targetIndex].id}`);
        await healing.getByLabel('Cura em PV').fill('2d4 + 1');
        await healing.getByRole('button', { name: 'Solicitar ao mestre', exact: true }).click();
        await expect.poll(() => session.server.getPendingActionPointRequests().length).toBe(1);
        expect(session.server.getPlayerHuds()[targetIndex].currentHealth).toBe(before);
        const approval = session.server.getPendingActionPointRequests()[0].id;
        expect((await session.server.approveActionPointRequest(approval)).ok).toBe(true);
        expect((await session.server.approveActionPointRequest(approval)).ok).toBe(false);
        expect(session.server.getPlayerHuds()[targetIndex].currentHealth).toBe(Math.min(21, before + 9));
        expect(session.server.getPlayerHuds()[index].actions.standard).toBe(false);
      }
      for (const [index, page] of pages.entries()) {
        await expect.poll(() => page.evaluate(async () => {
          const huds = await window.bossAPI.getPlayerHuds();
          return { count: huds.length, privateSheets: huds.filter(player => Boolean(player.summary)).length, health: huds.find(player => player.isSelf)?.currentHealth };
        })).toEqual({ count, privateSheets: 1, health: Math.min(21, 19 + index % 3) });
      }
      await pages[0].reload();
      await pages[0].locator('#web-player-password').fill('test-password');
      await pages[0].getByRole('button', { name: 'Entrar', exact: true }).click();
      await pages[0].getByRole('dialog', { name: 'Confirmar usuário' }).getByRole('button', { name: 'Confirmar', exact: true }).click();
      await expect.poll(() => pages[0].evaluate(async () => (await window.bossAPI.getPlayerHuds()).find(player => player.isSelf)?.currentHealth)).toBe(19);
      expect(session.server.getPendingActionPointRequests()).toHaveLength(0);
      expect(session.server.captureEncounter().pendingPlayerDamages).toHaveLength(0);
    } finally {
      await Promise.all(contexts.map(context => context.close()));
      await session.close();
    }
  });
}
