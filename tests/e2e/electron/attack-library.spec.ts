import { _electron as electron, expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { createEditableCharacterSheet, joinHostedSession, startHostedTestSession } from '../support/hosted-session';

test('biblioteca local, arsenal de fase, loop por faixa e retrato compartilhado no Electron', async ({ browser }, testInfo) => {
  const profile = testInfo.outputPath('attack-library-profile');
  await mkdir(profile, { recursive: true });
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ cwd: process.cwd(), args: ['.', '--no-sandbox', '--disable-gpu', '--in-process-gpu'], env: { ...env, BOSSBAR_E2E: '1', BOSSBAR_E2E_PROFILE: profile } });
  const session = await startHostedTestSession();
  const context = await browser.newContext();
  const named = async (title: string): Promise<Page> => {
    await expect.poll(async () => Promise.all(app.windows().map((page) => page.title()))).toContain(title);
    for (const page of app.windows()) if (await page.title() === title) return page;
    throw new Error(title);
  };
  try {
    await (await app.firstWindow()).getByRole('button', { name: 'Novo encontro' }).click();
    const master = await named('Controle do Mestre - BossBar T20');
    const player = await named('Apresentação do Chefão - BossBar T20');
    await master.getByRole('button', { name: 'Biblioteca de ataques', exact: true }).click();
    const libraryPage = await named('Biblioteca de ataques - BossBar T20');
    const library = libraryPage.getByRole('dialog', { name: 'Biblioteca de ataques' });
    await library.getByRole('button', { name: 'Novo ataque' }).click();
    await library.getByLabel('Nome', { exact: true }).fill('Garras de teste');
    await library.getByLabel('Tags (separadas por vírgula)').fill('Dragão,Fase 2');
    await library.getByLabel('Ataques (1–20)').fill('3');
    await library.getByLabel('Dano por acerto').fill('1d12');
    await library.getByLabel('Tipo de dano', { exact: true }).selectOption('Corte');
    await library.getByLabel('Alcance', { exact: true }).selectOption('Cone');
    await library.getByLabel('Alcance em metros').fill('12');
    await library.getByRole('button', { name: 'Adicionar efeito' }).click();
    await library.getByRole('button', { name: 'Salvar ataque' }).click();
    await expect(library.locator('article')).toContainText('Garras de teste');
    const entries = await libraryPage.evaluate(() => window.bossAPI.getAttackLibrary());
    expect(entries[0]).toMatchObject({ attackCount: 3, range: 'Cone 12m', tags: ['Dragão', 'Fase 2'] });
    await library.getByRole('button', { name: 'Fechar biblioteca de ataques' }).click();
    await master.getByRole('button', { name: 'Editar cena', exact: true }).click();
    const editor = await named('Editar Cena - BossBar T20');
    await editor.getByRole('button', { name: 'Escolher armas / ataques' }).click();
    await editor.getByRole('dialog', { name: 'Biblioteca de ataques' }).getByRole('button', { name: 'Selecionar', exact: true }).click();
    await expect(editor.getByText('Garras de teste · 1d12 · 3 ataque(s)', { exact: false })).toBeVisible();
    await editor.getByRole('button', { name: 'Salvar cena', exact: true }).click();
    await expect.poll(async () => (await editor.evaluate(() => window.bossAPI.getScenePlan())).phases[0].bosses[0].patch.attacks?.some((attack) => attack.name === 'Garras de teste')).toBe(true);
    await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, path.resolve('tests/fixtures/media/test-tone.mp3'));
    const loop = await editor.evaluate(async () => {
      const phase = (await window.bossAPI.getScenePlan()).phases[0];
      await window.bossAPI.openScenePhasePlaylist(phase.id, 'music', phase.name, { tracks: [], currentTrackId: null, volume: 0.8, muted: false, loop: false, revision: 0 });
      const result = await window.bossAPI.addScenePhasePlaylistTracks(phase.id, 'music');
      return { phaseId: phase.id, result };
    });
    expect(loop.result.ok).toBe(true);
    const track = loop.result.state!.tracks[0].id;
    const looping = await editor.evaluate(({ phaseId, trackId }) => new Promise<boolean>((resolve) => {
      const unsubscribe = window.bossAPI.subscribeScenePhasePlaylist((state) => {
        if (state.phaseId !== phaseId || state.tracks.find((track) => track.id === trackId)?.loop !== true) return;
        unsubscribe(); resolve(true);
      });
      window.bossAPI.dispatchScenePhasePlaylist(phaseId, 'music', { type: 'set-track-loop', trackId, loop: true });
    }), { phaseId: loop.phaseId, trackId: track });
    expect(looping).toBe(true);

    const web = await context.newPage(); await joinHostedSession(web, session.inviteUrl, 'Retrato Electron');
    await web.getByRole('button', { name: 'Ficha', exact: true }).click();
    await web.locator('#web-player-sheet-input').setInputFiles({ name: 'retrato.pdf', mimeType: 'application/pdf', buffer: await createEditableCharacterSheet({ characterName: 'Retrato Electron', playerName: 'Retrato Electron' }) });
    await expect(web.locator('#web-player-sheet-status')).toContainText('retrato.pdf');
    await web.locator('#web-player-sheet-open').click();
    await web.locator('#web-player-portrait-input').setInputFiles(path.resolve('tests/fixtures/media/test-background.png'));
    await expect.poll(() => session.server.getPlayerHuds()[0]?.portraitUrl).toBeTruthy();
    const hud = session.server.getPlayerHuds();
    const response = await fetch(hud[0].portraitUrl!);
    expect(response.headers.get('Cross-Origin-Resource-Policy')).toBe('cross-origin');
    await app.evaluate(({ BrowserWindow }, hud) => { BrowserWindow.getAllWindows().find((window) => window.getTitle() === 'Apresentação do Chefão - BossBar T20')?.webContents.send('multiplayer:player-huds-changed', hud); }, hud);
    const image = player.locator('.party-player-portrait img');
    await expect.poll(() => image.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    await player.getByRole('button', { name: 'Ampliar retrato de Retrato Electron' }).click();
    await expect(player.locator('.player-portrait-lightbox img')).toBeVisible();
  } finally { await context.close(); await session.close(); await app.close(); }
});
