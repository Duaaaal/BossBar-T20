import { chromium, expect } from '@playwright/test';

if (process.env.GITHUB_ACTIONS !== 'true' || process.env.RUNNER_ENVIRONMENT !== 'github-hosted') {
  throw new Error('Installed UI checks require a disposable GitHub-hosted runner.');
}
const [expectedVersion, expectedNotes = ''] = process.argv.slice(2);
const browser = await chromium.connectOverCDP('http://127.0.0.1:19287');
try {
  const pages = () => browser.contexts().flatMap(context => context.pages());
  await expect.poll(() => pages().length).toBeGreaterThan(0);
  const launcher = pages()[0];
  await expect.poll(() => launcher.evaluate(() => window.bossAPI?.getAppVersion())).toBe(expectedVersion);
  if (expectedNotes) {
    await launcher.getByRole('button', { name: 'Novo encontro', exact: true }).click();
    await expect.poll(async () => Promise.all(pages().map(page => page.title())))
      .toContain('Controle do Mestre - BossBar T20');
    const master = (await Promise.all(pages().map(async page => ({ page, title: await page.title() }))))
      .find(item => item.title === 'Controle do Mestre - BossBar T20').page;
    await expect.poll(async () => (await master.evaluate(() => window.bossAPI.getMasterNotes())).trim())
      .toBe(expectedNotes);
  }
  console.log(`Installed UI verified: ${expectedVersion}; preserved notes: ${Boolean(expectedNotes)}`);
} finally {
  await browser.close();
}
