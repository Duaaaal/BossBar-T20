import test from 'node:test';
import assert from 'node:assert/strict';
import {validSkillEffectChange,startSkillEffect,skillEffectExpired,defaultSkillEffectDuration} from '../src/shared/skill-effect-runtime.ts';
const change=(unit='rounds',amount=1)=>({id:'test',active:true,situation:'situação informada',duration:{unit,amount}});
test('efeitos exigem dados válidos e uma duração finita',()=>{
 assert.equal(validSkillEffectChange(change()),true);for(const invalid of [null,{}, {...change(),situation:''},change('invalid'),change('rounds',0),change('rounds',Infinity),change('minutes',1.5)])assert.equal(validSkillEffectChange(invalid),false);
 assert.equal(validSkillEffectChange({id:'test',active:false}),true);
});
test('rodadas expiram no início do turno do proprietário, sem usar tempo real',()=>{
 const effect=startSkillEffect(change(),3,'player:a');assert.equal(skillEffectExpired(effect,3,'boss:b','player:a'),false);assert.equal(skillEffectExpired(effect,4,'boss:b','player:a'),false);assert.equal(skillEffectExpired(effect,4,'player:a','player:a'),true);assert.equal(skillEffectExpired(effect,5,'boss:b','player:a'),true);
 const beforeInitiative=startSkillEffect(change(),0,null);assert.equal(skillEffectExpired(beforeInitiative,1,'player:a','player:a'),false);assert.equal(skillEffectExpired(beforeInitiative,2,'player:a','player:a'),true);
});
test('minutos/horas usam rodadas e turno atual termina ao avançar',()=>{
 assert.equal(startSkillEffect(change('minutes',2),1,'player:a').expiresRound,21);assert.equal(startSkillEffect(change('hours',1),1,'player:a').expiresRound,601);
 const turn=startSkillEffect(change('turn'),3,'player:a');assert.equal(skillEffectExpired(turn,3,'player:a','player:a'),false);assert.equal(skillEffectExpired(turn,3,'boss:b','player:a'),true);
 assert.equal(skillEffectExpired(startSkillEffect(change('scene'),1,'player:a'),10,'boss:b','player:a'),false);
});
test('durações explícitas preenchem o controle sem confundir custo por rodada',()=>{
 assert.deepEqual(defaultSkillEffectDuration('Duração: 1 minuto. Você pode gastar 1 PM.'),{unit:'minutes',amount:1});assert.deepEqual(defaultSkillEffectDuration('Até o fim do seu turno'),{unit:'turn',amount:1});assert.deepEqual(defaultSkillEffectDuration('Seu próximo teste recebe +2'),{unit:'test',amount:1});assert.deepEqual(defaultSkillEffectDuration('Você pode gastar 1 PM por rodada para manter o efeito'),{unit:'scene',amount:1});
});
