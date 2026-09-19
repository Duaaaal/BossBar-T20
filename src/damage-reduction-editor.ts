import { RD_TARGETS, RD_CATEGORIES, RD_SOURCES, reductionCategory, damageReductionError, normalizeDamageReduction, reductionTypeTotals, hasDamageImmunity, type DamageReductionBase, type DamageReductionEntry, type DamageReductionProfile, type ReductionCategory } from './shared/damage-reduction';
import './damage-reduction-editor.css';
import { appendRuleText, calculationTooltip } from './rule-presentation';
import { damageReductionBreakdown } from './shared/damage-reduction';

/** A local draft shared by the master and player; Escape/cancel never changes the saved profile. */
export const openDamageReductionEditor = (initial: DamageReductionProfile): Promise<DamageReductionProfile | null> => new Promise((resolve) => {
  const draft = normalizeDamageReduction(initial);
  const dialog = document.createElement('dialog'); dialog.className = 'damage-reduction-dialog';
  const title = document.createElement('h2'); title.id = 'damage-reduction-title'; title.textContent = 'Redução de dano';
  dialog.setAttribute('aria-labelledby', title.id);
  const top = document.createElement('header'); top.className = 'rd-dialog-heading';
  const titleGroup = document.createElement('div');
  const subtitle = document.createElement('p'); subtitle.textContent = 'Bases por categoria e fontes específicas';
  titleGroup.append(title, subtitle);
  const dismiss = document.createElement('button'); dismiss.type = 'button'; dismiss.className = 'rd-dismiss'; dismiss.textContent = '×'; dismiss.setAttribute('aria-label', 'Fechar redução de dano');
  top.append(titleGroup, dismiss);
  const explanation = document.createElement('details'); explanation.className = 'rd-explanation';
  const explanationTitle = document.createElement('summary'); explanationTitle.textContent = 'Como fontes, acúmulos e exceções funcionam';
  const helpIcon = document.createElement('span'); helpIcon.className = 'rd-help-icon'; helpIcon.textContent = '?'; helpIcon.setAttribute('aria-hidden', 'true'); explanationTitle.prepend(helpIcon);
  const help = document.createElement('p');
  help.textContent = 'Os valores dos cinco cabeçalhos são bases adicionais e somam com todas as fontes aplicáveis. Geral abrange qualquer dano; Origens abrange mundana, mágica, arcana e divina e exige informar a origem. Nas linhas adicionadas, habilidades e perícias distintas somam; fontes repetidas usam o maior valor. Itens, magias, parceiros e ambiente usam o maior valor de cada fonte. Total já revisado é um piso para essas linhas, antes das bases dos cabeçalhos.';
  const rule = document.createElement('p'); rule.className = 'rd-rule-note';
  appendRuleText(rule, 'As bases adicionais dos cabeçalhos seguem a configuração desta mesa. As fontes das linhas seguem o Livro Básico, p. 226 e 228–230. Ignorada por desativa apenas a proteção daquela linha ou cabeçalho. Perda de vida ignora RD. Tipo de dano e origem são independentes.');
  explanation.append(explanationTitle, help, rule);
  const immunityRule = document.createElement('p'); immunityRule.textContent = 'Imunidade segue a regra desta mesa: cada dano positivo da fonte correspondente causa exatamente 1 ponto, inclusive quando outra RD o reduziria a zero. Dano zero continua zero. As exceções em Ignorada por e perda de vida continuam sendo respeitadas.'; explanation.append(immunityRule);
  const scroll = document.createElement('div'); scroll.className = 'rd-table-scroll';
  scroll.tabIndex = 0; scroll.setAttribute('aria-label', 'Categorias de redução de dano');
  const bodies = new Map<ReductionCategory, HTMLTableSectionElement>();
  const categories: NonNullable<DamageReductionProfile['categories']> = {};
  const rows: Array<{ row: DamageReductionEntry; element: HTMLTableRowElement }> = [];
  const inputs: Array<{ value: DamageReductionBase; amount: HTMLInputElement; name: HTMLInputElement }> = [];
  let sequence = 0;
  const preview = document.createElement('p'); preview.className = 'rd-preview';
  const error = document.createElement('p'); error.className = 'rd-error'; error.setAttribute('role', 'alert');
  const profile = (): DamageReductionProfile => ({ version: 1, categories, entries: rows.map(({ row }) => row) });
  const update = () => {
    error.textContent = '';
    preview.replaceChildren();
    const caption = document.createElement('span'); caption.className = 'rd-preview-caption'; caption.textContent = 'Totais por tipo · origem não informada'; preview.append(caption);
    for (const { type, total } of reductionTypeTotals(profile())) {
      const chip = document.createElement('span'); chip.className = 'rd-total-chip'; if (total) chip.classList.add('is-active');
      const immune = hasDamageImmunity(profile(), { damageType: type });
      if (immune) chip.classList.add('is-active');
      chip.tabIndex = 0; calculationTooltip(chip, () => damageReductionBreakdown(profile(), { damageType: type }).description);
      chip.append(document.createTextNode(`${type} `)); const value = document.createElement('strong'); value.textContent = immune ? 'Imune: 1' : String(total); chip.append(value); preview.append(chip);
    }
    for (const [id, body] of bodies) body.closest('.rd-category')?.classList.toggle('has-protection', Boolean(categories[id]?.amount || categories[id]?.immune || rows.some(({ row }) => reductionCategory(row.target) === id && (row.amount > 0 || row.immune))));
  };
  const cell = (element: HTMLElement, caption?: string, span = 1) => {
    const td = document.createElement('td'); td.colSpan = span;
    if (caption) { const label = document.createElement(element.classList.contains('rd-amount-group') ? 'div' : 'label'); label.classList.add('rd-field'); const text = document.createElement('span'); text.textContent = caption; label.append(text, element); td.append(label); }
    else td.append(element);
    return td;
  };
  const fields = (value: DamageReductionBase, label: string) => {
    const amount = document.createElement('input'); amount.type = 'number'; amount.min = '0'; amount.max = '999'; amount.step = '1'; amount.value = String(value.amount); amount.setAttribute('aria-label', `RD: ${label}`);
    amount.addEventListener('input', () => { value.amount = amount.value.trim() ? Number(amount.value) : NaN; update(); });
    const name = document.createElement('input'); name.maxLength = 120; name.value = value.name; name.placeholder = 'Nome da proteção'; name.setAttribute('aria-label', 'Nome da fonte');
    name.addEventListener('input', () => { value.name = name.value; update(); });
    const bypass = document.createElement('details'); const caption = document.createElement('summary'); caption.setAttribute('aria-label', `Ignorada por: ${label}`);
    const setCaption = () => { caption.textContent = value.bypass.length ? `${value.bypass.length} exceção(ões)` : 'Nenhuma'; };
    setCaption(); bypass.append(caption);
    for (const [id, text] of RD_TARGETS.filter(([id]) => id !== 'universal')) {
      const labelElement = document.createElement('label'); const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = value.bypass.includes(id);
      checkbox.addEventListener('change', () => { value.bypass = checkbox.checked ? [...value.bypass, id] : value.bypass.filter((type) => type !== id); setCaption(); update(); });
      labelElement.append(checkbox, document.createTextNode(text)); bypass.append(labelElement);
    }
    inputs.push({ value, amount, name });
    const amountGroup = document.createElement('div'); amountGroup.className = 'rd-amount-group';
    const immunity = document.createElement('label'); immunity.className = 'rd-immunity';
    const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = value.immune === true; checkbox.setAttribute('aria-label', `Imunidade: ${label}`);
    checkbox.addEventListener('change', () => { value.immune = checkbox.checked; update(); });
    immunity.append(checkbox, document.createTextNode('Imune')); amountGroup.append(amount);
    return { amount: amountGroup, immunity, amountInput: amount, immunityInput: checkbox, name, bypass };
  };
  for (const [id, label] of RD_CATEGORIES) {
    const base = draft.categories?.[id] ?? { amount: 0, name: '', bypass: [] }; categories[id] = base;
    const section = document.createElement('section'); section.className = 'rd-category'; section.setAttribute('aria-label', label);
    const table = document.createElement('table'); table.setAttribute('aria-label', `RD: ${label}`);
    const columns = document.createElement('colgroup');
    for (const name of ['type', 'amount', 'source', 'name', 'bypass', 'remove']) { const col = document.createElement('col'); col.className = `rd-col-${name}`; columns.append(col); }
    table.append(columns);
    const body = document.createElement('tbody'); body.dataset.category = id; bodies.set(id, body);
    const header = document.createElement('tr'); header.className = 'rd-category-header';
    const heading = document.createElement('th'); heading.scope = 'rowgroup'; heading.textContent = label;
    const { amount, immunity, name, bypass } = fields(base, label); heading.prepend(immunity);
    header.append(heading, cell(amount, 'RD'), cell(name, 'Nome da fonte', 2), cell(bypass, 'Ignorada por'), document.createElement('td'));
    body.append(header); table.append(body); section.append(table); scroll.append(section);
  }
  const addRow = (entry: DamageReductionEntry) => {
    const row = { ...entry, bypass: [...entry.bypass] }; const category = reductionCategory(row.target);
    const element = document.createElement('tr'); element.className = 'rd-source-row';
    const target = document.createElement('select'); target.setAttribute('aria-label', 'Tipo de redução');
    // Category-wide entries from earlier sheets retain their scope and stacking rules.
    for (const [id, label] of RD_TARGETS.filter(([id]) => reductionCategory(id) === category && (!['physical', 'elemental', 'other'].includes(id) || id === row.target))) target.add(new Option(label, id, false, id === row.target));
    const { amount, immunity, amountInput, immunityInput, name, bypass } = fields(row, RD_TARGETS.find(([id]) => id === row.target)![1]);
    target.addEventListener('change', () => { row.target = target.value as DamageReductionEntry['target']; amountInput.setAttribute('aria-label', `RD: ${target.selectedOptions[0].text}`); immunityInput.setAttribute('aria-label', `Imunidade: ${target.selectedOptions[0].text}`); update(); });
    const source = document.createElement('select'); source.setAttribute('aria-label', 'Fonte da proteção');
    for (const [id, label] of RD_SOURCES) source.add(new Option(label, id, false, id === row.source));
    source.addEventListener('change', () => { row.source = source.value as DamageReductionEntry['source']; update(); });
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label', 'Remover proteção');
    remove.addEventListener('click', () => { rows.splice(rows.findIndex((item) => item.row === row), 1); inputs.splice(inputs.findIndex((item) => item.value === row), 1); element.remove(); update(); });
    const targetCell = cell(target, 'Tipo'); targetCell.prepend(immunity);
    element.append(targetCell, cell(amount, 'RD'), cell(source, 'Fonte'), cell(name, 'Nome da fonte'), cell(bypass, 'Ignorada por'), cell(remove));
    bodies.get(category)!.append(element); rows.push({ row, element });
    return target;
  };
  for (const entry of draft.entries) addRow(entry);
  const footer = document.createElement('footer');
  const addGroup = document.createElement('div'); addGroup.className = 'rd-add-source';
  const categoryLabel = document.createElement('label'); categoryLabel.textContent = 'Categoria';
  const category = document.createElement('select'); category.setAttribute('aria-label', 'Categoria da nova fonte');
  for (const [id, label] of RD_CATEGORIES) category.add(new Option(label, id));
  categoryLabel.append(category);
  const add = document.createElement('button'); add.type = 'button'; add.textContent = '+ Adicionar fonte';
  add.addEventListener('click', () => {
    if (rows.length >= 100) { error.textContent = 'Limite de 100 fontes. Remova uma linha antes de adicionar outra.'; return; }
    const target = RD_TARGETS.find(([id]) => reductionCategory(id) === category.value && !['physical', 'elemental', 'other'].includes(id))![0];
    addRow({ id: `rd-${Date.now()}-${++sequence}`, target, amount: 0, source: 'ability', name: '', bypass: [] }).focus(); update();
  });
  addGroup.append(categoryLabel, add);
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = 'Cancelar';
  const save = document.createElement('button'); save.type = 'button'; save.className = 'rd-save'; save.textContent = 'Aplicar RD';
  const close = (result: DamageReductionProfile | null) => { dialog.close(); dialog.remove(); resolve(result); };
  cancel.addEventListener('click', () => close(null));
  dismiss.addEventListener('click', () => close(null));
  save.addEventListener('click', () => {
    const invalid = inputs.find(({ amount }) => !amount.checkValidity() || !amount.value.trim());
    const result = profile(); const reason = invalid ? 'Informe um inteiro de 0 a 999 em cada valor de RD.' : damageReductionError(result);
    if (reason) { error.textContent = reason; if (invalid) invalid.amount.focus(); else inputs.find(({ value }) => (value.amount > 0 || value.immune) && !value.name.trim())?.name.focus(); return; }
    close(normalizeDamageReduction(result));
  });
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(null); });
  dialog.addEventListener('keydown', (event) => event.stopPropagation());
  footer.append(addGroup, cancel, save); dialog.append(top, explanation, scroll, preview, error, footer); document.body.append(dialog); update(); dialog.showModal();
});
