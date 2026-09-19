import { CHARACTER_OPTIONS } from './character-options.ts';
import { catalogKey } from './rules-catalog.ts';
/** Livro Básico — Jogo do Ano, pp. 106–107. Weapon size is independent. */
export const CHARACTER_SIZES = [
  { name: 'Minúsculo', stealth: 5, maneuvers: -5, reach: 1.5 },
  { name: 'Pequeno', stealth: 2, maneuvers: -2, reach: 1.5 },
  { name: 'Médio', stealth: 0, maneuvers: 0, reach: 1.5 },
  { name: 'Grande', stealth: -2, maneuvers: 2, reach: 3 },
  { name: 'Enorme', stealth: -5, maneuvers: 5, reach: 4.5 },
  { name: 'Colossal', stealth: -10, maneuvers: 10, reach: 9 },
] as const;
export const characterSize = (name: string) => /^[1-6]$/.test(name.trim()) ? CHARACTER_SIZES[Number(name.trim())-1] : CHARACTER_SIZES.find((size) =>
  size.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() === name.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase());

/** A race has medium size unless its racial rules change it. Optional chassis and duendes require a choice. */
export const raceSize = (race: string): {name: string; choices?: string[]; source: string}|undefined => {
  const key=catalogKey(race);const option=CHARACTER_OPTIONS.find(o=>o.kind==='race'&&catalogKey(o.name)===key);
  if(key==='duende')return {name:'',choices:['Minúsculo','Pequeno','Médio','Grande'],source:'Heróis de Arton, p. 9'};
  if(option&&key.startsWith('golem'))return {name:'',choices:['Pequeno','Médio','Grande'],source:'Ameaças de Arton, p. 135'};
  if(!option&&!['humana','sereia','tritao'].includes(key))return undefined;
  const name=key==='silfide'?'Minúsculo':['goblin','hynne','nezumi'].includes(key)?'Pequeno':['galokk','centauro','ceratops','ogro'].includes(key)?'Grande':'Médio';
  return {name,source:option?`${option.sourceId==='core'?'Livro Básico':option.sourceId==='heroes'?'Heróis de Arton':option.sourceId==='gods'?'Deuses de Arton':'Ameaças de Arton'}, p. ${option.page}`:'Livro Básico, p. 19 e 29'};
};
export const synchronizeCharacterSize = (values:Record<string,string>,raceChanged=false) => {
  const racial=raceSize(values['RAÇA']||'');
  if(raceChanged&&racial)values.SeleTamanho=racial.name;
  const size=characterSize(values.SeleTamanho||'');
  if(size)values.SeleTamanho=size.name;
  else if(racial&&!values.SeleTamanho?.trim())values.SeleTamanho=racial.name;
  const selected=characterSize(values.SeleTamanho||'');
  if(selected){values.ModFurtTam=String(selected.stealth);values['BossBar.ManobrasTamanho']=String(selected.maneuvers);}
  else if(raceChanged){values.ModFurtTam='0';values['BossBar.ManobrasTamanho']='0';}
};
