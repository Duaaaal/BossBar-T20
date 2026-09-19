import data from './data/t20-training-benefits.json' with { type: 'json' };
import { T20_CATALOG, catalogKey, sourceCitation, type AbilityReference } from './rules-catalog.ts';
import { characterSkillRules, skillDisplayName } from './skill-definitions.ts';
import type { CharacterSheetIssue } from './character-sheet.ts';

type Values = Record<string,string>;
const field='BossBar.Pericias.Fontes';
type BenefitSource=typeof data.sources[number];
export type BenefitGrant={ids:string[]; inserted:Record<string,{field:string;text:string}>};
export type BenefitGrants=Record<string,BenefitGrant>;
const categoryFields:Record<string,string>={race:'BossBar.Habilidades.Raca',origin:'BossBar.Habilidades.Origem',class:'BossBar.Habilidades.Classe',general:'BossBar.Habilidades.Gerais'};
const entries=(text:string)=>text.split(/(?:^|\r?\n)\s*[-•]\s+/).map(t=>t.trim()).filter(Boolean);
const read=(raw?:string):Record<string,unknown>=>{try{const p=JSON.parse(raw||'{}');return p&&typeof p==='object'&&!Array.isArray(p)?p:{};}catch{return {};}};
export const parseBenefitGrants=(raw:unknown):BenefitGrants=>{
  if(!raw||typeof raw!=='object')return {};
  const result:BenefitGrants={};
  for(const [source,value]of Object.entries(raw).slice(0,100)){
    if(!value||typeof value!=='object')continue;const v=value as BenefitGrant;
    const ids=Array.isArray(v.ids)?[...new Set(v.ids.filter(id=>typeof id==='string'&&id.length<=240))].slice(0,2):[];
    const inserted:BenefitGrant['inserted']={};
    for(const [id,entry]of Object.entries(v.inserted||{}).slice(0,2))if(entry&&Object.values(categoryFields).includes(entry.field)&&typeof entry.text==='string'&&entry.text.length<=20000)inserted[id]={field:entry.field,text:entry.text};
    result[source.slice(0,240)]={ids,inserted};
  }
  return result;
};
export const trainingBenefitSources=(values:Values)=>data.sources.filter(source=>catalogKey(values[source.identity]||'')===catalogKey(source.owner)&&!(source.identity==='ORIGEM'&&/^(golem|mashin)/.test(catalogKey(values['RAÇA']||''))));
export const benefitSlots=(values:Values,source:BenefitSource)=>{
  const p=read(values[field]);
  if(source.effectChoiceId){const effects=read(values['BossBar.Pericias.Efeitos']);const choices=(effects.choices||{}) as Record<string,string[]>;return source.max-Math.max(1,Math.min(source.max,choices[source.effectChoiceId]?.length||source.max));}
  const count=(p.choices as Record<string,number>|undefined)?.[source.id];return count===undefined?0:Math.max(0,source.max-count);
};
// The core races below are humanoids; creature types explicitly overridden by their racial abilities are excluded.
const humanoids=new Set(['anao','dahllan','elfo','goblin','hynne','kliren','qareen','sereiatritao']);
export const permittedTrainingBenefits=(values:Values,source:BenefitSource):AbilityReference[]=>{
  const race=catalogKey(values['RAÇA']||'');
  return T20_CATALOG.abilities.filter(ref=>source.allowed.some(name=>{
    if(name==='#general')return ref.category==='general'&&ref.subcategory!=='distincao';
    if(name==='#combate'||name==='#tormenta')return ref.category==='general'&&ref.subcategory===name.slice(1);
    if(name==='#mashin')return ref.category==='race'&&ref.subcategory==='maravilha'&&ref.owner==='Mashin';
    if(name==='#inheritance')return ref.category==='race'&&humanoids.has(catalogKey(ref.owner))&&ref.subcategory!=='racial';
    return catalogKey(ref.name)===catalogKey(name)&&(ref.category==='general'||ref.category==='origin'&&catalogKey(ref.owner)===catalogKey(source.owner));
  })&&(!ref.requiredRaces?.length||ref.requiredRaces.some(name=>catalogKey(name)===race)));
};
export const benefitPrerequisites=(ref:AbilityReference,values:Values)=>{
  const text=(/Pré-requisitos?:\s*([^]*)/i.exec(ref.description)?.[1]?.trim()||'').split(/\.\s+(?=[A-ZÀ-Ý])/)[0];
  const missing:string[]=[];const review:string[]=[];
  if(ref.requiredRaces?.length&&!ref.requiredRaces.some(r=>catalogKey(r)===catalogKey(values['RAÇA']||'')))missing.push('Raça: '+ref.requiredRaces.join(' ou '));
  if(ref.subcategory==='concedido')review.push('Devoção, acesso ao poder e obrigações da divindade.');
  if(ref.subcategory==='grupo')review.push('Exige outro personagem jogador com o mesmo poder na cena.');
  if(text){
    for(const part of text.replace(/\.$/,'').split(/,\s*/)){
      const attribute=/^(For|Des|Con|Int|Sab|Car)\s+([−–-]?\d+)(\s+ou menor)?$/i.exec(part);
      const level=/^(\d+)[º°o]?\s+nível(?: de personagem)?$/i.exec(part);
      const trained=/^treinad[oa] em (.+)$/i.exec(part);
      if(attribute){const key='Mod'+attribute[1][0].toUpperCase()+attribute[1].slice(1).toLowerCase();const current=Number(values[key]);const target=Number(attribute[2].replace(/[−–]/g,'-'));if(!Number.isFinite(current)||(attribute[3]?current>target:current<target))missing.push(part);}
      else if(level){if(Number(values.Lv||0)<Number(level[1]))missing.push(part);}
      else if(trained){
        const groups=trained[1].split(/\s+e\s+/).map(group=>group.split(/\s+ou\s+/).map(name=>characterSkillRules(values).find(skill=>[skill.name,skillDisplayName(skill,values)].some(n=>catalogKey(n)===catalogKey(name)))));
        if(groups.some(group=>group.some(skill=>!skill)))review.push(part);
        else if(!groups.every(group=>group.some(skill=>/^(Yes|Sim|On|true|1)$/i.test(values[skill!.trainedField]||''))))missing.push(part);
      }
      else review.push(part);
    }
  }
  return {text,missing,review};
};

/** Remove only our exact insertion; edited or pre-existing descriptions are never deleted. */
export const synchronizeTrainingBenefits=(values:Values)=>{
  const p=read(values[field]);const grants=parseBenefitGrants(p.benefits);const sources=trainingBenefitSources(values);
  for(const [sourceId,grant]of Object.entries(grants)){
    const source=sources.find(s=>s.id===sourceId);const allowed=source?permittedTrainingBenefits(values,source):[];
    const ids=source?grant.ids.filter(id=>allowed.some(ref=>ref.id===id)).slice(0,benefitSlots(values,source)):[];
    for(const [id,insertion]of Object.entries(grant.inserted))if(!ids.includes(id)){
      const shared=Object.entries(grants).some(([other,g])=>other!==sourceId&&g.ids.includes(id));
      if(shared){const other=Object.entries(grants).find(([key,g])=>key!==sourceId&&g.ids.includes(id))![1];other.inserted[id]??=insertion;}
      else {const all=entries(values[insertion.field]||'');if(all.includes(insertion.text))values[insertion.field]=all.filter(text=>text!==insertion.text).map(text=>'- '+text).join('\n\n');}
      delete grant.inserted[id];
    }
    grant.ids=ids;
    for(const id of ids){const ref=allowed.find(r=>r.id===id)!;const target=categoryFields[ref.category];const all=entries(values[target]||'');
      if(!all.some(text=>catalogKey(text.split(':')[0])===catalogKey(ref.name))){const text=ref.name+': '+ref.description;values[target]=[...all,text].map(t=>'- '+t).join('\n\n');grant.inserted[id]={field:target,text};}
    }
    if(!ids.length&&!Object.keys(grant.inserted).length)delete grants[sourceId];
  }
  if(Object.keys(grants).length||p.benefits){p.benefits=grants;values[field]=JSON.stringify(p);}
};
export const chooseTrainingBenefits=(values:Values,sourceId:string,ids:string[])=>{
  const source=trainingBenefitSources(values).find(s=>s.id===sourceId);if(!source)return false;
  const refs=permittedTrainingBenefits(values,source);if(ids.length>benefitSlots(values,source)||new Set(ids).size!==ids.length||ids.some(id=>!refs.some(ref=>ref.id===id)||benefitPrerequisites(refs.find(ref=>ref.id===id)!,values).missing.length))return false;
  const p=read(values[field]);const grants=parseBenefitGrants(p.benefits);grants[sourceId]={ids,inserted:grants[sourceId]?.inserted||{}};p.benefits=grants;values[field]=JSON.stringify(p);synchronizeTrainingBenefits(values);return true;
};
/** New grants must satisfy known prerequisites even when changes arrive outside the editor UI. */
export const invalidNewTrainingBenefits=(values:Values,original:Values):string[]=>{
  const before=parseBenefitGrants(read(original[field]).benefits);const after=parseBenefitGrants(read(values[field]).benefits);
  return Object.entries(after).flatMap(([sourceId,grant])=>{
    const source=trainingBenefitSources(values).find(s=>s.id===sourceId);const refs=source?permittedTrainingBenefits(values,source):[];
    if(grant.ids.length&&(!source||grant.ids.length>benefitSlots(values,source)))return ['Benefícios incompatíveis com a fonte selecionada.'];
    return grant.ids.filter(id=>!before[sourceId]?.ids.includes(id)).flatMap(id=>{
      const ref=refs.find(r=>r.id===id);if(!ref)return ['A fonte não permite o benefício selecionado.'];
      const missing=benefitPrerequisites(ref,values).missing;return missing.length?[`${ref.name}: pré-requisitos não atendidos — ${missing.join('; ')}.`]:[];
    });
  });
};
export const trainingBenefitIssues=(values:Values):CharacterSheetIssue[]=>{
  const grants=parseBenefitGrants(read(values[field]).benefits);const issues:CharacterSheetIssue[]=[];
  const add=(id:string,message:string,source:BenefitSource)=>issues.push({id:'benefit:'+id,field,location:'Perícias → Fontes de treinamento',message,reason:message,severity:'warning',dismissible:false,autoFixable:false,source:sourceCitation(source)});
  for(const source of trainingBenefitSources(values)){
    const slots=benefitSlots(values,source);const grant=grants[source.id];const refs=permittedTrainingBenefits(values,source);
    if((grant?.ids.length||0)<slots)add(source.id,`${source.owner}: escolha ${slots} poder(es) ou habilidade(s) para completar os benefícios desta fonte.`,source);
    for(const id of grant?.ids||[]){const ref=refs.find(r=>r.id===id);if(!ref){add(id,'A fonte não permite mais o benefício selecionado. Confira a escolha.',source);continue;}
      const prerequisites=benefitPrerequisites(ref,values);if(prerequisites.missing.length)add(id,`${ref.name}: pré-requisitos não atendidos — ${prerequisites.missing.join('; ')}.`,source);else if(prerequisites.review.length)add(id,`${ref.name}: o mestre deve conferir ${prerequisites.review.join('; ')}.`,source);
    }
  }
  return issues;
};

export const trainingBenefitOrigins=(values:Values,referenceId:string)=>{
  const grants=parseBenefitGrants(read(values[field]).benefits);
  return trainingBenefitSources(values).filter(source=>grants[source.id]?.ids.includes(referenceId)).map(source=>(source.identity==='RAÇA'?'Raça: ':'Origem: ')+source.owner);
};
