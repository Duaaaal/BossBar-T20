import { appendRuleText } from './rule-presentation';
import { searchCharacterOptions, characterOptionSource, type CharacterOption } from './shared/character-options';

let nextListId = 0;
/** Editable combobox: catalog suggestions never discard a custom identity. */
export const characterOptionsInput = (input: HTMLInputElement, kind: CharacterOption['kind'], label: string, selectedValue = (name: string) => name) => {
  const wrapper = document.createElement('div'); wrapper.className = 'character-options-input';
  const toggle = document.createElement('button'); toggle.type = 'button'; toggle.className = 'character-options-toggle'; toggle.textContent = '▾'; toggle.setAttribute('aria-label', `Opções de ${label}`);
  const list = document.createElement('div'); list.className = 'character-options-list'; list.id = `character-options-${++nextListId}`; list.setAttribute('role', 'listbox'); list.hidden = true;
  input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list'); input.setAttribute('aria-controls', list.id); input.setAttribute('aria-expanded', 'false'); input.autocomplete = 'off';
  input.placeholder = 'Pesquisar ou digitar';
  let index = -1; let choices: CharacterOption[] = [];
  const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); index = -1; };
  const select = (option: CharacterOption) => { input.value = selectedValue(option.name); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); close(); input.focus(); };
  const render = (query: string) => {
    choices = searchCharacterOptions(kind, query); index = -1; list.replaceChildren(); list.hidden = false; input.setAttribute('aria-expanded', 'true');
    for (const [i, option] of choices.entries()) {
      const row = document.createElement('div'); row.tabIndex = -1; row.id = `${list.id}-${i}`; row.setAttribute('role', 'option'); row.setAttribute('aria-selected', 'false');
      const name = document.createElement('strong'); name.textContent = option.name;
      const source = document.createElement('small'); appendRuleText(source, characterOptionSource(option));
      row.append(name, source); row.addEventListener('mousedown', (event) => event.preventDefault()); row.addEventListener('click', (event) => { event.preventDefault(); select(option); }); list.append(row);
    }
    if (!choices.length) { const empty = document.createElement('p'); empty.textContent = 'Nenhuma opção encontrada. O texto digitado será preservado.'; list.append(empty); }
    const edge = wrapper.closest('.web-player-sheet-editor-fields')?.getBoundingClientRect().right ?? window.innerWidth;
    const alignRight = wrapper.getBoundingClientRect().left + list.offsetWidth > edge - 8;
    list.style.left = alignRight ? 'auto' : '0'; list.style.right = alignRight ? '0' : 'auto';
  };
  toggle.addEventListener('click', (event) => { event.preventDefault(); input.focus(); if (list.hidden) render(''); else close(); });
  input.addEventListener('input', () => render(input.value));
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !list.hidden) { event.preventDefault(); event.stopPropagation(); close(); }
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); if (list.hidden) render('');
      index = Math.max(0, Math.min(choices.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
      list.querySelectorAll('[role="option"]').forEach((row, i) => row.setAttribute('aria-selected', String(i === index)));
      const active = list.children[index]; if (active) { input.setAttribute('aria-activedescendant', active.id); active.scrollIntoView({ block: 'nearest' }); }
    } else if (event.key === 'Enter' && !list.hidden && choices[index]) { event.preventDefault(); select(choices[index]); }
  });
  wrapper.addEventListener('focusout', (event) => { if (!wrapper.contains(event.relatedTarget as Node | null)) close(); });
  wrapper.append(input, toggle, list); return wrapper;
};
