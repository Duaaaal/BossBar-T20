import type { CharacterSheetSummary } from './character-sheet.ts';
import { parseDamageFormula, rollDamageFormulaDetailed } from './status.ts';

/** Bonuses from the same non-cumulative source category use the highest result,
 * including a fixed bonus already contained in the approved skill total. */
export const rollSkillBonuses=(skill:CharacterSheetSummary['skills'][number],random:(min:number,max:number)=>number)=>{
  const remaining=[...(skill.sources||[])];
  const bonuses=(skill.bonusDice||[]).flatMap(formula=>{
    const parsed=parseDamageFormula(formula);if(!parsed)return [];
    const index=remaining.findIndex(source=>source.dice===formula);const source=index<0?undefined:remaining.splice(index,1)[0];
    return [{formula,source,...rollDamageFormulaDetailed(parsed,random)}];
  });
  let extra=0;const terms:string[]=[];const groups=new Map<string,typeof bonuses>();
  for(const bonus of bonuses){
    const stack=bonus.source?.stack;
    if(stack&&stack!=='ability'){groups.set(stack,[...(groups.get(stack)||[]),bonus]);}
    else{extra+=bonus.total;terms.push(bonus.formula);}
  }
  for(const [stack,rolls]of groups){
    const base=Math.max(0,...(skill.sources||[]).filter(source=>source.stack===stack).map(source=>source.amount));
    extra+=Math.max(base,...rolls.map(roll=>roll.total+(roll.source?.amount||0)))-base;
    terms.push(rolls.length===1&&!base?rolls[0].formula:`maior(${[String(base),...rolls.map(roll=>roll.formula)].join('; ')})${base?' - '+base:''}`);
  }
  return {extra,rolls:bonuses.flatMap(bonus=>bonus.rolls),expression:terms.map(term=>' + '+term).join('')};
};

/** Approved skill totals and dice are shared by attacks, saves and first aid. */
export const rollSkill = (skill: CharacterSheetSummary['skills'][number], random: (min:number,max:number)=>number, initialDie?:number) => {
  const dice=[initialDie??random(1,21)];
  if(skill.rollMode)dice.push(random(1,21));
  const die=skill.rollMode==='best'?Math.max(...dice):skill.rollMode==='worst'?Math.min(...dice):dice[0];
  const bonuses=rollSkillBonuses(skill,random);const extra=bonuses.extra;const modifier=skill.total||0;
  return {die,dice,extra,modifier,total:die+modifier+extra,rolls:[...dice,...bonuses.rolls],rollMode:skill.rollMode||'sum' as const,expression:`${dice.length}d20 ${modifier<0?'-':'+'} ${Math.abs(modifier)}${bonuses.expression}`};
};
