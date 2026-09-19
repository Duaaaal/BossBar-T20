import { appendRuleText } from './rule-presentation';
import { characterOptionsInput } from './character-options-input';
import { sheetEditorPopup } from './sheet-editor-popup';
import { parseCharacterClasses, formatCharacterClasses, characterClassErrors } from './shared/character-classes';
import type { CharacterSheetEditorField } from './shared/character-sheet';

export const openMulticlassEditor = (fields: CharacterSheetEditorField[], changed: () => void) => {
  const characterClass = fields.find(({ name }) => name === 'CLASSE')!;
  const characterLevel = fields.find(({ name }) => name === 'Lv')!;
  const entries = parseCharacterClasses(characterClass.value, Number(characterLevel.value) || 1);
  if (!entries.length) entries.push({ name: '', level: 1 });
  const popup = sheetEditorPopup('Multiclasse');
  const help = document.createElement('p'); appendRuleText(help, 'Ao subir de nível, você pode adquirir 1 nível em outra classe. A primeira classe determina os PV iniciais, perícias e proficiências. As demais concedem PV de nível subsequente e seus PM. Livro Básico, p. 35.');
  const rows = document.createElement('div'); rows.className = 'multiclass-rows';
  const status = document.createElement('p'); status.setAttribute('aria-live', 'polite');
  const update = () => { const errors = characterClassErrors(entries); status.replaceChildren(); appendRuleText(status, errors.join(' ') || 'Nível do personagem: ' + entries.reduce((sum, entry) => sum + entry.level, 0) + '. A ordem começa pela classe inicial.'); };
  const render = () => {
    rows.replaceChildren();
    entries.forEach((entry, i) => {
      const row = document.createElement('div'); row.className = 'multiclass-row';
      const name = document.createElement('input'); name.type = 'text'; name.value = entry.name; name.setAttribute('aria-label', 'Classe ' + (i + 1)); name.maxLength = 80;
      const level = document.createElement('input'); level.type = 'number'; level.min = '1'; level.max = '20'; level.value = String(entry.level); level.setAttribute('aria-label', 'Nível da classe ' + (i + 1));
      const levelLabel = document.createElement('label'); levelLabel.textContent = 'Nível'; levelLabel.append(level);
      name.addEventListener('input', () => { entry.name = name.value; update(); }); level.addEventListener('input', () => { entry.level = Number(level.value); update(); });
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'Remover'; remove.disabled = entries.length === 1;
      remove.addEventListener('click', () => { entries.splice(i, 1); render(); update(); });
      row.append(characterOptionsInput(name, 'class', 'Classe ' + (i + 1)), levelLabel, remove); rows.append(row);
    });
  };
  const add = document.createElement('button'); add.type = 'button'; add.textContent = '+ Adicionar classe';
  add.addEventListener('click', () => { if (entries.length >= 20) return; entries.push({ name: '', level: 1 }); render(); update(); });
  popup.body.append(help, rows, add, status);
  const save = document.createElement('button'); save.type = 'button'; save.textContent = 'Usar estas classes';
  save.addEventListener('click', () => {
    update(); if (characterClassErrors(entries).length) return;
    characterClass.value = formatCharacterClasses(entries); characterLevel.value = String(entries.reduce((sum, entry) => sum + entry.level, 0));
    changed(); popup.close();
  });
  popup.actions.append(save); render(); update();
};
