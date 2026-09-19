import { validSkillActivations, type SkillTestActivation } from './skill-activation.ts';
export type SkillEffectDuration={unit:'scene'|'rounds'|'minutes'|'hours'|'turn'|'test';amount:number};
export type SkillEffectChange={id:string;active:boolean;situation?:string;value?:number;duration?:SkillEffectDuration};
export type ActiveSkillEffect=SkillTestActivation & {duration:SkillEffectDuration;activatedRound:number;expiresRound:number|null;activatedTurn:string|null};
export const validSkillEffectChange=(raw:unknown):raw is SkillEffectChange=>{
  if(!raw||typeof raw!=='object')return false;const value=raw as SkillEffectChange;
  if(typeof value.id!=='string'||!value.id||value.id.length>240||typeof value.active!=='boolean')return false;
  if(!value.active)return true;
  return validSkillActivations([{id:value.id,situation:value.situation,value:value.value}])&&Boolean(value.duration&&['scene','rounds','minutes','hours','turn','test'].includes(value.duration.unit)&&Number.isInteger(value.duration.amount)&&value.duration.amount>=1&&value.duration.amount<=1000);
};
export const startSkillEffect=(change:SkillEffectChange,round:number,activeTurn:string|null):ActiveSkillEffect=>{
  const duration=change.duration!;const rounds=duration.unit==='rounds'?duration.amount:duration.unit==='minutes'?duration.amount*10:duration.unit==='hours'?duration.amount*600:null;
  return {id:change.id,situation:change.situation!.trim(),value:change.value,duration,activatedRound:round,activatedTurn:activeTurn,expiresRound:rounds===null?null:Math.max(1,round)+rounds};
};
/** Durations use game time: ten six-second rounds per minute. */
export const skillEffectExpired=(effect:ActiveSkillEffect,round:number,activeTurn:string|null,ownerTurn:string)=>{
  if(effect.duration.unit==='turn')return activeTurn!==effect.activatedTurn;
  return effect.expiresRound!==null&&(round>effect.expiresRound||round===effect.expiresRound&&activeTurn===ownerTurn);
};
export const skillEffectDurationLabel=(effect:ActiveSkillEffect,round:number)=>effect.duration.unit==='scene'?'Até encerrar o combate':effect.duration.unit==='turn'?'Até terminar o turno atual':effect.duration.unit==='test'?'Próximo teste':`${Math.max(0,(effect.expiresRound||round)-round)} rodada(s) restantes`;
export const defaultSkillEffectDuration=(description:string):SkillEffectDuration=>{
  if(/próximo teste|um único teste|próximo ataque/i.test(description))return {unit:'test',amount:1};
  if(/até o (?:fim|final) d[oe] (?:seu )?turno(?! seguinte| próximo)/i.test(description))return {unit:'turn',amount:1};
  const explicit=/(?:duração:\s*|(?:por|durante)\s+)(\d+)\s+(rodadas?|minutos?|horas?)/i.exec(description);
  if(explicit)return {unit:/rodada/i.test(explicit[2])?'rounds':/minuto/i.test(explicit[2])?'minutes':'hours',amount:Number(explicit[1])};
  return {unit:'scene',amount:1};
};
