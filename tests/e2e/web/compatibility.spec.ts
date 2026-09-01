import { expect, test } from '@playwright/test';
import {
  joinHostedSession,
  startHostedTestSession,
  TEST_MEDIA_IDS,
} from '../support/hosted-session';

test('revela a cena atual sem aguardar mídias futuras e continua o preload', async ({ page }) => {
  const session = await startHostedTestSession();
  let releaseFutureVideo: () => void = () => {};
  try {
    let futureVideoLoaded = false;
    const futureVideoGate = new Promise<void>((resolve) => {
      releaseFutureVideo = resolve;
    });
    await page.route(`**/session-media/${TEST_MEDIA_IDS.video}*`, async (route) => {
      await futureVideoGate;
      await route.continue();
      futureVideoLoaded = true;
    });

    await page.goto(session.inviteUrl);
    await page.getByRole('button', { name: 'Criar acesso' }).click();
    await page.locator('#web-player-create-name').fill('Jogador Compatível');
    await page.locator('#web-player-create-password').fill('test-password');
    await page.locator('#web-player-create-password-confirm').fill('test-password');
    await expect(page.locator('.player-stage')).toHaveCount(0);
    await page.locator('#web-player-create-account').getByRole('button', { name: 'Criar acesso' }).click();

    await expect(page.locator('.player-stage')).toBeVisible();
    await expect(page.getByText('Aguardando todos os jogadores estarem prontos')).toBeVisible();
    expect(futureVideoLoaded).toBe(false);
    releaseFutureVideo();

    for (const mediaId of [
      TEST_MEDIA_IDS.background,
      TEST_MEDIA_IDS.animation,
      TEST_MEDIA_IDS.video,
      TEST_MEDIA_IDS.music,
    ]) {
      await expect.poll(
        () => session.mediaRequests.get(mediaId) ?? 0,
        { message: `${mediaId} não foi requisitado` },
      ).toBeGreaterThan(0);
    }
    expect(session.mediaRequests.get(TEST_MEDIA_IDS.background)).toBe(1);
    await expect.poll(() => futureVideoLoaded).toBe(true);
  } finally {
    releaseFutureVideo();
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
