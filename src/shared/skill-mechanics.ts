import data from './data/t20-skill-mechanics.json' with { type: 'json' };
import classData from './data/t20-skill-training.json' with { type: 'json' };
import { catalogKey, T20_CATALOG } from './rules-catalog.ts';
import { ABILITY_FIELDS, abilityEntry, splitTextEntries } from './character-sheet-content.ts';
import { parseCharacterClasses, baseCharacterClass } from './character-classes.ts';
import { ATTRIBUTE_PLAN_FIELD, attributeSourceTotals, parseAttributePlan } from './character-attributes.ts';
import { allSkillRules, skillDisplayName, trainingBonus, type SkillRule } from './skill-definitions.ts';
import { equippedRows, equipmentKeys } from './character-sheet-loadout.ts';
import type { CharacterSheetIssue } from './character-sheet.ts';

type Values = Record<string,string>;
export const SKILL_EFFECTS_FIELD='BossBar.Pericias.Efeitos';
export type SkillEffect = {
  skills: string[]; amount: number|string; choose?: number|'INT'|'DESTINY'; minimum?: number; trained?: boolean;
  condition?: string; options?: number[]; attribute?: string; replaceSkill?: string; chooseAtUse?:boolean;
  roll?: 'best'|'worst'; dice?: string; train?: boolean; untrained?: boolean;
  every?: number; start?: number; requiresRace?: string; exclude?: string[];
  ignoreArmor?:boolean; untrainedBonus?:boolean; noHalfUntrained?:boolean; minimumAmount?:number;
  maxAttribute?:string; maxMultiplier?:number; maximumByLevel?:{base:number;start:number;every:number;step:number};
  stack?:'ability'|'spell'|'item'|'partner'|'environment'; stackGroup?:string;
  suppresses?:string[];
  terrain?:boolean;
  requiresAbilities?:string[]; capAmountByClassLevel?:boolean;
  diceValues?:Record<string,string>;
  doubleFromLevel?:number;
  includeHalfOptions?:boolean;
};
export type SkillMechanic = {
  id:string; kind:'race'|'class'|'origin'|'ability'|'spell'|'item'|'optional'; owner:string; name:string; sourceId:string; page:number; level?:number;
  grant?:{allowed:string[];count:number;minimum?:number;duplicate?:'class'|'bonus';perTier?:boolean}; effects?:SkillEffect[];
};
export type OwnedSkillMechanic = SkillMechanic & { acquiredLevel:number; classLevel:number; heading?:string };
export type SkillEffectsPlan = {
  version:1;
  choices:Record<string,string[]>;
  active:Record<string,{situation:string;value?:number}>;
  imported:Record<string,number>;
  reviewed: boolean;
  reconciliation?: {version:1; totals:Record<string,{total:number;other:number}>};
  registered:string[];
  attributes:Record<string,{base:string;applied:string}>;
  terrains:Record<string,Record<string,number>>;
  extra:{id:string;name:string;skill:string;amount:number;dice:string;condition:string;active:boolean;note:string}[];
};
export const SKILL_TERRAINS=['Aquático','Ártico','Colina','Deserto','Floresta','Montanha','Pântano','Planície','Subterrâneo'] as const;
export const emptySkillEffectsPlan = (): SkillEffectsPlan => ({version:1,choices:{},active:{},imported:{},reviewed:false,registered:[],attributes:{},terrains:{},extra:[]});
export const parseSkillEffects = (text?:string):SkillEffectsPlan => {
  const result=emptySkillEffectsPlan();
  try {
    const p=JSON.parse(text||'{}'); if(p.version!==1)return result;
    const valid=(code:string)=>allSkillRules.some((r)=>r.code===code);
    for(const [id,list] of Object.entries(p.choices||{}).slice(0,200)) if(Array.isArray(list)) result.choices[id.slice(0,240)]=[...new Set(list.filter((v):v is string=>typeof v==='string'&&valid(v)))].slice(0,40);
    for(const [id,activation] of Object.entries(p.active||{}).slice(0,200)) {
      if(!activation||typeof activation!=='object')continue;
      const a=activation as {situation?:unknown;value?:unknown};
      if(typeof a.situation==='string'&&a.situation.trim())result.active[id.slice(0,240)]={situation:a.situation.trim().slice(0,500),...(typeof a.value==='number'&&Number.isFinite(a.value)?{value:Math.max(-999,Math.min(999,a.value))}:{})};
    }
    for(const [code,amount] of Object.entries(p.imported||{})) if(valid(code)&&typeof amount==='number'&&Number.isFinite(amount))result.imported[code]=Math.max(-999,Math.min(999,amount));
    result.reviewed=p.reviewed===true;
    if(p.reconciliation?.version===1){const totals:NonNullable<SkillEffectsPlan['reconciliation']>['totals']={};for(const [code,entry]of Object.entries(p.reconciliation.totals||{})){const e=entry as {total:number;other:number};if(valid(code)&&e&&Number.isFinite(e.total)&&Number.isFinite(e.other)&&Math.abs(e.total)<=10000&&Math.abs(e.other)<=10000)totals[code]={total:e.total,other:e.other};}result.reconciliation={version:1,totals};}
    for(const [id,ranks]of Object.entries(p.terrains||{}).slice(0,20))if(ranks&&typeof ranks==='object'&&!Array.isArray(ranks))result.terrains[id.slice(0,240)]=Object.fromEntries(Object.entries(ranks).filter(([name,rank])=>SKILL_TERRAINS.some(t=>t===name)&&typeof rank==='number'&&Number.isInteger(rank)&&rank>=1&&rank<=5));
    for(const [code,entry]of Object.entries(p.attributes||{})){
      const e=entry as {base?:unknown;applied?:unknown};if(valid(code)&&e&&typeof e.base==='string'&&typeof e.applied==='string'&&/^(FOR|DES|CON|INT|SAB|CAR)$/.test(e.base)&&/^(FOR|DES|CON|INT|SAB|CAR)$/.test(e.applied))result.attributes[code]={base:e.base,applied:e.applied};
    }
    if(Array.isArray(p.registered))result.registered=[...new Set(p.registered.filter((id:unknown):id is string=>typeof id==='string'&&SKILL_MECHANICS.some(r=>r.id===id&&['spell','item','optional'].includes(r.kind))))].slice(0,100) as string[];
    if(Array.isArray(p.extra))result.extra=p.extra.slice(0,50).filter((e:SkillEffectsPlan['extra'][number])=>e&&typeof e.id==='string'&&valid(e.skill)&&typeof e.name==='string'&&e.name.trim()&&typeof e.amount==='number'&&Number.isFinite(e.amount)&&typeof e.note==='string'&&e.note.trim()).map((e:SkillEffectsPlan['extra'][number])=>({id:e.id.slice(0,100),name:e.name.slice(0,160),skill:e.skill,amount:Math.max(-999,Math.min(999,e.amount)),dice:typeof e.dice==='string'&&/^(?:[1-9]|[1-9]\d)d(?:[2-9]|[1-9]\d|100)$/.test(e.dice)?e.dice:'',condition:typeof e.condition==='string'?e.condition.slice(0,300):'',active:e.active===true,note:e.note.slice(0,500)}));
  }catch{/* Malformed metadata never grants a benefit. */}
  return result;
};
export const SKILL_MECHANICS = data.rules as SkillMechanic[];
const indexedRules = new Map<string, SkillMechanic[]>();
for(const rule of SKILL_MECHANICS){const key=rule.kind+':'+catalogKey(rule.owner);indexedRules.set(key,[...(indexedRules.get(key)||[]),rule]);}
const abilityReferences = new Map<string, typeof T20_CATALOG.abilities>();
for(const ref of T20_CATALOG.abilities){const key=catalogKey(ref.name);abilityReferences.set(key,[...(abilityReferences.get(key)||[]),ref]);}
const recordedAbilities=(values:Values)=>ABILITY_FIELDS.flatMap(([,field])=>splitTextEntries(values[field]||'').map(text=>({...abilityEntry(text),field})));
const recordedAbilityAvailable=(values:Values,ability:ReturnType<typeof recordedAbilities>[number])=>{
  const category=ability.field==='BossBar.Habilidades.Classe'?'class':ability.field==='BossBar.Habilidades.Raca'?'race':ability.field==='BossBar.Habilidades.Origem'?'origin':undefined;
  if(!category)return true;
  const refs=(abilityReferences.get(catalogKey(ability.name.replace(/\s*\([^)]*\)\s*$/,'')))||[]).filter(ref=>ref.category===category);
  if(!refs.length)return true;
  if(category==='class'){const classes=parseCharacterClasses(values.CLASSE||'',Number(values.Lv)||1);return refs.some(ref=>classes.some(c=>baseCharacterClass(c.name)===baseCharacterClass(ref.owner||'')));}
  if(category==='race'&&['osteon','yidishan'].includes(catalogKey(values['RAÇA']||'')))return true;
  const current=catalogKey(values[category==='race'?'RAÇA':'ORIGEM']||'');return refs.some(ref=>current===catalogKey(ref.owner||'')||category==='race'&&current.startsWith(catalogKey(ref.owner||'')));
};
export const skillEffectAvailable=(effect:SkillEffect,values:Values)=>
  (!effect.requiresRace||catalogKey(effect.requiresRace)===catalogKey(values['RAÇA']||''))&&
  (!effect.requiresAbilities||effect.requiresAbilities.every(name=>recordedAbilities(values).some(ability=>catalogKey(ability.name.replace(/\s*\([^)]*\)\s*$/,''))===catalogKey(name))));
export const skillEffectOptionLabel=(effect:SkillEffect,value:number)=>effect.diceValues?.[value]||String(value);
export const skillRuleCitation=(rule:SkillMechanic)=>`${T20_CATALOG.sources.find(({id})=>id===rule.sourceId)?.name||rule.sourceId}, p. ${rule.page}`;
const attributeValue=(values:Values,attribute:string)=>Number(values['Mod'+attribute[0]+attribute.slice(1).toLowerCase()]||0);
export const permanentIntelligence=(values:Values)=>{
  const plan=parseAttributePlan(values[ATTRIBUTE_PLAN_FIELD]);return Math.max(0,Math.floor(Number(values.ModInt||0)-(plan?attributeSourceTotals(plan,'Int').temporary:0)));
};
export const skillMatches=(values:Values,rule:SkillRule,names:string[]):boolean=>names.some((name)=>{
  if(name==='*')return true;
  if(name==='#RES')return ['100','270','300'].includes(rule.code);
  if(name==='#ATTACK')return ['190','260'].includes(rule.code);
  if(name==='#NONATTACK')return !['190','260'].includes(rule.code);
  if(/^#(FOR|DES|CON|INT|SAB|CAR)$/.test(name))return rule.attribute===name.slice(1);
  if(name==='#NOBRE')return skillMatches(values,rule,classData.classes.Nobre.allowed);
  if(name==='Ofício')return Boolean(rule.nameField);
  const normalized=catalogKey(name);
  return normalized===catalogKey(rule.name)||normalized===catalogKey(skillDisplayName(rule,values))||Boolean(rule.nameField&&normalized.replace(/^oficio/,'')===catalogKey(values[rule.nameField]||'').replace(/^oficio/,''));
});
// Identity and explicitly recorded powers are the only inputs to source discovery.
// Numeric text in a description is never interpreted as executable rules.
export const characterSkillMechanics=(values:Values):OwnedSkillMechanic[]=>{
  const classes=parseCharacterClasses(values.CLASSE||'',Number(values.Lv)||1);
  const result:OwnedSkillMechanic[]=[];const level=Number(values.Lv)||1;
  for(const [kind,identity] of [['race',values['RAÇA']],['origin',values.ORIGEM]])for(const r of indexedRules.get(kind+':'+catalogKey(identity||''))||[])result.push({...r,acquiredLevel:1,classLevel:level});
  for(const entry of classes)for(const r of indexedRules.get('class:'+catalogKey(entry.name))||[])if(entry.level>=(r.level||1))result.push({...r,acquiredLevel:r.level||1,classLevel:entry.level});
  const registered=parseSkillEffects(values[SKILL_EFFECTS_FIELD]).registered;
  const spells=new Set(Object.entries(values).filter(([key])=>/^BossBar\.Magia\.\d+\.Nome$/.test(key)).map(([,name])=>catalogKey(name)));
  const items=Object.entries(values).filter(([key,value])=>value.trim()&&/^(?:Item\d+|BossBar\.Item\.\d+\.Nome)$/.test(key)).map(([key,name])=>{const index=Number(/\d+/.exec(key)?.[0]);return Number(values[`BossBar.Item.${index}.Quantidade`]??1)>0?name:'';}).filter(Boolean);
  for(const r of SKILL_MECHANICS) {
    const item=r.kind==='item'?items.find(name=>catalogKey(name.replace(/\s*\([^)]*\)\s*$/,''))===catalogKey(r.owner)):undefined;
    if(registered.includes(r.id)||r.kind==='spell'&&spells.has(catalogKey(r.owner))||item)result.push({...r,acquiredLevel:1,classLevel:level,...(item?{heading:item}:{})});
  }
  const occurrences=new Map<string,number>();
  for(const ability of recordedAbilities(values)){
    if(!recordedAbilityAvailable(values,ability))continue;
    const fullKey=catalogKey(ability.name);const key=indexedRules.has('ability:'+fullKey)?fullKey:catalogKey(ability.name.replace(/\s*\([^)]*\)\s*$/,'').replace(/\s*\+\d.*$/,''));
    const n=occurrences.get(key)||0;occurrences.set(key,n+1);
    for(const r of indexedRules.get('ability:'+key)||[]) {
      const owners=abilityReferences.get(key)||[];const acquiredClass=classes.find((c)=>owners.some((ref)=>baseCharacterClass(ref.owner||'')===baseCharacterClass(c.name)));
      const annotations=[...ability.name.matchAll(/\(([^)]+)\)/g)].flatMap(m=>m[1].split(/\s*[,;/]\s*|\s+e\s+/));
      const explicit=r.grant?.count===1?allSkillRules.filter(skill=>annotations.some(name=>catalogKey(name)===catalogKey(skill.name)||catalogKey(name)===catalogKey(skillDisplayName(skill,values)))&&skillMatches(values,skill,r.grant!.allowed)):[];
      result.push({...r,...(explicit.length===1?{grant:{...r.grant!,allowed:[skillDisplayName(explicit[0],values)]}}:{}),id:r.id+(n?':'+n:''),acquiredLevel:1,classLevel:acquiredClass?.level||level,heading:ability.name});
    }
  }
  // Repeated text from an import does not duplicate the same named passive effect.
  const seen=new Set<string>(); return result.filter((r)=>{const key=r.grant?r.id:`${catalogKey(r.heading||r.name)}:${JSON.stringify(r.effects?.map(effect=>Object.fromEntries(Object.entries(effect).filter(([name])=>name!=='condition'))))}`;if(seen.has(key))return false;seen.add(key);return true;});
};
export const effectChoiceCount=(effect:SkillEffect,values:Values)=>effect.choose==='INT'?Math.max(1,permanentIntelligence(values)):effect.choose==='DESTINY'?Math.max(0,Math.floor((Number(values.Lv)-1)/5)):effect.choose||0;
/** Parenthesized skill names are explicit choices, never formulas parsed from prose. */
export const inferSkillEffectChoices=(values:Values,plan:SkillEffectsPlan,owned=characterSkillMechanics(values))=>{
  for(const rule of owned) {
    const annotations=[...(rule.heading||'').matchAll(/\(([^)]+)\)/g)].flatMap(match=>match[1].split(/\s*[,;/]\s*|\s+e\s+/));
    if(!annotations.length)continue;
    for(const [index,effect]of(rule.effects||[]).entries()) {
      const id=rule.id+':'+index;if(!effect.choose||effect.chooseAtUse||plan.choices[id])continue;
      const choices=allSkillRules.filter(skill=>annotations.some(name=>catalogKey(name)===catalogKey(skill.name)||catalogKey(name)===catalogKey(skillDisplayName(skill,values)))&&skillMatches(values,skill,effect.skills)&&(!effect.exclude||!skillMatches(values,skill,effect.exclude))).map(skill=>skill.code);
      const count=effectChoiceCount(effect,values);
      if(choices.length>=(effect.minimum??count)&&choices.length<=count)plan.choices[id]=choices;
    }
  }
  return plan;
};
export const skillEffectOptions=(effect:SkillEffect,rule:OwnedSkillMechanic,values:Values)=>{
  if(effect.terrain) {
    const index=rule.effects?.indexOf(effect)??0;const ranks=parseSkillEffects(values[SKILL_EFFECTS_FIELD]).terrains[rule.id+':'+index]||{};
    const budget=terrainChoiceCount(rule);if(Object.values(ranks).reduce((sum,n)=>sum+n,0)!==budget)return [];
    const base=Math.max(1,attributeValue(values,'SAB'));return [...new Set(Object.values(ranks).map(rank=>base+2*(rank-1)))].sort((a,b)=>a-b);
  }
  const max=effect.maxAttribute?Math.max(0,attributeValue(values,effect.maxAttribute))*(effect.maxMultiplier||1):effect.maximumByLevel?effect.maximumByLevel.base+Math.max(0,Math.floor((rule.classLevel-effect.maximumByLevel.start)/effect.maximumByLevel.every))*effect.maximumByLevel.step:Infinity;
  const options=effect.options?.filter((value)=>value<=max).map(value=>effect.doubleFromLevel&&rule.classLevel>=effect.doubleFromLevel?value*2:value);
  return options&&effect.includeHalfOptions?[...new Set([...options,...options.map(value=>value/2)])].sort((a,b)=>a-b):options;
};
export const terrainChoiceCount=(rule:OwnedSkillMechanic)=>Math.max(0,1+Math.floor((rule.classLevel-3)/4));
export const skillEffectAmount=(effect:SkillEffect,rule:OwnedSkillMechanic,values:Values,skill:SkillRule,trained:boolean)=>{
  const attribute=String(effect.amount);
  let amount=typeof effect.amount==='number'?effect.amount:/^(FOR|DES|CON|INT|SAB|CAR)$/.test(attribute)?attributeValue(values,attribute):attribute==='training'?trainingBonus(Number(values.Lv),trained):0;
  if(attribute==='shield')amount=equippedRows(values,'Escudo').reduce((sum,index)=>{const k=equipmentKeys('Escudo',index);return sum+Number(values[k.defense]||0)+Number(values[k.otherDefense]||0);},0);
  if(attribute==='tormenta') {
    const powers=new Set(recordedAbilities(values).filter((a)=>(abilityReferences.get(catalogKey(a.name.replace(/\s*\([^)]*\)\s*$/,'')))||[]).some((ref)=>ref.subcategory==='tormenta')).map(a=>catalogKey(a.name))).size;
    const plan=parseSkillEffects(values[SKILL_EFFECTS_FIELD]);
    const deformity=characterSkillMechanics(values).find(r=>catalogKey(r.owner)==='lefou'&&r.effects?.some(e=>e.choose));
    const racial=catalogKey(values['RAÇA']||'')==='lefou'?Math.min(2,(plan.choices[deformity?.id+':0']||[]).length):catalogKey(values['RAÇA']||'')==='kaijin'?2:0;
    amount=1+Math.floor(Math.max(0,powers+racial-1)/2);
  }
  if(effect.every)amount+=Math.max(0,Math.floor((rule.classLevel-(effect.start||1))/effect.every));
  if(attribute==='halfTraining')amount=trainingBonus(Number(values.Lv),true)/2;
  if(attribute==='halfLevel')amount=Math.floor(Number(values.Lv)/2);
  if(attribute==='classLevel')amount=rule.classLevel;
  if(attribute==='chess')amount=2+new Set(recordedAbilities(values).filter(a=>['criar oportunidade','ordens de engajamento'].map(catalogKey).includes(catalogKey(a.name))).map(a=>catalogKey(a.name))).size;
  if(effect.minimumAmount!==undefined)amount=Math.max(effect.minimumAmount,amount);
  if(effect.capAmountByClassLevel)amount=Math.min(rule.classLevel,amount);
  return amount;
};
export type AppliedSkillSource={id:string;name:string;amount:number;reference:string;attribute?:string;dice?:string;roll?:'best'|'worst';train?:boolean;untrained?:boolean;replaceSkill?:string;substitute?:string;condition?:string;ignoreArmor?:boolean;noHalfUntrained?:boolean;stack?:string;ignored?:string;untrainedBonus?:boolean};
export const skillEffectsFor=(values:Values,skill:SkillRule,owned=characterSkillMechanics(values),plan=parseSkillEffects(values[SKILL_EFFECTS_FIELD]))=>{
  const sources:AppliedSkillSource[]=[]; const pending:string[]=[];
  for(const rule of owned) for(const [index,effect] of (rule.effects||[]).entries()) {
    const id=`${rule.id}:${index}`;
    if(!skillEffectAvailable(effect,values))continue;
    if(effect.exclude&&skillMatches(values,skill,effect.exclude)||!skillMatches(values,skill,effect.skills))continue;
    const selected=plan.choices[id]||[]; const count=effectChoiceCount(effect,values);
    if(effect.choose&&!selected.slice(0,count).includes(skill.code))continue;
    if(effect.trained&&!/^(Yes|Sim|On|true|1)$/i.test(values[skill.trainedField]||''))continue;
    if(effect.untrainedBonus&&/^(Yes|Sim|On|true|1)$/i.test(values[skill.trainedField]||''))continue;
    const activation=plan.active[id];
    if(effect.condition&&!activation)continue;
    if(effect.suppresses?.some(name=>owned.some(r=>catalogKey(r.name)===catalogKey(name)&&(r.effects||[]).some((_,i)=>plan.active[r.id+':'+i]))))continue;
    let amount=skillEffectAmount(effect,rule,values,skill,/^(Yes|Sim|On|true|1)$/i.test(values[skill.trainedField]||''));
    let dice=effect.dice;
    if(effect.options||effect.terrain) { const options=skillEffectOptions(effect,rule,values)!;const selected=activation?.value??(effect.terrain&&options.length===1?options[0]:undefined);if(selected===undefined||!options.includes(selected)){pending.push(rule.name);continue;} if(effect.diceValues) {dice=effect.diceValues[selected];amount=0;}else amount=selected; }
    sources.push({id,name:rule.name,amount,reference:skillRuleCitation(rule),...(typeof effect.amount==='string'&&/^(FOR|DES|CON|INT|SAB|CAR)$/.test(effect.amount)?{attribute:effect.amount}:{}),...(effect.attribute?{substitute:effect.attribute==='CAST'?values.SeleAtribMagia||'INT':effect.attribute}:{}),dice,roll:effect.roll,train:effect.train,untrained:effect.untrained,replaceSkill:effect.replaceSkill,condition:effect.condition,ignoreArmor:effect.ignoreArmor,noHalfUntrained:effect.noHalfUntrained,untrainedBonus:effect.untrainedBonus,stack:effect.stackGroup||effect.stack||(rule.kind==='spell'?'spell':rule.kind==='item'?'item':undefined)});
  }
  for(const e of plan.extra)if(e.skill===skill.code&&(!e.condition||plan.active['master:'+e.id]))sources.push({id:'master:'+e.id,name:e.name,amount:e.amount,dice:e.dice||undefined,reference:e.note,condition:e.condition});
  return {sources,pending};
};

/** Missing choices stay visible; malformed or orphaned metadata never grants a bonus. */
export const skillEffectIssues=(values:Values):CharacterSheetIssue[]=>{
  const owned=characterSkillMechanics(values);const plan=inferSkillEffectChoices(values,parseSkillEffects(values[SKILL_EFFECTS_FIELD]),owned);const issues:CharacterSheetIssue[]=[];
  const add=(id:string,message:string,source:string)=>issues.push({id:'skill-effect:'+id,field:SKILL_EFFECTS_FIELD,severity:'warning',message,reason:message,location:'Perícias → Fontes de treinamento → Efeitos e bônus',source,autoFixable:false});
  const known=new Set<string>();
  for(const rule of owned)for(const [index,effect]of(rule.effects||[]).entries()){
    const id=rule.id+':'+index;known.add(id);
    if(!skillEffectAvailable(effect,values))continue;
    if(effect.terrain){const ranks=plan.terrains[id]||{};const used=Object.values(ranks).reduce((sum,n)=>sum+n,0);const budget=terrainChoiceCount(rule);if(used!==budget)add(id+':terrain',`${rule.name}: distribua ${budget} escolha(s) entre terrenos novos e melhorias dos terrenos conhecidos. ${used} escolha(s) registrada(s).`,skillRuleCitation(rule));}
    const count=effectChoiceCount(effect,values);const selected=plan.choices[id]||[];
    const valid=selected.filter(code=>allSkillRules.some(skill=>skill.code===code&&skillMatches(values,skill,effect.skills)&&(!effect.exclude||!skillMatches(values,skill,effect.exclude))&&(!effect.trained||/^(Yes|Sim|On|1|true)$/i.test(values[skill.trainedField]||''))));
    if(count&&!effect.chooseAtUse&&(valid.length<(effect.minimum??count)||valid.length>count||valid.length!==selected.length))add(id,`${rule.name}: escolha ${effect.minimum&&effect.minimum!==count?`${effect.minimum} a ${count}`:count} perícia(s) elegível(is). ${valid.length} escolha(s) válida(s) registrada(s).`,skillRuleCitation(rule));
    if(plan.active[id]&&(effect.options||effect.terrain)&&plan.active[id].value!==undefined&&!skillEffectOptions(effect,rule,values)?.includes(plan.active[id].value!))add(id+':value',`${rule.name}: o valor informado não está disponível no nível ou atributo atual.`,skillRuleCitation(rule));
  }
  for(const id of new Set([...Object.keys(plan.choices),...Object.keys(plan.terrains),...Object.keys(plan.active).filter(id=>!id.startsWith('master:'))]))if(!known.has(id))add(id+':removed','Uma fonte de bônus foi removida ou alterada. Suas escolhas anteriores deixaram de conceder bônus; confira as fontes atuais.','Livro Básico, p. 226');
  for(const ability of recordedAbilities(values))if(!recordedAbilityAvailable(values,ability))issues.push({id:'skill-effect:identity:'+ability.field+':'+catalogKey(ability.name),field:ability.field,severity:'warning',dismissible:false,autoFixable:false,message:`${ability.name}: a raça, classe ou origem que concedia esta habilidade não está mais na identidade. O texto foi preservado, mas não concede bônus automáticos; revise a habilidade ou registre uma concessão do mestre.`});
  for(const [,field] of ABILITY_FIELDS)if(splitTextEntries(values[field]||'').map(abilityEntry).some(ability=>catalogKey(ability.name)==='familiar'))issues.push({id:'skill-effect:familiar-type',field,severity:'warning',dismissible:false,autoFixable:false,source:'Livro Básico, p. 38',message:'Familiar: informe o animal escolhido no nome, como Familiar (Gato), Familiar (Corvo) ou Familiar (Rato), para identificar os benefícios de perícia. A escolha não foi presumida.'});
  return issues;
};
