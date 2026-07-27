import { expect, test, type Page } from '@playwright/test';
import {
  createEditableCharacterSheet,
  createPublicBattle,
  joinHostedSession,
  startHostedTestSession,
} from '../support/hosted-session';

const uploadSheet = async (
  page: Page,
  characterName: string,
  playerName: string,
) => {
  await page.getByRole('button', { name: 'Ficha', exact: true }).click();
  await page.locator('#web-player-sheet-input').setInputFiles({
    name: `ficha-${characterName.toLocaleLowerCase('pt-BR')}.pdf`,
    mimeType: 'application/pdf',
    buffer: await createEditableCharacterSheet({ characterName, playerName }),
  });
  await expect(page.locator('#web-player-sheet-status')).toContainText(
    `ficha-${characterName.toLocaleLowerCase('pt-BR')}.pdf`,
  );
  await page.locator('#web-player-sheet-close').click();
};

test('sincroniza HUDs do grupo, privacidade e o turno do jogador', async ({
  browser,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium',
    'Fluxo multiplayer completo executado uma vez no Chromium.',
  );
  const session = await startHostedTestSession();
  const firstContext = await browser.newContext();
  const secondContext = await browser.newContext();
  try {
    const firstPage = await firstContext.newPage();
    const secondPage = await secondContext.newPage();
    await joinHostedSession(firstPage, session.inviteUrl, 'Jogador Aurora');
    await joinHostedSession(secondPage, session.inviteUrl, 'Jogador Brasa');
    await uploadSheet(firstPage, 'Aurora', 'Jogador Aurora');
    await uploadSheet(secondPage, 'Brasa', 'Jogador Brasa');
    await expect.poll(() => secondPage.evaluate(async () =>
      (await window.bossAPI.getPlayerHuds()).map((player) => ({
        name: player.characterName,
        self: player.isSelf,
        hasSummary: Boolean(player.summary),
      })),
    )).toEqual([
      { name: 'Aurora', self: false, hasSummary: false },
      { name: 'Brasa', self: true, hasSummary: true },
    ]);

    const auroraOnSecond = secondPage
      .locator('.party-player-card')
      .filter({ hasText: 'Aurora' });
    const brasaOnFirst = firstPage
      .locator('.party-player-card')
      .filter({ hasText: 'Brasa' });
    await expect(auroraOnSecond).toBeVisible();
    await expect(brasaOnFirst).toBeVisible();
    await expect(auroraOnSecond).toContainText('???');
    await expect(brasaOnFirst).toContainText('???');

    await firstPage.locator('#web-player-character-expand').click();
    await expect(firstPage.locator('#web-player-character-private')).toBeChecked();
    await firstPage.locator('#web-player-character-private').uncheck();
    await expect(auroraOnSecond).toContainText('21/21');
    await expect(brasaOnFirst).toContainText('???');
    await firstPage.locator('#web-player-character-private').check();
    await expect(auroraOnSecond).toContainText('???');
    await expect(auroraOnSecond).not.toContainText('21/21');
    await expect(firstPage.locator('#web-player-character-health-value'))
      .toHaveText('21/21');

    session.server.publishBattleState(createPublicBattle({
      battleStarted: true,
      revision: 2,
    }));
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const pending = session.server.getTurnState().participants.filter(
        ({ initiativeRolled }) => initiativeRolled === false,
      );
      if (pending.length === 0) break;
      for (const participant of pending) {
        if (participant.kind === 'boss') {
          expect(session.server.rollInitiativeAsHost(participant.id).ok).toBe(true);
        } else {
          const page = participant.name === 'Aurora' ? firstPage : secondPage;
          await page.getByRole('button', { name: 'Rodar Iniciativa' }).click();
        }
      }
    }
    await expect.poll(
      () => session.server.getTurnState().initiativeReady,
    ).toBe(true);
    let turn = session.server.advanceTurnAsHost().state;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const active = turn?.participants.find(
        ({ id }) => id === turn?.activeParticipantId,
      );
      if (active?.kind === 'player') break;
      turn = session.server.advanceTurnAsHost().state;
    }
    const active = turn?.participants.find(
      ({ id }) => id === turn?.activeParticipantId,
    );
    expect(active?.kind).toBe('player');
    await expect(firstPage.locator('.encounter-turn-hud strong')).toHaveText('1');
    await expect(secondPage.locator('.encounter-turn-hud strong')).toHaveText('1');

    const activePage = active?.name === 'Aurora' ? firstPage : secondPage;
    const waitingPage = activePage === firstPage ? secondPage : firstPage;
    await expect(
      activePage.getByRole('button', { name: 'Encerrar turno' }),
    ).toBeVisible();
    await expect(
      waitingPage.getByRole('button', { name: 'Encerrar turno' }),
    ).toHaveCount(0);

    const waitingFreeAction = waitingPage.locator('[data-player-action="free"]');
    await expect(waitingFreeAction).not.toHaveAttribute('title');
    await waitingFreeAction.click();
    await expect(waitingPage.locator('#web-player-status'))
      .toContainText('próprio turno');
    await expect(waitingPage.locator('#web-player-status'))
      .toHaveAttribute('data-visible', 'true');
    await expect(waitingPage.locator('#web-player-status'))
      .toHaveAttribute('data-visible', 'false', { timeout: 6_000 });

    const activeFreeAction = activePage.locator('[data-player-action="free"]');
    await activeFreeAction.click();
    await expect(activeFreeAction)
      .toHaveAttribute('data-tooltip', 'Ação livre não disponível');

    await activePage.getByRole('button', { name: 'Encerrar turno' }).click();
    await activePage.getByRole('button', { name: 'Encerrar turno' }).last().click();
    await expect.poll(
      () => session.server.getTurnState().activeParticipantId,
    ).not.toBe(active?.id);

    await firstPage.setViewportSize({ width: 640, height: 480 });
    const layout = await firstPage.evaluate(() => {
      const rectangle = (selector: string) => {
        const element = document.querySelector<HTMLElement>(selector);
        if (!element) return null;
        const bounds = element.getBoundingClientRect();
        return {
          left: bounds.left,
          top: bounds.top,
          right: bounds.right,
          bottom: bounds.bottom,
        };
      };
      return {
        width: window.innerWidth,
        height: window.innerHeight,
        self: rectangle('#web-player-character-hud'),
        party: rectangle('.party-hud.is-web-client'),
        turn: rectangle('.encounter-turn-hud'),
      };
    });
    for (const bounds of [layout.self, layout.party, layout.turn]) {
      expect(bounds).not.toBeNull();
      expect(bounds!.left).toBeGreaterThanOrEqual(0);
      expect(bounds!.top).toBeGreaterThanOrEqual(0);
      expect(bounds!.right).toBeLessThanOrEqual(layout.width + 1);
      expect(bounds!.bottom).toBeLessThanOrEqual(layout.height + 1);
    }
    expect(layout.party!.right).toBeLessThanOrEqual(layout.self!.left + 1);
  } finally {
    await firstContext.close();
    await secondContext.close();
    await session.close();
  }
});
