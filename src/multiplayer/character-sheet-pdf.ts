import { SKILL_EFFECTS_FIELD, parseSkillEffects, skillEffectIssues } from '../shared/skill-mechanics.ts';
import { catalogKey, T20_CATALOG } from '../shared/rules-catalog.ts';
import { createSkillCalculationContext } from '../shared/skill-test-context.ts';
import { SKILL_TRAINING_FIELD, skillTraining, synchronizeSkillTraining } from '../shared/skill-training.ts';
import { invalidNewTrainingBenefits } from '../shared/training-benefits.ts';
import { allSkillRules, characterSkillRules, skillDisplayName, skillComponentFields, trainingBonus, recalculateCharacterSkills, calculateCharacterSkills, initializeSkillEffects, skillImportIssues } from '../shared/character-skills.ts';
import { RESOURCE_AUTO_FIELD, characterResources, initializeAutomaticResources, recalculateCharacterResources } from '../shared/character-resources.ts';
import { characterClassIssues } from '../shared/character-classes.ts';
import { layoutEditableNimbExport, readExportContinuations, EXPORT_MANIFEST } from './character-sheet-export.ts';
import { normalizeSheetNumber } from '../shared/sheet-number.ts';
import {
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
  PDFName,
  PDFString,
  PDFHexString,
} from 'pdf-lib';
import type {
  CharacterSheetEditorField,
  CharacterSheetIssue,
  CharacterSheetSummary,
  CharacterSheetValidation,
} from '../shared/character-sheet.ts';
import { normalizeAttackRange, normalizeDamageType } from '../shared/attack-options.ts';
import { upgradeDefenseSources } from '../shared/defense-sources.ts';
import { armorPenaltyTotal, equipmentDefenseTotal, baseSpellManaCost, sheetDefenseTotal, sheetDefenseBreakdown } from '../shared/character-sheet-calculations.ts';
import { RD_FIELD, DAMAGE_ORIGINS, type DamageOrigin, damageReductionError, normalizeDamageReduction } from '../shared/damage-reduction.ts';
import { characterSize, raceSize, synchronizeCharacterSize } from '../shared/character-size.ts';
import { adjustmentFormula, attackSkillName, attackSkillTotal, equipmentKeys, equippedRows, inferredArmorAttributeLimit, upgradeSheetLoadout } from '../shared/character-sheet-loadout.ts';
import { parseDamageFormula } from '../shared/status.ts';
import { readNimbExtraPages } from './nimb-extra-pages.ts';
import { ABILITY_FIELDS, OLD_ABILITY_FIELDS, TEXT_CATALOG_VERSION_FIELD, sheetAbilities, sheetSpells, sheetContentIssues, upgradeSheetContent } from '../shared/character-sheet-content.ts';
import { INVENTORY_LOAD_VERSION_FIELD, affectsInventoryLoad, sheetInventoryLoad, recalculateInventoryLoad, upgradeInventoryLoad } from '../shared/character-sheet-inventory.ts';
import { canonicalSheetValues, isNimbSheet, isLegacySheet, nimbSheetValues, synchronizeNimbInventory, NIMB_SKILLS, SHEET_EXTRA_FIELD, SHEET_MODEL_VERSION, SHEET_RULES_VERSION, SHEET_TEXT_LIMIT } from './character-sheet-model.ts';
import { ATTRIBUTE_PLAN_FIELD, emptyAttributePlan, applyAttributePlan, attributePlanIssues, inferAttributePlan, reconcileImportedAttributePlan } from '../shared/character-attributes.ts';

type FieldValues = Record<string, string>;

const attributeFields = {
  for: 'ModFor',
  des: 'ModDes',
  con: 'ModCon',
  int: 'ModInt',
  sab: 'ModSab',
  car: 'ModCar',
} as const;

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
const MIN_ITEM_ROWS = 2;
const MAX_ITEM_ROWS = 100;
const MAX_ARMOR_ROWS = 20;
const MAX_SHIELD_ROWS = 20;
const spellFields = [
  ['Nome', 'Nome'],
  ['Circulo', 'Círculo'],
  ['Escola', 'Escola'],
  ['Execucao', 'Execução'],
  ['Alcance', 'Alcance'],
  ['Area', 'Área / Alvo'],
  ['Duracao', 'Duração'],
  ['Resistencia', 'Resistência'],
  ['Custo', 'Custo (PM)'],
  ['Efeito', 'Efeito'],
] as const;

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

  descriptors.push(editorField(RESOURCE_AUTO_FIELD, 'Recursos', 'Atributos', undefined, undefined, { validation: textValidation(1000) }));
  descriptors.push(editorField(SKILL_EFFECTS_FIELD, 'Efeitos nas perícias', 'Perícias', undefined, undefined, { validation: textValidation(100_000) }),
    editorField(SKILL_TRAINING_FIELD, 'Fontes de treinamento', 'Perícias', undefined, undefined, { defaultValue: '', validation: textValidation(30_000) }));
  descriptors.push(editorField(ATTRIBUTE_PLAN_FIELD, 'Distribuição', 'Atributos', undefined, undefined, { defaultValue: JSON.stringify(emptyAttributePlan()), validation: textValidation(20_000) }));
  for (const [, label, modifierName] of [
    ['For', 'Força', 'ModFor'],
    ['Des', 'Destreza', 'ModDes'],
    ['Con', 'Constituição', 'ModCon'],
    ['Int', 'Inteligência', 'ModInt'],
    ['Sab', 'Sabedoria', 'ModSab'],
    ['Car', 'Carisma', 'ModCar'],
  ] as const) {
    descriptors.push(
      editorField(modifierName, label, 'Atributos', undefined, undefined, {
        validation: integerValidation(-99, 99),
      }),
    );
  }

  descriptors.push(
    editorField('SeleAtribDefe', 'Atributo-chave', 'Defesa'),
    editorField('arm pesa', 'Atributo completo', 'Defesa'),
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

  for (const rule of allSkillRules) {
    const components = skillComponentFields(rule);
    if (rule.nameField) descriptors.push(editorField(rule.nameField, 'Nome', 'Perícias', rule.name));
    descriptors.push(
      editorField(rule.trainedField, 'Treinada', 'Perícias', rule.name),
      editorField(rule.modifierField.replace('ModAtrib', 'SeleAtrib'), 'Atributo-chave', 'Perícias', rule.name),
      editorField(components.halfLevel, '1/2 do nível', 'Perícias', rule.name, undefined, {
        validation: integerValidation(-99, 99),
      }),
      editorField(rule.modifierField, 'Atributo', 'Perícias', rule.name, undefined, {
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
      editorField(`BossBar.Ataque.${index}.Principal`, 'Principal', 'Ataques', group),
      editorField(`BossBar.Ataque.${index}.DuasArmas`, 'Duas armas', 'Ataques', group),
      editorField(`Ataque ${index}`, 'Arma', 'Ataques', group),
      editorField(`BossBar.Ataque.${index}.Pericia`, 'Perícia', 'Ataques', group, (values) => attackSkillName(values, index)),
      editorField(`BossBar.Ataque.${index}.Base`, 'Teste de ataque', 'Ataques', group, (values) => attackSkillTotal(values, index)),
      editorField(`BossBar.Ataque.${index}.Ajuste`, 'Ajuste de ataque', 'Ataques', group, undefined, { defaultValue: '0', validation: formulaValidation() }),
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
        'Multiplicador',
        'Ataques',
        group,
        (values) => values[multiplierField] ?? parseCritical(values[criticalField]).multiplier,
        { defaultValue: '2', validation: integerValidation(1, 20) },
      ),
      editorField(`Tipo ${index}`, 'Tipo', 'Ataques', group),
      editorField(`BossBar.Ataque.${index}.Origem`, 'Origem', 'Ataques', group),
      editorField(`BossBar.Ataque.${index}.Segunda.Origem`, 'Origem', 'Ataques', group),
      editorField(`Alcance ${index}`, 'Alcance', 'Ataques', group),
      editorField(`BossBar.Ataque.${index}.TesteTotal`, 'Bônus total', 'Ataques', group, (values) =>
        values[`BossBar.Ataque.${index}.TesteTotal`] ?? (values['BossBar.Source'] === 'nimb' && !values['BossBar.MigratedFrom'] ? 'Yes' : 'Off')),
      editorField(`BossBar.Ataque.${index}.DanoAlternativo`, 'Dano alternativo', 'Ataques', group, undefined, { validation: formulaValidation() }),
    );
    for (const [suffix, label] of [['Nome', 'Arma'], ['Pericia', 'Perícia'], ['Base', 'Teste de ataque'], ['Ajuste', 'Ajuste de ataque'], ['Dano', 'Dano'], ['MargemCritico', 'Margem de crítico'], ['MultiplicadorCritico', 'Multiplicador'], ['Tipo', 'Tipo'], ['Alcance', 'Alcance']] as const) {
      const prefix = `BossBar.Ataque.${index}.Segunda`;
      descriptors.push(editorField(`${prefix}.${suffix}`, label, 'Ataques', group,
        suffix === 'Base' ? (values) => attackSkillTotal(values, index, true)
          : suffix === 'Pericia' ? (values) => attackSkillName(values, index, true)
            : suffix === 'MargemCritico' ? (values) => values[`${prefix}.MargemCritico`] || parseCritical(values[`${prefix}.Critico`]).margin
              : suffix === 'MultiplicadorCritico' ? (values) => values[`${prefix}.MultiplicadorCritico`] || parseCritical(values[`${prefix}.Critico`]).multiplier : undefined,
        suffix === 'Ajuste' || suffix === 'Dano' ? { validation: formulaValidation(), ...(suffix === 'Ajuste' ? { defaultValue: '0' } : {}) }
          : suffix === 'MargemCritico' ? { defaultValue: '20', validation: integerValidation(2, 20) }
            : suffix === 'MultiplicadorCritico' ? { defaultValue: '2', validation: integerValidation(1, 20) } : undefined));
    }
    descriptors.push(editorField(`BossBar.Ataque.${index}.Informacoes`, 'Informações adicionais', 'Ataques', group, undefined, { validation: textValidation(SHEET_TEXT_LIMIT) }));
  }

  descriptors.push(
    editorField('ModAtribDefe', 'Atributo para Defesa', 'Defesa', undefined, undefined, { validation: integerValidation(-999, 999) }),
    editorField('B.Arm', 'Bônus de armadura', 'Defesa', undefined, undefined, { validation: integerValidation(-999, 1998) }),
    editorField('B.Esc', 'Bônus de escudo', 'Defesa', undefined, undefined, { validation: integerValidation(-999, 1998) }),
    editorField('Outros B.CA', 'Outros', 'Defesa', undefined, undefined, { validation: integerValidation(-999, 999) }),
    editorField('CA', 'Total', 'Defesa', undefined, undefined, { validation: integerValidation(0, 999) }),
    editorField('Proficiências', 'Proficiências', 'Proficiências'),
  );

  for (let index = 1; index <= MAX_ARMOR_ROWS; index += 1) {
    const group = `Armadura ${index}`;
    descriptors.push(
      editorField(`BossBar.Armadura.${index}.Equipado`, 'Equipada', 'Armadura e escudo', group),
      editorField(index === 1 ? 'Armadura' : `BossBar.Armadura.${index}.Nome`, 'Nome', 'Armadura e escudo', group),
      editorField(`BossBar.Armadura.${index}.Informacoes`, 'Informações adicionais', 'Armadura e escudo', group, undefined, { validation: textValidation(SHEET_TEXT_LIMIT) }),
      editorField(`BossBar.Armadura.${index}.LimiteAtributo`, 'Limite do atributo', 'Armadura e escudo', group, undefined, { validation: integerValidation(0, 99) }),
      editorField(`BossBar.Armadura.${index}.LimiteManual`, 'Limite revisado manualmente', 'Armadura e escudo', group),
      editorField(index === 1 ? 'B.Arm1' : `BossBar.Armadura.${index}.Defesa`, 'Defesa', 'Armadura e escudo', group, undefined, {
        validation: integerValidation(0, 999),
      }),
      editorField(index === 1 ? 'Pa' : `BossBar.Armadura.${index}.Penalidade`, 'Penalidade', 'Armadura e escudo', group, undefined, {
        validation: integerValidation(-99, 99),
      }),
      editorField(`BossBar.Armadura.${index}.OutrosDefesa`, 'Outros: Defesa', 'Armadura e escudo', group, undefined, { defaultValue: '0', validation: integerValidation(-999, 999) }),
      editorField(`BossBar.Armadura.${index}.OutrosPenalidade`, 'Outros: Penalidade', 'Armadura e escudo', group, undefined, { defaultValue: '0', validation: integerValidation(-99, 99) }),
    );
  }
  for (let index = 1; index <= MAX_SHIELD_ROWS; index += 1) {
    const group = `Escudo ${index}`;
    descriptors.push(
      editorField(`BossBar.Escudo.${index}.Equipado`, 'Equipado', 'Armadura e escudo', group),
      editorField(index === 1 ? 'Escudo' : `BossBar.Escudo.${index}.Nome`, 'Nome', 'Armadura e escudo', group),
      editorField(`BossBar.Escudo.${index}.Informacoes`, 'Informações adicionais', 'Armadura e escudo', group, undefined, { validation: textValidation(SHEET_TEXT_LIMIT) }),
      editorField(index === 1 ? 'B.Esc2' : `BossBar.Escudo.${index}.Defesa`, 'Defesa', 'Armadura e escudo', group, undefined, {
        validation: integerValidation(0, 999),
      }),
      editorField(index === 1 ? 'Pe' : `BossBar.Escudo.${index}.Penalidade`, 'Penalidade', 'Armadura e escudo', group, undefined, {
        validation: integerValidation(-99, 99),
      }),
      editorField(`BossBar.Escudo.${index}.OutrosDefesa`, 'Outros: Defesa', 'Armadura e escudo', group, undefined, { defaultValue: '0', validation: integerValidation(-999, 999) }),
      editorField(`BossBar.Escudo.${index}.OutrosPenalidade`, 'Outros: Penalidade', 'Armadura e escudo', group, undefined, { defaultValue: '0', validation: integerValidation(-99, 99) }),
    );
  }

  descriptors.push(
    editorField(RD_FIELD, 'Redução de dano', 'Defesa', undefined, undefined, { defaultValue: '{"version":1,"entries":[]}', validation: textValidation(40000) }),
    editorField('SeleTamanho', 'Tamanho', 'Características'),
    editorField('ModFurtTam', 'Tamanho em Furtividade', 'Características', undefined, undefined, { validation: integerValidation(-10, 5) }),
    editorField(
      'Exp',
      'Pontos de experiência',
      'Características',
      undefined,
      undefined,
      { defaultValue: '0', validation: integerValidation(0, 1_000_000_000) },
    ),
    editorField('Desloc', 'Deslocamento', 'Características'),
    editorField('BossBar.ManobrasTamanho', 'Tamanho em manobras', 'Características', undefined, undefined, { validation: integerValidation(-99, 99) }),
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
        'Espaços',
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
    editorField('ModAtribMagia', 'Atributo para CD', 'Magias', undefined, undefined, { validation: integerValidation(-99, 99) }),
    editorField('BossBar.CdOutros', 'Outros bônus de CD', 'Magias', undefined, undefined, { defaultValue: '0', validation: integerValidation(-999, 999) }),
    editorField('TesteResist', 'CD de magia', 'Magias', undefined, undefined, { validation: integerValidation(0, 9999) }),
    // Accept this identifier from older clients, but merge it into spell notes.
    editorField('BossBar.CdJustificativa', 'Origem dos outros bônus de CD', 'Magias', undefined, undefined, { validation: textValidation(2_000) }),
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
          ? (values) => values[name] ?? (values[TEXT_CATALOG_VERSION_FIELD] ? '' : values.Magias) ?? ''
          : undefined,
        { validation: fieldName === 'Circulo' ? integerValidation(1, 5) : fieldName === 'Custo' ? integerValidation(0, 999) : textValidation(fieldName === 'Efeito' ? SHEET_TEXT_LIMIT : 160) },
      ));
    }
  }
  descriptors.push(
    ...ABILITY_FIELDS.map(([, name, label]) => editorField(name, label, 'Habilidades', undefined, undefined, { validation: textValidation(SHEET_TEXT_LIMIT) })),
    editorField('Descrição', 'Descrição', 'Descrição', undefined, undefined, {
      validation: textValidation(SHEET_TEXT_LIMIT),
    }),
    editorField('HabRaçasOrigem', 'Habilidades de raça e origem', 'Habilidades', undefined, undefined, { validation: textValidation(SHEET_TEXT_LIMIT) }),
    editorField('HabClassePoderes', 'Habilidades de classe e poderes', 'Habilidades', undefined, undefined, { validation: textValidation(SHEET_TEXT_LIMIT) }),
    editorField('BossBar.Nimb.Habilidades', 'Habilidades e poderes importados', 'Habilidades', undefined, undefined, { validation: textValidation(SHEET_TEXT_LIMIT) }),
    editorField('BossBar.Nimb.Anotacoes', 'Anotações da ficha', 'Descrição', undefined, undefined, { validation: textValidation(SHEET_TEXT_LIMIT) }),
    editorField('BossBar.Nimb.MagiasAdicionais', 'Anotações para Magias', 'Magias', undefined, undefined, { validation: textValidation(SHEET_TEXT_LIMIT) }),
    editorField('BossBar.Nimb.Equipamento', 'Equipamento importado', 'Itens', undefined, undefined, { validation: textValidation(SHEET_TEXT_LIMIT) }),
    editorField('BossBar.Nimb.Equipamento2', 'Equipamento adicional', 'Itens', undefined, undefined, { validation: textValidation(SHEET_TEXT_LIMIT) }),
    editorField('BossBar.Nimb.EntreAventuras', 'Entre aventuras', 'Características'),
    editorField('BossBar.Nimb.PaginasAdicionais', 'Informações complementares', 'Características', undefined, undefined, { validation: textValidation(SHEET_TEXT_LIMIT) }),
    editorField('BossBar.Tibares', 'Tibares', 'Itens', undefined, undefined, { validation: decimalValidation(0, 1_000_000_000) }),
    editorField('BossBar.TibaresOuro', 'Tibares de ouro', 'Itens', undefined, undefined, { validation: decimalValidation(0, 1_000_000_000) }),
    editorField('BossBar.MoedaPersonalizada.Nome', 'Nome da moeda', 'Itens', undefined, undefined, { validation: textValidation(40) }),
    editorField('BossBar.MoedaPersonalizada.Quantidade', 'Quantidade', 'Itens', undefined, undefined, { defaultValue: '0', validation: decimalValidation(0, 1_000_000_000) }),
    editorField('BossBar.PenalidadeArmadura', 'Penalidade total', 'Armadura e escudo', undefined, undefined, { validation: integerValidation(0, 396) }),
    editorField('BossBar.LimiteAtributoDefesa', 'Limite do atributo', 'Defesa', undefined, undefined, { validation: integerValidation(0, 99) }),
    editorField('BossBar.DefesaJustificativa', 'Origem dos outros bônus de Defesa', 'Defesa', undefined, undefined, { validation: textValidation(2_000) }),
    editorField('BossBar.CargaRevisada', 'Revisei o equipamento e confirmei a carga em espaços', 'Itens', 'Carga'),
  );
  return descriptors;
};

const CHARACTER_SHEET_EDITOR_DESCRIPTORS = characterSheetEditorDescriptors();
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
    if (typeof update.value !== 'string') return `${descriptor.section} → ${descriptor.label}: o valor informado é inválido.`;
    const value = update.value.trim();
    const validation = descriptor.validation;
    if (value && /^Tipo \d+$|\.Segunda\.Tipo$/.test(update.name) && !normalizeDamageType(value)) return `${descriptor.group}: selecione um tipo de dano reconhecido.`;
    if (value && /^Alcance \d+$|\.Segunda\.Alcance$/.test(update.name) && !normalizeAttackRange(value)) return `${descriptor.group}: selecione um alcance reconhecido.`;
    if (value && /\.(Equipado|Principal|DuasArmas)$/.test(update.name) && !['Yes', 'Off'].includes(value)) return `${descriptor.group}: seleção inválida em ${descriptor.label}.`;
    if (value && /^BossBar\.Ataque\.\d+\.(Segunda\.)?Pericia$/.test(update.name) && !['Luta', 'Pontaria'].includes(value)) return `${descriptor.group}: escolha Luta ou Pontaria.`;
    if (!value || !validation) continue;
    if (validation.maxLength !== undefined && value.length > validation.maxLength) {
      return `${descriptor.label} aceita no máximo ${validation.maxLength} caracteres.`;
    }
    const fixedFormula = /^[+-]?\d+$/.test(value) && Math.abs(Number(value)) <= 1_000_000;
    if (validation.kind === 'formula' && (!DICE_FORMULA_PATTERN.test(value) || (!fixedFormula && !parseDamageFormula(/\.Ajuste$/.test(update.name) ? adjustmentFormula(value) : value)))) {
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

const normalizeRuleName = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLocaleLowerCase('pt-BR');

const readTextFieldValue = (field: PDFTextField): string => {
  try { return field.getText() ?? ''; } catch (error) {
    if (!field.isRichFormatted()) throw error;
    const rich = field.acroField.dict.lookup(PDFName.of('RV'));
    if (!(rich instanceof PDFString) && !(rich instanceof PDFHexString)) return '';
    return rich.decodeText().replace(/<\/(?:p|div)>/gi, '\n').replace(/<br\s*\/?\s*>/gi, '\n')
      .replace(/<[^>]*>/g, '').replace(/&(amp|lt|gt|quot|apos);/g, (_, entity: string) =>
        ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[entity] ?? '').trim();
  }
};

const readRawFieldValues = (document: PDFDocument) => {
  const values: FieldValues = {};
  for (const field of document.getForm().getFields()) {
    try {
      if (field instanceof PDFTextField) values[field.getName()] = readTextFieldValue(field);
      else if (field instanceof PDFCheckBox) {
        // Hidden checkboxes may have no widget. pdf-lib writes their value but
        // isChecked() only compares appearance states from a widget.
        const checked = field.isChecked() || (!field.acroField.getWidgets().length && field.acroField.getValue().decodeText() !== 'Off');
        values[field.getName()] = checked ? 'Yes' : 'Off';
      }
      else if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
        values[field.getName()] = field.getSelected()[0] ?? '';
      } else if (field instanceof PDFRadioGroup) values[field.getName()] = field.getSelected() ?? '';
    } catch {
      values[field.getName()] = '';
    }
  }
  return readExportContinuations(values);
};
const readFieldValues = (document: PDFDocument) => {
  const raw = readRawFieldValues(document);
  if (raw[SHEET_EXTRA_FIELD]) {
    try {
      const extra: unknown = JSON.parse(raw[SHEET_EXTRA_FIELD]);
      if (!extra || typeof extra !== 'object' || Array.isArray(extra)) throw new Error('Formato inválido');
      if (Object.entries(extra).some(([key, value]) => key.length > 180 || typeof value !== 'string' || value.length > SHEET_TEXT_LIMIT)) throw new Error('Campo adicional inválido');
    } catch { throw new Error('Os dados adicionais desta ficha estão corrompidos. Revise a cópia anterior ou recrie a ficha usando o modelo vazio.'); }
  }
  const values = canonicalSheetValues(raw);
  for (const descriptor of CHARACTER_SHEET_EDITOR_DESCRIPTORS) {
    if (['integer', 'decimal', 'formula'].includes(descriptor.validation?.kind ?? '') && values[descriptor.name] !== undefined) values[descriptor.name] = normalizeSheetNumber(values[descriptor.name]);
  }
  const size = characterSize(values.SeleTamanho?.trim() || raceSize(values['RAÇA']||'')?.name || '');
  // Old sheets did not have a maneuver field. Fill only absent derived terms;
  // conflicting imported values remain visible to validation and review.
  if (size) {
    values.SeleTamanho=size.name;
    if (!values.ModFurtTam?.trim()) values.ModFurtTam = String(size.stealth);
    if (!values['BossBar.ManobrasTamanho']?.trim()) values['BossBar.ManobrasTamanho'] = String(size.maneuvers);
  }
  if (isNimbSheet(raw) && document.getPageCount() > Math.max(3, Number(values['BossBar.Export.PageCount']) || 0) && !('BossBar.Nimb.PaginasAdicionais' in values)) {
    const extra = readNimbExtraPages(document);
    values['BossBar.Nimb.PaginasAdicionais'] = extra.text;
    if (extra.unread.length) values['BossBar.Import.PaginasRevisar'] = [...new Set(extra.unread)].join(', ');
  }
  if (isNimbSheet(raw) || isLegacySheet(raw)) upgradeSheetContent(values);
  upgradeInventoryLoad(values);
  reconcileImportedAttributePlan(values);
  upgradeDefenseSources(values);
  synchronizeSkillTraining(values);
  initializeSkillEffects(values, Boolean(values[RESOURCE_AUTO_FIELD]));
  const passivePlan=parseSkillEffects(values[SKILL_EFFECTS_FIELD]);
  if(Object.keys(passivePlan.active).length){passivePlan.active={};values[SKILL_EFFECTS_FIELD]=JSON.stringify(passivePlan);}
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

const validateFields = (fields: FieldValues, fieldCount: number): CharacterSheetValidation => {
  const nimb = fields['BossBar.Source'] === 'nimb';
  const supported = isLegacySheet(fields);
  if (!supported) {
    return {
      supported: false,
      template: 'unknown',
      summary: emptySummary(),
      issues: [{
        id: 'unsupported-template',
        severity: 'error',
        field: null,
        message: 'O PDF não contém os campos de uma ficha editável do Nimb ou do modelo antigo do BossBar. Baixe a ficha vazia e use-a como modelo.',
        autoFixable: false,
      }],
      fieldCount,
      checkedAt: Date.now(),
    };
  }

  const issues: CharacterSheetIssue[] = [];
  if (fields['BossBar.Import.ExportReview']) issues.push({ id: 'review:export-text', field: 'BossBar.Nimb.Anotacoes', severity: 'warning', autoFixable: false, message: fields['BossBar.Import.ExportReview'] });
  if (fields['BossBar.Import.PaginasRevisar']) issues.push({ id: 'review:extra-pages', field: 'BossBar.Nimb.PaginasAdicionais', severity: 'warning', autoFixable: false,
    message: `As páginas ${fields['BossBar.Import.PaginasRevisar']} usam texto ou imagens que não puderam ser reconhecidos automaticamente. As páginas foram preservadas no PDF. Consulte a ficha e transcreva os dados necessários em Anotações.`,
  });
  for (const descriptor of CHARACTER_SHEET_EDITOR_DESCRIPTORS) {
    // The old attribute scale is intentionally ignored; JdA uses ModFor, etc.
    if (['For', 'Des', 'Con', 'Int', 'Sab', 'Car'].includes(descriptor.name)) continue;
    if (/^Bônus Atq \d+$|\.(TesteTotal|DanoAlternativo)$/.test(descriptor.name)) continue;
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
  // The account identifies the player; Nimb exports legitimately leave this blank.
  addRequiredIssue(issues, fields, 'RAÇA', 'a raça');
  if (!/^(golem|mashin)/.test(catalogKey(fields['RAÇA'] || ''))) addRequiredIssue(issues, fields, 'ORIGEM', 'a origem');
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
        message: `O atributo ${CHARACTER_SHEET_EDITOR_DESCRIPTOR_BY_NAME.get(modifierField)?.label ?? modifierField} precisa ser um número inteiro.`, autoFixable: false,
      });
    }
  }

  if (!nimb) issues.push({
    id: 'template:legacy-attribute-scale',
    severity: 'warning',
    field: null,
    message: 'Modelo antigo: os antigos campos de modificador são os atributos do Jogo do Ano. A migração preserva esses valores no layout Nimb.',
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

  const className = normalizeRuleName(clean(fields.CLASSE)).replace(/\s+\d+\s*$/, '');
  const resources = characterResources(fields);
  if (resources) {
    for (const [kind, field, actual, label] of [['health', 'PVs Totais', maxHealth, 'PV'], ['mana', 'PMs Totais', maxMana, 'PM']] as const) {
      const expected = resources[kind];
      if (expected !== null && actual !== expected) issues.push({ id: `manual:class-${kind}`, severity: 'warning', field,
        message: `Os ${label} máximos diferem da progressão da classe e das fontes identificadas. Outras fontes podem justificar o valor.`,
        expected: String(expected), actual: actual === null ? '' : String(actual), autoFixable: false });
    }
    for (const [index, message] of resources.unresolved.entries()) issues.push({ id: `manual:resource-source:${index}`, severity: 'warning', field: 'SeleAtribMagia', message, autoFixable: false });
  }

  const validLevel = level ?? 1;
  if (fields[RD_FIELD]?.trim()) {
    let reason: string | null;
    try { reason = damageReductionError(JSON.parse(fields[RD_FIELD])); } catch { reason = 'A configuração de RD contém dados inválidos. Abra Redução de dano, em Defesa, e revise as fontes.'; }
    if (reason) issues.push({ id: 'invalid:rd', field: RD_FIELD, severity: 'error', autoFixable: false, message: reason });
  }
  const size = characterSize(fields.SeleTamanho ?? '');
  if (size) {
    addFormulaIssue(issues, 'ModFurtTam', numberValue(fields.ModFurtTam), size.stealth, 'O modificador de tamanho em Furtividade');
    addFormulaIssue(issues, 'BossBar.ManobrasTamanho', numberValue(fields['BossBar.ManobrasTamanho']), size.maneuvers, 'O modificador de tamanho em manobras');
  } else if (fields.SeleTamanho?.trim()) issues.push({ id: 'invalid:size', field: 'SeleTamanho', severity: 'warning', autoFixable: false, message: 'O tamanho não corresponde às seis categorias do Livro Básico. Selecione o tamanho em Características para atualizar Furtividade e manobras.' });
  else if(raceSize(fields['RAÇA']||'')?.choices)issues.push({id:'required:size',field:'SeleTamanho',severity:'error',autoFixable:false,message:`Escolha o tamanho do personagem: ${raceSize(fields['RAÇA'])!.choices!.join(', ')}. Esta raça permite escolher seu tamanho.`});
  const halfLevel = Math.floor(validLevel / 2);
  const skills: CharacterSheetSummary['skills'] = [];
  const skillCalculations = calculateCharacterSkills(fields);
  for (const rule of characterSkillRules(fields)) {
    const calculated = skillCalculations.get(rule.code)!;
    const components = skillComponentFields(rule);
    const halfField = components.halfLevel;
    const trainingField = components.training;
    const otherField = components.other;
    const trained = calculated.trained;
    const expectedTraining = trainingBonus(validLevel, trained);
    if (level !== null && level >= 1 && level <= 20) {
      addFormulaIssue(issues, halfField, integerValue(fields[halfField]), calculated.halfLevel, `A metade do nível em ${rule.name}`);
      addFormulaIssue(issues, trainingField, integerValue(fields[trainingField]), expectedTraining, `O treino em ${rule.name}`);
    }
    const attributeValue = calculated.attributeValue;
    const otherBonus = calculated.other;
    const sizeModifier = numericOrZero(fields[rule.sizeModifierField ?? '']);
    const armorPenalty = calculated.penalty;
    const expectedTotal = calculated.total;
    if (fields[`BossBar.Migration.Attribute.${rule.code}`] !== undefined) {
      issues.push({ id: `migration:attribute:${rule.code}`, field: rule.modifierField.replace('ModAtrib', 'SeleAtrib'), severity: 'warning', message: `${rule.name}: o atributo-chave não estava identificado na ficha antiga. O bônus original foi preservado; selecione o atributo correto para concluir a revisão.`, autoFixable: false });
    }
    if (level !== null && level >= 1 && level <= 20 && numberValue(fields[rule.modifierField]) !== null &&
      !issues.some((issue) => issue.id.startsWith('invalid:') && [rule.modifierField, otherField, rule.sizeModifierField, 'BossBar.PenalidadeArmadura', 'Pa', 'Pe'].includes(issue.field ?? ''))) {
      addFormulaIssue(issues, rule.code, numberValue(fields[rule.code]), expectedTotal, `O total de ${rule.name}`);
    }
    const total = numberValue(fields[rule.code]);
    const attribute = calculated.attribute;
    skills.push({
      id: rule.code,
      name: skillDisplayName(rule, fields),
      total,
      trained,
      trainedOnly: calculated.trainedOnly,
      bonusDice: calculated.dice, rollMode: calculated.roll, sources: calculated.sources, replacement: calculated.replacement,
      attribute,
      attributeValue,
      halfLevel: calculated.halfLevel,
      trainingBonus: expectedTraining,
      otherBonus,
      armorPenalty,
      sizeModifier,
      calculation: `${attributeValue} (${attribute}) + ${calculated.halfLevel} (metade do nível) + ${expectedTraining} (treino) + ${otherBonus} (outros) + ${sizeModifier} (tamanho) - ${armorPenalty} (penalidade)${calculated.sources.filter(s=>s.amount).map(s=>` + ${s.amount} (${s.name})`).join('')} = ${expectedTotal}${total !== null && total !== expectedTotal ? `. Total informado: ${total}.` : ''}${calculated.trainedOnly && !trained ? '. Exige treinamento para usar.' : ''}`,
    });
  }

  const expectedDefense = sheetDefenseTotal(fields);
  if (numberValue(fields.ModAtribDefe) !== null &&
    !issues.some((issue) => issue.id.startsWith('invalid:') && ['B.Arm', 'B.Esc', 'Outros B.CA', 'BossBar.LimiteAtributoDefesa'].includes(issue.field ?? ''))) {
    addFormulaIssue(issues, 'CA', numberValue(fields.CA), expectedDefense, 'A Defesa');
  }
  const expectedSpellDc = 10 + numericOrZero(fields.ModAtribMagia) + halfLevel + numericOrZero(fields['BossBar.CdOutros']);
  if (level !== null && level >= 1 && level <= 20 && numberValue(fields.ModAtribMagia) !== null) {
    addFormulaIssue(issues, 'TesteResist', numberValue(fields.TesteResist), expectedSpellDc, 'A CD de magia');
  }
  if (['clerigo', 'druida', 'arcanista', 'bardo'].includes(className) || fields.Magias?.trim()) {
    const attributeKey = clean(fields.SeleAtribMagia).toLowerCase().replace(/^mod/, '') as keyof CharacterSheetSummary['attributes'];
    if (attributes[attributeKey] !== undefined && attributes[attributeKey] !== null) addFormulaIssue(issues, 'ModAtribMagia', numberValue(fields.ModAtribMagia), attributes[attributeKey], 'O atributo-chave da CD de magia');
  }
  if (fields['BossBar.Import.DefesaSemOrigem'] && !fields['BossBar.DefesaJustificativa']?.trim()) issues.push({
    id: 'review:defense-origin', field: 'BossBar.DefesaJustificativa', severity: 'warning', autoFixable: false,
    message: `A Defesa importada inclui ${fields['BossBar.Import.DefesaSemOrigem']} em outros bônus sem origem identificada. O total foi preservado. Informe a habilidade, item ou regra que justifica esse bônus.`,
  });
  if (fields['BossBar.Import.CdSemOrigem'] && !fields['BossBar.Nimb.MagiasAdicionais']?.trim()) issues.push({
    id: 'review:spell-dc-origin', field: 'BossBar.Nimb.MagiasAdicionais', severity: 'warning', autoFixable: false,
    message: `A CD importada inclui ${fields['BossBar.Import.CdSemOrigem']} em outros bônus sem origem identificada. O total foi preservado. Registre a origem do bônus em Anotações para Magias.`,
  });
  for (const suffix of ['Defe', 'Magia']) {
    if (`BossBar.Migration.Attribute.${suffix}` in fields) issues.push({ id: `migration:attribute:${suffix}`, field: `SeleAtrib${suffix}`, severity: 'warning', autoFixable: false,
      message: `O atributo-chave de ${suffix === 'Defe' ? 'Defesa' : 'magia'} não estava identificado ou não correspondia ao bônus antigo. O valor original foi preservado. Selecione o atributo correto.`,
    });
  }
  if (fields['BossBar.Import.InventarioRevisar']) issues.push({ id: 'review:inventory', field: 'CargaTotal', severity: 'warning', autoFixable: false, message: fields['BossBar.Import.InventarioRevisar'] });
  const inventoryLoad = sheetInventoryLoad(fields);
  if (fields[INVENTORY_LOAD_VERSION_FIELD] === '1' && inventoryLoad.total !== null && numberValue(fields.CargaTotal) !== inventoryLoad.total) issues.push({
    id: 'calculation:load', field: 'CargaTotal', severity: 'warning', autoFixable: true, expected: String(inventoryLoad.total), actual: fields.CargaTotal,
    message: 'A carga soma as unidades não equipadas dos itens e as moedas. Pela regra da mesa, a armadura, o escudo e as armas do ataque principal selecionados não contam; cópias extras continuam contando.',
  });
  for (const reason of inventoryLoad.reasons.filter((reason) => reason.startsWith('Há cópias'))) issues.push({ id: 'review:equipped-load', field: 'CargaTotal', severity: 'warning', autoFixable: false, message: `${reason} A carga anterior foi preservada.` });
  for (let index = 1; index <= MAX_ITEM_ROWS; index++) {
    const name = fields[index <= 15 ? `Item${index}` : `BossBar.Item.${index}.Nome`];
    const spaces = index <= 15 ? `PesoItem${index}` : `BossBar.Item.${index}.Peso`;
    if (name?.trim() && !fields[spaces]?.trim() && inventoryLoad.items.find((item) => item.index === index)?.carried !== 0) issues.push({ id: `review:item-spaces:${index}`, field: spaces, severity: 'warning', autoFixable: false,
      message: `Informe os espaços por unidade de ${name}. A linha foi preservada como item; a carga atual permanece até a revisão.` });
  }
  if (numericOrZero(fields['BossBar.MoedaPersonalizada.Quantidade']) > 0 && !fields['BossBar.MoedaPersonalizada.Nome']?.trim()) issues.push({ id: 'required:custom-currency-name', field: 'BossBar.MoedaPersonalizada.Nome', severity: 'error', autoFixable: false, message: 'Informe o nome da moeda personalizada que possui quantidade.' });
  for (let index = 1; index <= MAX_SPELL_ROWS; index++) {
    const prefix = `BossBar.Magia.${index}`;
    if (!fields[`${prefix}.Nome`]?.trim()) continue;
    const baseCost = baseSpellManaCost(fields[`${prefix}.Circulo`] ?? '');
    if (baseCost === null) issues.push({ id: `review:spell-circle:${index}`, field: `${prefix}.Circulo`, severity: 'warning', autoFixable: false, message: 'Informe o círculo da magia para consultar seu custo base (Livro Básico, p. 170).' });
    else if (numberValue(fields[`${prefix}.Custo`]) !== baseCost) issues.push({ id: `review:spell-cost:${index}`, field: `${prefix}.Custo`, severity: 'warning', autoFixable: true, expected: String(baseCost), actual: fields[`${prefix}.Custo`], message: `O custo-base do ${fields[`${prefix}.Circulo`]}º círculo é ${baseCost} PM. Reduções e ajustes devem ser registrados em Anotações para Magias.` });
  }
  issues.push(...sheetContentIssues(fields), ...attributePlanIssues(fields), ...characterClassIssues(fields), ...skillTraining(fields).issues, ...skillEffectIssues(fields), ...skillImportIssues(fields));
  if (fields['BossBar.Migration.LoadUnits'] && fields['BossBar.CargaRevisada'] !== 'Yes') issues.push({ id: 'migration:load-units', field: 'BossBar.CargaRevisada', severity: 'warning', autoFixable: false, message: 'A ficha antiga usava campos chamados Peso. Os números foram preservados, pois não é possível saber se eram quilos ou espaços. Revise os espaços de cada item e a carga atual, depois confirme a revisão neste campo (Livro Básico, p. 141).' });
  const defense = integerValue(fields.CA);
  const defenseCalculation = sheetDefenseBreakdown(fields).description;
  for (const kind of ['Armadura', 'Escudo'] as const) {
    const selected = equippedRows(fields, kind);
    if (selected.length > 1) issues.push({ id: `invalid:equipped:${kind}`, field: equipmentKeys(kind, selected[1]).equipped, severity: 'error', autoFixable: false, message: `Só pode haver ${kind === 'Armadura' ? 'uma armadura equipada' : 'um escudo equipado'} (Livro Básico, p. 152).` });
  }
  const principal = Array.from({ length: MAX_ATTACK_ROWS }, (_, index) => index + 1).filter((index) => fields[`BossBar.Ataque.${index}.Principal`] === 'Yes');
  if (principal.length > 1) issues.push({ id: 'invalid:principal-attack', field: `BossBar.Ataque.${principal[1]}.Principal`, severity: 'error', autoFixable: false, message: 'Escolha apenas um ataque principal.' });
  if (principal.some((index) => fields[`BossBar.Ataque.${index}.DuasArmas`] === 'Yes') && equippedRows(fields, 'Escudo').length) issues.push({ id: 'invalid:hands', field: equipmentKeys('Escudo', equippedRows(fields, 'Escudo')[0]).equipped, severity: 'error', autoFixable: false, message: 'O ataque principal usa duas armas. Desequipe o escudo ou escolha um ataque principal com uma arma.' });
  for (let index = 1; index <= MAX_ATTACK_ROWS; index++) {
    const prefix = `BossBar.Ataque.${index}.Segunda`;
    if (fields[`BossBar.Ataque.${index}.DuasArmas`] !== 'Yes') continue;
    for (const suffix of ['Nome', 'Dano']) if (!fields[`${prefix}.${suffix}`]?.trim()) issues.push({ id: `required:${prefix}.${suffix}`, field: `${prefix}.${suffix}`, severity: 'error', autoFixable: false, message: `Preencha ${suffix === 'Nome' ? 'o nome' : 'o dano'} da segunda arma do Ataque ${index}.` });
  }
  const attacks = Array.from({ length: MAX_ATTACK_ROWS }, (_, index) => {
    const number = index + 1;
    const prefix = `BossBar.Ataque.${number}`;
    return {
      name: clean(fields[`Ataque ${number}`]),
      attackBonus: adjustmentFormula(fields[`${prefix}.Ajuste`] || '0'),
      attackBonusIncludesSkill: false,
      skill: attackSkillName(fields, number),
      primary: fields[`${prefix}.Principal`] === 'Yes',
      ...(fields[`${prefix}.DuasArmas`] === 'Yes' ? { secondaryWeapon: {
        name: fields[`${prefix}.Segunda.Nome`] || '',
        attackBonus: adjustmentFormula(fields[`${prefix}.Segunda.Ajuste`] || '0'),
        attackBonusIncludesSkill: false,
        skill: attackSkillName(fields, number, true),
        damage: fields[`${prefix}.Segunda.Dano`] || '',
        critical: fields[`${prefix}.Segunda.Critico`] || `${fields[`${prefix}.Segunda.MargemCritico`] || '20'}/x${fields[`${prefix}.Segunda.MultiplicadorCritico`] || '2'}`,
        damageType: normalizeDamageType(fields[`${prefix}.Segunda.Tipo`] || '') || '',
        damageOrigin: (DAMAGE_ORIGINS.find(([id]) => id === fields[`${prefix}.Segunda.Origem`])?.[0] ?? 'unknown') as DamageOrigin,
        range: normalizeAttackRange(fields[`${prefix}.Segunda.Alcance`] || '') || '',
      } } : {}),
      damage: clean(fields[`Dano ${number}`]),
      critical: clean(fields[`Crítico ${number}`]),
      damageOrigin: (DAMAGE_ORIGINS.find(([id]) => id === fields[`${prefix}.Origem`])?.[0] ?? 'unknown') as DamageOrigin,
      damageType: normalizeDamageType(clean(fields[`Tipo ${number}`])) ?? clean(fields[`Tipo ${number}`]),
      range: normalizeAttackRange(clean(fields[`Alcance ${number}`])) ?? clean(fields[`Alcance ${number}`]),
    };
  }).filter((attack) => [attack.name, attack.damage, attack.critical, attack.damageType, attack.range].some(Boolean));
  const strength = attributes.for ?? 0;
  const maxLoad = Math.max(0, strength >= 0 ? 10 + 2 * strength : 10 + strength);
  if (attributes.for !== null && !fields.CargaMax?.trim()) addFormulaIssue(issues, 'CargaMax', null, maxLoad, 'A carga máxima');
  if (attributes.for !== null && !fields.Levantar?.trim()) addFormulaIssue(issues, 'Levantar', null, 2 * (numberValue(fields.CargaMax) ?? maxLoad), 'A capacidade de levantar');
  if (numberValue(fields.CargaTotal) !== null && numberValue(fields.CargaTotal)! > (numberValue(fields.CargaMax) ?? maxLoad)) issues.push({
    id: 'review:load-limit', field: 'CargaTotal', severity: 'warning', autoFixable: false,
    message: `A carga informada excede o limite de ${numberValue(fields.CargaMax) ?? maxLoad} espaços. Confira itens, quantidades, moedas e possíveis exceções; o valor original foi preservado.`,
  });

  return {
    supported: true,
    template: nimb ? 'ficha-nimb-v3' : 'ficha-t20-editavel-v2',
    modelVersion: SHEET_MODEL_VERSION,
    rulesVersion: SHEET_RULES_VERSION,
    ...(fields['BossBar.MigratedFrom'] ? { migratedFrom: fields['BossBar.MigratedFrom'] } : {}),
    summary: {
      catalogVersion: T20_CATALOG.version,
      abilities: sheetAbilities(fields),
      spells: sheetSpells(fields),
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
      damageReduction: normalizeDamageReduction(fields[RD_FIELD]),
      attributes,
      defenses: { melee: defense, ranged: defense, calculation: defenseCalculation },
      equippedShield: equippedRows(fields, 'Escudo').length > 0,
      skills, skillContext: createSkillCalculationContext(fields),
      attacks,
      movement: clean(fields.Desloc),
      size: clean(fields.SeleTamanho),
      currentLoad: numberValue(fields.CargaTotal),
      maxLoad: numberValue(fields.CargaMax) ?? maxLoad,
    },
    issues: issues.map((issue) => {
      const descriptor = issue.field ? CHARACTER_SHEET_EDITOR_DESCRIPTOR_BY_NAME.get(issue.field) : undefined;
      const location = descriptor ? [descriptor.section, descriptor.group, descriptor.label].filter(Boolean).join(' → ') : 'Importação da ficha';
      const calculation = skills.find(({ id }) => id === issue.field)?.calculation;
      return { ...issue, location, reason: `${issue.message}${calculation ? ` Cálculo: ${calculation}` : ''}`,
        correction: issue.autoFixable ? `Use Validar e corrigir cálculos ou revise ${location}.` : `Revise ${location}.`,
        ...(descriptor?.section === 'Perícias' && !issue.source ? { source: 'Livro Básico — Jogo do Ano, p. 114–115.' }
          : issue.id.includes('load') || issue.id.includes('inventory') ? { source: 'Livro Básico — Jogo do Ano, p. 141; isenção de equipamentos selecionados conforme regra da mesa.' } : {}),
      };
    }),
    fieldCount,
    checkedAt: Date.now(),
  };
};

const writeValues = (document: PDFDocument, values: FieldValues) => {
  const form = document.getForm();
  const native = isNimbSheet(readRawFieldValues(document)) ? nimbSheetValues(values) : values;
  if (form.getFieldMaybe(EXPORT_MANIFEST)) form.getTextField(EXPORT_MANIFEST).setText('');
  const fields = new Map(form.getFields().map((field) => [field.getName(), field]));
  for (const [name, value] of Object.entries(native)) {
    const field = fields.get(name);
    if (!field) {
      if (value !== '') form.createTextField(name).setText(value);
    } else if (field instanceof PDFTextField) {
      if (readTextFieldValue(field) === value) continue;
      if (field.getMaxLength() !== undefined && value.length > field.getMaxLength()!) field.removeMaxLength();
      field.setText(value);
    } else if (field instanceof PDFCheckBox) {
      if (value === 'Yes') field.check(); else field.uncheck();
    } else if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
      if (!value) field.clear();
      else if (field.getSelected()[0] !== value) field.select(value);
    } else if (field instanceof PDFRadioGroup && field.getOptions().includes(value)) field.select(value);
  }
};

const correctedValues = (values: FieldValues, validation: CharacterSheetValidation) => {
  const corrected = { ...values };
  for (const issue of validation.issues) {
    if (!issue.autoFixable || !issue.field || issue.expected === undefined) continue;
    corrected[issue.field] = issue.id === 'range:current-health' ? String(validation.summary.maxHealth)
      : issue.id === 'range:current-mana' ? String(validation.summary.maxMana) : issue.expected;
  }
  return recalculateCharacterResources(applyAttributePlan(corrected));
};

const saveSheetDocument = (document: PDFDocument) => document.save({
  addDefaultPage: false, updateFieldAppearances: true, useObjectStreams: false,
});

export const inspectCharacterSheetPdf = async (bytes: Uint8Array, automaticallyFix = false) => {
  const document = await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false, throwOnInvalidObject: true });
  const fields = readFieldValues(document);
  let validation = validateFields(fields, document.getForm().getFields().length);
  if (!automaticallyFix || !validation.supported) return { validation, bytes: null as Uint8Array | null };
  // Apply only documented, deterministic fixes. A second pass resolves dependent totals.
  let corrected = fields;
  for (let pass = 0; pass < 3; pass++) {
    corrected = correctedValues(corrected, validation);
    validation = validateFields(corrected, document.getForm().getFields().length);
  }
  writeValues(document, corrected);
  const correctedBytes = await saveSheetDocument(document);
  validation = validateFields(readFieldValues(document), document.getForm().getFields().length);
  return { validation, bytes: correctedBytes };
};

/** Fresh uploads start at full resources; migration and subsequent edits do not. */
export const createBlankCharacterSheetPdf = async (bytes: Uint8Array) => {
  const document = await PDFDocument.load(bytes);
  const values = readFieldValues(document);
  for (const descriptor of CHARACTER_SHEET_EDITOR_DESCRIPTORS) {
    // Empty repeatable rows must stay empty: numeric defaults are not inventory entries.
    if (descriptor.group && /^(Item|Ataque|Armadura|Escudo|Magia) \d+$/.test(descriptor.group)) continue;
    if (!(descriptor.name in values)) continue;
    if (!['integer', 'decimal'].includes(descriptor.validation?.kind ?? '')) continue;
    const original = values[descriptor.name];
    values[descriptor.name] = original?.trim() && Number.isFinite(Number(original.replace(',', '.'))) ? normalizeSheetNumber(original) : descriptor.defaultValue ?? '';
  }
  values.Lv = '1'; values['PVs Totais'] = ''; values['PVs Atuais'] = '';
  values.SeleTamanho='';values.ModFurtTam='0';values['BossBar.ManobrasTamanho']='0';
  values['Ofício 1'] = ''; values['Ofício_2'] = '';
  values[ATTRIBUTE_PLAN_FIELD] = JSON.stringify(inferAttributePlan(values, emptyAttributePlan('points')));
  applyAttributePlan(values);
  values['PMs Totais'] = ''; values['PMs Atuais'] = '';
  values.CargaMax = ''; values.Levantar = '';
  for (let index = 1; index <= MIN_ITEM_ROWS; index++) values[`BossBar.Item.${index}.Quantidade`] = '1';
  initializeAutomaticResources(values);
  delete values[SKILL_EFFECTS_FIELD]; initializeSkillEffects(values, true);
  // Missing choices stay blank until provided or explicitly corrected by the player.
  values.CA = String(sheetDefenseTotal(values));
  writeValues(document, values);
  return { bytes: await saveSheetDocument(document), validation: validateFields(readFieldValues(document), document.getForm().getFields().length) };
};

export const initializeNewCharacterSheetPdf = async (bytes: Uint8Array) => {
  const document = await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false, throwOnInvalidObject: true });
  const values = readFieldValues(document);
  const initial = validateFields(values, document.getForm().getFields().length);
  if (!initial.supported) throw new Error('O modelo da ficha não é reconhecido. Use a ficha vazia como referência.');
  for (const [maximum, current] of [['PVs Totais', 'PVs Atuais'], ['PMs Totais', 'PMs Atuais']]) {
    const max = integerValue(values[maximum]);
    if (max !== null && max >= 0) values[current] = String(max);
  }
  writeValues(document, values);
  const updatedBytes = await saveSheetDocument(document);
  return { bytes: updatedBytes, validation: validateFields(readFieldValues(document), document.getForm().getFields().length) };
};

const editorFields = (document: PDFDocument): CharacterSheetEditorField[] => {
  const values = readFieldValues(document);
  synchronizeSkillTraining(values);
  const fields = new Map(document.getForm().getFields().map((field) => [field.getName(), field]));
  const activeSpellRows = new Set<number>();
  for (let index = 1; index <= MAX_SPELL_ROWS; index += 1) {
    if (spellFields.some(([fieldName]) => (
      values[`BossBar.Magia.${index}.${fieldName}`]?.trim()
    ))) activeSpellRows.add(index);
  }
  if (activeSpellRows.size === 0 && !values[TEXT_CATALOG_VERSION_FIELD] && values.Magias?.trim()) activeSpellRows.add(1);
  const activeAttackRows = new Set<number>(
    Array.from({ length: MIN_ATTACK_ROWS }, (_, index) => index + 1),
  );
  for (let index = MIN_ATTACK_ROWS + 1; index <= MAX_ATTACK_ROWS; index += 1) {
    if ([
      `Ataque ${index}`, `Bônus Atq ${index}`, `Dano ${index}`,
      `Crítico ${index}`, `Tipo ${index}`, `Alcance ${index}`,
      `BossBar.Ataque.${index}.MargemCritico`,
      `BossBar.Ataque.${index}.MultiplicadorCritico`,
      `BossBar.Ataque.${index}.Informacoes`, `BossBar.Ataque.${index}.Segunda.Nome`, `BossBar.Ataque.${index}.Segunda.Dano`,
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
    if (values[names[0]]?.trim() || names.slice(1).some((name) => values[name]?.trim() && Number(values[name].replace(',', '.')) !== 0)) activeItemRows.add(index);
  }
  const activeArmorRows = new Set<number>([1]);
  for (let index = 2; index <= MAX_ARMOR_ROWS; index += 1) {
    if (['Nome', 'Informacoes', 'Defesa', 'Penalidade', 'OutrosDefesa', 'OutrosPenalidade'].some((fieldName) => (
      values[`BossBar.Armadura.${index}.${fieldName}`]?.trim()
    ))) activeArmorRows.add(index);
  }
  const activeShieldRows = new Set<number>([1]);
  for (let index = 2; index <= MAX_SHIELD_ROWS; index += 1) {
    if (['Nome', 'Informacoes', 'Defesa', 'Penalidade', 'OutrosDefesa', 'OutrosPenalidade'].some((fieldName) => (
      values[`BossBar.Escudo.${index}.${fieldName}`]?.trim()
    ))) activeShieldRows.add(index);
  }
  return CHARACTER_SHEET_EDITOR_DESCRIPTORS.filter((descriptor) => {
    const craftMatch = /^BossBar\.Oficio\.(\d+)\./.exec(descriptor.name);
    if (craftMatch && !values[`BossBar.Oficio.${craftMatch[1]}.Nome`]?.trim()) return false;
    if (descriptor.name === 'BossBar.Nimb.PaginasAdicionais' && !values[descriptor.name]?.trim()) return false;
    if (OLD_ABILITY_FIELDS.includes(descriptor.name)) return false;
    if (descriptor.name === 'BossBar.Habilidades.Revisar' && !values[descriptor.name]?.trim()) return false;
    if (/^Bônus Atq \d+$|\.(TesteTotal|DanoAlternativo)$/.test(descriptor.name)) return false;
    if (['BossBar.CdJustificativa', 'arm pesa', 'BossBar.LimiteAtributoDefesa'].includes(descriptor.name)) return false;
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
    let fallbackValue = sourceValue === undefined || sourceValue === ''
      ? descriptor.defaultValue ?? ''
      : sourceValue;
    if (['integer', 'decimal', 'formula'].includes(descriptor.validation?.kind ?? '') || /\.Base$/.test(descriptor.name)) fallbackValue = normalizeSheetNumber(fallbackValue);
    if (/^BossBar\.Oficio\.\d+\.Treinada$/.test(descriptor.name) || descriptor.name.startsWith('Mar Trei ') || ['arm pesa', 'BossBar.CargaRevisada'].includes(descriptor.name) || /^BossBar\.(?:Ataque\.\d+\.(?:TesteTotal|Principal|DuasArmas)|(?:Armadura|Escudo)\.\d+\.Equipado)$/.test(descriptor.name)) {
      return { ...base, kind: 'checkbox' as const, value: fallbackValue === 'Yes' ? 'Yes' : 'Off' };
    }
    if (/^BossBar\.Ataque\.\d+\.(?:Segunda\.)?Pericia$/.test(descriptor.name)) return { ...base, kind: 'choice' as const, value: fallbackValue || 'Luta', options: ['Luta', 'Pontaria'] };
    if (descriptor.name.startsWith('SeleAtrib') || /^BossBar\.Oficio\.\d+\.SeleAtrib$/.test(descriptor.name)) {
      return { ...base, kind: 'choice' as const, value: fallbackValue, options: [...new Set([fallbackValue, 'FOR', 'DES', 'CON', 'INT', 'SAB', 'CAR'])] };
    }
    if (/^BossBar\.Magia\.\d+\.Circulo$/.test(descriptor.name)) return { ...base, kind: 'choice' as const, value: fallbackValue, options: ['', '1', '2', '3', '4', '5'] };
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

export const exportEditableCharacterSheetPdf = async (bytes: Uint8Array, blankNimb: Uint8Array) => {
  const source = await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false });
  const values = readFieldValues(source);
  const structuredSpells = Array.from({ length: MAX_SPELL_ROWS }, (_, offset) => {
    const prefix = `BossBar.Magia.${offset + 1}.`;
    if (!values[`${prefix}Nome`]?.trim()) return '';
    return '- ' + spellFields.filter(([key]) => values[`${prefix}${key}`]?.trim()).map(([key, label]) => `${label}: ${values[`${prefix}${key}`]}`).join(' | ');
  }).filter(Boolean);
  if (structuredSpells.length) values.Magias = structuredSpells.join('\n\n');
  const destination = await PDFDocument.load(blankNimb, { ignoreEncryption: false, updateMetadata: false });
  if (!isNimbSheet(readRawFieldValues(destination))) throw new Error('O modelo vazio de Nimb não está disponível.');
  writeValues(destination, values);
  // Recognized extra text fits in Nimb's existing body. Keep only attachments
  // whose information cannot be represented by editable text (e.g. images).
  const references: unknown = values['BossBar.Export.PageCount']
    ? JSON.parse(values['BossBar.Export.ReferencePages'] || '[]')
    : readNimbExtraPages(source).unread.map((page) => page - 1);
  const referencePages: number[] = [];
  if (Array.isArray(references)) for (const index of references) {
    if (!Number.isInteger(index) || index < 3 || index >= source.getPageCount()) continue;
    if (destination.getPageCount() >= 400) throw new Error('A ficha excede 400 páginas. Reduza os anexos antes de exportar.');
    const [copied] = await destination.copyPages(source, [index]);
    referencePages.push(destination.getPageCount()); destination.addPage(copied);
  }
  return layoutEditableNimbExport(destination, blankNimb, editorFields(source), referencePages);
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
  bytes: Uint8Array, updates: readonly CharacterSheetEditorField[], automaticallyFix = false,
) => {
  const invalidUpdate = validateCharacterSheetEditorUpdates(updates);
  if (invalidUpdate) throw new Error(invalidUpdate);
  const document = await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false, throwOnInvalidObject: true });
  const original = readFieldValues(document);
  if (!validateFields(original, document.getForm().getFields().length).supported) throw new Error('O formato desta ficha não é reconhecido. Use a ficha vazia como modelo.');
  if (updates.some(({ name, value }) => OLD_ABILITY_FIELDS.includes(name) && value !== (original[name] ?? ''))) throw new Error('Os campos antigos de habilidades foram substituídos pelas categorias de raça, origem, classe e poderes gerais. Reabra o editor atualizado e transfira seu texto para a categoria correspondente. A ficha anterior foi preservada.');
  let values = { ...original };
  const extraPagesUpdate = updates.find(({ name }) => name === 'BossBar.Nimb.PaginasAdicionais');
  if (extraPagesUpdate && extraPagesUpdate.value !== (original['BossBar.Nimb.PaginasAdicionais'] ?? '')) throw new Error('Páginas adicionais são uma referência do PDF original. Registre alterações em Anotações da ficha.');
  const byName = new Map(updates.map((field) => [field.name, field]));
  for (const update of updates) values[update.name] =
    (/^Tipo \d+$|\.Segunda\.Tipo$/.test(update.name) ? normalizeDamageType(update.value)
      : /^Alcance \d+$|\.Segunda\.Alcance$/.test(update.name) ? normalizeAttackRange(update.value) : null) ?? update.value;
  applyAttributePlan(values);
  const invalidBenefits = invalidNewTrainingBenefits(values, original);
  if (invalidBenefits.length) throw new Error(invalidBenefits.join(' '));
  recalculateCharacterResources(values);
  synchronizeNimbInventory(original, values);
  if (updates.some(({ name, value }) => value !== (original[name] ?? '') && (name === RD_FIELD || name === ATTRIBUTE_PLAN_FIELD || /^(BossBar\.(Ataque|Armadura|Escudo)\.|Ataque |Dano |Crítico |Tipo |Alcance )/.test(name)))) delete values['BossBar.Import.ExportReview'];
  if (automaticallyFix || updates.some(({ name, value }) => affectsInventoryLoad(name) && value !== (original[name] ?? ''))) recalculateInventoryLoad(values);
  for (let index = 1; index <= MAX_ARMOR_ROWS; index++) {
    const keys = equipmentKeys('Armadura', index);
    if (values[keys.name] !== original[keys.name] && values[`BossBar.Armadura.${index}.LimiteManual`] !== 'Yes') {
      const suggested = inferredArmorAttributeLimit(values[keys.name] || '');
      if (suggested !== null) values[keys.limit] = suggested;
    }
  }
  values['B.Arm'] = String(equipmentDefenseTotal(values, 'Armadura'));
  values['B.Esc'] = String(equipmentDefenseTotal(values, 'Escudo'));
  values['BossBar.PenalidadeArmadura'] = String(armorPenaltyTotal(values));
  for (let index = 1; index <= MAX_SPELL_ROWS; index++) {
    const prefix = `BossBar.Magia.${index}`;
    const cost = baseSpellManaCost(values[`${prefix}.Circulo`] ?? '');
    if (values[`${prefix}.Circulo`] !== original[`${prefix}.Circulo`] && values[`${prefix}.Custo`] === original[`${prefix}.Custo`]) values[`${prefix}.Custo`] = cost === null ? '' : String(cost);
  }
  upgradeSheetContent(values);
  for (let index = 1; index <= MAX_ATTACK_ROWS; index++) {
    const second = `BossBar.Ataque.${index}.Segunda`;
    if (values[`BossBar.Ataque.${index}.DuasArmas`] === 'Yes') values[`${second}.Critico`] = `${values[`${second}.MargemCritico`] || '20'}/x${values[`${second}.MultiplicadorCritico`] || '2'}`;
    if (values[`Dano ${index}`] !== original[`Dano ${index}`]) delete values[`BossBar.Ataque.${index}.SemDano`];
    const marginName = `BossBar.Ataque.${index}.MargemCritico`;
    const multiplierName = `BossBar.Ataque.${index}.MultiplicadorCritico`;
    if (!byName.has(marginName) && !byName.has(multiplierName)) continue;
    const configured = [`Ataque ${index}`, `Bônus Atq ${index}`, `Dano ${index}`, `Crítico ${index}`].some((name) => values[name]?.trim());
    const margin = values[marginName]?.trim();
    const multiplier = values[multiplierName]?.trim();
    if ((!configured && !original[marginName] && !original[multiplierName]) || values[`BossBar.Ataque.${index}.SemDano`] === 'Yes') continue;
    values[`Crítico ${index}`] = !margin && !multiplier ? '' : `${margin || '20'}/x${multiplier || '2'}`;
  }
  const spells = Array.from({ length: MAX_SPELL_ROWS }, (_, offset) => Object.fromEntries(spellFields.map(([name, label]) => [label, values[`BossBar.Magia.${offset + 1}.${name}`]?.trim() ?? ''])))
    .filter((spell) => Object.values(spell).some(Boolean));
  const hadStructuredSpells = Object.keys(original).some((name) => name.startsWith('BossBar.Magia.'));
  const unchangedText = !hadStructuredSpells && spells.length === 1 && Object.entries(spells[0]).every(([label, value]) => label === 'Efeito' ? value === original.Magias?.trim() : !value);
  if (!unchangedText && (hadStructuredSpells || spells.length > 0)) {
    const text = spells.map((spell) => Object.entries(spell).filter(([, value]) => value).map(([label, value]) => `${label}: ${value}`).join(' | ')).join('\n');
    if (text.length > SHEET_TEXT_LIMIT) throw new Error('O texto completo das magias excede 100.000 caracteres. Divida as anotações antes de salvar; nenhum texto foi descartado.');
    values.Magias = text;
  }
  // Selected attributes must follow the character's current attribute values.
  for (const skill of NIMB_SKILLS) {
    const changed = byName.has(skill.selector) && values[skill.selector] !== original[skill.selector];
    const attribute = Object.entries(attributeFields).find(([key]) => key === values[skill.selector]?.toLowerCase().replace(/^mod/, ''))?.[1];
    if (attribute && (changed || values[attribute] !== original[attribute])) {
      values[skill.modifier] = values[attribute];
      delete values[`BossBar.Migration.Attribute.${skill.code}`];
    }
  }
  for (const suffix of ['Defe', 'Magia']) {
    const attribute = Object.entries(attributeFields).find(([key]) => key === values[`SeleAtrib${suffix}`]?.toLowerCase().replace(/^mod/, ''))?.[1];
    if (attribute && (values[`SeleAtrib${suffix}`] !== original[`SeleAtrib${suffix}`] || values[attribute] !== original[attribute])) {
      values[`ModAtrib${suffix}`] = values[attribute];
      delete values[`BossBar.Migration.Attribute.${suffix}`];
    }
  }
  if (automaticallyFix) {
    for (let pass = 0; pass < 3; pass++) values = correctedValues(values, validateFields(values, document.getForm().getFields().length));
  }
  if(values['RAÇA']!==original['RAÇA']&&values.SeleTamanho===original.SeleTamanho)synchronizeCharacterSize(values,true);
  else if(values.SeleTamanho!==original.SeleTamanho)synchronizeCharacterSize(values);
  recalculateCharacterSkills(values);
  if (updates.some(({ name, value }) => (name.startsWith('Mar Trei ') || /^BossBar\.Oficio\.\d+\.Treinada$/.test(name)) && value === 'Yes' && original[name] !== 'Yes')) {
    const previousTraining = skillTraining(original); const nextTraining = skillTraining(values);
    if (nextTraining.unmatched.length > previousTraining.unmatched.length || nextTraining.unmatched.some(({ trainedField }) => values[trainedField] === 'Yes' && original[trainedField] !== 'Yes')) throw new Error('Perícias: o novo treinamento excede as escolhas permitidas pela classe e pelas fontes registradas. Abra Fontes de treinamento e registre a fonte adicional antes de salvar.');
  }
  values.CA = String(sheetDefenseTotal(values));
  values = upgradeSheetLoadout(values);
  writeValues(document, values);
  const updatedBytes = await saveSheetDocument(document);
  const validation = validateFields(readFieldValues(document), document.getForm().getFields().length);
  return { bytes: updatedBytes, validation, fields: editorFields(document) };
};

/** Converts the representation without guessing missing character choices or totals.
 * The caller stores the original PDF and metadata before publishing the migration. */
export const migrateCharacterSheetPdf = async (bytes: Uint8Array, blankNimb: Uint8Array) => {
  const source = await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false, throwOnInvalidObject: true });
  const raw = readRawFieldValues(source);
  const values = readFieldValues(source);
  if (!isNimbSheet(raw) && !isLegacySheet(raw)) throw new Error('Modelo antigo não reconhecido. Revise a ficha e use o novo modelo vazio.');
  if (isNimbSheet(raw)) {
    let stored: FieldValues = {};
    try { stored = JSON.parse(raw[SHEET_EXTRA_FIELD] || '{}') as FieldValues; } catch { /* Validation reports invalid metadata. */ }
    if (!stored || stored[TEXT_CATALOG_VERSION_FIELD] !== '1' || stored[INVENTORY_LOAD_VERSION_FIELD] !== '1' || !parseSkillEffects(stored[SKILL_EFFECTS_FIELD]).reconciliation) {
      writeValues(source, values);
      const upgraded = await saveSheetDocument(source);
      return { bytes: upgraded, validation: validateFields(readFieldValues(source), source.getForm().getFields().length), converted: false };
    }
    return { bytes, validation: validateFields(values, source.getForm().getFields().length), converted: false };
  }
  const destination = await PDFDocument.load(blankNimb, { ignoreEncryption: false, updateMetadata: false, throwOnInvalidObject: true });
  if (!isNimbSheet(readRawFieldValues(destination))) throw new Error('O modelo Nimb da migração é inválido. A ficha anterior foi preservada.');
  values['BossBar.MigratedFrom'] = 'ficha-t20-editavel-v2';
  for (const suffix of ['Defe', 'Magia']) {
    const attribute = Object.entries(attributeFields).find(([key]) => key === values[`SeleAtrib${suffix}`]?.toLowerCase().replace(/^mod/, ''))?.[1];
    if (!attribute || values[`ModAtrib${suffix}`] !== values[attribute]) {
      values[`BossBar.Migration.Attribute.${suffix}`] = values[`ModAtrib${suffix}`] ?? '';
    }
  }
  values['BossBar.PenalidadeArmadura'] = values['BossBar.PenalidadeArmadura'] || values.PArmTotal || String(Math.abs(numericOrZero(values.Pa)) + Math.abs(numericOrZero(values.Pe)));
  if (Object.entries(values).some(([name, value]) => (/^PesoItem\d+$/.test(name) || name === 'CargaTotal') && value.trim())) values['BossBar.Migration.LoadUnits'] = 'review';
  if (!values['BossBar.Nimb.Equipamento']) {
    values['BossBar.Nimb.Equipamento'] = Array.from({ length: MAX_ITEM_ROWS }, (_, offset) => {
      const index = offset + 1;
      const name = values[index <= 15 ? `Item${index}` : `BossBar.Item.${index}.Nome`];
      const weight = values[index <= 15 ? `PesoItem${index}` : `BossBar.Item.${index}.Peso`];
      return name?.trim() ? `${name}${weight?.trim() ? ` — carga anterior: ${weight} (revisar espaços)` : ''}` : '';
    }).filter(Boolean).join('\n');
  }
  for (const skill of NIMB_SKILLS) {
    const attribute = Object.entries(attributeFields).find(([key]) => key === values[skill.selector]?.toLowerCase().replace(/^mod/, ''))?.[1];
    if (!attribute || values[skill.modifier] !== values[attribute]) {
      // Preserve unexplained per-skill attribute bonuses in supplemental data.
      values[`BossBar.Migration.Attribute.${skill.code}`] = values[skill.modifier] ?? '';
    }
  }
  writeValues(destination, values);
  const migrated = await saveSheetDocument(destination);
  return { bytes: migrated, validation: validateFields(readFieldValues(destination), destination.getForm().getFields().length), converted: true };
};
