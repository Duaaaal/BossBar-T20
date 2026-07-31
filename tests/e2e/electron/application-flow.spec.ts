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
    args: ['.'],
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

    await expect(master.getByRole('button', { name: 'Abrir bloco de notas' })).toHaveText('📝');
    await expect(master.locator('.master-header')).toHaveCSS('text-align', 'left');
    await master.getByRole('button', { name: 'Abrir bloco de notas' }).click();
    await expect(master.getByLabel('Título da nota')).toHaveValue('Nota 1');
    await master.getByLabel('Título da nota').fill('Sessão automatizada');
    await expect(master.getByRole('tab', { name: 'Sessão automatizada' })).toBeVisible();
    await master.getByRole('button', { name: 'Fechar' }).click();
    await expect(control.getByRole('button', { name: 'Dano em área' })).toBeVisible();
    await expect(control.getByLabel('CD do teste de Reflexos')).toHaveCount(0);

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
      targetFilters.getByRole('button', { name: 'Aliados' }),
    ).toBeVisible();
    await expect(
      targetFilters.getByRole('button', { name: 'Inimigos' }),
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
    await targetFilters.getByRole('button', { name: 'Aliados' }).click();
    await expect(
      damageTargets.getByLabel(/Titã Automatizado.*Chefão/),
    ).toBeChecked();
    await targetFilters.getByRole('button', { name: 'Aliados' }).click();
    await expect(
      damageTargets.getByLabel(/Titã Automatizado.*Chefão/),
    ).not.toBeChecked();
    await expect(
      damageTargets.getByRole('button', { name: 'Aplicar dano' }),
    ).toBeDisabled();
    await damageTargets.getByRole('button', { name: 'Cancelar' }).click();

    await master.getByRole('button', { name: 'Iniciar Batalha' }).click();
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
    await skillDialog.getByLabel('Iniciativa').fill('14');
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
    await expect(
      control.locator('.control-target-area-group').getByLabel('CD do dano em área'),
    ).toBeVisible();
    await control.locator('.control-target-value input').fill('1d2 + 3');
    await control.getByRole('button', { name: 'Dano em jogador' }).click();
    const activeDamageTargets = control.getByRole('dialog', {
      name: 'Dano em jogador',
    });
    await activeDamageTargets
      .getByRole('group', { name: 'Filtros de alvos' })
      .getByRole('button', { name: 'Aliados' })
      .click();
    await activeDamageTargets.getByRole('button', { name: 'Aplicar dano' }).click();
    await expect(
      player.locator('.encounter-roll-result').filter({ hasText: 'Dano:' }),
    ).toContainText(
      /Dano:1d2\([12]\) \+ 3 = [45]/,
    );
    await control.getByRole('button', { name: /^Full Heal/ }).click();
    await expect(control.locator('.health-difference strong')).toHaveText('600/600');

    await control.locator('.control-amount-field input').fill('50');
    await control.getByRole('button', { name: /^Dano \(/ }).click();
    await expect(control.locator('.health-difference strong')).toHaveText('560/600');
    await expect(player.locator('.health-bar-fill')).toHaveAttribute('style', /93\.333/);

    const panelToggle = control.getByRole('button', { name: 'Minimizar painel' });
    await panelToggle.click();
    await expect(control.getByRole('button', { name: 'Expandir painel' })).toHaveAttribute('aria-expanded', 'false');
    await control.getByRole('button', { name: 'Expandir painel' }).click();
    await expect(control.getByRole('button', { name: 'Minimizar painel' })).toHaveAttribute('aria-expanded', 'true');

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
