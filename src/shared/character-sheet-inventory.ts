import { equipmentKeys, equippedRows } from './character-sheet-loadout.ts';
import { SHEET_COIN_FIELDS } from './character-sheet-calculations.ts';

type Values = Record<string, string>;
export const INVENTORY_LOAD_VERSION_FIELD = 'BossBar.InventoryLoadVersion';
export const inventoryKeys = (index: number) => ({ name: index <= 15 ? `Item${index}` : `BossBar.Item.${index}.Nome`, quantity: `BossBar.Item.${index}.Quantidade`, spaces: index <= 15 ? `PesoItem${index}` : `BossBar.Item.${index}.Peso` });
const key = (name: string) => name.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
const decimal = (value: string | undefined, fallback = NaN) => value?.trim() ? Number(value.replace(',', '.')) : fallback;
export const affectsInventoryLoad = (name: string) => /^(?:Item\d+|PesoItem\d+|Ataque \d+|Armadura|Escudo)$|^BossBar\.Item\.\d+\.(Nome|Quantidade|Peso)$|^BossBar\.(Armadura|Escudo)\.\d+\.(Nome|Equipado)$|^BossBar\.Ataque\.\d+\.(Principal|DuasArmas|Segunda\.Nome)$/.test(name) || SHEET_COIN_FIELDS.some((field) => field === name) || name === 'BossBar.CargaRevisada';

/** Table rule requested by the owner: only unequipped inventory units count.
 * Match complete names (including improvements), never guess similar equipment. */
export const sheetInventoryLoad = (values: Values) => {
  const selected: string[] = [];
  for (const kind of ['Armadura', 'Escudo'] as const) for (const index of equippedRows(values, kind)) {
    const name = values[equipmentKeys(kind, index).name]?.trim(); if (name) selected.push(name);
  }
  for (let index = 1; index <= 20; index++) if (values[`BossBar.Ataque.${index}.Principal`] === 'Yes') {
    if (values[`Ataque ${index}`]?.trim()) selected.push(values[`Ataque ${index}`]);
    if (values[`BossBar.Ataque.${index}.DuasArmas`] === 'Yes' && values[`BossBar.Ataque.${index}.Segunda.Nome`]?.trim()) selected.push(values[`BossBar.Ataque.${index}.Segunda.Nome`]);
  }
  const remaining = new Map<string, number>();
  for (const name of selected) remaining.set(key(name), (remaining.get(key(name)) ?? 0) + 1);
  const items = Array.from({ length: 100 }, (_, offset) => {
    const index = offset + 1; const keys = inventoryKeys(index);
    return { index, keys, name: values[keys.name]?.trim() ?? '', quantity: decimal(values[keys.quantity], 1), spaces: decimal(values[keys.spaces]), exempt: 0, carried: 0 };
  }).filter(({ name }) => name);
  const reasons: string[] = [];
  if (values['BossBar.Migration.LoadUnits'] === 'review' && values['BossBar.CargaRevisada'] !== 'Yes') reasons.push('Confirme a conversão das unidades antigas para espaços.');
  if (values['BossBar.Import.InventarioRevisar']) reasons.push(values['BossBar.Import.InventarioRevisar']);
  for (const [name, count] of remaining) {
    const matching = items.filter((item) => key(item.name) === name && item.quantity > 0);
    if (matching.length > 1 && new Set(matching.map(({ spaces }) => spaces)).size > 1 && matching.reduce((sum, item) => sum + item.quantity, 0) > count) {
      reasons.push(`Há cópias de “${matching[0].name}” com espaços diferentes. Use nomes distintos nos itens e no equipamento selecionado para identificar qual está equipado.`);
      remaining.delete(name);
    }
  }
  let total = 0; let gross = 0; let equipped = 0; const grossReasons: string[] = [];
  for (const item of items) {
    if (!Number.isFinite(item.quantity) || item.quantity < 0) { reasons.push(`Revise a quantidade de “${item.name}”.`); continue; }
    item.exempt = Math.min(item.quantity, remaining.get(key(item.name)) ?? 0);
    remaining.set(key(item.name), Math.max(0, (remaining.get(key(item.name)) ?? 0) - item.exempt));
    item.carried = item.quantity - item.exempt;
    if (!Number.isFinite(item.spaces) || item.spaces < 0) {
      if (item.quantity) grossReasons.push(`Informe os espaços de “${item.name}” para calcular a carga total e equipada.`);
    } else { gross += item.quantity * item.spaces; equipped += item.exempt * item.spaces; }
    if (!item.carried) continue;
    if (!Number.isFinite(item.spaces) || item.spaces < 0) { reasons.push(`Informe os espaços por unidade de “${item.name}”.`); continue; }
    total += item.carried * item.spaces;
  }
  let coins = 0;
  for (const name of SHEET_COIN_FIELDS) {
    const quantity = decimal(values[name], 0);
    if (!Number.isFinite(quantity) || quantity < 0) reasons.push('Revise as quantidades de moedas.');
    else coins += quantity;
  }
  const coinLoad = Math.floor(coins / 1000); const round = (value: number) => Number(value.toFixed(3));
  return { total: reasons.length ? null : round(total + coinLoad), gross: reasons.length || grossReasons.length ? null : round(gross + coinLoad), equipped: reasons.length || grossReasons.length ? null : round(equipped), coinLoad, items, reasons, grossReasons };
};

export const recalculateInventoryLoad = (values: Values) => {
  const result = sheetInventoryLoad(values);
  if (result.total !== null && decimal(values.CargaTotal) !== result.total) values.CargaTotal = String(result.total);
  return result;
};
export const upgradeInventoryLoad = (values: Values) => {
  if (values[INVENTORY_LOAD_VERSION_FIELD] === '1') return;
  // Old weight-based sheets must complete their existing unit review first.
  if (values['BossBar.Source'] !== 'nimb' && !values['BossBar.MigratedFrom']) return;
  if (values.CargaTotal !== undefined) values['BossBar.Original.CargaTotal'] ??= values.CargaTotal;
  recalculateInventoryLoad(values);
  values[INVENTORY_LOAD_VERSION_FIELD] = '1';
};
