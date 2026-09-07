import { _electron as electron, test, expect, type Page } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

test('avisa proporção, persiste enquadramento e salva encontro antes de fechar', async ({ browserName }, testInfo) => {
  void browserName;
  const profile = testInfo.outputPath('isolated-profile');
  await mkdir(profile, { recursive: true });
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ cwd: process.cwd(), args: ['.', '--no-sandbox', '--disable-gpu', '--in-process-gpu'], env: { ...env, BOSSBAR_E2E: '1', BOSSBAR_E2E_PROFILE: profile } });
  const named = async (title: string): Promise<Page> => {
    await expect.poll(async () => Promise.all(app.windows().map((page) => page.title()))).toContain(title);
    for (const page of app.windows()) if (await page.title() === title) return page;
    throw new Error(title);
  };
  try {
    await (await app.firstWindow()).getByRole('button', { name: 'Novo encontro' }).click();
    const master = await named('Controle do Mestre - BossBar T20');
    const player = await named('Apresentação do Chefão - BossBar T20');
    const userData = await app.evaluate(({ app }) => app.getPath('userData'));
    await master.getByRole('button', { name: 'Editar cena', exact: true }).click();
    const editor = await named('Editar Cena - BossBar T20');
    await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, path.resolve('assets/status-icons/status-36-coringa.png'));
    await editor.locator('.phase-media').filter({ hasText: 'Fundo da fase' }).getByRole('button', { name: 'Upload', exact: true }).click();
    await expect(editor.locator('.media-aspect-warning')).toContainText('Esta proporção pode não caber');
    await expect(editor.locator('.media-aspect-warning')).toContainText('1920 × 1080');
    await editor.getByLabel('Enquadramento da mídia').selectOption('cover');
    await editor.getByRole('button', { name: 'Salvar cena', exact: true }).click();
    await expect.poll(async () => (await editor.evaluate(() => window.bossAPI.getScenePlan())).phases[0].mediaFit).toBe('cover');
    await master.evaluate(() => window.bossAPI.dispatch({ type: 'start-battle' }));
    await expect.poll(() => master.evaluate(async () => (await window.bossAPI.getState()).battleStarted)).toBe(true);
    await expect(player.locator('.player-stage')).toHaveCSS('background-size', 'cover');
    const closeMaster = () => app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows().find((window) => window.getTitle() === 'Controle do Mestre - BossBar T20')?.close(); });
    await closeMaster();
    const prompt = master.getByRole('dialog', { name: 'Salvar o encontro antes de fechar?' });
    await expect(prompt).toBeVisible();
    await prompt.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(prompt).toBeHidden();
    await expect(master.getByRole('button', { name: 'Editar cena', exact: true })).toBeVisible();
    await closeMaster();
    const closed = app.waitForEvent('close');
    await prompt.getByRole('button', { name: 'Salvar e fechar', exact: true }).click();
    await closed;
    const library = JSON.parse(await readFile(path.join(userData, 'boss-library.json'), 'utf8'));
    expect(library.entries.some((entry: { isAutosave?: boolean }) => !entry.isAutosave)).toBe(true);
    expect(library.entries.some((entry: { isAutosave?: boolean }) => entry.isAutosave)).toBe(true);
    expect(library.entries[0].scene.phases[0].mediaFit).toBe('cover');
  } finally { await app.close().catch(() => undefined); }
});
