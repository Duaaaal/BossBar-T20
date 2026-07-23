import {
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
} from 'pdf-lib';
import type {
  CharacterSheetIssue,
  CharacterSheetSummary,
  CharacterSheetValidation,
} from '../shared/character-sheet.ts';

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
  maxMana: null, defense: null,
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
  const maxMana = integerValue(fields['PMs Totais']);
  const currentMana = integerValue(fields['PMs Atuais']);
  for (const [field, value] of [
    ['PVs Totais', maxHealth], ['PVs Atuais', currentHealth],
    ['PMs Totais', maxMana], ['PMs Atuais', currentMana],
  ] as const) {
    if (value !== null && value < 0) issues.push({
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
    const suffix = rule.code === '110' ? 11 : Number.parseInt(rule.code, 10) / 10;
    const halfField = rule.code === '300' ? '301' : `${String(suffix).padStart(2, '0')}1`;
    const trainingField = rule.code === '300' ? '303' : `${String(suffix).padStart(2, '0')}3`;
    const otherField = rule.code === '300' ? '304' : `${String(suffix).padStart(2, '0')}4`;
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
  const attacks = Array.from({ length: 5 }, (_, index) => {
    const number = index + 1;
    return {
      name: clean(fields[`Ataque ${number}`]),
      attackBonus: clean(fields[`Bônus Atq ${number}`]),
      damage: clean(fields[`Dano ${number}`]),
      critical: clean(fields[`Crítico ${number}`]),
      damageType: clean(fields[`Tipo ${number}`]),
      range: clean(fields[`Alcance ${number}`]),
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
