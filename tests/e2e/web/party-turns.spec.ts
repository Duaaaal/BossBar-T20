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

const expectInsideViewport = async (
  page: Page,
  selector: string,
) => {
  const layout = await page.locator(selector).evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      left: bounds.left,
      top: bounds.top,
      right: bounds.right,
      bottom: bounds.bottom,
    };
  });
  expect(layout.left).toBeGreaterThanOrEqual(0);
  expect(layout.top).toBeGreaterThanOrEqual(0);
  expect(layout.right).toBeLessThanOrEqual(layout.width + 1);
  expect(layout.bottom).toBeLessThanOrEqual(layout.height + 1);
};

const rollPlayerInitiative = async (page: Page) => {
  const shortcuts = page.locator('.self-combat-shortcuts');
  await expect(shortcuts.getByRole('button')).toHaveCount(4);
  await expect(
    shortcuts.getByRole('button', { name: 'Teste de perícia' }),
  ).toBeVisible();
  await expect(
    shortcuts.getByRole('button', { name: 'Combate' }),
  ).toBeVisible();
  await expect(
    shortcuts.getByRole('button', { name: /Ponto de Ação/ }),
  ).toBeVisible();
  await expect(
    shortcuts.getByRole('button', { name: /Ponto Heróico/ }),
  ).toBeVisible();

  const skillButton = shortcuts.getByRole('button', {
    name: 'Teste de perícia',
  });
  await expect(skillButton).toHaveClass(/is-initiative-pending/);
  await skillButton.click();
  const skillDialog = page.getByRole('dialog', { name: 'Teste de perícia' });
  await expect(skillDialog).toBeVisible();
  await expect(
    skillDialog.locator('.player-skill-table.is-initiative-pending'),
  ).toBeVisible();
  await expect(
    skillDialog.locator('.player-skill-table button:not(:disabled)'),
  ).toHaveCount(1);
  await expectInsideViewport(page, '.player-combat-modal');
  await skillDialog.getByRole('button', { name: 'Rolar' }).click();
  await expect(
    page.locator('.encounter-roll-results.is-self .encounter-roll-result')
      .filter({ hasText: 'Iniciativa:' }),
  ).toBeVisible();
  await expect(page.locator('.self-combat-feedback')).toHaveCount(0);
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
    await expect(firstPage.locator('.party-player-resources')).toHaveCount(0);
    await expect(secondPage.locator('.party-player-resources')).toHaveCount(0);
    await expect(auroraOnSecond).toContainText('???');
    await expect(brasaOnFirst).toContainText('???');

    await firstPage.locator('#web-player-character-expand').click();
    await expect(firstPage.locator('#web-player-character-private')).toBeChecked();
    await firstPage.locator('#web-player-character-private').uncheck();
    await expect(auroraOnSecond).toContainText('21/21');
    await expect(auroraOnSecond.locator('.party-player-defense')).toContainText('Defesa:');
    await expect(auroraOnSecond.locator('.party-player-defense img')).toHaveCount(2);
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
    const [firstPlayerId, secondPlayerId] = await Promise.all([
      firstPage.evaluate(async () =>
        (await window.bossAPI.getPlayerHuds()).find(({ isSelf }) => isSelf)?.id,
      ),
      secondPage.evaluate(async () =>
        (await window.bossAPI.getPlayerHuds()).find(({ isSelf }) => isSelf)?.id,
      ),
    ]);
    const pageByPlayerId = new Map([
      [firstPlayerId, firstPage],
      [secondPlayerId, secondPage],
    ]);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const pending = session.server.getTurnState().participants.filter(
        ({ initiativeRolled }) => initiativeRolled === false,
      );
      if (pending.length === 0) break;
      for (const participant of pending) {
        if (participant.kind === 'boss') {
          expect(session.server.rollInitiativeAsHost(participant.id).ok).toBe(true);
        } else {
          const page = pageByPlayerId.get(participant.sourceId);
          if (!page) {
            throw new Error(`Jogador E2E sem página: ${participant.sourceId}`);
          }
          await rollPlayerInitiative(page);
        }
        await expect.poll(
          () => session.server.getTurnState().participants.find(
            ({ id }) => id === participant.id,
          )?.initiativeRolled,
          { message: `Iniciativa pendente: ${participant.kind} ${participant.name}` },
        ).toBe(true);
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
    const waitTurnNotice = waitingPage.locator('#web-player-status');
    await expect(waitTurnNotice)
      .toContainText('próprio turno');
    await expect(waitTurnNotice)
      .toHaveAttribute('data-visible', 'true');
    const noticeLayout = await waitTurnNotice.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return {
        top: bounds.top,
        center: bounds.left + bounds.width / 2,
        viewportCenter: window.innerWidth / 2,
        position: getComputedStyle(element).position,
        zIndex: Number(getComputedStyle(element).zIndex),
      };
    });
    expect(noticeLayout.position).toBe('fixed');
    expect(noticeLayout.top).toBeGreaterThanOrEqual(0);
    expect(Math.abs(noticeLayout.center - noticeLayout.viewportCenter)).toBeLessThan(2);
    expect(noticeLayout.zIndex).toBeGreaterThanOrEqual(2_147_483_640);
    await waitTurnNotice.click();
    await expect(waitTurnNotice).toHaveAttribute('data-visible', 'false');

    await waitingFreeAction.click();
    await expect(waitTurnNotice).toHaveAttribute('data-visible', 'true');
    await expect(waitTurnNotice)
      .toHaveAttribute('data-visible', 'false', { timeout: 6_000 });

    await waitingPage
      .getByRole('button', { name: 'Teste de perícia' })
      .click();
    const reactTurnNotice = waitingPage.locator('.self-combat-feedback');
    await expect(reactTurnNotice).toContainText('Aguarde o seu turno');
    await expectInsideViewport(waitingPage, '.self-combat-feedback');
    await reactTurnNotice.click();
    await expect(reactTurnNotice).toHaveCount(0);

    const activeFreeAction = activePage.locator('[data-player-action="free"]');
    await activeFreeAction.click();
    await expect(activeFreeAction)
      .toHaveAttribute('data-app-tooltip', 'Ação livre não disponível');
    await activeFreeAction.hover();
    const actionTooltip = activePage.locator('.disabled-control-tooltip');
    await expect(actionTooltip).toContainText('Ação livre não disponível');
    await expectInsideViewport(activePage, '.disabled-control-tooltip');

    await waitingPage
      .getByRole('button', { name: 'Teste de perícia' })
      .hover();
    const iconTooltip = waitingPage.locator('.disabled-control-tooltip');
    await expect(iconTooltip).toContainText('Disponível no seu turno');
    await expectInsideViewport(waitingPage, '.disabled-control-tooltip');

    await activePage
      .getByRole('button', { name: 'Teste de perícia' })
      .click();
    const activeSkillDialog = activePage.getByRole('dialog', {
      name: 'Teste de perícia',
    });
    const reflexOption = activeSkillDialog
      .locator('.player-skill-table button')
      .filter({ hasText: 'Reflexos' });
    await expect(reflexOption).toBeVisible();
    await reflexOption.click();
    await activeSkillDialog.getByRole('button', { name: 'Rolar' }).click();
    const skillResult = activePage
      .locator('.encounter-roll-result')
      .filter({ hasText: 'Reflexos:' })
      .last();
    await expect(skillResult).toBeVisible();
    await expect(skillResult.locator('.encounter-roll-sequence')).toHaveText(/#\d+/);

    const correlationId = 'opposed-check-e2e';
    session.server.publishRollResult({
      id: 'opposed-check-e2e-result',
      participantId: active!.id,
      label: 'Teste oposto',
      expression: '1d20',
      rolls: [12],
      modifier: 5,
      total: 17,
      outcome: 'success',
      category: 'test',
      createdAt: Date.now(),
      retainedByParticipantId: active!.id,
      sequence: 101,
      correlationId,
    });
    const linkedResult = activePage.locator(
      `.encounter-roll-result[data-relation-id="${correlationId}"]`,
    );
    await expect(linkedResult).toBeVisible();
    await expect(linkedResult.locator('.encounter-roll-sequence')).toHaveText('#101');
    await expect(
      linkedResult.getByLabel('Teste relacionado'),
    ).toBeVisible();

    const resultStack = activePage.locator('.encounter-roll-results.is-self');
    const resultStackLayout = await resultStack.evaluate((element) => {
      const template = element.querySelector<HTMLElement>('.encounter-roll-result');
      if (!template) throw new Error('Resultado-base não encontrado.');
      for (let index = 0; index < 24; index += 1) {
        const clone = template.cloneNode(true) as HTMLElement;
        clone.dataset.e2eOverflowResult = String(index);
        clone.querySelector('span:last-child')?.append(` ${index + 1}`);
        element.append(clone);
      }
      const bounds = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        top: bounds.top,
        bottom: bounds.bottom,
        viewportHeight: window.innerHeight,
        overflowY: style.overflowY,
      };
    });
    expect(resultStackLayout.overflowY).toBe('auto');
    expect(resultStackLayout.scrollHeight).toBeGreaterThan(resultStackLayout.clientHeight);
    expect(resultStackLayout.top).toBeGreaterThanOrEqual(0);
    expect(resultStackLayout.bottom).toBeLessThanOrEqual(resultStackLayout.viewportHeight + 1);
    const scrolledResultStack = await resultStack.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      return element.scrollTop;
    });
    expect(scrolledResultStack).toBeGreaterThan(0);
    await resultStack.locator('[data-e2e-overflow-result]').evaluateAll((elements) => {
      elements.forEach((element) => element.remove());
    });

    await activePage.setViewportSize({ width: 640, height: 480 });
    await activePage.getByRole('button', { name: 'Combate' }).click();
    await expect(
      activePage.getByRole('dialog', { name: 'Realizar ataque' }),
    ).toBeVisible();
    await expectInsideViewport(activePage, '.player-combat-modal');
    await activePage
      .getByRole('dialog', { name: 'Realizar ataque' })
      .getByRole('button', { name: 'Fechar' })
      .click();
    await activePage.setViewportSize({ width: 1280, height: 720 });

    await activePage.getByRole('button', { name: 'Encerrar turno' }).click();
    await activePage
      .getByRole('dialog', { name: 'Encerrar seu turno?' })
      .getByRole('button', { name: 'Encerrar turno' })
      .click();
    await expect(skillResult).toHaveClass(/is-leaving/);
    await expect(linkedResult).toHaveClass(/is-leaving/);
    await expect(skillResult).toHaveCount(0, { timeout: 1_000 });
    await expect(linkedResult).toHaveCount(0, { timeout: 1_000 });
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
        shortcuts: rectangle('.self-combat-shortcuts'),
      };
    });
    for (const bounds of [
      layout.self,
      layout.party,
      layout.turn,
      layout.shortcuts,
    ]) {
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
