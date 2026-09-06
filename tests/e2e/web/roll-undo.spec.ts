import { expect, test } from '@playwright/test';
import {
  createPublicBattle,
  joinHostedSession,
  startHostedTestSession,
} from '../support/hosted-session';

test('sincroniza o risco de um resultado desfeito entre jogadores e reconexões', async ({ browser }) => {
  const session = await startHostedTestSession();
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  try {
    const pages = await Promise.all(contexts.map((context) => context.newPage()));
    for (const [index, page] of pages.entries()) {
      await joinHostedSession(page, session.inviteUrl, `Observador Undo ${index + 1}`);
    }
    session.server.publishBattleState(createPublicBattle({ battleStarted: true, revision: 2 }));
    const rollId = 'formula:boss:boss-e2e:undo-test';
    session.server.publishRollResult({
      id: rollId,
      participantId: 'boss:boss-e2e',
      label: 'Dano',
      expression: '1d4',
      rolls: [3],
      modifier: 0,
      total: 3,
      outcome: 'neutral',
      category: 'damage',
      createdAt: Date.now(),
      retainedByParticipantId: null,
      targetParticipantId: 'boss:boss-e2e',
      targetName: 'Dragão de Teste',
    });
    for (const page of pages) {
      await expect(page.locator(`[data-roll-id="${rollId}"]`))
        .toContainText('1d4(3) + ??? = 3');
    }
    session.server.publishHistoryEntry({
      id: 'history:undo:e2e',
      kind: 'system',
      round: 0,
      turnParticipantId: null,
      actorParticipantId: null,
      actorName: 'Mestre',
      label: 'Desfazer',
      detail: 'O mestre reverteu o dano.',
      createdAt: Date.now(),
      revertsEntryIds: [`history:${rollId}`],
    });
    for (const page of pages) {
      const row = page.locator(`[data-roll-id="${rollId}"]`);
      await expect(row).toHaveClass(/is-undone/);
      await expect(row).toContainText('(desfeito)');
      const strike = await row.evaluate((element) => {
        const style = getComputedStyle(element, '::after');
        return {
          width: Number.parseFloat(style.width),
          rowWidth: element.getBoundingClientRect().width,
          height: style.height,
          animation: style.animationName,
        };
      });
      expect(strike.width).toBeGreaterThan(strike.rowWidth - 15);
      expect(strike.height).toBe('2px');
      expect(strike.animation).toBe('none');
    }
    // A page reload intentionally requires authentication again; reconnect
    // the existing session to exercise snapshot recovery without bypassing it.
    await contexts[1].setOffline(true);
    await expect(pages[1].locator('#web-player-status'))
      .toHaveAttribute('data-state', 'disconnected');
    await contexts[1].setOffline(false);
    await expect(pages[1].locator('#web-player-status'))
      .not.toHaveAttribute('data-state', 'disconnected');
    await expect(pages[1].locator(`[data-roll-id="${rollId}"]`))
      .toHaveClass(/is-undone/);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    await session.close();
  }
});
