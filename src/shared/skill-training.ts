import { parseBenefitGrants, synchronizeTrainingBenefits, trainingBenefitIssues, type BenefitGrants } from './training-benefits.ts';
import data from './data/t20-skill-training.json' with { type: 'json' };
import { catalogKey, T20_CATALOG } from './rules-catalog.ts';
import { parseCharacterClasses } from './character-classes.ts';
import { allSkillRules, characterSkillRules, skillDisplayName, skillComponentFields, isVacantCraft, type SkillRule } from './skill-definitions.ts';
import { characterSkillMechanics, permanentIntelligence, skillMatches, skillRuleCitation } from './skill-mechanics.ts';
import type { CharacterSheetIssue } from './character-sheet.ts';

export const SKILL_TRAINING_FIELD = 'BossBar.Pericias.Fontes';
type Values = Record<string, string>;
type ClassRule = { mandatory: string[][]; count: number; allowed: string[]; sourceId: string; page: number };
type OriginRule = { choices?: number; allowed?: string[]; review?: string; sourceId: string; page: number };
export type TrainingPlan = { benefits?:BenefitGrants; version: 1|2; choices: Record<string, number>; extra: { skill: string; source: string; note: string }[]; reviewedOrigin?: string;
  automatic?:Record<string,string[]>; selections?:Record<string,string[]>; retired?:string[]; sourceKeys?:Record<string,string>; duplicates?:Record<string,boolean>; explicit?:string[];
};
export const parseTrainingPlan = (value?: string): TrainingPlan => {
  try {
    const p = JSON.parse(value || '{}');
    if ([1,2].includes(p.version) && p.choices && typeof p.choices === 'object' && Array.isArray(p.extra)) return {
      benefits:parseBenefitGrants(p.benefits),
      version: p.version, choices: Object.fromEntries(Object.entries(p.choices).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isInteger(entry[1]) && entry[1] >= 0 && entry[1] <= 40)),
      extra: p.extra.slice(0, 40).filter((e: TrainingPlan['extra'][number]) => e && allSkillRules.some(({ code }) => code === e.skill) && typeof e.source === 'string' && e.source.trim() && typeof e.note === 'string' && e.note.trim()).map((e: TrainingPlan['extra'][number]) => ({ skill: e.skill, source: e.source.slice(0, 160), note: e.note.slice(0, 500) })),
      reviewedOrigin: typeof p.reviewedOrigin === 'string' ? p.reviewedOrigin : undefined,
      automatic: safeAssignments(p.automatic), selections:safeAssignments(p.selections),
      explicit:Array.isArray(p.explicit)?p.explicit.filter((id:unknown):id is string=>typeof id==='string').slice(0,200):[],
      retired:Array.isArray(p.retired)?p.retired.filter((v:unknown):v is string=>typeof v==='string').slice(0,40):[],
      sourceKeys:Object.fromEntries(Object.entries(p.sourceKeys||{}).filter((e):e is [string,string]=>typeof e[1]==='string').slice(0,200)),
      duplicates:Object.fromEntries(Object.entries(p.duplicates||{}).filter((e):e is [string,boolean]=>typeof e[1]==='boolean').slice(0,100)),
    };
  } catch { /* An incomplete draft grants no additional training. */ }
  return { version: 1, choices: {}, extra: [] };
};
const safeAssignments=(raw:unknown):Record<string,string[]>=>!raw||typeof raw!=='object'?{}:Object.fromEntries(Object.entries(raw).filter((e):e is [string,string[]]=>Array.isArray(e[1])&&e[1].every((v:unknown)=>typeof v==='string')).slice(0,200).map(([k,v])=>[k.slice(0,240),v.slice(0,40)]));
const checked = (value?: string) => /^(Yes|Sim|On|true|1)$/i.test(value || '');
const citation = (rule: { sourceId: string; page: number }) => `${T20_CATALOG.sources.find(({ id }) => id === rule.sourceId)?.name || rule.sourceId}, p. ${rule.page}`;
const skillName = (values: Values, rule: SkillRule) => skillDisplayName(rule,values);
const matches = skillMatches;

/** Match selections against finite grants; a skill cannot spend two grants at once. */
export const skillTraining = (values: Values) => {
  const skillRules=characterSkillRules(values);
  const selected = skillRules.filter((rule) => checked(values[rule.trainedField]));
  const initial = parseCharacterClasses(values.CLASSE || '', Number(values.Lv) || 1)[0];
  const rule = initial && Object.entries(data.classes as Record<string, ClassRule>).find(([name]) => catalogKey(name) === catalogKey(initial.name))?.[1];
  const plan = parseTrainingPlan(values[SKILL_TRAINING_FIELD]);
  const sources: { id: string; key:string; label: string; count: number; max: number; min: number; choice: boolean; confirmed: boolean; allowed: string[]; source: string; fixed:boolean; duplicate?:'class'|'bonus' }[] = [];
  const pending: string[] = []; const issues: CharacterSheetIssue[] = trainingBenefitIssues(values);
  const slots: { id: string; label: string; allowed: string[] }[] = [];
  const source = (id: string, label: string, count: number, allowed: string[], reference: string, choice = false, min = 0, duplicate?:'class'|'bonus') => {
    const chosen = choice ? plan.choices[id] : count;
    const valid = chosen !== undefined && chosen >= min && chosen <= count;
    if (choice && !valid) pending.push(`Confirme quantas perícias foram obtidas por ${label} em Fontes de treinamento.`);
    const actual = valid ? chosen : count;
    const fixed=allowed.length===1&&!['*','Ofício'].includes(allowed[0])&&!allowed[0].startsWith('#')&&!choice;
    sources.push({ id, key:id.startsWith('class:')?id+':'+catalogKey(initial?.name||''):id, label, count: actual, max: count, min, allowed, choice, confirmed: valid, source: reference,fixed,duplicate });
    for (let i = 0; i < actual; i++) slots.push({ id, label, allowed });
  };
  const issue = (id: string, field: string, message: string, severity: 'error' | 'warning' = 'warning', expected?: string) => issues.push({ id: `training:${id}`, field, severity, message, reason: message, location: 'Perícias → Fontes de treinamento', source: 'Livro Básico, p. 17, 35 e 114', autoFixable: expected !== undefined, ...(expected !== undefined ? { expected } : {}) });
  if (rule) {
    for (const [index, group] of rule.mandatory.entries()) {
      source(`class:mandatory:${index}`, `${initial.name}: ${group.join(' ou ')}`, 1, group, citation(rule));
      if (!selected.some((skill) => matches(values, skill, group))) {
        const exact = group.length === 1 ? skillRules.find((skill) => matches(values, skill, group)) : undefined;
        issue(`mandatory:${index}`, exact?.trainedField || SKILL_TRAINING_FIELD, `A classe inicial exige treinamento em ${group.join(' ou ')}.`);
      }
    }
    source('class:choices', `${initial.name}: escolhas da classe`, rule.count, rule.allowed, citation(rule));
  } else if (initial) pending.push('Classe inicial personalizada ou não reconhecida: registre seus treinamentos em Fontes adicionais para revisão do mestre.');
  const intelligence = permanentIntelligence(values);
  source('intelligence', 'Inteligência permanente', Number.isFinite(intelligence) ? Math.min(99, Math.max(0, Math.floor(intelligence))) : 0, ['*'], 'Livro Básico, p. 17 e 114');
  const origin = Object.entries(data.origins as Record<string, OriginRule>).find(([name]) => catalogKey(name) === catalogKey(values.ORIGEM || ''))?.[1];
  const noOrigin=/^(golem|mashin)/.test(catalogKey(values['RAÇA']||''));
  if (origin?.allowed&&!noOrigin) source('origin:' + catalogKey(values.ORIGEM), `Origem: ${values.ORIGEM}`, origin.choices || 0, origin.allowed, citation(origin), true);
  else if (values.ORIGEM?.trim()&&!noOrigin&&!origin && plan.reviewedOrigin !== values.ORIGEM) pending.push('Confira os benefícios da origem personalizada e registre seus treinamentos nas fontes adicionais.');
  else if(catalogKey(values.ORIGEM||'')==='amnesico'&&plan.reviewedOrigin!==values.ORIGEM)pending.push('Amnésico: registre a perícia escolhida pelo mestre nas fontes adicionais.');
  const mechanics=characterSkillMechanics(values);
  for(const mechanic of mechanics) {
    const grant=mechanic.grant;if(!grant||mechanic.kind==='origin'&&noOrigin)continue;
    const id=mechanic.kind==='race'?'race:'+catalogKey(mechanic.owner):mechanic.id;
    const repeated=grant.allowed.length===1&&!['Ofício','*'].includes(grant.allowed[0])&&!grant.allowed[0].startsWith('#')&&slots.some((s)=>s.allowed.length===1&&catalogKey(s.allowed[0])===catalogKey(grant.allowed[0]));
    if(repeated&&!grant.duplicate)continue;
    if(grant.duplicate==='bonus'&&plan.duplicates?.[id]===true){source(id,`${mechanic.owner} — ${mechanic.name}`,0,grant.allowed,skillRuleCitation(mechanic),false,0,'bonus');sources[sources.length-1].fixed=false;continue;}
    const count=grant.perTier?1+Number(Number(values.Lv)>=5)+Number(Number(values.Lv)>=11)+Number(Number(values.Lv)>=17):grant.count;
    source(id,`${mechanic.owner} — ${mechanic.name}`,count,grant.allowed,skillRuleCitation(mechanic),grant.minimum!==undefined,grant.minimum||0,grant.duplicate);
    if(grant.duplicate==='class'&&repeated){const slot=slots[slots.length-1];slot.allowed=rule?.allowed||[];sources[sources.length-1].allowed=slot.allowed;sources[sources.length-1].fixed=false;}
  }
  for (const entry of plan.extra) {const skill=skillRules.find(({code})=>code===entry.skill);if(skill)source('extra:' + entry.skill, `${entry.source}: ${entry.note}`, 1, [skillName(values, skill)], 'Registro sujeito à aprovação do mestre');}
  const assigned = new Map<number, SkillRule>();
  const assign = (skill: SkillRule, visited: Set<number>): boolean => {
    const preferred = Object.keys(plan.selections || {}).filter(id => plan.selections![id].includes(skill.code));
    const ordered = [...slots.entries()].sort(([a, sa], [b, sb]) => {
      // A fixed grant owns its skill before any free choice can claim it.
      const priority = (slot: typeof sa) => sources.find(s => s.id === slot.id)?.fixed ? 0 : preferred.includes(slot.id) ? 1 : 2;
      return priority(sa) - priority(sb) || a - b;
    });
    for (const [index, slot] of ordered) {
      if (visited.has(index) || !matches(values, skill, slot.allowed)) continue;
      const explicitOwner = plan.explicit?.find(id => plan.selections?.[id]?.includes(skill.code));
      if (explicitOwner && explicitOwner !== slot.id) continue;
      if (plan.explicit?.includes(slot.id) && !plan.selections?.[slot.id]?.includes(skill.code)) continue;
      visited.add(index); const previous = assigned.get(index);
      if (!previous || assign(previous, visited)) { assigned.set(index, skill); return true; }
    }
    return false;
  };
  const unmatched = selected.filter((skill) => !assign(skill, new Set()));
  // An origin may replace a proficiency already paid for by another source.
  for(const s of sources.filter((s)=>s.duplicate==='class'&&s.fixed)) {
    const assignedOriginal=[...assigned].find(([i,skill])=>slots[i].id!==s.id&&matches(values,skill,s.allowed));
    if(assignedOriginal){const slot=slots.find((slot)=>slot.id===s.id)!;slot.allowed=rule?.allowed||[];s.allowed=slot.allowed;s.fixed=false;}
  }
  if(sources.some((s)=>s.duplicate==='class')){assigned.clear();unmatched.splice(0,unmatched.length,...selected.filter((skill)=>!assign(skill,new Set())));}
  for (const skill of unmatched) issue(`excess:${skill.code}`, skill.trainedField, `${skill.name} não cabe nas escolhas da classe inicial e nas fontes de treinamento registradas. Desmarque-a ou registre a fonte que concede esse treinamento.`, 'warning');
  for (const s of sources.filter(s => s.duplicate === 'bonus' && !s.count)) {
    const chosen = plan.selections?.[s.id] || [];
    if (chosen.length !== 1 || ![...assigned].some(([i, skill]) => slots[i].id !== s.id && skill.code === chosen[0] && matches(values, skill, s.allowed))) {
      issue('duplicate:' + s.id, SKILL_TRAINING_FIELD, `${s.label}: o bônus de +2 exige uma perícia treinada por outra fonte. Escolha um treinamento anterior válido ou receba uma nova perícia.`);
    }
  }
  for (const s of selected.filter(s => s.nameField && /^(?:qualquer|\s*)$/i.test(values[s.nameField!] || ''))) issue('craft:' + s.code, s.nameField!, 'Informe a especialização deste Ofício; cada profissão tem seu próprio treinamento.');
  for (const [i, message] of pending.entries()) issue(`source:${i}`, SKILL_TRAINING_FIELD, message);
  const remaining = slots.length - assigned.size;
  if (rule && remaining > 0) issue('remaining', SKILL_TRAINING_FIELD, `Restam ${remaining} treinamento(s) nas fontes configuradas. Confira as escolhas disponíveis em Fontes de treinamento.`);
  for(const name of plan.retired||[])issue('retired:'+catalogKey(name),SKILL_TRAINING_FIELD,`${name}: a fonte anterior mudou ou foi removida. Confira as escolhas de treinamento afetadas.`);
  return { selected, sources, plan, issues, unmatched, remaining, maximum: slots.length, classRule: rule, assignments: [...assigned].map(([index, skill]) => ({ skill: skillName(values,skill), code: skill.code, sourceId: slots[index].id, source: slots[index].label })) };
};

/** Automatic ownership is persisted separately from master grants and unknown imports. */
export const synchronizeSkillTraining=(values:Values)=>{
  const before={...values};synchronizeTrainingBenefits(values);let state=skillTraining(values);const plan=state.plan;
  const keys=Object.fromEntries(state.sources.map((s)=>[s.id,s.key]));
  const retained = new Map<string,Set<string>>();
  for (const source of state.sources) {
    const previous = [...new Set([...(plan.selections?.[source.id] || []), ...Object.entries(plan.automatic || {}).filter(([, owners]) => owners.includes(source.id)).map(([code]) => code)])];
    retained.set(source.id, new Set(previous.filter(code => {
      const skill = allSkillRules.find(r => r.code === code);
      return skill && checked(values[skill.trainedField]) && matches(values, skill, source.allowed) && plan.sourceKeys?.[source.id] === source.key;
    }).slice(0, source.count)));
  }
  for(const [code,owners] of Object.entries(plan.automatic||{})) {
    const removed=owners.every((id)=>!retained.get(id)?.has(code));
    if(removed&&!plan.extra.some((e)=>e.skill===code)) {
      const rule=allSkillRules.find((r)=>r.code===code);if(rule&&checked(values[rule.trainedField])){values[rule.trainedField]='Off';plan.retired=[...new Set([...(plan.retired||[]),skillName(values,rule)])];}
    }
  }
  const automatic:Record<string,string[]>={};
  for(const source of state.sources.filter((s)=>s.fixed)) {
    let rule=characterSkillRules(values).find((r)=>matches(values,r,source.allowed));
    const craft=/^Ofício\s*\((.+)\)$/i.exec(source.allowed[0]);
    if(!rule&&craft){rule=allSkillRules.find((r)=>isVacantCraft(r,values));if(rule){values[rule.nameField!]=craft[1];values[rule.modifierField.replace('ModAtrib','SeleAtrib')]='INT';values[skillComponentFields(rule).other]='0';}}
    if(rule){values[rule.trainedField]='Yes';automatic[rule.code]=[...(automatic[rule.code]||[]),source.id];}
  }
  values[SKILL_TRAINING_FIELD]=JSON.stringify(plan);state=skillTraining(values);
  const selections:Record<string,string[]>={};
  for(const assignment of state.assignments){
    // Fixed grants never acquire a second, arbitrary free-choice owner.
    if(!automatic[assignment.code]?.length)automatic[assignment.code]=[assignment.sourceId];
    selections[assignment.sourceId]=[...(selections[assignment.sourceId]||[]),assignment.code];
  }
  for (const [id, codes] of Object.entries(plan.selections || {})) if (state.sources.some(s => s.id === id && s.duplicate === 'bonus' && !s.count)) selections[id] = codes;
  plan.version=2;plan.automatic=automatic;plan.sourceKeys=keys;plan.selections=selections;
  values[SKILL_TRAINING_FIELD]=JSON.stringify(plan);
  return Object.fromEntries(Object.entries(values).filter(([name,value])=>before[name]!==value));
};

/** Limited choices precede unrestricted sources; mandatory grants are a compact summary. */
export const trainingChoiceSources = (values: Values) => skillTraining(values).sources
  .filter(source => !source.fixed && !source.id.startsWith('extra:') && (source.max > 0 || source.duplicate))
  .sort((a,b) => Number(a.allowed.includes('*')) - Number(b.allowed.includes('*')) ||
    characterSkillRules(values).filter(skill => matches(values,skill,a.allowed)).length - characterSkillRules(values).filter(skill => matches(values,skill,b.allowed)).length);

/** Explicit choices belong to exactly one source and cannot be silently reassigned. */
export const selectSourceTraining = (values: Values, sourceId: string, code: string, selected: boolean) => {
  const state=skillTraining(values); const source=state.sources.find(s=>s.id===sourceId);
  const skill=characterSkillRules(values).find(s=>s.code===code);
  if(!source || source.fixed || !skill || !matches(values,skill,source.allowed))return false;
  const owner=state.assignments.find(a=>a.code===code);
  if(owner && owner.sourceId!==sourceId)return false;
  const codes=state.assignments.filter(a=>a.sourceId===sourceId).map(a=>a.code);
  if(selected && !codes.includes(code) && codes.length>=source.count)return false;
  const plan=state.plan;plan.explicit=[...new Set([...(plan.explicit||[]),sourceId])];
  plan.selections={...plan.selections,[sourceId]:selected?[...new Set([...codes,code])]:codes.filter(c=>c!==code)};
  values[skill.trainedField]=selected?'Yes':'Off'; values[SKILL_TRAINING_FIELD]=JSON.stringify(plan);
  synchronizeSkillTraining(values); return true;
};
