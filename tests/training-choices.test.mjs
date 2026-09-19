import test from 'node:test';
import assert from 'node:assert/strict';
import { trainingChoiceSources, selectSourceTraining, skillTraining, synchronizeSkillTraining, SKILL_TRAINING_FIELD, parseTrainingPlan } from '../src/shared/skill-training.ts';
const fresh=()=>{const values={Lv:'1',CLASSE:'Guerreiro 1','RAÇA':'Humano',ModInt:'1'};synchronizeSkillTraining(values);return values;};

test('fontes limitadas vêm antes das livres; obrigatórias não viram etapas',()=>{
 const values=fresh();const sources=trainingChoiceSources(values);
 assert.equal(sources[0].id,'class:mandatory:0');assert.equal(sources[1].id,'class:choices');
 assert.ok(sources.slice(2).every(s=>s.allowed.includes('*')));assert.ok(sources.every(s=>!s.fixed));
 assert.equal(values['Mar Trei forti'],'Yes');
});
test('escolha explícita permanece na sua fonte e impede uso da mesma perícia em duas fontes',()=>{
 const values=fresh();assert.equal(selectSourceTraining(values,'class:mandatory:0','190',true),true);
 assert.equal(selectSourceTraining(values,'intelligence','260',true),true);
 let state=skillTraining(values);assert.equal(state.assignments.find(a=>a.code==='260').sourceId,'intelligence');
 assert.equal(selectSourceTraining(values,'class:choices','260',true),false);
 assert.equal(selectSourceTraining(values,'class:choices','130',true),true);
 synchronizeSkillTraining(values);state=skillTraining(values);
 assert.equal(state.assignments.find(a=>a.code==='260').sourceId,'intelligence');
 assert.equal(selectSourceTraining(values,'intelligence','260',false),true);assert.equal(values['Mar Trei ponta'],'Off');
 assert.equal(selectSourceTraining(values,'class:choices','260',true),true);
});
test('limite, lista, campos fixos e metadados não permitem concessões forjadas',()=>{
 const values=fresh();assert.equal(selectSourceTraining(values,'class:mandatory:0','070',true),false);
 assert.equal(selectSourceTraining(values,'class:mandatory:1','120',false),false);
 assert.equal(selectSourceTraining(values,'intelligence','260',true),true);
 assert.equal(selectSourceTraining(values,'intelligence','070',true),false);
 const plan=parseTrainingPlan(values[SKILL_TRAINING_FIELD]);assert.ok(plan.explicit.includes('intelligence'));
 synchronizeSkillTraining(values);assert.deepEqual(parseTrainingPlan(values[SKILL_TRAINING_FIELD]).selections.intelligence,['260']);
});
