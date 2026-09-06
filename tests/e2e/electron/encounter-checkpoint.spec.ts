import { _electron as electron, expect, test, type Page } from '@playwright/test';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';

test('retoma fase, vida, condições e blackout; encerra cutscenes manual e automaticamente', async ({ browserName }, testInfo) => {
  void browserName;
  const profile = testInfo.outputPath('checkpoint-profile');
  await mkdir(profile, { recursive: true });
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const launch = () => electron.launch({ cwd: process.cwd(), args: ['.', '--no-sandbox', '--disable-gpu', '--in-process-gpu'], env: { ...env, BOSSBAR_E2E: '1', BOSSBAR_E2E_PROFILE: profile } });
  let app = await launch();
  const windowNamed = async (title: string): Promise<Page> => {
    await expect.poll(async () => Promise.all(app.windows().map((page) => page.title()))).toContain(title);
    for (const page of app.windows()) if (await page.title() === title) return page;
    throw new Error(`Janela ausente: ${title}`);
  };
  try {
    await (await app.firstWindow()).getByRole('button', { name: 'Novo encontro' }).click();
    const master = await windowNamed('Controle do Mestre - BossBar T20');
    const player = await windowNamed('Apresentação do Chefão - BossBar T20');
    const control = await windowNamed('Painel Privado do Encontro - BossBar T20');
    await player.addInitScript(() => {
      const events: unknown[] = [];
      Object.assign(window, { __musicEvents: events });
      for (const name of ['error', 'playing', 'pause', 'ended']) document.addEventListener(name, (event) => {
        const audio = event.target;
        if (audio instanceof HTMLAudioElement && audio.classList.contains('music-player')) events.push({ name, at: Date.now(), time: audio.currentTime, error: audio.error?.message });
      }, true);
      const create = AudioContext.prototype.createMediaElementSource;
      AudioContext.prototype.createMediaElementSource = function (element) {
        const source = create.call(this, element);
        const connect = source.connect.bind(source);
        source.connect = ((destination: AudioNode) => {
          if (element.classList.contains('music-player') && destination instanceof GainNode && !(window as typeof window & { __musicGain?: GainNode }).__musicGain) Object.assign(window, { __musicGain: destination });
          return connect(destination);
        }) as typeof source.connect;
        return source;
      };
    });
    await player.reload();
    await master.evaluate(() => window.bossAPI.openSceneEditor());
    const editor = await windowNamed('Editar Cena - BossBar T20');
    const file = path.resolve('tests/fixtures/media/test-video.mp4');
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
    }, file);
    const selection = await editor.evaluate(() => window.bossAPI.chooseScenePhaseMedia('cut-checkpoint', 'background'));
    expect(selection.ok).toBe(true);
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
    }, path.resolve('tests/fixtures/media/test-tone.mp3'));
    const playlists = await editor.evaluate(async () => {
      const initial = { tracks: [], currentTrackId: null, volume: 0.5, muted: false, loop: true, revision: 0 };
      await window.bossAPI.openScenePhasePlaylist('phase-1', 'music', 'Fase 1', initial);
      const phase = await window.bossAPI.addScenePhasePlaylistTracks('phase-1', 'music');
      if (!phase.ok) throw new Error('Falha ao preparar a playlist de teste');
      window.bossAPI.dispatchScenePhasePlaylist('phase-1', 'music', { type: 'set-loop', loop: true });
      const loopingPhase = await window.bossAPI.openScenePhasePlaylist('phase-1', 'music', 'Fase 1', initial);
      await window.bossAPI.openScenePhasePlaylist('cut-checkpoint', 'music', 'Cutscene', initial);
      const cut = await window.bossAPI.addScenePhasePlaylistTracks('cut-checkpoint', 'music');
      return { phase: loopingPhase!, cut: cut.state! };
    });
    const savedScene = await editor.evaluate(async (playlists) => {
      const plan = await window.bossAPI.getScenePlan();
      const first = plan.phases[0];
      const cutscene = { id: 'cut-checkpoint', name: 'Interlúdio', background: { name: 'test-video.mp4', configured: true as const, mediaType: 'video' as const },
        videoVolume: 0.35, videoMuted: false, visualFadeInSeconds: 0.4, visualFadeOutSeconds: 0.6, audioFadeInSeconds: 0.5, audioFadeOutSeconds: 0.8,
        music: playlists.cut, transitionSound: null, advanceMode: 'manual' as const, durationSeconds: 4, transition: 'fade' as const, transitionDurationSeconds: 0.5 };
      return window.bossAPI.saveScenePlan({ ...plan, phases: [
        { ...first, hudDelaySeconds: 0.5, hudFadeInSeconds: 1, visualFadeInSeconds: 2, audioFadeInSeconds: 2, music: playlists.phase, startHealth: 500, endHealth: 250, cutscene, bosses: first.bosses.map((boss) => ({ ...boss, patch: { ...boss.patch, maxHealth: 500, currentHealth: 500 } })) },
        { ...first, id: 'phase-second', name: 'Renascimento', startHealth: 250, endHealth: 0, cutscene: null,
          bosses: first.bosses.map((boss) => ({ ...boss, patch: { ...boss.patch, bossName: 'Segunda forma', maxHealth: 500, currentHealth: 400 } })) },
      ] });
    }, playlists);
    expect(savedScene.ok).toBe(true);
    // Setup uses IPC directly; reload to discard the editor's upload draft.
    await editor.reload();
    await expect(editor.locator('select').filter({ has: editor.locator('option[value="fade-blackout"]') })).toBeDisabled();
    await editor.getByRole('button', { name: '▷ Cutscene 1 → 2', exact: true }).click();
    await expect(editor.getByRole('heading', { name: 'Cutscene entre fases' })).toBeVisible();
    await expect(editor.getByRole('spinbutton', { name: 'Imagem: entrada' })).toHaveValue('0.4');
    await expect(editor.getByRole('spinbutton', { name: 'Áudio: saída' })).toHaveValue('0.8');
    await expect(editor.getByRole('spinbutton', { name: 'Duração do blackout' })).toHaveValue('0.6');
    await expect(editor.getByRole('spinbutton', { name: 'Imagem: saída' })).toHaveCount(0);
    await editor.screenshot({ path: testInfo.outputPath('cutscene-editor.png') });
    const tab = await editor.locator('.cutscene-tab-row').boundingBox();
    const closeTab = await editor.getByRole('button', { name: 'Excluir cutscene 1', exact: true }).boundingBox();
    expect(closeTab!.y).toBeGreaterThanOrEqual(tab!.y);
    expect(closeTab!.y + closeTab!.height).toBeLessThanOrEqual(tab!.y + tab!.height);
    await editor.getByRole('button', { name: 'Fechar edição da cutscene' }).click();
    await expect(editor.getByRole('spinbutton', { name: 'Entrada da fase: imagem' })).toHaveValue('2');
    await expect(editor.getByRole('spinbutton', { name: 'Entrada da fase: áudio' })).toHaveValue('2');
    await expect(editor.getByRole('spinbutton', { name: 'Intervalo do HUD' })).toHaveValue('0.5');
    await expect(editor.getByRole('spinbutton', { name: 'Fade de entrada do HUD' })).toHaveValue('1');
    await editor.getByRole('button', { name: 'Excluir cutscene 1', exact: true }).click();
    await editor.getByRole('button', { name: 'Fechar confirmação' }).click();
    await expect(editor.getByRole('button', { name: '▷ Cutscene 1 → 2', exact: true })).toBeVisible();
    await editor.getByRole('button', { name: 'Excluir cutscene 1', exact: true }).click();
    await editor.getByRole('dialog').getByRole('button', { name: 'Excluir cutscene', exact: true }).click();
    await expect(editor.getByRole('button', { name: '▷ Cutscene 1 → 2', exact: true })).toHaveCount(0);
    await editor.keyboard.press('Control+z');
    await expect(editor.getByRole('button', { name: '▷ Cutscene 1 → 2', exact: true })).toBeVisible();
    await master.evaluate(() => window.bossAPI.dispatch({ type: 'start-battle' }));
    await expect.poll(() => player.evaluate(async () => (await window.bossAPI.getState()).battleStarted)).toBe(true);
    await expect(player.locator('.phase-entrance')).toBeVisible();
    expect(await player.evaluate(async () => (await window.bossAPI.getScenePlan()).phaseEntrance)).toMatchObject({ phaseId: 'phase-1', visualSeconds: 2, audioSeconds: 2 });
    await expect(player.locator('.music-player')).toHaveJSProperty('paused', false);
    const toneDurations = await player.evaluate(async () => {
      const audio = document.querySelector<HTMLAudioElement>('.music-player')!;
      const response = await fetch(audio.src); const bytes = await response.arrayBuffer();
      const context = new AudioContext();
      try { const decoded = await context.decodeAudioData(bytes); return { duration: audio.duration, decoded: decoded.duration }; }
      finally { await context.close(); }
    });
    expect(toneDurations.decoded).toBeCloseTo(toneDurations.duration, 2);
    await editor.getByRole('button', { name: /Fase 1.*500/ }).click();
    await editor.locator('.phase-playlist-card').filter({ hasText: 'Música da fase' }).getByTitle('Pausar', { exact: true }).click();
    await expect(player.locator('.music-player')).toHaveJSProperty('paused', true);
    await editor.locator('.phase-playlist-card').filter({ hasText: 'Música da fase' }).getByTitle('Reproduzir', { exact: true }).click();
    await expect(player.locator('.music-player')).toHaveJSProperty('paused', false);
    await expect.poll(() => editor.evaluate(async () => (await window.bossAPI.getMusicState()).sceneOwnerId)).toBe('phase-1');
    const initialGain = await player.evaluate(() => (window as typeof window & { __musicGain: GainNode }).__musicGain.gain.value);
    await control.evaluate(async () => {
      const state = await window.bossAPI.getState();
      return window.bossAPI.applyHealthSequence({ bossId: state.activeBossId, type: 'damage', total: 260, hits: 1, ignoreDamageReduction: true });
    });
    await expect(player.locator('.cutscene-presentation')).toHaveClass(/is-playing/).catch(async (error) => {
      console.log('Electron cutscene:', await player.locator('.cutscene-presentation video').evaluate(async (element: HTMLVideoElement) => ({
        error: element.error?.message, ready: element.readyState, status: await fetch(element.src).then((r) => r.status).catch(() => 0),
      })));
      throw error;
    });
    await expect(player.locator('.cutscene-presentation video')).toHaveJSProperty('muted', true);
    await expect(player.locator('.boss-hud')).toBeHidden();
    await expect(player.locator('.encounter-turn-tools')).toBeHidden();
    await expect.poll(() => player.evaluate(() => (window as typeof window & { __musicGain: GainNode }).__musicGain.gain.value)).toBeLessThan(initialGain * 0.8);
    await expect.poll(() => editor.evaluate(async () => (await window.bossAPI.getMusicState()).externalPlayback)).toBe(true);
    expect(await editor.evaluate(async () => (await window.bossAPI.getMusicState()).sceneOwnerId)).toBe('cut-checkpoint');
    await editor.evaluate(() => window.bossAPI.controlSceneMusic('cut-checkpoint', { type: 'toggle' }));
    await expect.poll(() => editor.evaluate(async () => (await window.bossAPI.getMusicState()).isPlaying)).toBe(false);
    await editor.evaluate(() => window.bossAPI.controlSceneMusic('cut-checkpoint', { type: 'seek', time: 0.1 }));
    expect(await editor.evaluate(async () => (await window.bossAPI.getMusicState()).resumeTime)).toBeCloseTo(0.1);
    await editor.evaluate(() => window.bossAPI.controlSceneMusic('cut-checkpoint', { type: 'toggle' }));
    await expect.poll(() => editor.evaluate(async () => (await window.bossAPI.getMusicState()).isPlaying)).toBe(true);
    await editor.evaluate(() => window.bossAPI.dispatchScenePhasePlaylist('cut-checkpoint', 'music', { type: 'set-loop', loop: false }));
    await expect.poll(() => editor.evaluate(async () => (await window.bossAPI.getMusicState()).isPlaying)).toBe(false);
    expect(await editor.evaluate(() => window.bossAPI.controlSceneMusic('cut-checkpoint', { type: 'toggle' }))).toBe(true);
    await expect.poll(() => editor.evaluate(async () => (await window.bossAPI.getMusicState()).isPlaying)).toBe(true);
    const savedCutscene = await master.evaluate(async () => {
      const state = await window.bossAPI.getState();
      return window.bossAPI.saveBossToLibrary({ activeBossId: state.activeBossId, bosses: state.bosses.map((boss) => ({ ...boss, bossId: boss.id, amount: boss.controlAmount, description: boss.nextAction })) }, 'new');
    });
    expect(savedCutscene.ok).toBe(true);
    expect(await master.evaluate(() => window.bossAPI.continueCutscene())).toBe(true);
    await expect.poll(() => player.evaluate(async () => (await window.bossAPI.getScenePlan()).activePhaseIndex)).toBe(1);
    await expect(player.locator('.cutscene-presentation')).toHaveClass(/is-ending/);
    await expect.poll(() => editor.evaluate(async () => (await window.bossAPI.getMusicState()).sceneOwnerId)).toBe('phase-1');
    const savedTail = await master.evaluate(async () => {
      const state = await window.bossAPI.getState();
      return window.bossAPI.saveBossToLibrary({ activeBossId: state.activeBossId, bosses: state.bosses.map((boss) => ({ ...boss, bossId: boss.id, amount: boss.controlAmount, description: boss.nextAction })) }, 'new');
    });
    expect(savedTail.ok).toBe(true);
    await expect(player.locator('.cutscene-presentation')).toHaveCount(0);
    await expect(player.locator('.boss-hud')).toBeVisible();
    await expect(player.locator('.music-player')).toHaveJSProperty('paused', false).catch(async (error) => {
      console.log('Phase handoff:', await player.evaluate(async () => ({ music: await window.bossAPI.getMusicState(), events: (window as typeof window & { __musicEvents: unknown[] }).__musicEvents, phases: (await window.bossAPI.getScenePlan()).phases.map((phase) => phase.music) })));
      throw error;
    });
    await expect.poll(() => player.evaluate(async () => (await window.bossAPI.getScenePlan()).activePhaseIndex)).toBe(1);
    await expect.poll(() => player.evaluate(async () => (await window.bossAPI.getState()).bosses[0].currentHealth)).toBe(400);
    await control.evaluate(async () => {
      const state = await window.bossAPI.getState();
      await window.bossAPI.applyHealthSequence({ bossId: state.activeBossId, type: 'damage', total: 33, hits: 1, ignoreDamageReduction: true });
      window.bossAPI.dispatch({ type: 'apply-status', bossId: state.activeBossId, statusId: 'abalado', turns: 4, damageFormula: null });
    });
    await expect.poll(() => player.evaluate(async () => (await window.bossAPI.getState()).bosses[0].activeStatuses)).toMatchObject([{ statusId: 'abalado', turnsRemaining: 4 }]);
    await master.evaluate(() => window.bossAPI.activateSceneBlackout());
    const saved = await master.evaluate(async () => {
      const state = await window.bossAPI.getState();
      return window.bossAPI.saveBossToLibrary({ activeBossId: state.activeBossId, bosses: state.bosses.map((boss) => ({ ...boss, bossId: boss.id, amount: boss.controlAmount, description: boss.nextAction })) }, 'new');
    });
    expect(saved.ok).toBe(true);
    await master.evaluate(() => window.bossAPI.dispatch({ type: 'reset-all' }));
    await master.evaluate(() => window.bossAPI.openBossLibrary());
    const library = await windowNamed('Biblioteca de Encontros - BossBar T20');
    expect(await library.evaluate((id) => window.bossAPI.loadBossFromLibrary(id!, false), saved.entryId)).toMatchObject({ ok: true });
    await expect.poll(() => player.evaluate(async () => {
      const state = await window.bossAPI.getState(); const scene = await window.bossAPI.getScenePlan();
      return { battle: state.battleStarted, hp: state.bosses[0].currentHealth, name: state.bosses[0].bossName, statuses: state.bosses[0].activeStatuses, phase: scene.activePhaseIndex, blackout: scene.blackoutActive };
    })).toMatchObject({ battle: true, hp: 367, name: 'Segunda forma', phase: 1, blackout: true, statuses: [{ statusId: 'abalado', turnsRemaining: 4 }] });
    // Change only the ending mode, then exercise automatic video completion.
    await master.evaluate(() => window.bossAPI.dispatch({ type: 'end-battle' }));
    const automatic = await editor.evaluate(async () => {
      const plan = await window.bossAPI.getScenePlan();
      return window.bossAPI.saveScenePlan({ ...plan, phases: plan.phases.map((phase) => ({ ...phase, cutscene: phase.cutscene ? { ...phase.cutscene, advanceMode: 'automatic' as const } : null })) });
    });
    expect(automatic.ok).toBe(true);
    await master.evaluate(() => window.bossAPI.dispatch({ type: 'start-battle' }));
    await control.evaluate(async () => {
      const state = await window.bossAPI.getState();
      return window.bossAPI.applyHealthSequence({ bossId: state.activeBossId, type: 'damage', total: 260, hits: 1, ignoreDamageReduction: true });
    });
    await expect(player.locator('.cutscene-presentation')).toHaveClass(/is-playing/);
    await expect.poll(() => player.evaluate(async () => (await window.bossAPI.getScenePlan()).cutscenePlayback?.endingAt)).toBeTruthy();
    const automaticTiming = await player.evaluate(async () => (await window.bossAPI.getScenePlan()).cutscenePlayback!);
    expect((automaticTiming.endingAt! - automaticTiming.startedAt!) / 1000).toBeCloseTo(automaticTiming.durationSeconds - automaticTiming.offsetSeconds, 2);
    await expect(player.locator('.cutscene-presentation')).toHaveCount(0, { timeout: 12000 });
    await expect.poll(() => player.evaluate(async () => (await window.bossAPI.getScenePlan()).activePhaseIndex)).toBe(1);
    // The checkpoint must also survive disk normalization after a process restart.
    await app.evaluate(({ app }) => app.exit(0));
    await app.close();
    app = await launch();
    await (await app.firstWindow()).getByRole('button', { name: 'Carregar encontro' }).click();
    const reopenedLibrary = await windowNamed('Biblioteca de Encontros - BossBar T20');
    expect(await reopenedLibrary.evaluate((id) => window.bossAPI.loadBossFromLibrary(id!, false), saved.entryId)).toMatchObject({ ok: true });
    const reopenedPlayer = await windowNamed('Apresentação do Chefão - BossBar T20');
    await expect.poll(() => reopenedPlayer.evaluate(async () => {
      const state = await window.bossAPI.getState(); const scene = await window.bossAPI.getScenePlan();
      return { hp: state.bosses[0].currentHealth, phase: scene.activePhaseIndex, blackout: scene.blackoutActive, status: state.bosses[0].activeStatuses[0]?.statusId, battle: state.battleStarted };
    })).toEqual({ hp: 367, phase: 1, blackout: true, status: 'abalado', battle: true });
    const reopenedMaster = await windowNamed('Controle do Mestre - BossBar T20');
    await reopenedMaster.getByRole('button', { name: 'Resetar', exact: true }).click();
    await reopenedMaster.getByRole('button', { name: 'Resetar encontro', exact: true }).click();
    await reopenedMaster.getByRole('button', { name: 'Sim, resetar', exact: true }).click();
    await expect.poll(() => reopenedPlayer.evaluate(async () => {
      const state = await window.bossAPI.getState(); const scene = await window.bossAPI.getScenePlan();
      return { hp: state.bosses[0].currentHealth, status: state.bosses[0].activeStatuses.length, phase: scene.activePhaseIndex, battle: state.battleStarted, phases: scene.phases.length };
    })).toEqual({ hp: 500, status: 0, phase: -1, battle: false, phases: 2 });
    await expect(reopenedPlayer.locator('.music-player')).toHaveJSProperty('paused', true);
    expect(await reopenedLibrary.evaluate((id) => window.bossAPI.loadBossFromLibrary(id!, false), savedCutscene.entryId)).toMatchObject({ ok: true });
    await expect(reopenedPlayer.locator('.cutscene-presentation')).toHaveClass(/is-playing/);
    await expect.poll(() => reopenedPlayer.evaluate(async () => (await window.bossAPI.getScenePlan()).activePhaseIndex)).toBe(0);
    expect(await reopenedLibrary.evaluate((id) => window.bossAPI.loadBossFromLibrary(id!, false), savedTail.entryId)).toMatchObject({ ok: true });
    await expect.poll(() => reopenedPlayer.evaluate(async () => {
      const scene = await window.bossAPI.getScenePlan(); const state = await window.bossAPI.getState();
      return { phase: scene.activePhaseIndex, cutscene: Boolean(scene.cutscenePlayback), hp: state.bosses[0].currentHealth };
    })).toEqual({ phase: 1, cutscene: false, hp: 400 });
  } finally {
    await app.evaluate(({ app }) => app.exit(0)).catch(() => undefined);
    await app.close();
  }
});
