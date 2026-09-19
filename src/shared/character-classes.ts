import { catalogKey } from './rules-catalog.ts';
import type { CharacterSheetIssue } from './character-sheet.ts';

export type CharacterClassLevel = { name: string; level: number };
const VARIANTS: Record<string, string> = Object.fromEntries([
  ['Necromante','Arcanista'], ['Machado de Pedra','Bárbaro'], ['Magimarcialista','Bardo'], ['Duelista','Bucaneiro'],
  ['Seteiro','Caçador'], ['Vassalo','Cavaleiro'], ['Usurpador','Clérigo'], ['Ermitão','Druida'], ['Inovador','Guerreiro'],
  ['Alquimista','Inventor'], ['Ventanista','Ladino'], ['Atleta','Lutador'], ['Burguês','Nobre'], ['Santo','Paladino'],
].map(([variant, original]) => [catalogKey(variant), catalogKey(original)]));
export const baseCharacterClass = (name: string) => VARIANTS[catalogKey(name)] || catalogKey(name);
export const parseCharacterClasses = (text: string, level = 1): CharacterClassLevel[] => text.split(/\s*[/;]\s*/).filter((part) => part.trim()).map((part) => {
  const match = part.trim().match(/^(.*?)\s+(\d+)$/);
  return { name: (match?.[1] || part).trim(), level: match ? Number(match[2]) : text.includes('/') ? 1 : level };
});
export const formatCharacterClasses = (classes: CharacterClassLevel[]) => classes.map((entry) => entry.name.trim() + ' ' + entry.level).join(' / ');
export const abbreviateCharacterClasses = (text: string) => {
  const classes = parseCharacterClasses(text);
  if (classes.length < 2) return text;
  const short: Record<string, string> = { arcanista: 'Arc.', barbaro: 'Bár.', bardo: 'Bard.', bucaneiro: 'Buc.', cacador: 'Caç.', cavaleiro: 'Cav.', clerigo: 'Clér.', druida: 'Dru.', guerreiro: 'Gue.', inventor: 'Inv.', ladino: 'Lad.', lutador: 'Lut.', nobre: 'Nob.', paladino: 'Pal.', machadodepedra: 'M. Ped.', magimarcialista: 'Magim.', necromante: 'Nec.', treinador: 'Trei.' };
  return classes.map(({ name, level }) => `${short[catalogKey(name)] || name.slice(0, 4) + '.'} ${level}`).join(' / ');
};
export const characterClassErrors = (classes: CharacterClassLevel[]) => {
  const errors: string[] = []; const seen = new Set<string>();
  for (const entry of classes) {
    if (!entry.name.trim()) errors.push('Escolha o nome de cada classe.');
    if (!Number.isInteger(entry.level) || entry.level < 1 || entry.level > 20) errors.push('Cada classe precisa de 1 a 20 níveis.');
    const key = VARIANTS[catalogKey(entry.name)] || catalogKey(entry.name);
    if (seen.has(key)) errors.push('Uma classe não pode se repetir nem ser combinada com sua variante. Heróis de Arton, p. 22.');
    seen.add(key);
  }
  if (classes.reduce((sum, entry) => sum + entry.level, 0) > 20) errors.push('A soma dos níveis de classe não pode superar 20.');
  return errors;
};
export const characterClassIssues = (values: Record<string, string>): CharacterSheetIssue[] => {
  if (!values.CLASSE?.trim()) return [];
  const classes = parseCharacterClasses(values.CLASSE, Number(values.Lv) || 1);
  const errors = characterClassErrors(classes);
  if (classes.reduce((sum, entry) => sum + entry.level, 0) !== Number(values.Lv)) errors.push('O nível do personagem deve ser igual à soma dos níveis das classes.');
  return errors.map((message, index) => ({ id: 'classes:' + index, field: 'CLASSE', message, reason: message, severity: 'error', autoFixable: false, location: 'Identidade → Classe', source: 'Livro Básico, p. 35; Heróis de Arton, p. 22' }));
};
