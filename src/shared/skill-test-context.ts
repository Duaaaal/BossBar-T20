import { defaultSkillEffectDuration } from './skill-effect-runtime.ts';
import { T20_CATALOG,catalogKey } from './rules-catalog.ts';
import type { CharacterSheetSummary } from './character-sheet.ts';
import { characterSkillMechanics, SKILL_EFFECTS_FIELD, parseSkillEffects, skillMatches, skillRuleCitation, skillEffectOptions, inferSkillEffectChoices, skillEffectAvailable, skillEffectOptionLabel } from './skill-mechanics.ts';
import { allSkillRules, characterSkillRules, skillComponentFields } from './skill-definitions.ts';
import { calculateCharacterSkills } from './character-skills.ts';
import { ABILITY_FIELDS, abilityEntry, splitTextEntries } from './character-sheet-content.ts';
import { validSkillActivations,type SkillTestActivation } from './skill-activation.ts';
export { validSkillActivations,type SkillTestActivation } from './skill-activation.ts';
export type SkillCalculationContext={values:Record<string,string>};
export const createSkillCalculationContext=(fields:Record<string,string>):SkillCalculationContext=>{
  const keys=new Set(['Lv','CLASSE','RAÇA','ORIGEM','SeleAtribMagia','Pa','Pe','ModFurtTam','BossBar.Pericias.Fontes',SKILL_EFFECTS_FIELD,'BossBar.Atributos.Distribuicao']);
  for(const attr of ['For','Des','Con','Int','Sab','Car'])keys.add('Mod'+attr);
  for(const skill of characterSkillRules(fields)){[skill.code,skill.modifierField,skill.trainedField,skill.nameField,skill.modifierField.replace('ModAtrib','SeleAtrib'),...Object.values(skillComponentFields(skill))].filter(Boolean).forEach((k)=>keys.add(k!));}
  const values=Object.fromEntries(Object.entries(fields).filter(([key])=>keys.has(key)||/^BossBar\.(Armadura|Escudo)\./.test(key)||/^BossBar\.Magia\.\d+\.Nome$/.test(key)||/^(?:Item\d+|BossBar\.Item\.\d+\.(?:Nome|Quantidade))$/.test(key)||['Armadura','Escudo','B.Arm1','B.Esc2'].includes(key)));
  for(const [,field]of ABILITY_FIELDS)values[field]=splitTextEntries(fields[field]||'').map(abilityEntry).map(ability=>'- '+ability.name+':').join('\n');
  return {values};
};
const contextCache=new WeakMap<SkillCalculationContext,{owned:ReturnType<typeof characterSkillMechanics>;plan:ReturnType<typeof parseSkillEffects>}>();
export const availableSkillSituations=(context:SkillCalculationContext|undefined,skillId:string)=>{
  if(!context)return [];
  const values=context.values;const skill=allSkillRules.find((r)=>r.code===skillId);if(!skill)return [];
  let cached=contextCache.get(context);if(!cached){const owned=characterSkillMechanics(values);cached={owned,plan:inferSkillEffectChoices(values,parseSkillEffects(values[SKILL_EFFECTS_FIELD]),owned)};contextCache.set(context,cached);}
  const {plan,owned}=cached;
  const options=owned.flatMap((rule)=>(rule.effects||[]).flatMap((effect,index)=>{
    const id=`${rule.id}:${index}`;
    if(!effect.condition||!skillMatches(values,skill,effect.skills)||effect.exclude&&skillMatches(values,skill,effect.exclude))return [];
    if(effect.choose&&!effect.chooseAtUse&&!plan.choices[id]?.includes(skillId))return [];
    if(effect.trained&&values[skill.trainedField]!=='Yes')return [];
    if(!skillEffectAvailable(effect,values))return [];
    if(effect.untrainedBonus&&values[skill.trainedField]==='Yes')return [];
    const reference=rule.kind==='spell'?T20_CATALOG.spells.find(r=>catalogKey(r.name)===catalogKey(rule.name)):T20_CATALOG.abilities.find(r=>r.sourceId===rule.sourceId&&catalogKey(r.name)===catalogKey(rule.name));
    const description=(reference?.kind==='spell'?'Duração: '+reference.duration+'. ':'')+(reference?.description||effect.condition);
    return [{id,name:rule.name,duration:defaultSkillEffectDuration(description),condition:effect.condition,reference:skillRuleCitation(rule),options:skillEffectOptions(effect,rule,values),optionLabels:Object.fromEntries((skillEffectOptions(effect,rule,values)||[]).map(value=>[value,skillEffectOptionLabel(effect,value)])),allowsUntrained:Boolean(effect.train||effect.untrained),activation:plan.active[id]}];
  }));
  for(const extra of plan.extra)if(extra.skill===skillId&&extra.condition)options.push({id:'master:'+extra.id,name:extra.name,duration:defaultSkillEffectDuration(extra.condition),condition:extra.condition,reference:extra.note,options:undefined,optionLabels:{},allowsUntrained:false,activation:plan.active['master:'+extra.id]});
  return options;
};
/** The request only selects rules from the approved sheet; it cannot supply formulas. */
export const skillForSituation=(summary:CharacterSheetSummary,skillId:string,activations?:SkillTestActivation[])=>{
  const original=summary.skills.find((s)=>s.id===skillId);if(!original)return {error:'Esta perícia não está disponível na ficha.'};
  if(activations===undefined)return {skill:original};
  if(!validSkillActivations(activations))return {error:'As situações informadas para a perícia são inválidas.'};
  // Older approved sheets have authoritative totals, but no effect calculation context.
  if(!summary.skillContext)return activations.length===0?{skill:original}:{error:'As situações informadas para a perícia são inválidas.'};
  const available=availableSkillSituations(summary.skillContext,skillId);
  for(const activation of activations){const option=available.find((s)=>s.id===activation.id);if(!option||option.options&&!option.options.includes(activation.value!))return {error:'Um dos efeitos selecionados não está disponível ou precisa de um valor válido.'};}
  const values={...summary.skillContext.values};const plan=parseSkillEffects(values[SKILL_EFFECTS_FIELD]);
  for(const option of available)delete plan.active[option.id];
  for(const activation of activations){plan.active[activation.id]={situation:activation.situation,value:activation.value};
    const effect=characterSkillMechanics(values).flatMap(r=>(r.effects||[]).map((effect,index)=>({id:r.id+':'+index,effect}))).find(e=>e.id===activation.id)?.effect;if(effect?.chooseAtUse)plan.choices[activation.id]=[skillId];}
  values[SKILL_EFFECTS_FIELD]=JSON.stringify(plan);const result=calculateCharacterSkills(values).get(skillId)!;
  return {skill:{...original,total:result.total,trained:result.trained,trainedOnly:result.trainedOnly,bonusDice:result.dice,rollMode:result.roll,sources:result.sources,replacement:result.replacement}};
};

export const availableCharacterSkillEffects=(summary:CharacterSheetSummary|undefined|null)=>{
  const effects=new Map<string,ReturnType<typeof availableSkillSituations>[number]&{skills:string[]}>();
  for(const skill of summary?.skills||[])for(const option of availableSkillSituations(summary?.skillContext,skill.id)){
    const previous=effects.get(option.id);if(previous)previous.skills.push(skill.name);else effects.set(option.id,{...option,skills:[skill.name]});
  }
  return [...effects.values()];
};
