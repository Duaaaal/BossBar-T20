import data from './data/t20-reference-catalog.json' with { type: 'json' };
import benefitAbilities from './data/t20-benefit-abilities.json' with { type: 'json' };

export type AbilityCategory = 'race' | 'origin' | 'class' | 'general' | 'review';
export type CatalogSource = { id: string; name: string; file: string; sha256: string; pages: number; role: string };
type Reference = { id: string; name: string; sourceId: string; pdfPage: number; page: number; description: string; implementation: 'text-only' };
export type AbilityReference = Reference & { kind: 'ability'; requiredRaces?:string[]; aliases?: string[]; baseDescription?: string; category: Exclude<AbilityCategory, 'review'>; subcategory: string; owner: string };
export type SpellReference = Reference & { kind: 'spell'; circle: number; school: string; tradition: string; execution: string; range: string; target: string; area: string; effectTarget: string; duration: string; resistance: string; cost: number; baseDescription: string };
export type SpellSupplement = { id: string; name: string; spellId: string; sourceId: string; page: number; pdfPage: number; description: string };
export type ReferenceCatalog = { schemaVersion: number; version: string; sources: CatalogSource[]; spells: SpellReference[]; abilities: AbilityReference[]; supplements: SpellSupplement[] };

/** Shared textual rules registry. It contains no executable costs, effects or commands. */
export const T20_CATALOG = {...data,version:'t20-local-2026-09-14',abilities:[...data.abilities,...benefitAbilities]} as ReferenceCatalog;
export const catalogKey = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
export const catalogTextKey = (text: string) => catalogKey(text.replace(/veja o texto/gi, 'veja texto').replace(/\s*\(JÁ INCLUSO\)/gi, '').replace(/\s+Pré-requisitos?:[\s\S]*$/i, ''));
const spellIndex = new Map(T20_CATALOG.spells.map((spell) => [catalogKey(spell.name), spell]));
const abilityIndex = new Map<string, AbilityReference[]>();
for (const reference of T20_CATALOG.abilities) for (const name of [reference.name, ...(reference.aliases ?? [])]) {
  const key = catalogKey(name); const previous = abilityIndex.get(key) ?? [];
  if (!previous.some(({ id }) => id === reference.id)) abilityIndex.set(key, [...previous, reference]);
}
export const findSpell = (name: string) => spellIndex.get(catalogKey(name));
export const catalogReference = (id: string) => T20_CATALOG.spells.find((item) => item.id === id) ?? T20_CATALOG.abilities.find((item) => item.id === id);
export const sourceCitation = (reference: Pick<Reference, 'sourceId' | 'page'>) => `${T20_CATALOG.sources.find(({ id }) => id === reference.sourceId)?.name ?? reference.sourceId}, p. ${reference.page}`;
export const searchRulesCatalog = (query: string, kind?: 'spell' | 'ability', limit = 50) => {
  const key = catalogKey(query);
  return [...(kind === 'ability' ? [] : T20_CATALOG.spells), ...(kind === 'spell' ? [] : T20_CATALOG.abilities)]
    .filter((item) => !key || catalogKey(item.name).includes(key)).slice(0, Math.max(0, Math.min(100, limit)));
};
export const findAbility = (name: string, identity: { race?: string; characterClass?: string }, hint?: AbilityCategory) => {
  const candidates = abilityIndex.get(catalogKey(name)) ?? [];
  const matchesOwner = (ref: AbilityReference) => ref.owner.split('/').filter(Boolean).some((owner) =>
    catalogKey(ref.category === 'race' ? identity.race ?? '' : identity.characterClass ?? '').includes(catalogKey(owner)));
  const matching = candidates.filter(matchesOwner);
  const hinted = candidates.filter((ref) => ref.category === hint);
  const available = matching.length ? matching : hinted.length ? hinted : candidates;
  const categories = new Set(available.map(({ category }) => category));
  return { reference: available.length === 1 ? available[0] : undefined,
    category: categories.size === 1 ? available[0].category : 'review' as AbilityCategory,
    candidates: available };
};
export const spellFieldDefaults = (spell: SpellReference): Record<string, string> => ({
  Nome: spell.name, Circulo: String(spell.circle), Escola: spell.school, Execucao: spell.execution,
  Alcance: spell.range, Area: spell.area || (spell.target ? `Alvo: ${spell.target}` : spell.effectTarget ? `Efeito: ${spell.effectTarget}` : 'Não se aplica'),
  Duracao: spell.duration, Resistencia: spell.resistance, Custo: String(spell.cost), Efeito: spell.description,
});

export type CharacterAbility = { id: string; name: string; description: string; category: AbilityCategory; referenceId?: string; source?: string; acquiredFrom?: string; implementation: 'text-only' };
export type CharacterSpell = { id: string; name: string; circle: number | null; cost: number | null; school: string; execution: string; range: string; area: string; duration: string; resistance: string; description: string; referenceId?: string; source?: string; implementation: 'text-only' };
