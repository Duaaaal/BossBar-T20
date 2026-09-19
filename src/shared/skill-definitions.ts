import type { CharacterSheetEditorField } from './character-sheet.ts';
export type SkillRule = {
  code: string; name: string; modifierField: string; trainedField: string;
  attribute: string; nameField?: string; trainedOnly?: boolean; armorPenalty?: boolean; sizeModifierField?: string;
};
const definitions: [string, string, string, string, string, boolean?, boolean?][] = [
  ['010','Acrobacia','Acro','acro','DES',false,true], ['020','Adestramento','Ades','ades','CAR',true],
  ['030','Atletismo','Atle','atle','FOR'], ['040','Atuação','Atua','atua','CAR',true], ['050','Cavalgar','Cava','caval','DES'],
  ['060','Conhecimento','Conh','conhe','INT',true], ['070','Cura','Cura','cura','SAB'], ['080','Diplomacia','Dipl','dipl','CAR'],
  ['090','Enganação','Enga','enga','CAR'], ['100','Fortitude','Fort','forti','CON'], ['110','Furtividade','Furt','furti','DES',false,true],
  ['120','Guerra','Guer','guerra','INT',true], ['130','Iniciativa','Inic','ini','DES'], ['140','Intimidação','Inti','inti','CAR'],
  ['150','Intuição','Intu','intu','SAB'], ['160','Investigação','Inve','inve','INT'], ['170','Jogatina','Joga','joga','CAR',true],
  ['180','Ladinagem','Ladi','ladi','DES',true,true], ['190','Luta','Luta','luta','FOR'], ['200','Misticismo','Mist','misti','INT',true],
  ['210','Pilotagem','Pilo','pilo','DES',true], ['220','Nobreza','Nobr','nobre','INT',true],
  ['230','Ofício 1','Ofi1','ofi1','INT',true], ['240','Ofício 2','Ofi2','ofi2','INT',true],
  ['250','Percepção','Perc','perce','SAB'], ['260','Pontaria','Pont','ponta','DES'], ['270','Reflexos','Refl','refle','DES'],
  ['280','Religião','Reli','reli','SAB',true], ['290','Sobrevivência','Sobr','sobre','SAB'], ['300','Vontade','Vont','vonta','SAB'],
];
export const skillRules: SkillRule[] = definitions.map(([code,name,modifier,trained,attribute,trainedOnly,armorPenalty]) => ({
  code,name,attribute,modifierField:'ModAtrib'+modifier,trainedField:'Mar Trei '+trained,trainedOnly,armorPenalty,
  ...(code==='110'?{sizeModifierField:'ModFurtTam'}:{}), ...(code==='230'?{nameField:'Ofício 1'}:code==='240'?{nameField:'Ofício_2'}:{}),
}));
export const MAX_CRAFT_SPECIALIZATIONS = 40;
export const isVacantCraft = (rule: SkillRule, values: Record<string,string>) => Boolean(rule.nameField) &&
  (!values[rule.nameField!]?.trim() || /^qualquer$/i.test(values[rule.nameField!]!.trim()) && !/^(Yes|Sim|On|1|true)$/i.test(values[rule.trainedField] || ''));
export const allSkillRules: SkillRule[] = [...skillRules, ...Array.from({length:MAX_CRAFT_SPECIALIZATIONS-2},(_,offset) => {
  const n=offset+3; const prefix=`BossBar.Oficio.${n}`;
  return {code:prefix+'.Total',name:`Ofício ${n}`,nameField:prefix+'.Nome',modifierField:prefix+'.ModAtrib',trainedField:prefix+'.Treinada',attribute:'INT',trainedOnly:true};
})];
export const characterSkillRules = (values: Record<string,string>) => allSkillRules.filter((rule,index) => index<skillRules.length || Boolean(values[rule.nameField!]?.trim()));
export const skillDisplayName = (rule: SkillRule, values: Record<string,string>) => {
  const name = rule.nameField && values[rule.nameField]?.trim();
  return name ? /^ofício\b/i.test(name) ? name : `Ofício (${name})` : rule.name;
};
export const skillComponentFields = (rule: SkillRule) => {
  if (rule.code.startsWith('BossBar.')) { const prefix=rule.code.replace(/\.Total$/,''); return {halfLevel:prefix+'.MetadeNivel',training:prefix+'.Treino',other:prefix+'.Outros'}; }
  const suffix=Number.parseInt(rule.code,10)/10;
  return {halfLevel:`${String(suffix).padStart(2,'0')}1`,training:`${String(suffix).padStart(2,'0')}3`,other:`${String(suffix).padStart(2,'0')}4`};
};
export const trainingBonus = (level: number, trained: boolean) => !trained?0:level>=15?6:level>=7?4:2;
export const craftEditorFields=(rule:SkillRule,values:Record<string,string>):CharacterSheetEditorField[]=>{
  const parts=skillComponentFields(rule);
  return [[rule.nameField!,'Nome'],[rule.trainedField,'Treinada'],[rule.modifierField.replace('ModAtrib','SeleAtrib'),'Atributo-chave'],[parts.halfLevel,'1/2 do nível'],[rule.modifierField,'Atributo'],[parts.training,'Treino'],[parts.other,'Outros'],[rule.code,'Total']].map(([name,label])=>({
    name,label,section:'Perícias',group:rule.name,value:values[name]??(label==='Atributo-chave'?'INT':label==='Treinada'?'Off':label==='Nome'?'':'0'),
    kind:label==='Treinada'?'checkbox':label==='Atributo-chave'?'choice':'text',
    ...(label==='Atributo-chave'?{options:['FOR','DES','CON','INT','SAB','CAR']}:{validation:label==='Nome'?{kind:'text' as const,maxLength:160}:{kind:'integer' as const,min:-999,max:999}}),
  }));
};
