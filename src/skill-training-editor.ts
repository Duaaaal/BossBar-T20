import { trainingBenefitEditor } from './training-benefit-editor';
import { trainingBenefitSources, benefitSlots, parseBenefitGrants } from './shared/training-benefits';
import { sheetAbilities } from './shared/character-sheet-content';
import { skillTraining, SKILL_TRAINING_FIELD, parseTrainingPlan, synchronizeSkillTraining, trainingChoiceSources, selectSourceTraining } from './shared/skill-training';
import { allSkillRules, characterSkillRules, skillDisplayName, craftEditorFields, isVacantCraft } from './shared/skill-definitions';
import { skillMatches } from './shared/skill-mechanics';
import { skillEffectsEditor } from './skill-effects-editor';
import { catalogKey } from './shared/rules-catalog';
import type { CharacterSheetEditorField } from './shared/character-sheet';
import { sheetEditorPopup } from './sheet-editor-popup';
import { appendRuleText, calculationTooltip } from './rule-presentation';
import './skill-training-editor.css';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => {
  const node = document.createElement(tag); node.className = className; node.textContent = text; return node;
};
const labeled = (text: string, control: HTMLElement) => {
  const label = el('label', '', text); label.append(control); return label;
};

/** The nested draft is committed only by Apply, never by Cancel or Escape. */
export const openSkillTrainingEditor = (fields: CharacterSheetEditorField[], changed: (updates: CharacterSheetEditorField[]) => void, requestedSkill?: string) => {
  const values = Object.fromEntries(fields.map(({ name, value }) => [name, value]));
  const initialValues={...values};
  synchronizeSkillTraining(values);
  const skillRules = characterSkillRules(values);
  const original = skillTraining(values); const plan = parseTrainingPlan(values[SKILL_TRAINING_FIELD]);
  const popup = sheetEditorPopup('Fontes de treinamento'); popup.dialog.classList.add('skill-training-popup');
  const nativeSkills = el('div', 'training-native-skills');
  let currentSourceId = trainingChoiceSources(values).find(source => !source.confirmed || original.assignments.filter(a=>a.sourceId===source.id).length < source.count)?.id || trainingChoiceSources(values)[0]?.id || '';
  const navigation = el('nav', 'training-navigation'); navigation.setAttribute('aria-label', 'Etapas das fontes');
  const previous = el('button', '', '← Anterior'); previous.type='button';
  const next = el('button', '', 'Próxima →'); next.type='button';
  const step = el('span', 'training-step'); navigation.append(previous,step,next);
  const move = (offset:number) => { const sources=trainingChoiceSources(values); const index=sources.findIndex(s=>s.id===currentSourceId);currentSourceId=sources[index+offset]?.id||currentSourceId;search.value='';selectedOnly.setAttribute('aria-pressed','false');refresh(); };
  previous.addEventListener('click',()=>move(-1));next.addEventListener('click',()=>move(1));
  const metrics = el('div', 'training-metrics'); metrics.setAttribute('aria-live', 'polite');
  const context = el('p', 'training-context');
  const columns = el('div', 'training-columns');
  const grants = el('section', 'training-grants'); grants.setAttribute('aria-label', 'Fontes do personagem');
  const grantList = el('div', 'training-grant-list'); grants.append(nativeSkills, el('h3', '', 'Fonte atual'), grantList);
  const selection = el('section', 'training-selection'); selection.setAttribute('aria-label', 'Escolher perícias');
  const search = el('input'); search.type = 'search'; search.placeholder = 'Buscar perícia'; search.setAttribute('aria-label', 'Buscar perícia');
  const selectedOnly = el('button', 'training-filter', 'Selecionadas'); selectedOnly.type = 'button'; selectedOnly.setAttribute('aria-pressed', 'false');
  const searchRow = el('div', 'training-search'); searchRow.append(search, selectedOnly);
  const skills = el('div', 'training-skill-list');
  const empty = el('p', '', 'Nenhuma perícia encontrada.'); empty.hidden = true;
  selection.append(el('h3', '', 'Escolher perícias'), searchRow, skills, empty); columns.append(grants, selection);
  const extra = el('details', 'training-additional'); const extraTitle = el('summary', '', 'Fontes adicionais');
  const rows = el('div', 'skill-training-extra');
  const addButton = el('button', 'training-add-source', '+ Fonte adicional'); addButton.type = 'button';
  extra.append(extraTitle, el('p', 'training-muted', 'Uma habilidade, origem especial ou decisão do mestre pode conceder outro treinamento. Registre a perícia, a fonte e sua justificativa.'), rows, addButton);
  const unknownOrigin = original.issues.some(({ message }) => message.includes('origem personalizada') || message.includes('Amnésico:'));
  if (unknownOrigin) {
    const review = el('div', 'training-origin-review');
    const check = el('input'); check.type = 'checkbox'; check.checked = plan.reviewedOrigin === values.ORIGEM;
    check.setAttribute('aria-label', `Conferi os benefícios de ${values.ORIGEM}`);
    check.addEventListener('change', () => { plan.reviewedOrigin = check.checked ? values.ORIGEM : undefined; refresh(); });
    review.append(el('p', '', `${values.ORIGEM}: confira a regra da origem e registre os treinamentos que ela concede.`), labeled('Benefícios da origem conferidos', check)); extra.insertBefore(review, rows);
  }
  extra.open = Boolean(plan.extra.length || requestedSkill || unknownOrigin && plan.reviewedOrigin !== values.ORIGEM);
  const rules = el('details', 'training-rules'); rules.append(el('summary', '', 'Como as escolhas são distribuídas'));
  const ruleText = el('p'); appendRuleText(ruleText, 'Cada perícia usa uma fonte compatível. A classe inicial concede as perícias fixas e as escolhas da sua lista; multiclasse não repete esses benefícios. Inteligência permanente positiva permite escolhas livres. Livro Básico, p. 17, 35 e 114.'); rules.append(ruleText);
  const feedback = el('p', 'skill-training-feedback'); feedback.setAttribute('role', 'status'); feedback.hidden = true;
  const apply = el('button', '', 'Aplicar fontes'); apply.type = 'button';
  popup.body.append(metrics, context, navigation, columns, el('hr', 'training-divider'), extra, rules, feedback);
  popup.actions.prepend(el('small', 'training-approval', 'A aprovação do mestre acontece ao salvar a ficha.')); popup.actions.append(apply);
  const controls: { skill: HTMLSelectElement; source: HTMLInputElement; note: HTMLInputElement; row: HTMLElement }[] = [];
  const views = new Map<string, { card: HTMLElement; count: HTMLElement; used: HTMLElement }>();
  const createSourceCard=(source:ReturnType<typeof skillTraining>['sources'][number])=>{
    const card = el('article', 'training-source-card'); card.dataset.sourceId = source.id;
    const heading = el('div', 'training-source-heading');
    const name = source.id === 'class:choices' ? 'Escolhas da classe' : source.id.startsWith('class:mandatory:') ? source.allowed.join(' ou ') : source.label;
    const count = el('span', 'training-source-count'); heading.append(el('strong', '', name), count);
    const category = source.id.startsWith('class:mandatory:') ? 'Classe inicial · obrigatório' : source.id === 'class:choices' ? values.CLASSE.split('/')[0].trim() + ' · classe inicial' : source.id === 'intelligence' ? 'Bônus permanente · escolhas livres' : /(^|:)origin:/.test(source.id) ? 'Benefício de origem' : /(^|:)race:/.test(source.id) ? 'Habilidade de raça' : source.id.includes(':optional:') ? 'Regra opcional registrada' : source.id.includes(':class:') ? 'Progressão da classe' : 'Poder registrado';
    const used = el('p', 'training-source-used'); card.append(el('small', 'training-source-kind', category), heading);
    if(source.duplicate==='bonus') {
      const duplicate=el('select');duplicate.setAttribute('aria-label',`${source.label}: treinamento anterior`);
      duplicate.add(new Option('Receber treinamento','training',false,!plan.duplicates?.[source.id]));
      duplicate.add(new Option('Já era treinada: receber +2','bonus',false,plan.duplicates?.[source.id]===true));
      const chosen=el('select');chosen.setAttribute('aria-label',`${source.label}: perícia que já era treinada`);
      chosen.add(new Option('Escolha a perícia…',''));
      for(const rule of skillRules.filter((r)=>skillMatches(values,r,source.allowed)))chosen.add(new Option(skillDisplayName(rule,values),rule.code,false,plan.selections?.[source.id]?.[0]===rule.code));
      const update=()=>{if(source.allowed.length===1&&!chosen.value&&chosen.options.length===2)chosen.selectedIndex=1;plan.duplicates={...plan.duplicates,[source.id]:duplicate.value==='bonus'};plan.selections={...plan.selections,[source.id]:chosen.value?[chosen.value]:[]};chosen.hidden=duplicate.value!=='bonus'||source.allowed.length===1;refresh();};
      duplicate.addEventListener('change',update);chosen.addEventListener('change',update);chosen.hidden=duplicate.value!=='bonus'||source.allowed.length===1;
      card.append(labeled('Ao receber esta habilidade',duplicate),chosen);
    }
    if (source.choice) {
      const select = el('select'); select.setAttribute('aria-label', `Perícias de ${source.label}`);
      select.add(new Option('Escolha a quantidade…', '', false, plan.choices[source.id] === undefined));
      for (let n = source.min; n <= source.max; n++) select.add(new Option(`${n} ${n === 1 ? 'perícia' : 'perícias'}${source.max-n ? ` + ${source.max-n} ${source.max-n===1?'poder':'poderes'}` : ''}`, String(n), false, plan.choices[source.id] === n));
      select.addEventListener('change', () => { if (select.value === '') delete plan.choices[source.id]; else plan.choices[source.id] = Number(select.value); refresh(); });
      const help = source.id.startsWith('origin:') ? 'Cada poder escolhido usa um dos benefícios da origem.' : source.id === 'race:humano' ? 'Versátil: 2 perícias, ou 1 perícia e 1 poder geral.' : 'Informe quantos benefícios desta habilidade foram usados em perícias.';
      select.title=help; card.append(select);
    }
    const allowed = el('details', 'training-allowed'); allowed.append(el('summary', '', source.allowed.includes('*') ? 'Qualquer perícia · referência' : 'Perícias permitidas · referência'));
    const list = el('p'); appendRuleText(list, `${source.allowed.includes('*') ? 'Escolha livre.' : source.allowed.join(', ') + '.'} ${source.source}`); allowed.append(list);
    card.append(used, allowed, el('div','training-benefit-host')); grantList.append(card); views.set(source.id, { card, count, used });
  };
  trainingChoiceSources(values).forEach(createSourceCard);
  const createSkillView = (rule: typeof skillRules[number]) => {
    const row = el('label', 'training-skill'); row.dataset.skill = rule.code;
    const check = el('input'); check.type = 'checkbox'; check.checked = values[rule.trainedField] === 'Yes';
    const name = skillDisplayName(rule, values);
    check.setAttribute('aria-label', `Treinar ${name}`);
    const text = el('span', 'training-skill-text'); const assigned = el('small'); text.append(el('strong', '', name), assigned);
    check.addEventListener('change', () => { values[SKILL_TRAINING_FIELD]=JSON.stringify(plan); selectSourceTraining(values,currentSourceId,rule.code,check.checked);Object.assign(plan,parseTrainingPlan(values[SKILL_TRAINING_FIELD])); refresh(); });
    row.append(check, text); skills.append(row); return { rule, row, check, assigned, name };
  };
  const skillViews = skillRules.map(createSkillView);
  const filter = () => { let visible = 0; for (const view of skillViews) { view.row.hidden = view.row.dataset.eligible !== 'true' || !catalogKey(view.name).includes(catalogKey(search.value)) || selectedOnly.getAttribute('aria-pressed') === 'true' && !view.check.checked; if (!view.row.hidden) visible++; } empty.hidden = visible > 0; };
  search.addEventListener('input', filter);
  selectedOnly.addEventListener('click', () => { selectedOnly.setAttribute('aria-pressed', String(selectedOnly.getAttribute('aria-pressed') !== 'true')); filter(); });
  const collectExtras = () => {
    const active = controls.filter(({ row }) => row.isConnected);
    plan.extra = active.map(({ skill, source, note }) => ({ skill: skill.value, source: source.value.trim(), note: note.value.trim() })); return active;
  };
  const refresh = () => {
    collectExtras(); values[SKILL_TRAINING_FIELD] = JSON.stringify(plan);
    synchronizeSkillTraining(values); Object.assign(plan, parseTrainingPlan(values[SKILL_TRAINING_FIELD]));
    const state = skillTraining(values); const pending = state.sources.filter(({ confirmed }) => !confirmed).length;
    for(const source of trainingChoiceSources(values))if(!views.has(source.id))createSourceCard(source);
    for(const [id,view]of views)if(!state.sources.some(s=>s.id===id)){view.card.remove();views.delete(id);}
    metrics.replaceChildren();
    const benefits=parseBenefitGrants(plan.benefits);const sources=trainingBenefitSources(values);
    const powerCount=sources.reduce((n,s)=>n+(benefits[s.id]?.ids.length||0),0);const powerMax=sources.reduce((n,s)=>n+benefitSlots(values,s),0);
    const additionalPowers=sheetAbilities(values).filter(a=>a.category==='general'&&!a.acquiredFrom).length;
    for (const [value, label, tone] of [[`${state.selected.length}/${state.maximum}`, 'perícias escolhidas', state.unmatched.length?'warning':''], [`${powerCount}/${powerMax}`, 'poderes escolhidos', ''], [plan.extra.length, 'fontes adicionais', ''], [additionalPowers, 'poderes adicionais', '']] as const) {
      const item = el('div', 'training-metric ' + tone); item.append(el('strong', '', String(value)), el('span', '', label)); metrics.append(item);
    }
    const mandatory = state.issues.filter(({ id }) => id.startsWith('training:mandatory:') || id === 'training:hobgoblin').length;
    const messages = [pending ? `${pending} escolha(s) de fonte para confirmar.` : '', mandatory ? `${mandatory} perícia(s) obrigatória(s) ainda não selecionada(s).` : '', plan.retired?.length?`Fonte removida ou alterada: ${plan.retired.join(', ')}. Confira as escolhas afetadas.`:'',unknownOrigin && plan.reviewedOrigin !== values.ORIGEM ? 'Confira os benefícios da origem nas fontes adicionais.' : ''].filter(Boolean);
    context.textContent = messages.join(' ') || (state.unmatched.length ? 'Há perícias sem fonte compatível. Revise as fontes adicionais.' : '');context.hidden=!context.textContent;
    context.classList.toggle('needs-review', Boolean(messages.length || state.unmatched.length));
    for (const source of state.sources) {
      const view = views.get(source.id); if (!view) continue;
      const host=view.card.querySelector<HTMLElement>('.training-benefit-host');if(host){host.replaceChildren(trainingBenefitEditor(values,source.id,()=>{Object.assign(plan,parseTrainingPlan(values[SKILL_TRAINING_FIELD]));refresh();}));}
      const assigned = state.assignments.filter(({ sourceId }) => sourceId === source.id);
      view.count.textContent = source.confirmed ? `${assigned.length} / ${source.count}` : `Até ${source.max}`;
      view.card.classList.toggle('is-pending', !source.confirmed);
      view.card.classList.toggle('is-empty', source.count === 0);
      view.used.textContent = assigned.length ? `Alocadas: ${assigned.map(({ skill }) => skill).join(', ')}` : source.count ? 'Nenhuma perícia alocada.' : 'Não concede perícias nesta configuração.';
    }
    const steps = trainingChoiceSources(values);
    if (!steps.some(s=>s.id===currentSourceId)) currentSourceId=steps[0]?.id||'';
    const index=steps.findIndex(s=>s.id===currentSourceId); const current=steps[index];
    nativeSkills.replaceChildren(el('span','','Perícias natas:'));
    for(const assignment of state.assignments.filter(a=>state.sources.some(s=>s.fixed&&!s.id.startsWith('extra:')&&s.id===a.sourceId))){
      const source=state.sources.find(s=>s.id===assignment.sourceId)!;const label=el('label');const check=el('input');check.type='checkbox';check.checked=true;check.disabled=true;check.setAttribute('aria-label',assignment.skill+' (nata)');
      label.tabIndex=0;calculationTooltip(label,()=>`${assignment.skill}: concedida automaticamente por ${source.label}.\n${source.source}`);label.append(check,el('span','',assignment.skill));nativeSkills.append(label);
    }
    nativeSkills.hidden=nativeSkills.childElementCount===1;
    step.textContent=current?`${index+1} de ${steps.length} · ${current.allowed.includes('*')?'Escolha livre':'Escolha limitada'}`:'Nenhuma escolha pendente';
    previous.disabled=index<=0;next.disabled=index>=steps.length-1;
    for(const [id,view] of views)view.card.hidden=id!==currentSourceId;
    selection.hidden=!current;grantList.hidden=!current;navigation.hidden=!current;
    grants.querySelector('h3')!.hidden=!current;
    for (const view of skillViews) {
      const assignment = state.assignments.find(({ code }) => code === view.rule.code);
      const invalid = state.unmatched.some(({ code }) => code === view.rule.code);
      view.check.checked = values[view.rule.trainedField] === 'Yes';
      const fixed = state.sources.some(source=>source.fixed&&state.plan.automatic?.[view.rule.code]?.includes(source.id));
      view.row.dataset.eligible=String(Boolean(current&&skillMatches(values,view.rule,current.allowed)&&!fixed));
      view.row.classList.toggle('is-selected',view.check.checked);view.row.classList.toggle('is-unmatched',invalid);
      const used=state.assignments.filter(a=>a.sourceId===currentSourceId).length;
      view.check.disabled=!current||!current.confirmed||Boolean(assignment&&assignment.sourceId!==currentSourceId)||!view.check.checked&&used>=current.count;
      view.assigned.textContent=assignment?.sourceId===currentSourceId?'Escolhida nesta fonte':assignment?'Já escolhida · '+assignment.source:invalid?'Sem fonte registrada':'Disponível nesta fonte';
      view.row.title=view.assigned.textContent;
    }
    addButton.disabled = rows.childElementCount >= 30; extraTitle.textContent = `Fontes adicionais${rows.childElementCount ? ` · ${rows.childElementCount}` : ''}`;
    filter();
  };
  const add = (entry?: typeof plan.extra[number]) => {
    const row = el('div', 'skill-training-extra-row'); const skill = el('select'); skill.setAttribute('aria-label', 'Perícia adicional');
    const requested = skillRules.find(({ name }) => name === requestedSkill);
    for (const rule of skillRules) skill.add(new Option(rule.name, rule.code, false, rule.code === (entry?.skill || requested?.code)));
    const source = el('input'); source.placeholder = 'Ex.: Mestre, nome do poder'; source.setAttribute('aria-label', 'Fonte do treinamento'); source.maxLength = 160; source.value = entry?.source || '';
    const note = el('input'); note.placeholder = 'Regra, livro/página ou autorização'; note.setAttribute('aria-label', 'Justificativa do treinamento'); note.maxLength = 500; note.value = entry?.note || '';
    const remove = el('button', 'training-remove', '×'); remove.type = 'button'; remove.setAttribute('aria-label', 'Remover fonte de treinamento');
    remove.addEventListener('click', () => { row.remove(); refresh(); addButton.focus(); });
    for (const control of [skill, source, note]) control.addEventListener('input', () => { control.removeAttribute('aria-invalid'); feedback.hidden = true; refresh(); });
    row.append(labeled('Perícia', skill), labeled('Fonte', source), labeled('Justificativa', note), remove); rows.append(row); controls.push({ skill, source, note, row }); return source;
  };
  plan.extra.forEach(add);
  addButton.addEventListener('click', () => { if (rows.childElementCount < 30) { const input = add(); refresh(); input.focus(); } });
  apply.addEventListener('click', () => {
    const invalid = popup.body.querySelector<HTMLInputElement>(':invalid'); if (invalid) { invalid.reportValidity(); invalid.focus(); return; }
    const active = collectExtras(); const missing = active.flatMap(({ source, note }) => [source, note]).find((input) => !input.value.trim());
    const error = (message: string) => { feedback.hidden = false; feedback.textContent = message; feedback.scrollIntoView({ block: 'nearest' }); };
    if (missing) { error('Preencha a fonte e a justificativa de cada treinamento adicional.'); missing.setAttribute('aria-invalid', 'true'); missing.focus(); return; }
    if (new Set(active.map(({ skill }) => skill.value)).size !== active.length) { error('Registre cada perícia adicional apenas uma vez.'); return; }
    values[SKILL_TRAINING_FIELD] = JSON.stringify(plan); const state = skillTraining(values);
    if (state.unmatched.length > original.unmatched.length || state.unmatched.some(({ code }) => !original.unmatched.some((skill) => skill.code === code))) { error('Há uma nova perícia sem fonte. Desmarque-a ou registre uma fonte compatível antes de aplicar.'); return; }
    plan.retired = []; values[SKILL_TRAINING_FIELD] = JSON.stringify(plan);
    for (const rule of characterSkillRules(values).filter((r) => r.nameField && !fields.some((f) => f.name === r.nameField))) fields.push(...craftEditorFields(rule, values));
    for (const field of fields) if(values[field.name]!==undefined) field.value=values[field.name];
    changed(fields.filter(field=>field.value!==initialValues[field.name])); popup.close();
  });
  if (requestedSkill) {
    popup.body.insertBefore(el('p', 'training-request', `${requestedSkill}: escolha fora das fontes disponíveis. Adicione a fonte que concede esse treinamento; depois, selecione a perícia.`), columns);
    search.value = requestedSkill; filter();
  }
  const craftButton = el('button', 'training-add-craft', '+ Especialização de Ofício'); craftButton.type = 'button';
  selection.append(craftButton);
  craftButton.addEventListener('click', () => {
    const dialog = sheetEditorPopup('Adicionar especialização de Ofício');
    const input = el('input'); input.type = 'text'; input.placeholder = 'Ex.: alquimista, armeiro, cozinheiro'; input.maxLength = 160; input.setAttribute('aria-label', 'Especialização de Ofício');
    const message = el('p', 'training-muted', 'Cada especialização tem seu próprio treinamento e suas fontes.');
    const add = el('button', '', 'Adicionar Ofício'); add.type = 'button'; dialog.body.append(labeled('Especialização', input), message); dialog.actions.append(add);
    add.addEventListener('click', () => {
      const name = input.value.trim().replace(/^Ofício\s*\((.+)\)$/i, '$1');
      if (!name) { input.focus(); return; }
      if (characterSkillRules(values).some((r) => r.nameField && catalogKey(values[r.nameField] || '') === catalogKey(name))) { message.textContent = 'Esta especialização já está cadastrada.'; return; }
      const rule = allSkillRules.find((r) => isVacantCraft(r, values)); if (!rule) { message.textContent = 'O limite de 40 especializações foi atingido.'; return; }
      values[rule.nameField!] = name; values[rule.modifierField.replace('ModAtrib', 'SeleAtrib')] = 'INT';
      const oldView = skillViews.find((v) => v.rule.code === rule.code);
      if (oldView) { oldView.name = skillDisplayName(rule, values); oldView.row.querySelector('strong')!.textContent = oldView.name; oldView.check.setAttribute('aria-label', 'Treinar ' + oldView.name); }
      else { skillRules.push(rule); skillViews.push(createSkillView(rule)); }
      for (const control of controls) if (!Array.from(control.skill.options).some((o) => o.value === rule.code)) control.skill.add(new Option(skillDisplayName(rule, values), rule.code));
      refresh(); dialog.close();
    }); input.focus();
  });
  popup.body.insertBefore(skillEffectsEditor(values, () => { Object.assign(plan,parseTrainingPlan(values[SKILL_TRAINING_FIELD])); refresh(); }), rules);
  refresh();
};
