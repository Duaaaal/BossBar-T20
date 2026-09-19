import data from './data/t20-character-options.json' with { type: 'json' };
import { catalogKey, T20_CATALOG } from './rules-catalog.ts';

export type CharacterOption = { id: string; kind: 'race' | 'origin' | 'class' | 'deity'; name: string; sourceId: string; page: number; pdfPage: number; note?: string };
export const CHARACTER_OPTIONS = data.entries as CharacterOption[];
export const identityOptionKind: Record<string, CharacterOption['kind']> = { 'RAÇA': 'race', ORIGEM: 'origin', CLASSE: 'class', DIVINDADE: 'deity' };
export const characterOptionSource = (option: CharacterOption) => `${T20_CATALOG.sources.find(({ id }) => id === option.sourceId)?.name ?? option.sourceId}, p. ${option.page}`;
export const searchCharacterOptions = (kind: CharacterOption['kind'], query = '') => {
  const key = catalogKey(query);
  return CHARACTER_OPTIONS.filter((option) => option.kind === kind && (!key || catalogKey(`${option.name} ${characterOptionSource(option)}`).includes(key)))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
};
