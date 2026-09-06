import { _electron as electron, expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const projectRoot = path.resolve(process.cwd());

const windowByTitle = async (
  application: Awaited<ReturnType<typeof electron.launch>>,
  title: string,
) => {
  await expect.poll(async () => Promise.all(
    application.windows().map((window) => window.title()),
  )).toContain(title);
  for (const window of application.windows()) {
    if (await window.title() === title) return window;
  }
  throw new Error(`A janela "${title}" não foi encontrada.`);
};

test('abre launcher, mestre, apresentação e painel usando perfil descartável', async ({ browserName }, testInfo) => {
  void browserName;
  const profile = testInfo.outputPath('isolated-profile');
  await mkdir(profile, { recursive: true });
  const testEnvironment = { ...process.env };
  // Alguns ambientes de automação definem esta variável globalmente. Se ela
  // chegar ao Electron, o processo inicia como Node.js em vez do aplicativo.
  delete testEnvironment.ELECTRON_RUN_AS_NODE;
  const application = await electron.launch({
    // O perfil descartável roda dentro do sandbox do CI/Codex, que não permite
    // criar os subprocessos GPU/sandbox do Chromium. Isso afeta apenas o teste.
    args: ['.', '--no-sandbox', '--disable-gpu', '--in-process-gpu'],
    cwd: projectRoot,
    env: {
      ...testEnvironment,
      BOSSBAR_E2E: '1',
      BOSSBAR_E2E_PROFILE: profile,
    },
  });
  try {
    const launcher = await application.firstWindow();
    await expect(launcher).toHaveTitle('Início - BossBar T20');

    const paths = await application.evaluate(({ app }) => ({
      userData: app.getPath('userData'),
      documents: app.getPath('documents'),
      music: app.getPath('music'),
      pictures: app.getPath('pictures'),
    }));
    for (const location of Object.values(paths)) {
      expect(path.resolve(location).startsWith(path.resolve(profile))).toBe(true);
    }

    await launcher.getByRole('button', { name: 'Novo encontro' }).click();
    const master = await windowByTitle(application, 'Controle do Mestre - BossBar T20');
    const player = await windowByTitle(application, 'Apresentação do Chefão - BossBar T20');
    const control = await windowByTitle(application, 'Painel Privado do Encontro - BossBar T20');

    await player.evaluate(() => {
      Object.assign(window, {
        __bossCriticalCueAnimations: 0,
        __bossCriticalCueAudio: 0,
      });
      HTMLMediaElement.prototype.play = function patchedPlay() {
        const current = (
          window as typeof window & { __bossCriticalCueAudio?: number }
        ).__bossCriticalCueAudio ?? 0;
        Object.assign(window, { __bossCriticalCueAudio: current + 1 });
        queueMicrotask(() => this.dispatchEvent(new Event('playing')));
        return Promise.resolve();
      };
      const originalAnimate = Element.prototype.animate;
      Element.prototype.animate = function patchedAnimate(keyframes, options) {
        if (this instanceof HTMLElement && this.classList.contains('player-stage')) {
          const current = (
            window as typeof window & { __bossCriticalCueAnimations?: number }
          ).__bossCriticalCueAnimations ?? 0;
          Object.assign(window, { __bossCriticalCueAnimations: current + 1 });
        }
        return originalAnimate.call(this, keyframes, options);
      };
    });
    await application.evaluate(({ BrowserWindow }) => {
      const presentation = BrowserWindow.getAllWindows().find(
        (window) => window.getTitle() === 'Apresentação do Chefão - BossBar T20',
      );
      presentation?.webContents.send('music:duck', {
        id: 1,
        phase: 'duck',
        duration: 1_000,
        targetVolume: 0.2,
        soundEffect: {
          id: 1,
          kind: 'natural-success-enemy',
          url: 'data:audio/mpeg;base64,//uQxAA=',
        },
        targetPlayerIds: ['fixture-player'],
      });
    });
    await expect.poll(() => player.evaluate(() => (
      window as typeof window & { __bossCriticalCueAnimations?: number }
    ).__bossCriticalCueAnimations ?? 0)).toBeGreaterThan(0);
    await expect.poll(() => player.evaluate(() => (
      window as typeof window & { __bossCriticalCueAudio?: number }
    ).__bossCriticalCueAudio ?? 0)).toBeGreaterThan(0);
    const threatAnimationCount = await player.evaluate(() => (
      window as typeof window & { __bossCriticalCueAnimations?: number }
    ).__bossCriticalCueAnimations ?? 0);
    await application.evaluate(({ BrowserWindow }) => {
      const presentation = BrowserWindow.getAllWindows().find(
        (window) => window.getTitle() === 'Apresentação do Chefão - BossBar T20',
      );
      presentation?.webContents.send('music:duck', {
        id: 1,
        phase: 'impact',
        duration: 1_100,
        soundEffect: null,
        targetPlayerIds: ['fixture-player'],
      });
    });
    await expect.poll(() => player.evaluate(() => (
      window as typeof window & { __bossCriticalCueAnimations?: number }
    ).__bossCriticalCueAnimations ?? 0)).toBeGreaterThan(threatAnimationCount);
    const criticalAnimationCount = await player.evaluate(() => (
      window as typeof window & { __bossCriticalCueAnimations?: number }
    ).__bossCriticalCueAnimations ?? 0);
    const criticalAudioCount = await player.evaluate(() => (
      window as typeof window & { __bossCriticalCueAudio?: number }
    ).__bossCriticalCueAudio ?? 0);
    await application.evaluate(({ BrowserWindow }) => {
      const presentation = BrowserWindow.getAllWindows().find(
        (window) => window.getTitle() === 'Apresentação do Chefão - BossBar T20',
      );
      presentation?.webContents.send('music:duck', {
        id: 2,
        phase: 'duck',
        duration: 160,
        targetVolume: 0.12,
        soundEffect: {
          id: 2,
          kind: 'natural-failure',
          url: 'data:audio/mpeg;base64,//uQxAA=',
        },
      });
    });
    await expect.poll(() => player.evaluate(() => (
      window as typeof window & { __bossCriticalCueAudio?: number }
    ).__bossCriticalCueAudio ?? 0)).toBeGreaterThan(criticalAudioCount);
    await expect.poll(() => player.evaluate(() => (
      window as typeof window & { __bossCriticalCueAnimations?: number }
    ).__bossCriticalCueAnimations ?? 0)).toBe(criticalAnimationCount);

    await expect(master.getByRole('button', { name: 'Abrir bloco de notas' })).toHaveText('📝');
    await expect(master.locator('.master-header')).toHaveCSS('text-align', 'left');
    await master.getByRole('button', { name: 'Abrir bloco de notas' }).click();
    await expect(master.getByLabel('Título da nota')).toHaveValue('Nota 1');
    await master.getByLabel('Título da nota').fill('Sessão automatizada');
    await expect(master.getByRole('tab', { name: 'Sessão automatizada' })).toBeVisible();
    await master.getByRole('button', { name: 'Fechar' }).click();
    await expect(control.getByRole('button', { name: 'Dano em área' })).toHaveCount(0);
    await expect(control.getByLabel('CD do teste de Reflexos')).toHaveCount(0);
    const musicVolume = control.getByLabel('Volume da música');
    await expect(musicVolume).toHaveValue('80');
    await musicVolume.fill('35');
    await expect(musicVolume).toHaveValue('35');
    await control.getByTitle('Mutar música').click();
    await expect(control.getByTitle('Ativar música')).toBeVisible();
    await control.getByTitle('Ativar música').click();
    await expect(control.getByTitle('Mutar música')).toBeVisible();

    await control.locator('.control-name-field input').fill('Titã Automatizado');
    await control.getByRole('button', { name: /Alterar Perícias/ }).click();
    const attributes = control.getByRole('dialog', { name: 'Alterar Perícias' });
    await expect(attributes.getByLabel('Escudo')).toHaveCount(0);
    await attributes.getByLabel('Vida máxima').fill('600');
    await attributes.getByLabel('Vida atual').fill('600');
    await attributes.getByLabel('Iniciativa').fill('14');
    await attributes.getByRole('button', { name: 'Aplicar' }).click();
    await control.locator('.control-action-field textarea').fill('Golpe de validação');
    await control.getByRole('button', { name: 'Ação padrão' }).click();
    await expect(control.getByLabel('Escudo')).toBeVisible();
    await control.getByRole('button', { name: 'Dano em jogador' }).click();
    const damageTargets = control.getByRole('dialog', {
      name: 'Dano em jogador',
    });
    await expect(damageTargets).toContainText('Titã Automatizado');
    const targetFilters = damageTargets.getByRole('group', {
      name: 'Filtros de alvos',
    });
    await expect(targetFilters.getByRole('button')).toHaveCount(3);
    await expect(
      targetFilters.getByRole('button', { name: 'Todos' }),
    ).toBeVisible();
    await expect(
      targetFilters.getByRole('button', { name: 'Chefões' }),
    ).toBeVisible();
    await expect(
      targetFilters.getByRole('button', { name: 'Personagens' }),
    ).toBeDisabled();
    await expect(
      damageTargets.locator('[data-target-faction="bosses"]'),
    ).toContainText('Titã Automatizado');
    await expect(
      damageTargets.getByRole('button', { name: 'Cancelar' }),
    ).toHaveClass(/control-status-modal-cancel/);
    await expect(
      damageTargets.getByRole('button', { name: 'Aplicar dano' }),
    ).toHaveClass(/control-status-modal-apply/);
    await expect(
      damageTargets.getByRole('checkbox', { name: 'Dano em área' }),
    ).not.toBeChecked();
    await expect(damageTargets.getByLabel('CD do dano em área')).toBeDisabled();
    await targetFilters.getByRole('button', { name: 'Chefões' }).click();
    await expect(
      damageTargets.getByLabel(/Titã Automatizado.*Chefão/),
    ).toBeChecked();
    await targetFilters.getByRole('button', { name: 'Chefões' }).click();
    await expect(
      damageTargets.getByLabel(/Titã Automatizado.*Chefão/),
    ).not.toBeChecked();
    await expect(
      damageTargets.getByRole('button', { name: 'Aplicar dano' }),
    ).toBeDisabled();
    await damageTargets.getByRole('button', { name: 'Cancelar' }).click();

    await master.getByRole('button', { name: 'Abrir depurador do encontro' }).click();
    const encounterDebugger = await windowByTitle(
      application,
      'Depurador do Encontro - BossBar T20',
    );
    await encounterDebugger.getByRole('button', { name: /Chefão Titã Automatizado/ }).click();
    const debugEditor = encounterDebugger.getByLabel('Valores da criatura em JSON');
    const debugBoss = JSON.parse(await debugEditor.inputValue());
    debugBoss.currentHealth = 590;
    await debugEditor.fill(JSON.stringify(debugBoss, null, 2));
    await encounterDebugger.getByRole('button', { name: 'Aplicar sobrescrita' }).click();
    await expect(encounterDebugger.getByRole('status')).toContainText('sincronizados');
    await expect(control.locator('.health-difference strong')).toHaveText('590/600');
    await control.getByRole('button', { name: /^Full Heal/ }).click();
    await expect(control.locator('.health-difference strong')).toHaveText('600/600');
    await encounterDebugger.close();
    await master.getByRole('button', { name: 'Iniciar Batalha' }).click();
    const preparationWarning = master.getByRole('dialog', {
      name: 'O encontro ainda não está completamente preparado',
    });
    if (await preparationWarning.isVisible().catch(() => false)) {
      await preparationWarning.getByRole('button', {
        name: 'Continuar mesmo assim',
      }).click();
    }
    await expect(player.getByRole('heading', { name: 'Titã Automatizado' })).toBeVisible();
    await expect(control.locator('.health-difference strong')).toHaveText('600/600');
    const skillButton = control.getByRole('button', {
      name: 'Teste de perícia',
    });
    await expect(skillButton).toHaveClass(/is-initiative-pending/);
    await expect(
      control.getByRole('button', { name: 'Iniciar turno' }),
    ).toBeDisabled();
    await skillButton.click();
    const skillDialog = control.getByRole('dialog', {
      name: 'Teste de perícia',
    });
    await expect(
      skillDialog.locator('.control-skill-picker-item.is-initiative-required'),
    ).toContainText('Iniciativa');
    await expect(skillDialog.getByRole('textbox')).toHaveCount(0);
    await expect(skillDialog.getByRole('button', { name: 'Rolar Iniciativa' }))
      .toContainText(/\+[0-9]+/);
    const skillLayout = await skillDialog.evaluate((dialog) => {
      const bounds = dialog.getBoundingClientRect();
      const list = dialog.querySelector<HTMLElement>('.control-skill-picker-list');
      return {
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        left: bounds.left,
        top: bounds.top,
        right: bounds.right,
        bottom: bounds.bottom,
        listScrollHeight: list?.scrollHeight ?? 0,
        listClientHeight: list?.clientHeight ?? 0,
      };
    });
    expect(skillLayout.left).toBeGreaterThanOrEqual(0);
    expect(skillLayout.top).toBeGreaterThanOrEqual(0);
    expect(skillLayout.right).toBeLessThanOrEqual(skillLayout.viewportWidth + 1);
    expect(skillLayout.bottom).toBeLessThanOrEqual(skillLayout.viewportHeight + 1);
    expect(skillLayout.listScrollHeight).toBeLessThanOrEqual(
      skillLayout.listClientHeight + 1,
    );
    await skillDialog.getByRole('button', { name: 'Rolar Iniciativa' }).click();
    await expect(control.getByRole('button', { name: 'Iniciar turno' })).toBeEnabled();
    await expect(control.locator('.control-attack-arrow')).toHaveText('→');
    await control.getByRole('button', { name: 'Armas/Ataques' }).click();
    const arsenalDialog = control.getByRole('dialog', {
      name: 'Armas e ataques',
    });
    await arsenalDialog.getByLabel('Dano', { exact: true }).fill('1d2 + 3');
    await arsenalDialog.getByRole('button', { name: 'Aplicar' }).click();
    await expect(control.locator('.control-selected-attack')).toContainText('Golpe');
    await expect(control.locator('.control-selected-attack')).toContainText(/Dano 1d2\s*\+\s*3/);
    await expect(control.locator('.control-selected-attack')).toContainText('Tipo corpo a corpo');
    await expect(control.locator('.control-selected-attack')).toContainText('Margem 20');
    await expect(control.locator('.control-selected-attack')).toContainText('Mult. x2');
    await expect(control.locator('.control-selected-attack')).toContainText('Alcance Adjacente');
    await control.locator('.control-selected-attack').click();
    const attackOptions = control.getByRole('listbox', { name: 'Ataque atual do chefão' });
    await expect(attackOptions).toBeVisible();
    await expect(attackOptions.getByRole('option', { name: /Golpe/ })).toBeVisible();
    await control.locator('.control-selected-attack').click();
    await control.getByRole('button', { name: 'Armas/Ataques' }).click();
    await arsenalDialog.getByRole('button', { name: '+ Novo ataque' }).click();
    await arsenalDialog.getByLabel('Nome', { exact: true }).fill('Rajada sombria');
    await arsenalDialog.getByLabel('Dano', { exact: true }).fill('1d4');
    await arsenalDialog.getByRole('button', { name: 'Aplicar' }).click();
    await control.locator('.control-selected-attack').click();
    await control.getByRole('option', { name: /Rajada sombria/ }).click();
    await expect(control.locator('.control-selected-attack')).toContainText('Rajada sombria');
    await control.locator('.control-selected-attack').click();
    await control.getByRole('option', { name: /Golpe/ }).click();
    await expect(control.locator('.control-selected-attack')).toContainText('Golpe');
    await control.getByRole('button', { name: 'Dano em jogador' }).click();
    const activeDamageTargets = control.getByRole('dialog', {
      name: 'Dano em jogador',
    });
    await activeDamageTargets
      .getByRole('group', { name: 'Filtros de alvos' })
      .getByRole('button', { name: 'Chefões' })
      .click();
    await activeDamageTargets.getByRole('button', { name: 'Aplicar dano' }).click();
    await expect(
      player.locator('.encounter-roll-result').filter({ hasText: /Dano.*Titã Automatizado:/ }),
    ).toContainText(
      /Dano.*Titã Automatizado:1d2\([12]\) \+ 3 = [45]/,
    );
    await control.getByRole('button', { name: /^Full Heal/ }).click();
    await expect(control.locator('.health-difference strong')).toHaveText('600/600');

    await control.locator('.control-amount-field input').fill('50');
    await control.getByRole('button', { name: /^Dano \(/ }).click();
    await expect(control.locator('.health-difference strong')).toHaveText('550/600');
    await expect(player.locator('.health-bar-fill')).toHaveAttribute('style', /91\.666/);
    await control.keyboard.press('Control+Z');
    await expect(control.locator('.health-difference strong')).toHaveText('600/600');
    await expect(
      player.locator('.player-resource-notices button').filter({ hasText: 'Desfazer' }),
    ).toBeVisible();
    await player.getByRole('button', { name: 'Histórico' }).click();
    const fightHistory = player.getByRole('dialog', { name: 'Histórico da luta' });
    await expect(fightHistory).toBeVisible();
    await expect(fightHistory.locator('.fight-history-entry-meta').last())
      .toHaveText(/^#\d+ · \d{2}:\d{2}:\d{2} · \d{2}:\d{2}$/);
    await expect(fightHistory.locator('.fight-history-entry').last())
      .toContainText('O mestre reverteu');
    await expect(fightHistory.locator('.fight-history-entry.is-undone'))
      .toContainText('Dano (desfeito)');
    await fightHistory.getByRole('button', { name: 'Fechar histórico' }).click();

    await control.locator('.control-amount-field input').fill('2d4');
    await control.getByRole('button', { name: /^Dano \(/ }).click();
    const formulaResult = player.locator('.encounter-roll-result').filter({
      hasText: /Dano.*Titã Automatizado:/,
    }).last();
    await expect(formulaResult).toContainText(/2d4\([1-4], [1-4]\).*=/);
    await control.keyboard.press('Control+Z');
    await expect(formulaResult).toHaveClass(/is-undone/);
    await expect(formulaResult).toContainText('(desfeito)');
    const strike = await formulaResult.evaluate((element) => {
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

    const panelToggle = control.locator('.control-minimize-button');
    await panelToggle.click();
    await expect(panelToggle).toHaveAttribute('aria-expanded', 'false');
    await panelToggle.click();
    await expect(panelToggle).toHaveAttribute('aria-expanded', 'true');

    await control.getByRole('button', { name: 'Status personalizado' }).click();
    await expect(control.getByRole('heading', { name: 'Biblioteca de status' })).toBeVisible();
    await control.getByRole('button', { name: '+ Criar novo' }).click();
    await control.getByLabel('Nome do status').fill('Marca automatizada');
    await control.getByLabel('Descrição do efeito').fill('Reduz a defesa e causa dano por turno.');
    await control.getByLabel('Também inflige (opcional)').selectOption('vulneravel');
    await control.getByLabel('Valor afetado').selectOption('meleeDefense');
    await control.getByRole('button', { name: 'Salvar na biblioteca' }).click();
    await expect(control.getByText('Marca automatizada', { exact: true })).toBeVisible();
    await control.locator('.control-status-library-select').filter({ hasText: 'Marca automatizada' }).click();
    await control.getByLabel('Dano por turno (opcional)').fill('1d6 + 2');
    await control.getByLabel('Turnos', { exact: true }).fill('3');
    await control
      .getByRole('dialog', { name: 'Marca automatizada' })
      .getByRole('button', { name: 'Aplicar', exact: true })
      .click();
    const statusTargets = control.getByRole('dialog', { name: 'Escolher alvos' });
    await expect(statusTargets.getByLabel(/Titã Automatizado.*Chefão/)).toBeChecked();
    await statusTargets.getByRole('button', { name: 'Aplicar', exact: true }).click();
    await control
      .getByRole('alertdialog', { name: 'Confirmar ação do chefão' })
      .getByRole('button', { name: 'Confirmar' })
      .click();

    await expect(player.getByRole('listitem', { name: /Marca automatizada/ })).toBeVisible();
    await expect(player.getByRole('listitem', { name: /Vulnerável/ })).toBeVisible();
    await control.getByRole('button', { name: /Marca automatizada, ativo por 3 turnos/ }).click();
    await expect(control.getByText('Marca automatizada', { exact: true })).toBeVisible();
  } finally {
    await application.evaluate(({ app }) => app.exit(0)).catch(() => undefined);
    await application.close().catch(() => undefined);
  }
});
