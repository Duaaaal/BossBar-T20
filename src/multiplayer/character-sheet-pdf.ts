import {
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
} from 'pdf-lib';
import type {
  CharacterSheetEditorField,
  CharacterSheetIssue,
  CharacterSheetSummary,
  CharacterSheetValidation,
} from '../shared/character-sheet.ts';
import { normalizeAttackRange, normalizeDamageType } from '../shared/attack-options.ts';
import { parseDamageFormula } from '../shared/status.ts';

type FieldValues = Record<string, string>;

type SkillRule = {
  code: string;
  name: string;
  modifierField: string;
  trainedField: string;
  trainedOnly?: boolean;
  armorPenalty?: boolean;
  sizeModifierField?: string;
};

const attributeFields = {
  for: 'ModFor',
  des: 'ModDes',
  con: 'ModCon',
  int: 'ModInt',
  sab: 'ModSab',
  car: 'ModCar',
} as const;

const skillRules: SkillRule[] = [
  { code: '010', name: 'Acrobacia', modifierField: 'ModAtribAcro', trainedField: 'Mar Trei acro', armorPenalty: true },
  { code: '020', name: 'Adestramento', modifierField: 'ModAtribAdes', trainedField: 'Mar Trei ades', trainedOnly: true },
  { code: '030', name: 'Atletismo', modifierField: 'ModAtribAtle', trainedField: 'Mar Trei atle' },
  { code: '040', name: 'Atuação', modifierField: 'ModAtribAtua', trainedField: 'Mar Trei atua' },
  { code: '050', name: 'Cavalgar', modifierField: 'ModAtribCava', trainedField: 'Mar Trei caval' },
  { code: '060', name: 'Conhecimento', modifierField: 'ModAtribConh', trainedField: 'Mar Trei conhe', trainedOnly: true },
  { code: '070', name: 'Cura', modifierField: 'ModAtribCura', trainedField: 'Mar Trei cura' },
  { code: '080', name: 'Diplomacia', modifierField: 'ModAtribDipl', trainedField: 'Mar Trei dipl' },
  { code: '090', name: 'Enganação', modifierField: 'ModAtribEnga', trainedField: 'Mar Trei enga' },
  { code: '100', name: 'Fortitude', modifierField: 'ModAtribFort', trainedField: 'Mar Trei forti' },
  { code: '110', name: 'Furtividade', modifierField: 'ModAtribFurt', trainedField: 'Mar Trei furti', armorPenalty: true, sizeModifierField: 'ModFurtTam' },
  { code: '120', name: 'Guerra', modifierField: 'ModAtribGuer', trainedField: 'Mar Trei guerra', trainedOnly: true },
  { code: '130', name: 'Iniciativa', modifierField: 'ModAtribInic', trainedField: 'Mar Trei ini' },
  { code: '140', name: 'Intimidação', modifierField: 'ModAtribInti', trainedField: 'Mar Trei inti' },
  { code: '150', name: 'Intuição', modifierField: 'ModAtribIntu', trainedField: 'Mar Trei intu' },
  { code: '160', name: 'Investigação', modifierField: 'ModAtribInve', trainedField: 'Mar Trei inve' },
  { code: '170', name: 'Jogatina', modifierField: 'ModAtribJoga', trainedField: 'Mar Trei joga', trainedOnly: true },
  { code: '180', name: 'Ladinagem', modifierField: 'ModAtribLadi', trainedField: 'Mar Trei ladi', trainedOnly: true, armorPenalty: true },
  { code: '190', name: 'Luta', modifierField: 'ModAtribLuta', trainedField: 'Mar Trei luta' },
  { code: '200', name: 'Misticismo', modifierField: 'ModAtribMist', trainedField: 'Mar Trei misti', trainedOnly: true },
  { code: '210', name: 'Pilotagem', modifierField: 'ModAtribPilo', trainedField: 'Mar Trei pilo', trainedOnly: true },
  { code: '220', name: 'Nobreza', modifierField: 'ModAtribNobr', trainedField: 'Mar Trei nobre', trainedOnly: true },
  { code: '230', name: 'Ofício 1', modifierField: 'ModAtribOfi1', trainedField: 'Mar Trei ofi1', trainedOnly: true },
  { code: '240', name: 'Ofício 2', modifierField: 'ModAtribOfi2', trainedField: 'Mar Trei ofi2', trainedOnly: true },
  { code: '250', name: 'Percepção', modifierField: 'ModAtribPerc', trainedField: 'Mar Trei perce' },
  { code: '260', name: 'Pontaria', modifierField: 'ModAtribPont', trainedField: 'Mar Trei ponta' },
  { code: '270', name: 'Reflexos', modifierField: 'ModAtribRefl', trainedField: 'Mar Trei refle' },
  { code: '280', name: 'Religião', modifierField: 'ModAtribReli', trainedField: 'Mar Trei reli', trainedOnly: true },
  { code: '290', name: 'Sobrevivência', modifierField: 'ModAtribSobr', trainedField: 'Mar Trei sobre' },
  { code: '300', name: 'Vontade', modifierField: 'ModAtribVont', trainedField: 'Mar Trei vonta' },
];

type EditorFieldDescriptor = {
  name: string;
  label: string;
  section: string;
  group?: string;
  valueFrom?: (values: FieldValues) => string;
  defaultValue?: string;
  validation?: CharacterSheetEditorField['validation'];
};

const editorField = (
  name: string,
  label: string,
  section: string,
  group?: string,
  valueFrom?: EditorFieldDescriptor['valueFrom'],
  options?: Pick<EditorFieldDescriptor, 'defaultValue' | 'validation'>,
): EditorFieldDescriptor => ({ name, label, section, group, valueFrom, ...options });

const integerValidation = (min: number, max: number) => ({
  kind: 'integer' as const,
  min,
  max,
});

const formulaValidation = (maxLength = 120) => ({
  kind: 'formula' as const,
  maxLength,
});

const decimalValidation = (min: number, max: number) => ({
  kind: 'decimal' as const,
  min,
  max,
});

const textValidation = (maxLength: number) => ({
  kind: 'text' as const,
  maxLength,
});

const MAX_SPELL_ROWS = 100;
const MIN_ATTACK_ROWS = 2;
const MAX_ATTACK_ROWS = 20;
const MIN_ITEM_ROWS = 3;
const MAX_ITEM_ROWS = 100;
const MAX_ARMOR_ROWS = 20;
const MAX_SHIELD_ROWS = 20;
const spellFields = [
  ['Nome', 'Nome'],
  ['Escola', 'Escola'],
  ['Execucao', 'Execução'],
  ['Alcance', 'Alcance'],
  ['Area', 'Área'],
  ['Duracao', 'Duração'],
  ['Resistencia', 'Resistência'],
  ['Efeito', 'Efeito'],
] as const;

const skillComponentFields = (rule: SkillRule) => {
  const suffix = rule.code === '110' ? 11 : Number.parseInt(rule.code, 10) / 10;
  return {
    halfLevel: rule.code === '300' ? '301' : `${String(suffix).padStart(2, '0')}1`,
    training: rule.code === '300' ? '303' : `${String(suffix).padStart(2, '0')}3`,
    other: rule.code === '300' ? '304' : `${String(suffix).padStart(2, '0')}4`,
  };
};

const parseCritical = (value: string | undefined) => {
  const normalized = (value ?? '').trim();
  const margin = normalized.match(/^(\d{1,2})(?=\D|$)/)?.[1] ?? (/^[x×]/i.test(normalized) ? '20' : '');
  const multiplier = normalized.match(/[x×]\s*(\d{1,2})/i)?.[1] ?? '';
  return { margin, multiplier };
};

const characterSheetEditorDescriptors = (): EditorFieldDescriptor[] => {
  const descriptors: EditorFieldDescriptor[] = [
    editorField('NOME DO PERSONAGEM', 'Nome', 'Identidade'),
    editorField('JOGADOR', 'Jogador', 'Identidade'),
    editorField('RAÇA', 'Raça', 'Identidade'),
    editorField('ORIGEM', 'Origem', 'Identidade'),
    editorField('CLASSE', 'Classe', 'Identidade'),
    editorField('Lv', 'Nível', 'Identidade', undefined, undefined, {
      validation: integerValidation(1, 20),
    }),
    editorField('DIVINDADE', 'Divindade', 'Identidade'),
  ];

  for (const [name, label, modifierName] of [
    ['For', 'Força', 'ModFor'],
    ['Des', 'Destreza', 'ModDes'],
    ['Con', 'Constituição', 'ModCon'],
    ['Int', 'Inteligência', 'ModInt'],
    ['Sab', 'Sabedoria', 'ModSab'],
    ['Car', 'Carisma', 'ModCar'],
  ] as const) {
    descriptors.push(
      editorField(name, 'Atributo', 'Atributos e modificadores', label, undefined, {
        validation: integerValidation(-99, 99),
      }),
      editorField(modifierName, 'Modificador', 'Atributos e modificadores', label, undefined, {
        validation: integerValidation(-99, 99),
      }),
    );
  }

  descriptors.push(
    editorField('PVs Totais', 'PV máximo', 'Pontos de vida e mana', undefined, undefined, { validation: integerValidation(1, 1_000_000) }),
    editorField('PVs Atuais', 'PV atual', 'Pontos de vida e mana', undefined, undefined, { validation: integerValidation(-1_000_000, 1_000_000) }),
    editorField(
      'BossBar.PVs Temporarios',
      'PV temporário',
      'Pontos de vida e mana',
      undefined,
      undefined,
      { defaultValue: '0', validation: integerValidation(0, 1_000_000) },
    ),
    editorField('PMs Totais', 'PM máximo', 'Pontos de vida e mana', undefined, undefined, { validation: integerValidation(0, 1_000_000) }),
    editorField('PMs Atuais', 'PM atual', 'Pontos de vida e mana', undefined, undefined, { validation: integerValidation(0, 1_000_000) }),
  );

  for (const rule of skillRules) {
    const components = skillComponentFields(rule);
    if (rule.code === '230') {
      descriptors.push(editorField('Ofício 1', 'Nome', 'Perícias', rule.name));
    } else if (rule.code === '240') {
      descriptors.push(editorField('Ofício_2', 'Nome', 'Perícias', rule.name));
    }
    descriptors.push(
      editorField(rule.trainedField, 'Treinada', 'Perícias', rule.name),
      editorField(components.halfLevel, '1/2 do nível', 'Perícias', rule.name, undefined, {
        validation: integerValidation(-99, 99),
      }),
      editorField(rule.modifierField, 'Mod. de atributo', 'Perícias', rule.name, undefined, {
        validation: integerValidation(-99, 99),
      }),
      editorField(components.training, 'Treino', 'Perícias', rule.name, undefined, {
        validation: integerValidation(-99, 99),
      }),
      editorField(
        components.other,
        'Outros',
        'Perícias',
        rule.name,
        undefined,
        { defaultValue: '0', validation: integerValidation(-999, 999) },
      ),
      editorField(rule.code, 'Total', 'Perícias', rule.name, undefined, {
        validation: integerValidation(-99, 99),
      }),
    );
  }

  for (let index = 1; index <= MAX_ATTACK_ROWS; index += 1) {
    const group = `Ataque ${index}`;
    const criticalField = `Crítico ${index}`;
    const marginField = `BossBar.Ataque.${index}.MargemCritico`;
    const multiplierField = `BossBar.Ataque.${index}.MultiplicadorCritico`;
    descriptors.push(
      editorField(`Ataque ${index}`, 'Nome', 'Ataques', group),
      editorField(
        `Bônus Atq ${index}`,
        'Teste de ataque',
        'Ataques',
        group,
        undefined,
        { validation: formulaValidation() },
      ),
      editorField(
        `Dano ${index}`,
        'Dano',
        'Ataques',
        group,
        undefined,
        { validation: formulaValidation() },
      ),
      editorField(
        marginField,
        'Margem de crítico',
        'Ataques',
        group,
        (values) => values[marginField] ?? parseCritical(values[criticalField]).margin,
        { validation: integerValidation(2, 20) },
      ),
      editorField(
        multiplierField,
        'Multiplicador de crítico',
        'Ataques',
        group,
        (values) => values[multiplierField] ?? parseCritical(values[criticalField]).multiplier,
        { defaultValue: '2', validation: integerValidation(1, 20) },
      ),
      editorField(`Tipo ${index}`, 'Tipo', 'Ataques', group),
      editorField(`Alcance ${index}`, 'Alcance', 'Ataques', group),
    );
  }

  descriptors.push(
    editorField('ModAtribDefe', 'Mod. de Destreza', 'Defesa', undefined, undefined, { validation: integerValidation(-999, 999) }),
    editorField('B.Arm', 'Bônus de armadura', 'Defesa', undefined, undefined, { validation: integerValidation(0, 999) }),
    editorField('B.Esc', 'Bônus de escudo', 'Defesa', undefined, undefined, { validation: integerValidation(0, 999) }),
    editorField('Outros B.CA', 'Outros', 'Defesa', undefined, undefined, { validation: integerValidation(-999, 999) }),
    editorField('PArmTotal', 'Penalidade de armadura', 'Defesa', undefined, undefined, { validation: integerValidation(-999, 999) }),
    editorField('CA', 'Total', 'Defesa', undefined, undefined, { validation: integerValidation(0, 999) }),
    editorField('Proficiências', 'Proficiências', 'Proficiências'),
  );

  for (let index = 1; index <= MAX_ARMOR_ROWS; index += 1) {
    const group = `Armadura ${index}`;
    descriptors.push(
      editorField(index === 1 ? 'Armadura' : `BossBar.Armadura.${index}.Nome`, 'Nome', 'Armadura e escudo', group),
      editorField(index === 1 ? 'B.Arm1' : `BossBar.Armadura.${index}.Defesa`, 'Defesa', 'Armadura e escudo', group, undefined, {
        validation: integerValidation(0, 999),
      }),
      editorField(index === 1 ? 'Pa' : `BossBar.Armadura.${index}.Penalidade`, 'Penalidade', 'Armadura e escudo', group, undefined, {
        validation: integerValidation(-99, 99),
      }),
    );
  }
  for (let index = 1; index <= MAX_SHIELD_ROWS; index += 1) {
    const group = `Escudo ${index}`;
    descriptors.push(
      editorField(index === 1 ? 'Escudo' : `BossBar.Escudo.${index}.Nome`, 'Nome', 'Armadura e escudo', group),
      editorField(index === 1 ? 'B.Esc2' : `BossBar.Escudo.${index}.Defesa`, 'Defesa', 'Armadura e escudo', group, undefined, {
        validation: integerValidation(0, 999),
      }),
      editorField(index === 1 ? 'Pe' : `BossBar.Escudo.${index}.Penalidade`, 'Penalidade', 'Armadura e escudo', group, undefined, {
        validation: integerValidation(-99, 99),
      }),
    );
  }

  descriptors.push(
    editorField('SeleTamanho', 'Tamanho', 'Características'),
    editorField(
      'Exp',
      'Pontos de experiência',
      'Características',
      undefined,
      undefined,
      { defaultValue: '0', validation: integerValidation(0, 1_000_000_000) },
    ),
    editorField('Desloc', 'Deslocamento', 'Características'),
  );

  for (let index = 1; index <= MAX_ITEM_ROWS; index += 1) {
    const group = `Item ${index}`;
    descriptors.push(
      editorField(
        index <= 15 ? `Item${index}` : `BossBar.Item.${index}.Nome`,
        'Item',
        'Itens',
        group,
      ),
      editorField(
        `BossBar.Item.${index}.Quantidade`,
        'Quantidade',
        'Itens',
        group,
        undefined,
        { defaultValue: '0', validation: integerValidation(0, 9_999) },
      ),
      editorField(
        index <= 15 ? `PesoItem${index}` : `BossBar.Item.${index}.Peso`,
        'Peso',
        'Itens',
        group,
        undefined,
        { validation: decimalValidation(0, 1_000_000) },
      ),
    );
  }
  descriptors.push(
    editorField('CargaTotal', 'Carga atual', 'Itens', 'Carga', undefined, {
      defaultValue: '0',
      validation: decimalValidation(0, 100_000_000),
    }),
    editorField('CargaMax', 'Carga máxima', 'Itens', 'Carga', undefined, {
      validation: decimalValidation(0, 100_000_000),
    }),
    editorField('Levantar', 'Levantar', 'Itens', 'Carga'),
  );

  descriptors.push(
    editorField('SeleAtribMagia', 'Atributo-chave', 'Magias'),
    editorField('ModAtribMagia', 'Modificador', 'Magias'),
    editorField('TesteResist', 'Teste de resistência', 'Magias'),
  );
  for (let index = 1; index <= MAX_SPELL_ROWS; index += 1) {
    for (const [fieldName, label] of spellFields) {
      const name = `BossBar.Magia.${index}.${fieldName}`;
      descriptors.push(editorField(
        name,
        label,
        'Magias',
        `Magia ${index}`,
        index === 1 && fieldName === 'Efeito'
          ? (values) => values[name] ?? values.Magias ?? ''
          : undefined,
        { validation: textValidation(fieldName === 'Efeito' ? 1_000 : 160) },
      ));
    }
  }
  descriptors.push(
    editorField('Descrição', 'Descrição', 'Descrição', undefined, undefined, {
      validation: textValidation(2_000),
    }),
    editorField('HabRaçasOrigem', 'Habilidades de raça e origem', 'Habilidades'),
    editorField('HabClassePoderes', 'Habilidades de classe e poderes', 'Habilidades'),
  );
  return descriptors;
};

const CHARACTER_SHEET_EDITOR_DESCRIPTORS = characterSheetEditorDescriptors();
const CHARACTER_SHEET_EDITOR_FIELD_NAMES = new Set(
  CHARACTER_SHEET_EDITOR_DESCRIPTORS.map(({ name }) => name),
);
const CHARACTER_SHEET_EDITOR_DESCRIPTOR_BY_NAME = new Map(
  CHARACTER_SHEET_EDITOR_DESCRIPTORS.map((descriptor) => [descriptor.name, descriptor]),
);
const DICE_FORMULA_PATTERN = /^[+-]?\s*(?:\d+d\d+|\d+)(?:\s*[+-]\s*(?:\d+d\d+|\d+))*$/i;

export const validateCharacterSheetEditorUpdates = (
  updates: readonly CharacterSheetEditorField[],
): string | null => {
  const names = new Set<string>();
  for (const update of updates) {
    if (names.has(update.name)) return 'A ficha contém campos duplicados.';
    names.add(update.name);
    const descriptor = CHARACTER_SHEET_EDITOR_DESCRIPTOR_BY_NAME.get(update.name);
    if (!descriptor) return `O campo ${update.label || update.name} não é reconhecido.`;
    const value = update.value.trim();
    const validation = descriptor.validation;
    if (value && /^Tipo \d+$/.test(update.name) && !normalizeDamageType(value)) return `${descriptor.group}: selecione um tipo de dano reconhecido.`;
    if (value && /^Alcance \d+$/.test(update.name) && !normalizeAttackRange(value)) return `${descriptor.group}: selecione um alcance reconhecido.`;
    if (!value || !validation) continue;
    if (validation.maxLength !== undefined && value.length > validation.maxLength) {
      return `${descriptor.label} aceita no máximo ${validation.maxLength} caracteres.`;
    }
    const fixedFormula = /^[+-]?\d+$/.test(value) && Math.abs(Number(value)) <= 1_000_000;
    if (validation.kind === 'formula' && (!DICE_FORMULA_PATTERN.test(value) || (!fixedFormula && !parseDamageFormula(value)))) {
      return `${descriptor.label} deve usar apenas números, dados, + e - (ex.: 2d6 + 3).`;
    }
    if (validation.kind === 'decimal') {
      const normalized = value.replace(',', '.');
      if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized)) {
        return `${descriptor.label} deve ser um número válido.`;
      }
      const parsed = Number(normalized);
      if (validation.min !== undefined && parsed < validation.min) {
        return `${descriptor.label} deve ser no mínimo ${validation.min}.`;
      }
      if (validation.max !== undefined && parsed > validation.max) {
        return `${descriptor.label} deve ser no máximo ${validation.max}.`;
      }
    }
    if (validation.kind === 'integer') {
      if (!/^[+-]?\d+$/.test(value)) return `${descriptor.label} deve ser um número inteiro.`;
      const parsed = Number.parseInt(value, 10);
      if (validation.min !== undefined && parsed < validation.min) {
        return `${descriptor.label} deve ser no mínimo ${validation.min}.`;
      }
      if (validation.max !== undefined && parsed > validation.max) {
        return `${descriptor.label} deve ser no máximo ${validation.max}.`;
      }
    }
  }
  if (updates.length > CHARACTER_SHEET_EDITOR_DESCRIPTORS.length) {
    return 'A ficha contém campos demais.';
  }
  return null;
};

const classProgression: Record<string, {
  initialHealth: number;
  healthPerLevel: number;
  manaPerLevel: number;
}> = {
  arcanista: { initialHealth: 8, healthPerLevel: 2, manaPerLevel: 6 },
  barbaro: { initialHealth: 24, healthPerLevel: 6, manaPerLevel: 3 },
  bardo: { initialHealth: 12, healthPerLevel: 3, manaPerLevel: 4 },
  bucaneiro: { initialHealth: 16, healthPerLevel: 4, manaPerLevel: 3 },
  cacador: { initialHealth: 16, healthPerLevel: 4, manaPerLevel: 4 },
  cavaleiro: { initialHealth: 20, healthPerLevel: 5, manaPerLevel: 3 },
  clerigo: { initialHealth: 16, healthPerLevel: 4, manaPerLevel: 5 },
  druida: { initialHealth: 16, healthPerLevel: 4, manaPerLevel: 4 },
  guerreiro: { initialHealth: 20, healthPerLevel: 5, manaPerLevel: 3 },
  inventor: { initialHealth: 12, healthPerLevel: 3, manaPerLevel: 4 },
  ladino: { initialHealth: 12, healthPerLevel: 3, manaPerLevel: 4 },
  lutador: { initialHealth: 20, healthPerLevel: 5, manaPerLevel: 3 },
  nobre: { initialHealth: 16, healthPerLevel: 4, manaPerLevel: 4 },
  paladino: { initialHealth: 20, healthPerLevel: 5, manaPerLevel: 3 },
};

const normalizeRuleName = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLocaleLowerCase('pt-BR');

const readFieldValues = (document: PDFDocument) => {
  const values: FieldValues = {};
  for (const field of document.getForm().getFields()) {
    try {
      if (field instanceof PDFTextField) values[field.getName()] = field.getText() ?? '';
      else if (field instanceof PDFCheckBox) values[field.getName()] = field.isChecked() ? 'Yes' : 'Off';
      else if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
        values[field.getName()] = field.getSelected()[0] ?? '';
      } else if (field instanceof PDFRadioGroup) values[field.getName()] = field.getSelected() ?? '';
    } catch {
      values[field.getName()] = '';
    }
  }
  return values;
};

const clean = (value: string | undefined) => (value ?? '').trim();
const numberValue = (value: string | undefined): number | null => {
  const normalized = clean(value).replace(',', '.');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};
const integerValue = (value: string | undefined) => {
  const parsed = numberValue(value);
  return parsed !== null && Number.isInteger(parsed) ? parsed : null;
};
const isChecked = (value: string | undefined) => value === 'Yes';
const numericOrZero = (value: string | undefined) => numberValue(value) ?? 0;

const emptySummary = (): CharacterSheetSummary => ({
  characterName: '', playerName: '', race: '', origin: '', characterClass: '',
  level: null, currentHealth: null, maxHealth: null, currentMana: null,
  maxMana: null, temporaryHealth: 0, defense: null,
  attributes: { for: null, des: null, con: null, int: null, sab: null, car: null },
  defenses: { melee: null, ranged: null, calculation: '' },
  skills: [], attacks: [], movement: '', size: '', currentLoad: null, maxLoad: null,
});

const addRequiredIssue = (
  issues: CharacterSheetIssue[],
  fields: FieldValues,
  field: string,
  label: string,
) => {
  if (clean(fields[field])) return;
  issues.push({
    id: `required:${field}`,
    severity: 'error',
    field,
    message: `Preencha ${label}.`,
    autoFixable: false,
  });
};

const addFormulaIssue = (
  issues: CharacterSheetIssue[],
  field: string,
  actual: number | null,
  expected: number,
  label: string,
) => {
  if (actual === expected) return;
  issues.push({
    id: `formula:${field}`,
    severity: 'error',
    field,
    message: `${label} não corresponde ao cálculo da ficha.`,
    expected: String(expected),
    actual: actual === null ? 'vazio' : String(actual),
    autoFixable: true,
  });
};

const trainingBonus = (level: number, trained: boolean) => {
  if (!trained) return 0;
  if (level >= 15) return 6;
  if (level >= 7) return 4;
  return 2;
};

const validateFields = (fields: FieldValues, fieldCount: number): CharacterSheetValidation => {
  const requiredTemplateFields = [
    'NOME DO PERSONAGEM', 'JOGADOR', 'CLASSE', 'Lv', 'For', 'ModFor',
    'PVs Totais', 'CA', 'Descrição',
  ];
  const supported = requiredTemplateFields.every((field) => field in fields);
  if (!supported) {
    return {
      supported: false,
      template: 'unknown',
      summary: emptySummary(),
      issues: [{
        id: 'unsupported-template',
        severity: 'error',
        field: null,
        message: 'Este PDF não usa os campos editáveis esperados da Ficha T20 v.2.0.',
        autoFixable: false,
      }],
      fieldCount,
      checkedAt: Date.now(),
    };
  }

  const issues: CharacterSheetIssue[] = [];
  for (const descriptor of CHARACTER_SHEET_EDITOR_DESCRIPTORS) {
    // The old attribute scale is intentionally ignored; JdA uses ModFor, etc.
    if (['For', 'Des', 'Con', 'Int', 'Sab', 'Car'].includes(descriptor.name)) continue;
    const value = descriptor.valueFrom?.(fields) ?? fields[descriptor.name];
    if (!value?.trim()) continue;
    const error = validateCharacterSheetEditorUpdates([{ ...descriptor, kind: 'text', value }]);
    if (error) issues.push({ id: `invalid:${descriptor.name}`, severity: 'error', field: descriptor.name, message: error, actual: value, autoFixable: false });
  }
  for (let index = 1; index <= MAX_ATTACK_ROWS; index += 1) {
    const critical = fields[`Crítico ${index}`]?.trim();
    if (critical && !/^(?:\d{1,2}(?:\s*[-–]\s*20)?(?:\s*\/\s*[x×]\s*\d{1,2})?|[x×]\s*\d{1,2})$/i.test(critical)) {
      issues.push({ id: `invalid:critical:${index}`, severity: 'error', field: `BossBar.Ataque.${index}.MargemCritico`, message: `Ataque ${index}: revise a margem e o multiplicador de crítico (ex.: 19/x2).`, actual: critical, autoFixable: false });
    }
  }
  addRequiredIssue(issues, fields, 'NOME DO PERSONAGEM', 'o nome do personagem');
  addRequiredIssue(issues, fields, 'JOGADOR', 'o nome do jogador');
  addRequiredIssue(issues, fields, 'RAÇA', 'a raça');
  addRequiredIssue(issues, fields, 'ORIGEM', 'a origem');
  addRequiredIssue(issues, fields, 'CLASSE', 'a classe');
  addRequiredIssue(issues, fields, 'PVs Totais', 'os PV máximos');
  addRequiredIssue(issues, fields, 'PVs Atuais', 'os PV atuais');
  addRequiredIssue(issues, fields, 'PMs Totais', 'os PM máximos');
  addRequiredIssue(issues, fields, 'PMs Atuais', 'os PM atuais');

  const level = integerValue(fields.Lv);
  if (level === null || level < 1 || level > 20) {
    issues.push({
      id: 'range:level', severity: 'error', field: 'Lv',
      message: 'O nível deve ser um número inteiro entre 1 e 20.',
      actual: clean(fields.Lv) || 'vazio', autoFixable: false,
    });
  }

  const attributes = {} as CharacterSheetSummary['attributes'];
  for (const [key, modifierField] of Object.entries(attributeFields) as Array<[
    keyof CharacterSheetSummary['attributes'], string,
  ]>) {
    const modifier = integerValue(fields[modifierField]);
    attributes[key] = modifier;
    if (modifier === null) {
      issues.push({
        id: `number:${modifierField}`, severity: 'error', field: modifierField,
        message: `${modifierField} precisa ser um número inteiro.`, autoFixable: false,
      });
    }
  }

  issues.push({
    id: 'template:legacy-attribute-scale',
    severity: 'warning',
    field: null,
    message: 'Regra do Jogo do Ano: a mecânica da antiga escala de atributos tornou-se obsoleta. O BossBar ignora esses valores e considera somente os campos de modificador como os atributos oficiais.',
    autoFixable: false,
  });

  const maxHealth = integerValue(fields['PVs Totais']);
  const currentHealth = integerValue(fields['PVs Atuais']);
  const temporaryHealth = Math.max(0, integerValue(fields['BossBar.PVs Temporarios']) ?? 0);
  const maxMana = integerValue(fields['PMs Totais']);
  const currentMana = integerValue(fields['PMs Atuais']);
  for (const [field, value] of [
    ['PVs Totais', maxHealth], ['PVs Atuais', currentHealth],
    ['PMs Totais', maxMana], ['PMs Atuais', currentMana],
  ] as const) {
    if (field !== 'PVs Atuais' && value !== null && value < 0) issues.push({
      id: `range:${field}`, severity: 'error', field,
      message: `${field} não pode ser negativo.`, actual: String(value), autoFixable: false,
    });
  }
  if (maxHealth !== null && currentHealth !== null && currentHealth > maxHealth) {
    issues.push({
      id: 'range:current-health', severity: 'error', field: 'PVs Atuais',
      message: 'Os PV atuais não podem superar os PV máximos.',
      expected: `até ${maxHealth}`, actual: String(currentHealth), autoFixable: true,
    });
  }
  if (maxMana !== null && currentMana !== null && currentMana > maxMana) {
    issues.push({
      id: 'range:current-mana', severity: 'error', field: 'PMs Atuais',
      message: 'Os PM atuais não podem superar os PM máximos.',
      expected: `até ${maxMana}`, actual: String(currentMana), autoFixable: true,
    });
  }

  const className = normalizeRuleName(clean(fields.CLASSE));
  const progression = !className.includes('/') ? classProgression[className] : undefined;
  const constitution = attributes.con;
  if (progression && level !== null && constitution !== null) {
    const expectedHealth = Math.max(1, progression.initialHealth + constitution) +
      Math.max(0, level - 1) * Math.max(1, progression.healthPerLevel + constitution);
    const expectedMana = progression.manaPerLevel * level;
    if (maxHealth !== null && maxHealth !== expectedHealth) issues.push({
      id: 'manual:class-health', severity: 'warning', field: 'PVs Totais',
      message: 'Os PV máximos diferem da progressão básica da classe no manual. Poderes, raça ou outras exceções podem justificar o valor.',
      expected: String(expectedHealth), actual: String(maxHealth), autoFixable: false,
    });
    if (maxMana !== null && maxMana !== expectedMana) issues.push({
      id: 'manual:class-mana', severity: 'warning', field: 'PMs Totais',
      message: 'Os PM máximos diferem da progressão básica da classe no manual. Poderes, raça ou outras exceções podem justificar o valor.',
      expected: String(expectedMana), actual: String(maxMana), autoFixable: false,
    });
  }

  const validLevel = level ?? 1;
  const halfLevel = Math.floor(validLevel / 2);
  const skills: CharacterSheetSummary['skills'] = [];
  for (const rule of skillRules) {
    const components = skillComponentFields(rule);
    const halfField = components.halfLevel;
    const trainingField = components.training;
    const otherField = components.other;
    const trained = isChecked(fields[rule.trainedField]);
    const expectedTraining = trainingBonus(validLevel, trained);
    addFormulaIssue(issues, halfField, integerValue(fields[halfField]), halfLevel, `A metade do nível em ${rule.code}`);
    addFormulaIssue(issues, trainingField, integerValue(fields[trainingField]), expectedTraining, `O treino em ${rule.code}`);
    const attributeValue = numericOrZero(fields[rule.modifierField]);
    const otherBonus = numericOrZero(fields[otherField]);
    const sizeModifier = numericOrZero(fields[rule.sizeModifierField ?? '']);
    const armorPenalty = rule.armorPenalty
      ? numericOrZero(fields.Pa) + numericOrZero(fields.Pe)
      : 0;
    const expectedTotal = rule.trainedOnly && !trained ? 0 :
      attributeValue + halfLevel + expectedTraining + otherBonus + sizeModifier - armorPenalty;
    addFormulaIssue(issues, rule.code, numberValue(fields[rule.code]), expectedTotal, `O total da perícia ${rule.code}`);
    const total = numberValue(fields[rule.code]);
    const attribute = clean(fields[rule.modifierField.replace('ModAtrib', 'SeleAtrib')]) || 'Atributo';
    skills.push({
      id: rule.code,
      name: rule.code === '230' ? clean(fields['Ofício 1']) || rule.name
        : rule.code === '240' ? clean(fields.Ofício_2) || rule.name
          : rule.name,
      total,
      trained,
      trainedOnly: Boolean(rule.trainedOnly),
      attribute,
      attributeValue,
      halfLevel,
      trainingBonus: expectedTraining,
      otherBonus,
      armorPenalty,
      sizeModifier,
      calculation: rule.trainedOnly && !trained
        ? 'Perícia somente treinada; valor 0 sem treinamento.'
        : `${attributeValue} (atributo) + ${halfLevel} (metade do nível) + ${expectedTraining} (treino) + ${otherBonus} (outros) + ${sizeModifier} (tamanho) - ${armorPenalty} (penalidade) = ${total ?? expectedTotal}`,
    });
  }

  const defenseIncludesDexterity = isChecked(fields['arm pesa']);
  const expectedDefense = numericOrZero(fields['Base CA']) +
    numericOrZero(fields['B.Arm']) + numericOrZero(fields['B.Esc']) +
    numericOrZero(fields['Outros B.CA']) +
    (defenseIncludesDexterity ? numericOrZero(fields.ModAtribDefe) : 0);
  addFormulaIssue(issues, 'CA', numberValue(fields.CA), expectedDefense, 'A Defesa');
  const expectedSpellDc = numericOrZero(fields['Base CA']) +
    numericOrZero(fields.ModAtribMagia) + halfLevel;
  addFormulaIssue(issues, 'TesteResist', numberValue(fields.TesteResist), expectedSpellDc, 'A CD de magia');
  const defense = integerValue(fields.CA);
  const defenseCalculation = `${numericOrZero(fields['Base CA'])} (base) + ${numericOrZero(fields['B.Arm'])} (armadura) + ${numericOrZero(fields['B.Esc'])} (escudo) + ${numericOrZero(fields['Outros B.CA'])} (outros) + ${defenseIncludesDexterity ? numericOrZero(fields.ModAtribDefe) : 0} (atributo) = ${defense ?? expectedDefense}`;
  const attacks = Array.from({ length: MAX_ATTACK_ROWS }, (_, index) => {
    const number = index + 1;
    return {
      name: clean(fields[`Ataque ${number}`]),
      attackBonus: clean(fields[`Bônus Atq ${number}`]),
      damage: clean(fields[`Dano ${number}`]),
      critical: clean(fields[`Crítico ${number}`]),
      damageType: normalizeDamageType(clean(fields[`Tipo ${number}`])) ?? clean(fields[`Tipo ${number}`]),
      range: normalizeAttackRange(clean(fields[`Alcance ${number}`])) ?? clean(fields[`Alcance ${number}`]),
    };
  }).filter((attack) => Object.values(attack).some(Boolean));
  const strength = attributes.for ?? 0;
  const maxLoad = Math.max(0, strength >= 0 ? 10 + 2 * strength : 10 + strength);

  return {
    supported: true,
    template: 'ficha-t20-editavel-v2',
    summary: {
      characterName: clean(fields['NOME DO PERSONAGEM']),
      playerName: clean(fields.JOGADOR),
      race: clean(fields['RAÇA']),
      origin: clean(fields.ORIGEM),
      characterClass: clean(fields.CLASSE),
      level,
      currentHealth,
      maxHealth,
      temporaryHealth,
      currentMana,
      maxMana,
      defense,
      attributes,
      defenses: { melee: defense, ranged: defense, calculation: defenseCalculation },
      skills,
      attacks,
      movement: clean(fields.Desloc),
      size: clean(fields.SeleTamanho),
      currentLoad: numberValue(fields.CargaTotal),
      maxLoad,
    },
    issues,
    fieldCount,
    checkedAt: Date.now(),
  };
};

const applyAutomaticFixes = (document: PDFDocument, validation: CharacterSheetValidation) => {
  const form = document.getForm();
  for (const issue of validation.issues) {
    if (!issue.autoFixable || !issue.field || issue.expected === undefined) continue;
    let expected = issue.expected;
    if (issue.id === 'range:current-health') expected = String(validation.summary.maxHealth ?? 0);
    if (issue.id === 'range:current-mana') expected = String(validation.summary.maxMana ?? 0);
    try {
      form.getTextField(issue.field).setText(expected);
    } catch {
      // A malformed field remains in the report instead of making the whole PDF unusable.
    }
  }
};

export const inspectCharacterSheetPdf = async (
  bytes: Uint8Array,
  automaticallyFix = false,
) => {
  const document = await PDFDocument.load(bytes, {
    ignoreEncryption: false,
    updateMetadata: false,
    throwOnInvalidObject: true,
  });
  const fields = readFieldValues(document);
  let validation = validateFields(fields, Object.keys(fields).length);
  if (!automaticallyFix || !validation.supported) {
    return { validation, bytes: null as Uint8Array | null };
  }
  applyAutomaticFixes(document, validation);
  const correctedBytes = await document.save({
    addDefaultPage: false,
    updateFieldAppearances: false,
    useObjectStreams: false,
  });
  validation = validateFields(readFieldValues(document), document.getForm().getFields().length);
  return { validation, bytes: correctedBytes };
};

const editorFields = (document: PDFDocument): CharacterSheetEditorField[] => {
  const values = readFieldValues(document);
  const fields = new Map(document.getForm().getFields().map((field) => [field.getName(), field]));
  const activeSpellRows = new Set<number>();
  for (let index = 1; index <= MAX_SPELL_ROWS; index += 1) {
    if (spellFields.some(([fieldName]) => (
      values[`BossBar.Magia.${index}.${fieldName}`]?.trim()
    ))) activeSpellRows.add(index);
  }
  if (activeSpellRows.size === 0 && values.Magias?.trim()) activeSpellRows.add(1);
  const activeAttackRows = new Set<number>(
    Array.from({ length: MIN_ATTACK_ROWS }, (_, index) => index + 1),
  );
  for (let index = MIN_ATTACK_ROWS + 1; index <= MAX_ATTACK_ROWS; index += 1) {
    if ([
      `Ataque ${index}`, `Bônus Atq ${index}`, `Dano ${index}`,
      `Crítico ${index}`, `Tipo ${index}`, `Alcance ${index}`,
      `BossBar.Ataque.${index}.MargemCritico`,
      `BossBar.Ataque.${index}.MultiplicadorCritico`,
    ].some((name) => values[name]?.trim())) activeAttackRows.add(index);
  }
  const activeItemRows = new Set<number>(
    Array.from({ length: MIN_ITEM_ROWS }, (_, index) => index + 1),
  );
  for (let index = 1; index <= MAX_ITEM_ROWS; index += 1) {
    const names = [
      index <= 15 ? `Item${index}` : `BossBar.Item.${index}.Nome`,
      `BossBar.Item.${index}.Quantidade`,
      index <= 15 ? `PesoItem${index}` : `BossBar.Item.${index}.Peso`,
    ];
    if (names.some((name) => values[name]?.trim())) activeItemRows.add(index);
  }
  const activeArmorRows = new Set<number>([1]);
  for (let index = 2; index <= MAX_ARMOR_ROWS; index += 1) {
    if (['Nome', 'Defesa', 'Penalidade'].some((fieldName) => (
      values[`BossBar.Armadura.${index}.${fieldName}`]?.trim()
    ))) activeArmorRows.add(index);
  }
  const activeShieldRows = new Set<number>([1]);
  for (let index = 2; index <= MAX_SHIELD_ROWS; index += 1) {
    if (['Nome', 'Defesa', 'Penalidade'].some((fieldName) => (
      values[`BossBar.Escudo.${index}.${fieldName}`]?.trim()
    ))) activeShieldRows.add(index);
  }
  return CHARACTER_SHEET_EDITOR_DESCRIPTORS.filter((descriptor) => {
    // This legacy metadata field is only exposed when an import needs repair.
    if (descriptor.name === 'JOGADOR' && values.JOGADOR?.trim()) return false;
    const attackMatch = /^Ataque (\d+)$/.exec(descriptor.group ?? '');
    if (attackMatch) return activeAttackRows.has(Number(attackMatch[1]));
    const spellMatch = /^BossBar\.Magia\.(\d+)\./.exec(descriptor.name);
    if (spellMatch) return activeSpellRows.has(Number(spellMatch[1]));
    const itemMatch = /^Item (\d+)$/.exec(descriptor.group ?? '');
    if (itemMatch) return activeItemRows.has(Number(itemMatch[1]));
    const armorMatch = /^Armadura (\d+)$/.exec(descriptor.group ?? '');
    if (armorMatch) return activeArmorRows.has(Number(armorMatch[1]));
    const shieldMatch = /^Escudo (\d+)$/.exec(descriptor.group ?? '');
    if (shieldMatch) return activeShieldRows.has(Number(shieldMatch[1]));
    return true;
  }).map((descriptor) => {
    const field = fields.get(descriptor.name);
    const base = {
      name: descriptor.name,
      label: descriptor.label,
      section: descriptor.section,
      ...(descriptor.group ? { group: descriptor.group } : {}),
      ...(descriptor.validation ? { validation: descriptor.validation } : {}),
    };
    const sourceValue = descriptor.valueFrom?.(values) ?? values[descriptor.name];
    const fallbackValue = sourceValue === undefined || sourceValue === ''
      ? descriptor.defaultValue ?? ''
      : sourceValue;
    try {
      if (field instanceof PDFTextField) {
        return { ...base, kind: 'text' as const, value: fallbackValue };
      }
      if (field instanceof PDFCheckBox) {
        return { ...base, kind: 'checkbox' as const, value: field.isChecked() ? 'Yes' : 'Off' };
      }
      if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
        return {
          ...base,
          kind: 'choice',
          value: field.getSelected()[0] ?? '',
          options: field.getOptions().slice(0, 100),
        } as CharacterSheetEditorField;
      }
      if (field instanceof PDFRadioGroup) {
        return {
          ...base,
          kind: 'choice',
          value: field.getSelected() ?? '',
          options: field.getOptions().slice(0, 100),
        } as CharacterSheetEditorField;
      }
    } catch {
      // A malformed widget remains editable as plain text in the semantic editor.
    }
    return { ...base, kind: 'text' as const, value: fallbackValue };
  });
};

export const readCharacterSheetEditorFields = async (bytes: Uint8Array) => {
  const document = await PDFDocument.load(bytes, {
    ignoreEncryption: false,
    updateMetadata: false,
    throwOnInvalidObject: true,
  });
  return editorFields(document);
};

export const applyCharacterSheetEditorFields = async (
  bytes: Uint8Array,
  updates: readonly CharacterSheetEditorField[],
) => {
  const invalidUpdate = validateCharacterSheetEditorUpdates(updates);
  if (invalidUpdate) throw new Error(invalidUpdate);
  const document = await PDFDocument.load(bytes, {
    ignoreEncryption: false,
    updateMetadata: false,
    throwOnInvalidObject: true,
  });
  const form = document.getForm();
  const originalValues = readFieldValues(document);
  const byName = new Map(updates.map((field) => [field.name, field]));
  for (const field of form.getFields()) {
    const update = byName.get(field.getName());
    if (!update) continue;
    const value = (/^Tipo \d+$/.test(update.name) ? normalizeDamageType(update.value) : /^Alcance \d+$/.test(update.name) ? normalizeAttackRange(update.value) : null) ?? update.value.slice(0, 2_000);
    try {
      if (field instanceof PDFTextField && update.kind === 'text') {
        field.setText(value);
      } else if (field instanceof PDFCheckBox && update.kind === 'checkbox') {
        if (value === 'Yes') field.check();
        else field.uncheck();
      } else if (
        (field instanceof PDFDropdown || field instanceof PDFOptionList) &&
        update.kind === 'choice' &&
        field.getOptions().includes(value)
      ) {
        field.select(value);
      } else if (
        field instanceof PDFRadioGroup &&
        update.kind === 'choice' &&
        field.getOptions().includes(value)
      ) {
        field.select(value);
      }
    } catch {
      // Unsupported/malformed fields are retained unchanged and remain visible
      // in validation instead of invalidating the complete player proposal.
    }
  }

  const existingNames = new Set(form.getFields().map((field) => field.getName()));
  for (const update of updates) {
    const descriptor = CHARACTER_SHEET_EDITOR_DESCRIPTOR_BY_NAME.get(update.name);
    const normalizedValue = update.value.trim();
    if (
      existingNames.has(update.name) ||
      !CHARACTER_SHEET_EDITOR_FIELD_NAMES.has(update.name) ||
      update.kind !== 'text' ||
      !normalizedValue ||
      normalizedValue === descriptor?.defaultValue
    ) continue;
    try {
      form.createTextField(update.name).setText(update.value.slice(0, 2_000));
      existingNames.add(update.name);
    } catch {
      // Supplemental BossBar fields never invalidate the original PDF.
    }
  }

  for (let index = 1; index <= MAX_ATTACK_ROWS; index += 1) {
    const marginFieldName = `BossBar.Ataque.${index}.MargemCritico`;
    const multiplierFieldName = `BossBar.Ataque.${index}.MultiplicadorCritico`;
    const margin = byName.get(marginFieldName)?.value.trim();
    const multiplier = byName
      .get(multiplierFieldName)
      ?.value.trim();
    if (margin === undefined && multiplier === undefined) continue;
    const criticalName = `Crítico ${index}`;
    let previousCritical = '';
    try {
      previousCritical = form.getTextField(criticalName).getText() ?? '';
    } catch {
      // The source PDF may not include every attack slot.
    }
    const attackConfigured = [
      `Ataque ${index}`,
      `Bônus Atq ${index}`,
      `Dano ${index}`,
    ].some((name) => Boolean(byName.get(name)?.value.trim()));
    if (
      !previousCritical.trim() &&
      !attackConfigured &&
      !existingNames.has(marginFieldName) &&
      !existingNames.has(multiplierFieldName)
    ) continue;
    if (!margin && !multiplier && !previousCritical.trim()) continue;
    const criticalValue = !margin && !multiplier
      ? ''
        : [margin || '20', `x${multiplier || '2'}`].join('/');
    try {
      form.getTextField(criticalName).setText(criticalValue);
    } catch {
      try {
        form.createTextField(criticalName).setText(criticalValue);
      } catch {
        // A malformed critical field remains unchanged.
      }
    }
  }

  const spells = Array.from({ length: MAX_SPELL_ROWS }, (_, zeroBasedIndex) => {
    const index = zeroBasedIndex + 1;
    return Object.fromEntries(spellFields.map(([fieldName, label]) => [
      label,
      byName.get(`BossBar.Magia.${index}.${fieldName}`)?.value.trim() ?? '',
    ]));
  }).filter((spell) => Object.values(spell).some(Boolean));
  const hadStructuredSpells = Object.keys(originalValues)
    .some((name) => name.startsWith('BossBar.Magia.'));
  const legacySpellText = originalValues.Magias?.trim() ?? '';
  const isUnchangedLegacySpell = !hadStructuredSpells && spells.length === 1 &&
    Object.entries(spells[0] ?? {}).every(([label, value]) => (
      label === 'Efeito' ? value === legacySpellText : !value
    ));
  if (!isUnchangedLegacySpell && (hadStructuredSpells || spells.length > 0)) {
    const serializedSpells = spells.map((spell) => Object.entries(spell)
      .filter(([, value]) => value)
      .map(([label, value]) => `${label}: ${value}`)
      .join(' | '))
      .join('\n');
    try {
      form.getTextField('Magias').setText(serializedSpells.slice(0, 8_000));
    } catch {
      // The structured BossBar fields remain authoritative when the source PDF has no legacy field.
    }
  }
  const updatedBytes = await document.save({
    addDefaultPage: false,
    updateFieldAppearances: true,
    useObjectStreams: false,
  });
  const validation = validateFields(
    readFieldValues(document),
    document.getForm().getFields().length,
  );
  return {
    bytes: updatedBytes,
    validation,
    fields: editorFields(document),
  };
};
