import { armorPenaltyTotal } from './character-sheet-calculations.ts';
import { characterSkillRules, skillComponentFields, skillDisplayName, trainingBonus, isVacantCraft, type SkillRule } from './skill-definitions.ts';
import { characterSkillMechanics, skillEffectsFor, parseSkillEffects, emptySkillEffectsPlan, inferSkillEffectChoices, SKILL_EFFECTS_FIELD, skillMatches, effectChoiceCount, skillEffectAmount, skillEffectAvailable, type AppliedSkillSource } from './skill-mechanics.ts';
import { synchronizeSkillTraining, skillTraining, parseTrainingPlan, SKILL_TRAINING_FIELD } from './skill-training.ts';
import type { CharacterSheetIssue } from './character-sheet.ts';
export { skillRules, allSkillRules, characterSkillRules, skillComponentFields, skillDisplayName, trainingBonus, type SkillRule } from './skill-definitions.ts';
type Values=Record<string,string>;
const checked=(value?:string)=>/^(Yes|Sim|On|true|1)$/i.test(value||'');
const attrValue=(values:Values,code:string)=>Number(values['Mod'+code[0]+code.slice(1).toLowerCase()]||0);
export const initializeSkillEffects=(values:Values,blank=false)=>{
  const plan=inferSkillEffectChoices(values,values[SKILL_EFFECTS_FIELD]?parseSkillEffects(values[SKILL_EFFECTS_FIELD]):emptySkillEffectsPlan());
  if(plan.reconciliation){values[SKILL_EFFECTS_FIELD]=JSON.stringify(plan);return;}
  // An absent level is not level 1: defer deduction until the player supplies it.
  const level=Number(values.Lv);
  if(!blank&&(!Number.isInteger(level)||level<1||level>20)){values[SKILL_EFFECTS_FIELD]=JSON.stringify(plan);return;}
  const previous={...plan.imported};plan.imported={};plan.active={};plan.reviewed=true;plan.reconciliation={version:1,totals:{}};
  values[SKILL_EFFECTS_FIELD]=JSON.stringify(plan);
  if(blank)return;
  // Infer only a complete, unique distribution of a passive numeric choice.
  // Ambiguous allocations still need a choice; arbitrary description text never becomes a rule.
  const pending=characterSkillMechanics(values).flatMap(rule=>(rule.effects||[]).flatMap((effect,index)=>{
    const id=rule.id+':'+index;const count=effectChoiceCount(effect,values);
    return count&&!plan.choices[id]?.length&&!effect.condition&&!effect.chooseAtUse&&!effect.terrain&&!effect.attribute&&!effect.replaceSkill&&skillEffectAvailable(effect,values)?[{rule,effect,id,count}]:[];
  }));
  for(const choice of pending){
    const baselineValues={...values};for(const skill of characterSkillRules(values))baselineValues[skillComponentFields(skill).other]='0';
    const baseline=calculateCharacterSkills(baselineValues);
    const candidates=characterSkillRules(values).filter(skill=>{
      if(isVacantCraft(skill,values)||!skillMatches(values,skill,choice.effect.skills)||choice.effect.exclude&&skillMatches(values,skill,choice.effect.exclude)||choice.effect.trained&&!checked(values[skill.trainedField]))return false;
      const raw=values[skill.code]?.trim();if(!raw)return false;
      const amount=skillEffectAmount(choice.effect,choice.rule,values,skill,true);
      return amount!==0&&Number(raw)-baseline.get(skill.code)!.total===amount;
    });
    if(candidates.length!==choice.count||pending.some(other=>other!==choice&&candidates.some(skill=>skillMatches(values,skill,other.effect.skills)&&skillEffectAmount(other.effect,other.rule,values,skill,true)===skillEffectAmount(choice.effect,choice.rule,values,skill,true))))continue;
    plan.choices[choice.id]=candidates.map(skill=>skill.code);values[SKILL_EFFECTS_FIELD]=JSON.stringify(plan);
  }
  const baselineValues={...values};for(const skill of characterSkillRules(values))baselineValues[skillComponentFields(skill).other]='0';
  const baseline=calculateCharacterSkills(baselineValues);
  for(const skill of characterSkillRules(values)){
    const otherField=skillComponentFields(skill).other;const other=Number((values[otherField]||'0').replace(',','.'));const raw=values[skill.code]?.trim();const total=raw?Number(raw.replace(',','.')):NaN;const expected=baseline.get(skill.code)?.total;
    if(!Number.isFinite(other))continue;
    if(isVacantCraft(skill,values)&&!other)continue;
    if(Number.isFinite(total)&&Number.isFinite(expected)){
      plan.reconciliation.totals[skill.code]={total,other};
      // Only the unexplained difference remains editable. Matched passives are counted by their named sources.
      values[otherField]=String(total-expected!);
    }else if(previous[skill.code])values[otherField]=String(other-previous[skill.code]);
  }
  values[SKILL_EFFECTS_FIELD]=JSON.stringify(plan);
};

export const skillImportDiscrepancies=(values:Values)=>{
  const plan=parseSkillEffects(values[SKILL_EFFECTS_FIELD]);if(!plan.reconciliation)return [];
  const baseline={...values};for(const skill of characterSkillRules(values))baseline[skillComponentFields(skill).other]='0';
  return [...calculateCharacterSkills(baseline).values()].flatMap(entry=>{
    const field=skillComponentFields(entry.rule).other;const difference=Number((values[field]||'0').replace(',','.'));
    return Number.isFinite(difference)&&difference!==0&&Number.isFinite(entry.total)?[{code:entry.rule.code,name:skillDisplayName(entry.rule,values),field,difference,expected:entry.total,total:entry.total+difference,original:plan.reconciliation!.totals[entry.rule.code]?.total}]:[];
  });
};
export const skillImportIssues=(values:Values):CharacterSheetIssue[]=>skillImportDiscrepancies(values).map(row=>({id:'skill-import:'+row.code,field:row.field,severity:'warning',dismissible:false,autoFixable:false,location:'Perícias → '+row.name+' → Outros',message:`Total ${row.total}; fontes identificadas ${row.expected}. A diferença ${row.difference>0?'+':''}${row.difference} não tem uma fonte registrada. Remova ou ajuste Outros, ou registre uma fonte em Efeitos e bônus.`,reason:`Total ${row.total}; fontes identificadas ${row.expected}. A diferença ${row.difference>0?'+':''}${row.difference} não tem uma fonte registrada. Remova ou ajuste Outros, ou registre uma fonte em Efeitos e bônus.`}));

/** Resolving a missing source may explain an import residual, but never absorbs a later level/attribute gain. */
export const reconcileImportedSkillSources=(values:Values,before:Values)=>{
  const imported=parseSkillEffects(before[SKILL_EFFECTS_FIELD]).reconciliation;if(!imported)return;
  const previous=calculateCharacterSkills(before);const next=calculateCharacterSkills(values);
  for(const [code,original]of Object.entries(imported.totals)){
    const old=previous.get(code);const current=next.get(code);if(!old||!current||old.total!==original.total)continue;
    const field=skillComponentFields(old.rule).other;const residual=Number(before[field]||0);const gain=current.total-old.total;
    if(!residual||!gain||values[field]!==before[field]||Math.sign(gain)!==Math.sign(residual)||Math.abs(gain)>Math.abs(residual))continue;
    if(old.attributeValue!==current.attributeValue||old.attribute!==current.attribute||old.halfLevel!==current.halfLevel||old.training!==current.training||old.size!==current.size||old.penalty!==current.penalty)continue;
    values[field]=String(residual-gain);
  }
};
export const calculateCharacterSkills=(values:Values)=>{
  const level=Number(values.Lv);const owned=characterSkillMechanics(values);const plan=inferSkillEffectChoices(values,parseSkillEffects(values[SKILL_EFFECTS_FIELD]),owned);
  const rules=characterSkillRules(values);
  const trainingPlan=parseTrainingPlan(values[SKILL_TRAINING_FIELD]);
  const priorTraining=Object.values(trainingPlan.duplicates||{}).some(Boolean)?skillTraining(values):undefined;
  const result=new Map<string,{rule:SkillRule;total:number;attribute:string;attributeValue:number;halfLevel:number;training:number;other:number;size:number;penalty:number;trained:boolean;trainedOnly:boolean;sources:AppliedSkillSource[];dice:string[];roll:'best'|'worst'|null;replacement?:string}>();
  for(const skill of rules) {
    const components=skillComponentFields(skill);const selectedAttribute=(values[skill.modifierField.replace('ModAtrib','SeleAtrib')]||skill.attribute).toUpperCase();
    const rawAttribute=plan.attributes[skill.code]?.applied===selectedAttribute?plan.attributes[skill.code].base:selectedAttribute;
    const sources=skillEffectsFor(values,skill,owned,plan).sources;
    for(const mechanic of owned.filter((r)=>r.grant?.duplicate==='bonus'&&trainingPlan.duplicates?.[r.id])) {
      const chosen=trainingPlan.selections?.[mechanic.id]||[];
      if(chosen.length===1&&chosen[0]===skill.code&&priorTraining?.assignments.some(a=>a.code===skill.code&&a.sourceId!==mechanic.id)&&skillMatches(values,skill,mechanic.grant!.allowed))sources.push({id:mechanic.id,name:mechanic.name+' (treinamento anterior)',amount:2,reference:`Heróis de Arton, p. ${mechanic.page}`});
    }
    const trained=checked(values[skill.trainedField])||sources.some((s)=>s.train);
    if(trained)for(const source of sources)if(source.untrainedBonus)source.amount=0;
    const alternative=sources.filter((s)=>s.substitute).sort((a,b)=>attrValue(values,b.substitute!)-attrValue(values,a.substitute!))[0];
    const attribute=alternative&&attrValue(values,alternative.substitute!)>attrValue(values,rawAttribute)?alternative.substitute!:rawAttribute;
    const attributeValue=attrValue(values,attribute);const halfLevel=!trained&&sources.some((s)=>s.noHalfUntrained)?0:Math.floor(level/2);const training=trainingBonus(level,trained);
    const other=Number((values[components.other]||'0').replace(',','.'))-(plan.imported[skill.code]||0);
    const size=Number(values[skill.sizeModifierField||'']||0);const penalty=skill.armorPenalty&&!sources.some((s)=>s.ignoreArmor)?armorPenaltyTotal(values):0;
    // Core p. 226: a skill may add its own key attribute once more, but never
    // add the same attribute from two separate bonus sources.
    const strongest=new Map<string,AppliedSkillSource>();
    for(const source of sources){
      const group=source.attribute?'attribute:'+source.attribute:source.stack&&source.stack!=='ability'?source.stack+':'+Math.sign(source.amount):null;
      if(!group)continue;
      const previous=strongest.get(group);
      if(!previous||Math.abs(source.amount)>Math.abs(previous.amount))strongest.set(group,source);
    }
    let bonus=0;
    for(const source of sources){
      const group=source.attribute?'attribute:'+source.attribute:source.stack&&source.stack!=='ability'?source.stack+':'+Math.sign(source.amount):null;
      if(group&&strongest.get(group)!==source){source.ignored='Não acumula com uma fonte de valor maior ou igual';source.amount=0;}
      bonus+=source.amount;
    }
    const best=sources.some((s)=>s.roll==='best');const worst=sources.some((s)=>s.roll==='worst');
    result.set(skill.code,{rule:skill,total:attributeValue+halfLevel+training+other+size-penalty+bonus,attribute,attributeValue,halfLevel,training,other,size,penalty,trained,trainedOnly:Boolean(skill.trainedOnly&&!sources.some((s)=>s.untrained)),sources,dice:sources.flatMap((s)=>s.dice?[s.dice]:[]),roll:best===worst?null:best?'best':'worst'});
  }
  // Substitutions read the original calculations, preventing cycles and cascading bonuses.
  const originals=new Map([...result].map(([id,entry])=>[id,{...entry}]));
  for(const entry of result.values())for(const source of entry.sources.filter((s)=>s.replaceSkill)) {
    const target=rules.find((r)=>skillMatches(values,r,[source.replaceSkill!]));const replacement=target&&originals.get(target.code);
    if(replacement&&(!replacement.trainedOnly||replacement.trained)&&replacement.total>entry.total){entry.total=replacement.total;entry.replacement=skillDisplayName(replacement.rule,values);entry.dice=[...replacement.dice];entry.roll=replacement.roll;entry.trainedOnly=false;}
  }
  return result;
};

/** Shared by the draft, validation and authoritative combat summaries. */
export const recalculateCharacterSkills=(values:Values)=>{
  const before={...values};const level=Number(values.Lv);if(!Number.isInteger(level)||level<1||level>20)return {};
  synchronizeSkillTraining(values);initializeSkillEffects(values,Boolean(values['BossBar.Recursos.Automaticos']));
  const plan=parseSkillEffects(values[SKILL_EFFECTS_FIELD]);
  for(const entry of calculateCharacterSkills(values).values()) {
    const skill=entry.rule;const components=skillComponentFields(skill);
    const selector=skill.modifierField.replace('ModAtrib','SeleAtrib');const previous=values[selector]||skill.attribute;
    const base=plan.attributes[skill.code]?.applied===previous?plan.attributes[skill.code].base:previous;
    if(entry.attribute!==base)plan.attributes[skill.code]={base,applied:entry.attribute};else delete plan.attributes[skill.code];
    values[selector]=entry.attribute;
    values[components.halfLevel]=String(entry.halfLevel);values[components.training]=String(entry.training);
    const raw=values['Mod'+entry.attribute[0]+entry.attribute.slice(1).toLowerCase()];
    if(raw?.trim()&&/^[+-]?\d+$/.test(raw.trim())){values[skill.modifierField]=String(entry.attributeValue);if(Number.isFinite(entry.total))values[skill.code]=String(entry.total);}
  }
  values[SKILL_EFFECTS_FIELD]=JSON.stringify(plan);
  return Object.fromEntries(Object.entries(values).filter(([key,value])=>value!==before[key]));
};
