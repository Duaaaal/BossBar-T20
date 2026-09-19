import { appendRuleText } from './rule-presentation';
import { T20_CATALOG, catalogKey, sourceCitation, type AbilityReference, type SpellReference } from './shared/rules-catalog';
import './rules-catalog-dialog.css';
import type { ReferenceVariant } from './shared/reference-variants';

const categories = { race: 'Raça', origin: 'Origem', class: 'Classe', general: 'Poder geral' };
type Entry = AbilityReference | SpellReference;
/** Read-only reference shared by the player and master, independent of sheet editing. */
export function openRulesCatalog(options: { query?: string; kind?: 'spell' | 'ability'; referenceId?: string; master?: boolean } = {}) {
  const active = document.querySelector<HTMLDialogElement>('.rules-catalog-dialog');
  if (active) { active.focus(); return; }
  const previousFocus = document.activeElement as HTMLElement | null;
  const dialog = document.createElement('dialog'); dialog.className = 'rules-catalog-dialog';
  dialog.setAttribute('aria-labelledby', 'rules-catalog-title');
  dialog.innerHTML = `<header class="rules-catalog-header"><div><small>Biblioteca de Tormenta20</small><h2 id="rules-catalog-title">Poderes e magias</h2></div><button type="button" class="rules-catalog-close" aria-label="Fechar catálogo">×</button></header>
    <form class="rules-catalog-filters" role="search"><label>Buscar<input type="search" placeholder="Nome do poder ou da magia" autocomplete="off"></label><label>Conteúdo<select class="rules-catalog-kind"><option value="">Todos</option><option value="spell">Magias</option><option value="ability">Habilidades e poderes</option></select></label><label>Livro<select class="rules-catalog-source"><option value="">Todos os livros</option></select></label></form>
    <p class="rules-catalog-context">Consulta aos livros de referência. Efeitos, condições e aprimoramentos ainda não são executados automaticamente.</p>
    <div class="rules-catalog-body"><nav aria-label="Resultados do catálogo"><p class="rules-catalog-count" aria-live="polite"></p><div class="rules-catalog-results"></div></nav><article class="rules-catalog-detail" tabindex="0" aria-label="Descrição da referência"></article></div>`;
  const search = dialog.querySelector<HTMLInputElement>('input')!;
  const kind = dialog.querySelector<HTMLSelectElement>('.rules-catalog-kind')!;
  const source = dialog.querySelector<HTMLSelectElement>('.rules-catalog-source')!;
  for (const book of T20_CATALOG.sources) source.add(new Option(book.name, book.id));
  search.value = options.query ?? ''; kind.value = options.kind ?? '';
  const results = dialog.querySelector<HTMLElement>('.rules-catalog-results')!;
  const detail = dialog.querySelector<HTMLElement>('.rules-catalog-detail')!;
  const entries: Entry[] = [...T20_CATALOG.spells, ...T20_CATALOG.abilities].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  let selected = options.referenceId;
  let variants: ReferenceVariant[] = [];
  let variantError = '';
  let editingVariant = false;
  const show = (entry: Entry) => {
    selected = entry.id; detail.replaceChildren();
    editingVariant = false;
    const pendingButton = dialog.querySelector<HTMLButtonElement>('.rules-catalog-pending');
    if (pendingButton) { const count = variants.filter((v) => v.status === 'pending').length; pendingButton.textContent = `${count} proposta(s) pendente(s)`; pendingButton.disabled = count === 0; }
    for (const button of results.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.referenceId === entry.id));
    const heading = document.createElement('h3'); heading.textContent = entry.name;
    const citation = document.createElement('p'); citation.className = 'rules-catalog-citation'; appendRuleText(citation, sourceCitation(entry));
    const tag = document.createElement('p'); tag.className = 'rules-catalog-tag';
    tag.textContent = entry.kind === 'spell' ? `Magia ${entry.tradition} · ${entry.circle}º círculo · ${entry.cost} PM` : [categories[entry.category], entry.owner || entry.subcategory].filter(Boolean).join(' · ');
    detail.append(heading, citation, tag);
    if (entry.kind === 'spell') {
      const stats = document.createElement('dl'); stats.className = 'rules-catalog-stats';
      for (const [label, value] of [['Escola', entry.school], ['Execução', entry.execution], ['Alcance', entry.range], ['Alvo', entry.target], ['Área', entry.area], ['Efeito', entry.effectTarget], ['Duração', entry.duration], ['Resistência', entry.resistance]]) {
        if (!value) continue;
        const term = document.createElement('dt'); term.textContent = label;
        const description = document.createElement('dd'); description.textContent = value; stats.append(term, description);
      }
      detail.append(stats);
    }
    const text = document.createElement('div'); text.className = 'rules-catalog-description'; text.textContent = entry.description; detail.append(text);
    for (const supplement of T20_CATALOG.supplements.filter(({ spellId }) => spellId === entry.id)) {
      const extra = document.createElement('details'); const summary = document.createElement('summary'); appendRuleText(summary, `Complemento opcional — ${sourceCitation(supplement)}`);
      const body = document.createElement('div'); body.className = 'rules-catalog-description'; body.textContent = supplement.description; extra.append(summary, body); detail.append(extra);
    }
    const variantSection = document.createElement('section'); variantSection.className = 'rules-catalog-variants';
    const title = document.createElement('h4'); title.textContent = 'Variantes por livro e revisão'; variantSection.append(title);
    const note = document.createElement('p'); note.textContent = 'O texto base continua como padrão. Variantes são referências textuais e não alteram automaticamente fichas ou regras.'; variantSection.append(note);
    for (const variant of variants.filter((v) => v.referenceId === entry.id)) {
      const item = document.createElement('details'); const summary = document.createElement('summary');
      appendRuleText(summary, `${sourceCitation(variant)} · ${variant.revision} · ${{ approved: 'Aprovada', pending: 'Proposta pendente', rejected: 'Não aprovada' }[variant.status]}`);
      const description = document.createElement('div'); description.className = 'rules-catalog-description'; description.textContent = variant.description;
      item.append(summary, description);
      if (options.master && variant.status === 'pending') for (const approve of [true, false]) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = approve ? 'Aprovar variante' : 'Recusar proposta';
        button.onclick = async () => { button.disabled = true; try { const result = await window.bossAPI.reviewReferenceVariant(variant.id, approve); variantError = result.error ?? ''; if (result.variants) variants = result.variants; } catch { variantError = 'Erro inesperado ao revisar. Tente novamente.'; } show(entry); };
        item.append(button);
      }
      variantSection.append(item);
    }
    if (variantError) { const error = document.createElement('p'); error.setAttribute('role', 'alert'); error.textContent = variantError; variantSection.append(error); }
    const formDetails = document.createElement('details'); const formTitle = document.createElement('summary'); formTitle.textContent = options.master ? 'Cadastrar variante' : 'Propor variante ao mestre';
    const form = document.createElement('form'); form.className = 'rules-catalog-variant-form';
    form.addEventListener('input', () => { editingVariant = true; });
    form.innerHTML = '<label>Livro<select name="book"></select></label><label>Revisão<input name="revision" required maxlength="80" placeholder="Ex.: 2ª edição, revisão de setembro"></label><label>Página<input name="page" type="number" required min="1" max="10000"></label><label class="variant-description">Descrição<textarea name="description" required maxlength="50000" rows="7"></textarea></label><p role="status"></p><button type="submit"></button>';
    const book = form.elements.namedItem('book') as HTMLSelectElement; for (const source of T20_CATALOG.sources) book.add(new Option(source.name, source.id)); book.value = entry.sourceId;
    (form.elements.namedItem('page') as HTMLInputElement).value = String(entry.page);
    const save = form.querySelector('button')!; save.textContent = options.master ? 'Salvar variante' : 'Enviar proposta';
    form.onsubmit = async (event) => {
      event.preventDefault(); save.disabled = true;
      try {
        const result = await window.bossAPI.saveReferenceVariant({ referenceId: entry.id, sourceId: book.value, revision: (form.elements.namedItem('revision') as HTMLInputElement).value, page: Number((form.elements.namedItem('page') as HTMLInputElement).value), description: (form.elements.namedItem('description') as HTMLTextAreaElement).value });
        if (!result.ok) { form.querySelector('[role=status]')!.textContent = result.error ?? 'Não foi possível salvar.'; return; }
        variants = result.variants ?? variants; variantError = ''; show(entry);
      } catch { form.querySelector('[role=status]')!.textContent = 'Erro inesperado ao salvar. O texto permanece aqui para você tentar novamente.'; }
      finally { save.disabled = false; }
    };
    formDetails.append(formTitle, form); variantSection.append(formDetails); detail.append(variantSection);
    detail.scrollTop = 0;
  };
  const render = () => {
    const key = catalogKey(search.value);
    const matching = entries.filter((entry) => (!kind.value || entry.kind === kind.value) && (!source.value || entry.sourceId === source.value) && (!key || [entry.name, ...(entry.kind === 'ability' ? entry.aliases ?? [] : [])].some((name) => catalogKey(name).includes(key))));
    results.replaceChildren();
    dialog.querySelector('.rules-catalog-count')!.textContent = `${matching.length} referência${matching.length === 1 ? '' : 's'}`;
    for (const entry of matching) {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.referenceId = entry.id;
      const name = document.createElement('strong'); name.textContent = entry.name;
      const context = document.createElement('small'); context.textContent = entry.kind === 'spell' ? `${entry.circle}º círculo · ${entry.school}` : [categories[entry.category], entry.owner].filter(Boolean).join(' · ');
      button.append(name, context); button.addEventListener('click', () => show(entry)); results.append(button);
    }
    const entry = matching.find(({ id }) => id === selected) ?? matching[0];
    if (entry) show(entry);
    else { detail.textContent = 'Nenhuma referência encontrada. Tente outro nome ou livro. Textos personalizados podem ser mantidos na ficha para revisão.'; }
  };
  dialog.querySelector('form')!.addEventListener('submit', (event) => event.preventDefault());
  search.addEventListener('input', render); kind.addEventListener('change', render); source.addEventListener('change', render);
  dialog.querySelector('button')!.addEventListener('click', () => dialog.close());
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dialog.close(); }
  });
  dialog.addEventListener('close', () => { dialog.remove(); previousFocus?.focus(); }, { once: true });
  document.body.append(dialog); render(); dialog.showModal(); search.focus();
  if (window.bossAPI.getReferenceVariants) void window.bossAPI.getReferenceVariants().then((result) => {
    if (!dialog.isConnected) return;
    variants = result.variants ?? []; variantError = result.error ?? '';
    const pending = variants.filter((v) => v.status === 'pending');
    if (options.master && pending.length) {
      const pendingButton = document.createElement('button'); pendingButton.type = 'button'; pendingButton.className = 'rules-catalog-pending'; pendingButton.textContent = `${pending.length} proposta(s) pendente(s)`;
      pendingButton.onclick = () => { search.value = ''; kind.value = ''; source.value = ''; selected = variants.find((v) => v.status === 'pending')?.referenceId; render(); };
      dialog.querySelector('.rules-catalog-header > div')!.append(pendingButton);
    }
    const entry = entries.find(({ id }) => id === selected); if (entry && !editingVariant) show(entry);
  }).catch(() => { variantError = 'Não foi possível carregar variantes. Feche e abra o catálogo para tentar novamente.'; const entry = entries.find(({ id }) => id === selected); if (entry && dialog.isConnected && !editingVariant) show(entry); });
}
