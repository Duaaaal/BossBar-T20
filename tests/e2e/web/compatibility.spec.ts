import { expect, test } from '@playwright/test';
import {
  joinHostedSession,
  startHostedTestSession,
  TEST_MEDIA_IDS,
} from '../support/hosted-session';

test('confirma o nome e só revela a apresentação depois de carregar as mídias', async ({ page }) => {
  const session = await startHostedTestSession();
  try {
    await page.route(`**/session-media/${TEST_MEDIA_IDS.video}*`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 650));
      await route.continue();
    });

    await page.goto(session.inviteUrl);
    await page.locator('#web-player-name').fill('Jogador Compatível');
    await page.locator('#web-player-password').fill('test-password');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByRole('dialog', { name: 'Confirmar usuário' })).toBeVisible();
    await expect(page.locator('#web-player-confirmed-name')).toHaveText('Jogador Compatível');
    await page.locator('#web-player-password-confirm').fill('test-password');
    await page.getByRole('button', { name: 'Confirmar' }).click();

    await expect(page.locator('#web-player-pending')).toBeVisible();
    await expect(page.locator('.player-stage')).toHaveCount(0);
    await expect(page.locator('.player-stage')).toBeVisible();
    await expect(page.getByText('Aguardando todos os jogadores estarem prontos')).toBeVisible();

    for (const mediaId of [
      TEST_MEDIA_IDS.background,
      TEST_MEDIA_IDS.animation,
      TEST_MEDIA_IDS.video,
      TEST_MEDIA_IDS.music,
    ]) {
      expect(session.mediaRequests.get(mediaId), `${mediaId} não foi requisitado`).toBeGreaterThan(0);
    }
    expect(session.mediaRequests.get(TEST_MEDIA_IDS.background)).toBe(1);
  } finally {
    await session.close();
  }
});

test('mostra imediatamente que a sala foi encerrada pelo mestre', async ({ page }) => {
  const session = await startHostedTestSession();
  await joinHostedSession(page, session.inviteUrl, 'Jogador Encerramento');
  await session.close();

  await expect(page.getByRole('heading', { name: 'Sala encerrada' })).toBeVisible();
  await expect(page.getByText('O mestre encerrou esta sala.')).toBeVisible();
});
