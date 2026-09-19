import { ATTRIBUTES, ATTRIBUTE_PLAN_FIELD, ATTRIBUTE_COST, attributeAllocationStatus, attributePlanTotals, attributePlanIssues, emptyAttributePlan, parseAttributePlan, inferAttributePlan, attributeSourceTotals, deduceImportedAttributeBase, type AttributePlan, type AttributeCode, type AttributeRolls } from './shared/character-attributes';
import { ATTRIBUTE_SOURCES, attributeSourceCitation } from './shared/attribute-sources';
import { appendRuleText, calculationTooltip } from './rule-presentation';
import { attributeCalculationDescription } from './shared/attribute-calculation-description';
import { catalogKey } from './shared/rules-catalog';
import { confirmAttributeReset, sheetEditorPopup } from './sheet-editor-popup';
import type { CharacterSheetEditorField } from './shared/character-sheet';
import { citationPattern } from './shared/reference-books';

type RollRequest = (options: { attribute?: AttributeCode; generation?: string; reset?: boolean }) => Promise<AttributeRolls>;
const signed = (value: number) => value > 0 ? '+' + value : String(value);
const labeled = (caption: string, input: HTMLElement) => {
  const label = document.createElement('label'); const title = document.createElement('span'); title.textContent = caption; label.append(title, input); return label;
};
export const characterAttributesEditor = (fields: CharacterSheetEditorField[], changed: () => void, rollRequest: RollRequest) => {
  const root = document.createElement('div'); root.className = 'character-attributes-editor'; root.dataset.fieldName = ATTRIBUTE_PLAN_FIELD;
  const stored = fields.find(({ name }) => name === ATTRIBUTE_PLAN_FIELD)!;
  const values = () => Object.fromEntries(fields.map(({ name, value }) => [name, value]));
  let plan = parseAttributePlan(stored?.value) ?? emptyAttributePlan();
  if (plan.method === 'unreviewed' || plan.version === 2) plan = inferAttributePlan(values(), plan);
  const status = document.createElement('p'); status.className = 'attribute-allocation-status'; status.setAttribute('aria-live', 'polite');
  status.hidden = true;
  const help = document.createElement('div'); help.className = 'attribute-allocation-help';
  const feedback = document.createElement('div'); feedback.className = 'attribute-allocation-feedback'; feedback.setAttribute('aria-live', 'polite');
  const grid = document.createElement('div'); grid.className = 'attribute-allocation-grid';
  const sourcePanel = document.createElement('details'); sourcePanel.className = 'attribute-source-panel'; sourcePanel.open = true;
  const sourceTitle = document.createElement('summary'); sourceTitle.textContent = 'Fontes:';
  const sourceBody = document.createElement('div'); sourceBody.className = 'attribute-source-body'; sourcePanel.append(sourceTitle, sourceBody);
  const inputs = new Map<string, HTMLInputElement>();
  let rolling = false;
  const meter = document.createElement('div'); meter.className = 'attribute-points-meter'; meter.setAttribute('aria-hidden', 'true');
  const update = (notify = true) => {
    deduceImportedAttributeBase(plan); stored.value = JSON.stringify(plan);
    const calculated = attributePlanTotals(plan);
    for (const [code] of ATTRIBUTES) {
      const source = attributeSourceTotals(plan, code);
      const total = calculated?.['Mod' + code] ?? (plan.base[code].trim() ? Number(plan.base[code]) + source.race + source.permanent + source.temporary : null);
      const totalInput = inputs.get(code + ':total'); if (totalInput) totalInput.value = total === null || !Number.isFinite(total) ? '' : String(total);
      const base = inputs.get(code + ':base'); if (base && document.activeElement !== base) base.value = plan.base[code];
      const bonus = inputs.get(code + ':bonus'); if (bonus) {
        bonus.value = signed(source.race + source.permanent + source.temporary);
      }
      const field = fields.find(({ name }) => name === 'Mod' + code); if (field) field.value = total === null || !Number.isFinite(total) ? '' : String(total);
      const card = totalInput?.closest<HTMLElement>('.attribute-allocation-card');
      if (card) { const initial = Number(plan.base[code]); card.dataset.limit = !plan.base[code].trim() || !['points', 'rolled'].includes(plan.method) ? '' : initial > 4 || initial < (plan.method === 'rolled' ? -2 : -1) ? 'outside' : initial === 4 ? 'maximum' : initial === (plan.method === 'rolled' ? -2 : -1) ? 'minimum' : ''; }
    }
    status.textContent = attributeAllocationStatus(plan);
    const issues = attributePlanIssues(values());
    status.dataset.state = issues.some(({ severity }) => severity === 'error') ? 'error' : issues.some(({ id }) => id.includes('choice:') || id.includes('source:') || id.includes('imported-range:') || id.endsWith('budget')) ? 'review' : 'success';
    feedback.replaceChildren();
    for (const issue of issues.filter(({ id }) => !id.startsWith('attributes:choice:') && !id.startsWith('attributes:source:') && id !== 'attributes:budget')) {
      const text = document.createElement('p'); appendRuleText(text, issue.reason || issue.message); text.dataset.severity = issue.severity; feedback.append(text);
    }
    meter.hidden = plan.method !== 'points'; meter.replaceChildren();
    const spent = ATTRIBUTES.reduce((sum, [key]) => sum + (ATTRIBUTE_COST[Number(plan.base[key])] || 0), 0);
    for (let i = 0; i < 10; i++) { const point = document.createElement('i'); point.className = i < spent ? 'is-used' : ''; point.style.setProperty('--point-intensity', String((i + 1) / 10)); meter.append(point); }
    help.replaceChildren();
    if (plan.method === 'points') {
      const table = document.createElement('table'); table.className = 'attribute-cost-table'; table.setAttribute('aria-label', 'Custo de compra dos atributos');
      const valueRow = table.insertRow(); const costRow = table.insertRow();
      for (const [row, caption] of [[valueRow, 'Valor'], [costRow, 'Custo']] as const) { const heading = document.createElement('th'); heading.scope = 'row'; heading.textContent = caption; row.append(heading); }
      for (const base of [-1, 0, 1, 2, 3, 4]) {
        appendRuleText(valueRow.insertCell(), String(base).replace('-', '−')); appendRuleText(costRow.insertCell(), String(ATTRIBUTE_COST[base]).replace('-', '−'));
      }
      help.append(table);
    } else appendRuleText(help, plan.method === 'unreviewed' ? 'Base = total − bônus identificados.'
      : plan.method === 'rolled' ? 'Role 4 dados; some os 3 maiores.'
      : 'Defina a base; registre cada bônus.');
    for (const [code] of ATTRIBUTES) for (const button of grid.querySelectorAll<HTMLButtonElement>(`[data-buy-attribute="${code}"]`)) {
      const current = Number(plan.base[code] || 0); const target = purchaseTarget(code, button.dataset.buyAction!);
      button.dataset.atLimit = String(target === current);
    }
    if (notify) changed();
  };
  const method = document.createElement('select'); method.setAttribute('aria-label', 'Método de distribuição');
  for (const [value, label] of [['unreviewed', 'Valores importados da ficha'], ['points', 'Compra de atributos · 10 pontos'], ['rolled', 'Rolagem de atributos · 4d6'], ['manual', 'Valores definidos pelo mestre']]) {
    if (value !== 'unreviewed' || plan.method === value) method.add(new Option(label, value, false, value === plan.method));
  }
  const add = document.createElement('button'); add.type = 'button'; add.className = 'sheet-secondary-action attribute-add-point'; add.textContent = '+ Adicionar ponto';
  const toolbar = document.createElement('div'); toolbar.className = 'attribute-allocation-toolbar'; toolbar.append(method, help);
  calculationTooltip(help, () => plan.method === 'points'
    ? 'Você tem 10 pontos para distribuir entre os seis atributos.\nCada valor da Base tem um custo total: −1 devolve 1 ponto; 0 é gratuito; 1 custa 1; 2 custa 2; 3 custa 4; 4 custa 7.\nExemplo: subir de 2 para 3 gasta mais 2 pontos (4 − 2).\nMax. usa o maior valor permitido pelo saldo; Min. reduz a base para −1. Bônus de fontes são somados depois.'
    : plan.method === 'rolled' ? 'Some os 3 maiores dados e converta em atributo. Cada rolagem fica bloqueada. Se a soma dos seis atributos ficar abaixo de 6, o menor é repetido automaticamente. Livro Básico, p. 17.' : help.textContent || '');
  const purchaseTarget = (code: AttributeCode, action: string) => {
    const current = Number(plan.base[code] || 0);
    const available = 10 - ATTRIBUTES.filter(([key]) => key !== code).reduce((sum, [key]) => sum + (ATTRIBUTE_COST[Number(plan.base[key])] || 0), 0);
    if (action === 'min') return -1;
    if (action === 'minus') return Math.max(-1, current - 1);
    if (action === 'max') return [4, 3, 2, 1, 0, -1].find((base) => ATTRIBUTE_COST[base] <= available) ?? current;
    return current < 4 && ATTRIBUTE_COST[current + 1] <= available ? current + 1 : current;
  };
  let notice: HTMLDivElement | undefined; let noticeTimer: ReturnType<typeof setTimeout> | undefined;
  const notifyLimit = (anchor: HTMLElement, message: string) => {
    clearTimeout(noticeTimer); notice?.remove();
    notice = document.createElement('div'); notice.className = 'attribute-limit-popup'; notice.setAttribute('role', 'status'); notice.setAttribute('popover', 'manual');
    appendRuleText(notice, message); root.append(notice); notice.showPopover();
    const bounds = anchor.getBoundingClientRect(); const popup = notice.getBoundingClientRect();
    notice.style.left = `${Math.max(8, Math.min(bounds.left, innerWidth - popup.width - 8))}px`;
    notice.style.top = `${Math.max(8, bounds.bottom + popup.height + 12 < innerHeight ? bounds.bottom + 6 : bounds.top - popup.height - 6)}px`;
    noticeTimer = setTimeout(() => { notice?.remove(); notice = undefined; }, 2000);
  };
  const reflectNewBonus = (before: ReturnType<typeof attributePlanTotals>) => {
    const after = attributePlanTotals(plan);
    if (plan.importedTotals && before && after) for (const [code] of ATTRIBUTES) { const total = plan.importedTotals[code]; if (total !== null) plan.importedTotals[code] = total + after['Mod' + code] - before['Mod' + code]; }
  };
  const renderSources = () => {
    sourceBody.replaceChildren();
    const cited = new Set<string>();
    const sourceText = (text: string) => text.replace(citationPattern(), (citation) => { if (cited.has(citation)) return ''; cited.add(citation); return citation; }).replace(/\s*[·;]\s*$/, '');
    for (const text of plan.inferred?.labels || []) { const line = document.createElement('p'); appendRuleText(line, sourceText(text)); sourceBody.append(line); }
    for (const choice of plan.inferred?.choices || []) {
      const row = document.createElement('div'); row.className = 'attribute-choice';
      const title = document.createElement('strong'); title.textContent = choice.label + ' · ' + choice.count + ' × +' + choice.amount; row.append(title);
      for (let i = 0; i < choice.count; i++) {
        const select = document.createElement('select'); select.setAttribute('aria-label', choice.label + ': escolha ' + (i + 1));
        select.add(new Option('Confirmar atributo…', '', false, !choice.selected[i]));
        for (const [key, name] of ATTRIBUTES.filter(([key]) => choice.allowed.includes(key))) select.add(new Option(name, key, false, key === choice.selected[i]));
        select.addEventListener('change', () => { choice.selected[i] = select.value as AttributeCode; update(); }); row.append(select);
      }
      const citation = sourceText(choice.source); if (citation) { const reference = document.createElement('small'); appendRuleText(reference, citation); row.append(reference); } sourceBody.append(row);
    }
    for (const message of plan.inferred?.unresolved || []) { const line = document.createElement('p'); line.className = 'attribute-source-unresolved'; line.textContent = message; sourceBody.append(line); }
    for (const [code, name] of ATTRIBUTES) if (Number(plan.adjustments[code])) { const line = document.createElement('p'); line.textContent = name + ': ajuste anteriormente registrado ' + signed(Number(plan.adjustments[code])) + '.'; sourceBody.append(line); }
    for (const entry of plan.increases) {
      const source = ATTRIBUTE_SOURCES.find(({ id }) => id === entry.sourceId) ?? ATTRIBUTE_SOURCES[0];
      const row = document.createElement('div'); row.className = 'attribute-increase-record';
      const text = document.createElement('span'); text.textContent = entry.attribute + ' ' + signed(entry.amount ?? 1) + ' · ' + source.name + ' · ' + ((entry.duration ?? source.duration) === 'temporary' ? 'Temporário' : 'Permanente') + ' · nível ' + entry.level + (entry.note ? ' · ' + entry.note : '');
      const citation = sourceText(attributeSourceCitation(source)); if (citation) { text.append(document.createTextNode(' · ')); appendRuleText(text, citation); }
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Remover';
      remove.addEventListener('click', () => { const before = attributePlanTotals(plan); plan.increases = plan.increases.filter((other) => other !== entry); reflectNewBonus(before); renderSources(); update(); });
      row.append(text, remove); sourceBody.append(row);
    }
    if (plan.inferred?.choices.some((c) => c.selected.filter(Boolean).length !== c.count) || plan.inferred?.unresolved.length) sourcePanel.open = true;
  };
  const renderGrid = () => {
    grid.replaceChildren(); inputs.clear();
    for (const [code, name] of ATTRIBUTES) {
      const card = document.createElement('div'); card.className = 'attribute-allocation-card';
      const header = document.createElement('div'); header.className = 'attribute-card-heading';
      const title = document.createElement('strong'); title.textContent = name; header.append(title); card.append(header);
      const rolled = plan.method === 'rolled' ? plan.rolls?.results[code] : undefined;
      if (rolled) {
        const result = document.createElement('span'); result.className = 'attribute-roll-result';
        const lowest = rolled.dice.indexOf(Math.min(...rolled.dice));
        const sum = rolled.dice.reduce((total, die) => total + die, 0) - rolled.dice[lowest];
        result.setAttribute('aria-label', `${name}: dados ${rolled.dice.join(', ')}; descartado ${rolled.dice[lowest]}; soma dos três maiores ${sum}`);
        result.append(document.createTextNode('('));
        rolled.dice.forEach((value, index) => {
          if (index) result.append(document.createTextNode(' '));
          const die = document.createElement(index === lowest ? 's' : 'span'); die.dataset.die = String(value); die.textContent = String(value); result.append(die);
        });
        result.append(document.createTextNode(` = ${sum})`)); header.append(result);
      }
      if (plan.method === 'points') for (const [action, caption] of [['max', 'Max.'], ['plus', '+'], ['minus', '−'], ['min', 'Min.']]) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = caption;
        button.dataset.buyAttribute = code; button.dataset.buyAction = action; button.setAttribute('aria-label', `${name}: ${caption}`);
        button.addEventListener('click', () => {
          const current = Number(plan.base[code] || 0); const target = purchaseTarget(code, action);
          if (current === target) {
            const decreasing = action === 'minus' || action === 'min';
            notifyLimit(button, decreasing ? `${name}: mínimo de −1 atingido.` : current === 4 ? `${name}: máximo inicial de 4 atingido.` : `${name}: saldo insuficiente para aumentar a Base.`);
            return;
          }
          plan.base[code] = String(target); update();
        }); header.append(button);
      }
      for (const [key, caption] of [['base', 'Base'], ['bonus', 'Bônus'], ['total', 'Total']] as const) {
        const input = document.createElement('input'); input.type = 'text'; input.inputMode = 'numeric'; input.maxLength = 4; input.setAttribute('aria-label', name + ': ' + caption);
        input.readOnly = key !== 'base' || plan.method === 'points' || plan.method === 'rolled' || (plan.method === 'unreviewed' && plan.importedTotals?.[code] !== null); input.setAttribute('aria-readonly', String(input.readOnly));
        input.value = key === 'base' ? plan.base[code] : '';
        calculationTooltip(input, () => attributeCalculationDescription(plan, code));
        if (key === 'base') input.addEventListener('input', () => {
          plan.base[code] = input.value;
          if (plan.method === 'unreviewed' && plan.importedTotals) { const source = attributeSourceTotals(plan, code); plan.importedTotals[code] = /^[+-]?\d+$/.test(input.value) ? Number(input.value) + source.race + source.permanent + source.temporary : null; }
          update();
        });
        const label = labeled(caption, input); if (key === 'total') label.dataset.fieldName = 'Mod' + code;
        inputs.set(code + ':' + key, input); card.append(label);
      }
      if (plan.method === 'rolled') {
        const roll = document.createElement('button'); roll.type = 'button'; roll.className = 'attribute-roll-button'; const result = plan.rolls?.results[code];
        const icon = document.createElement('span'); icon.className = 'attribute-roll-icon'; icon.textContent = '⚄'; icon.setAttribute('aria-hidden', 'true');
        roll.append(icon, document.createTextNode('Rolar'));
        if (result) roll.classList.add('is-rolled');
        roll.setAttribute('aria-label', 'Rolar ' + name); roll.disabled = Boolean(result) || Boolean(plan.base[code]);
        if (result) roll.title = result.attempts.length + ' rolagem(ns). ' + (result.attempts.length > 1 ? 'Menor resultado repetido pela exceção oficial. ' : '') + 'Menor dado descartado: ' + Math.min(...result.dice) + '.';
        roll.addEventListener('click', async () => { if (rolling) return; rolling = true; grid.querySelectorAll<HTMLButtonElement>('.attribute-roll-button').forEach((button) => { button.disabled = true; }); try {
          plan.rolls ??= await rollRequest({});
          plan.rolls = await rollRequest({ attribute: code, generation: plan.rolls.generation });
          for (const [key] of ATTRIBUTES) plan.base[key] = plan.rolls.results[key] ? String(plan.rolls.results[key]!.value) : '';
          renderGrid(); update();
        } catch (error) { renderGrid(); status.hidden = false; status.textContent = error instanceof Error ? error.message : 'Erro inesperado na rolagem.'; } finally { rolling = false; } }); card.append(roll);
      }
      grid.append(card);
    }
  };
  let changingMethod = false;
  const restart = async (next: AttributePlan['method']) => {
    if (changingMethod) return;
    changingMethod = true;
    const valid = !attributePlanIssues(values()).some(({ severity }) => severity === 'error') && Boolean(attributePlanTotals(plan));
    try {
      // Let the native select finish committing its choice before opening a modal.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (!root.isConnected) return;
      if (!await confirmAttributeReset((valid ? 'A ficha já possui atributos válidos. ' : '') + 'Trocar ou reiniciar a distribuição apaga os valores iniciais, as rolagens e os aumentos deste rascunho. Você precisará alocar tudo novamente. A ficha salva só muda após Salvar e fechar e aprovação do mestre.')) { method.value = plan.method; return; }
      // Point/manual allocation is local draft work; only dice need server state.
      const rolls = next === 'rolled' || plan.rolls ? await rollRequest({ reset: true }) : undefined;
      plan = inferAttributePlan(values(), emptyAttributePlan(next)); if (next === 'rolled') plan.rolls = rolls;
      for (const [code] of ATTRIBUTES) { const field = fields.find(({ name }) => name === 'Mod' + code); if (field) field.value = '0'; }
      method.querySelector('option[value="unreviewed"]')?.remove();
      method.value = next; renderGrid(); renderSources(); update();
    } catch (error) {
      method.value = plan.method;
      const popup = sheetEditorPopup('Não foi possível trocar a distribuição'); const text = document.createElement('p');
      text.textContent = error instanceof Error ? error.message : 'Erro inesperado ao reiniciar os atributos.'; popup.body.append(text);
    } finally { changingMethod = false; }
  };
  method.addEventListener('change', () => void restart(method.value as AttributePlan['method']));
  add.addEventListener('click', () => {
    const popup = sheetEditorPopup('Registrar aumento de atributo');
    const search = document.createElement('input'); search.type = 'search'; search.placeholder = 'Pesquisar fonte ou livro'; search.setAttribute('aria-label', 'Pesquisar fonte do aumento');
    const source = document.createElement('select'); source.setAttribute('aria-label', 'Fonte do aumento');
    const renderOptions = () => { const previous = source.value; source.replaceChildren(); for (const entry of ATTRIBUTE_SOURCES.filter((entry) => catalogKey(entry.name + ' ' + attributeSourceCitation(entry)).includes(catalogKey(search.value)))) source.add(new Option(entry.name, entry.id, false, entry.id === previous)); };
    renderOptions();
    const attribute = document.createElement('select'); attribute.setAttribute('aria-label', 'Atributo aumentado'); for (const [key, name] of ATTRIBUTES) attribute.add(new Option(name, key));
    const amount = document.createElement('input'); amount.type = 'number'; amount.min = '-100'; amount.max = '100'; amount.value = '1'; amount.setAttribute('aria-label', 'Pontos do aumento');
    const level = document.createElement('input'); level.type = 'number'; level.min = '1'; level.max = fields.find(({ name }) => name === 'Lv')?.value || '20'; level.value = level.max; level.setAttribute('aria-label', 'Nível de aquisição');
    const duration = document.createElement('select'); duration.setAttribute('aria-label', 'Duração do aumento'); duration.add(new Option('Permanente', 'permanent')); duration.add(new Option('Temporário / enquanto a fonte estiver ativa', 'temporary'));
    const note = document.createElement('input'); note.type = 'text'; note.maxLength = 1000; note.setAttribute('aria-label', 'Detalhes da fonte'); note.placeholder = 'Aquisição, aprimoramento, condição ou decisão do mestre';
    const reference = document.createElement('p'); reference.className = 'attribute-source-guidance';
    const sync = () => { const chosen = ATTRIBUTE_SOURCES.find(({ id }) => id === source.value); if (!chosen) return; if (chosen.attribute) attribute.value = chosen.attribute; amount.value = String(chosen.amount ?? 1); duration.value = chosen.duration; reference.replaceChildren(); appendRuleText(reference, chosen.note + ' · ' + attributeSourceCitation(chosen)); };
    source.addEventListener('change', sync); search.addEventListener('input', () => { renderOptions(); sync(); }); sync();
    popup.body.append(search, labeled('Fonte', source), reference, labeled('Atributo', attribute), labeled('Pontos', amount), labeled('Nível de aquisição', level), labeled('Duração', duration), labeled('Informações da fonte', note));
    const included = document.createElement('input'); included.type = 'checkbox';
    if (plan.method === 'unreviewed') {
      const includedLabel = labeled('Este bônus já está incluído nos atributos atuais', included); includedLabel.className = 'attribute-already-included'; popup.body.append(includedLabel);
    }
    const approval = document.createElement('small'); approval.textContent = 'O aumento fica no rascunho. Salvar e fechar envia as alterações para aprovação do mestre.'; popup.body.append(approval);
    const submit = document.createElement('button'); submit.type = 'button'; submit.textContent = 'Adicionar ao rascunho';
    submit.addEventListener('click', () => {
      if (!source.value || !amount.reportValidity() || !level.reportValidity() || !Number.isInteger(Number(amount.value)) || !Number(amount.value)) return;
      const before = attributePlanTotals(plan);
      plan.increases.push({ id: crypto.randomUUID(), attribute: attribute.value as AttributeCode, amount: Number(amount.value), level: Number(level.value), sourceId: source.value, note: note.value, duration: duration.value as 'permanent' | 'temporary' });
      if (!included.checked) reflectNewBonus(before); renderSources(); sourcePanel.open = true; update(); popup.close();
    }); popup.actions.append(submit);
  });
  root.append(add, toolbar, status, meter, grid, feedback, sourcePanel); renderGrid(); renderSources(); update(false);
  return root;
};
