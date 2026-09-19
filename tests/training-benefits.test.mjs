import test from 'node:test';
import assert from 'node:assert/strict';
import {trainingBenefitSources,permittedTrainingBenefits,chooseTrainingBenefits,benefitPrerequisites,synchronizeTrainingBenefits,trainingBenefitIssues,parseBenefitGrants} from '../src/shared/training-benefits.ts';
import {SKILL_TRAINING_FIELD,synchronizeSkillTraining,parseTrainingPlan} from '../src/shared/skill-training.ts';
import {T20_CATALOG} from '../src/shared/rules-catalog.ts';
import {sheetAbilities} from '../src/shared/character-sheet-content.ts';
const power=name=>T20_CATALOG.abilities.find(r=>r.name===name);
const fresh=(race='Humano',origin='')=>{const values={'RAÇA':race,ORIGEM:origin,CLASSE:'Guerreiro 1',Lv:'1',ModFor:'2',ModDes:'2',ModInt:'0',ModCon:'1',ModSab:'1',ModCar:'0',[SKILL_TRAINING_FIELD]:JSON.stringify({version:2,choices:{'race:humano':1,'race:osteon':0,'race:mashin':1,'origin:acolito':1},extra:[]})};synchronizeSkillTraining(values);return values;};

test('Versátil insere na categoria do livro e preserva origem após sincronização',()=>{
 const v=fresh();assert.equal(chooseTrainingBenefits(v,'race:humano',[power('Sortudo').id]),true);synchronizeSkillTraining(v);
 assert.match(v['BossBar.Habilidades.Gerais'],/Sortudo/);assert.equal(sheetAbilities(v).find(a=>a.name==='Sortudo').acquiredFrom,'Raça: Humano');
 assert.deepEqual(parseTrainingPlan(v[SKILL_TRAINING_FIELD]).benefits['race:humano'].ids,[power('Sortudo').id]);
 const plan=JSON.parse(v[SKILL_TRAINING_FIELD]);plan.choices['race:humano']=2;v[SKILL_TRAINING_FIELD]=JSON.stringify(plan);synchronizeSkillTraining(v);
 assert.doesNotMatch(v['BossBar.Habilidades.Gerais'],/Sortudo/);
});
test('trocar fonte não apaga poderes importados, personalizados ou concedidos por outra fonte',()=>{
 for(const customize of [false,true]){const v=fresh();if(!customize)v['BossBar.Habilidades.Gerais']='- Sortudo: Texto da ficha original';chooseTrainingBenefits(v,'race:humano',[power('Sortudo').id]);if(customize)v['BossBar.Habilidades.Gerais']+=' Minha adaptação.';const original=v['BossBar.Habilidades.Gerais'];v['RAÇA']='Elfo';synchronizeSkillTraining(v);assert.equal(v['BossBar.Habilidades.Gerais'],original);}
 const v=fresh('Humano','Artesão');const plan=JSON.parse(v[SKILL_TRAINING_FIELD]);plan.choices['origin:artesao']=1;v[SKILL_TRAINING_FIELD]=JSON.stringify(plan);
 chooseTrainingBenefits(v,'race:humano',[power('Sortudo').id]);chooseTrainingBenefits(v,'origin:artesao',[power('Sortudo').id]);v['RAÇA']='Elfo';synchronizeSkillTraining(v);assert.match(v['BossBar.Habilidades.Gerais'],/Sortudo/);v.ORIGEM='';synchronizeSkillTraining(v);assert.doesNotMatch(v['BossBar.Habilidades.Gerais'],/Sortudo/);
});
test('origens filtram poderes próprios e gerais permitidos; fontes rejeitam ids e quantidades inválidos',()=>{
 const v=fresh('Humano','Acólito');const source=trainingBenefitSources(v).find(s=>s.id==='origin:acolito');const options=permittedTrainingBenefits(v,source);
 assert.deepEqual(options.map(r=>r.name).sort(),['Medicina','Membro da Igreja','Vontade de Ferro'].sort());
 assert.equal(chooseTrainingBenefits(v,'origin:acolito',[power('Sortudo').id]),false);
 assert.equal(chooseTrainingBenefits(v,'race:humano',[power('Sortudo').id,power('Atlético').id]),false);
 assert.equal(chooseTrainingBenefits(v,'race:humano',['forged']),false);
 assert.equal(chooseTrainingBenefits(v,'origin:acolito',[power('Membro da Igreja').id]),true);assert.match(v['BossBar.Habilidades.Origem'],/Membro da Igreja/);
 assert.ok(trainingBenefitIssues(fresh()).some(i=>i.dismissible===false));
});
test('pré-requisitos conhecidos bloqueiam; condições ainda não automatizadas são explícitas para revisão',()=>{
 const v=fresh();const ataque=power('Ataque em Arco');assert.ok(ataque);assert.equal(benefitPrerequisites(ataque,v).missing.length,2);
 v.Lv='4';v['Mar Trei luta']='Yes';assert.deepEqual(benefitPrerequisites(ataque,v).missing,[]);
 assert.ok(benefitPrerequisites(power('Contra-Ataque'),v).review.some(t=>t.includes('Combate Defensivo')));
 const origins=trainingBenefitSources(fresh('Humano','Assistente de Laboratório'));const source=origins.find(s=>s.id==='origin:assistentedelaboratorio');assert.ok(permittedTrainingBenefits(v,source).some(r=>r.name==='Esse Cheiro...'));assert.ok(!permittedTrainingBenefits(v,source).some(r=>r.name==='Dom Artístico'));
});
test('Mashin, herança humanoide e Deformidade oferecem os benefícios corretos',()=>{
 const m=fresh('Mashin');const ms=trainingBenefitSources(m).find(s=>s.id==='race:mashin');assert.equal(permittedTrainingBenefits(m,ms).length,10);assert.equal(chooseTrainingBenefits(m,ms.id,[power('Caminho da Perfeição').id]),true);assert.match(m['BossBar.Habilidades.Raca'],/Caminho da Perfeição/);
 const o=fresh('Osteon');const os=trainingBenefitSources(o).find(s=>s.id==='race:osteon');const opts=permittedTrainingBenefits(o,os);assert.ok(opts.some(r=>r.name==='Duro como Pedra'));assert.ok(!opts.some(r=>r.name==='Olhar Atordoante'));
 const l=fresh('Lefou');l['BossBar.Pericias.Efeitos']=JSON.stringify({version:1,choices:{'core:race:lefou:deformidade:0':['190']}});const ls=trainingBenefitSources(l).find(s=>s.id==='race:lefou');assert.ok(permittedTrainingBenefits(l,ls).every(r=>r.subcategory==='tormenta'));
 assert.equal(chooseTrainingBenefits(l,ls.id,[power('Carapaça').id]),true);l['BossBar.Pericias.Efeitos']=JSON.stringify({version:1,choices:{'core:race:lefou:deformidade:0':['190','260']}});synchronizeTrainingBenefits(l);assert.doesNotMatch(l['BossBar.Habilidades.Gerais'],/Carapaça/);
});
test('metadados corrompidos e poderes raciais incompatíveis não ampliam a lista',()=>{
 assert.deepEqual(parseBenefitGrants(null),{});const v=fresh();const source=trainingBenefitSources(v).find(s=>s.id==='race:humano');const options=permittedTrainingBenefits(v,source);assert.ok(options.some(r=>r.name==='Comandar Aprimorado'));assert.ok(!options.some(r=>r.name==='Criança da Luz'));assert.ok(!options.some(r=>r.name==='Escapada Criativa'));
 assert.equal(new Set(T20_CATALOG.abilities.map(r=>r.id)).size,T20_CATALOG.abilities.length);
 for(const ref of T20_CATALOG.abilities.filter(r=>r.sourceId==='heroes')){assert.ok(ref.description.length>40);assert.ok(!ref.name.includes('Aprimoramento'));assert.ok(!ref.description.includes('O Dilema do Jogador Ausente'));}
});

test('nomes personalizados não herdam concessões por prefixo; perícias alternativas são avaliadas sem falsos bloqueios',()=>{
 assert.equal(trainingBenefitSources(fresh('Humanoide personalizado')).some(s=>s.id==='race:humano'),false);
 const v=fresh();const ref={...power('Sortudo'),description:'Pré-requisitos: treinado em Atuação e Enganação.'};
 v['Mar Trei atua']='Yes';v['Mar Trei enga']='Yes';assert.deepEqual(benefitPrerequisites(ref,v).missing,[]);
 v['Mar Trei enga']='Off';assert.equal(benefitPrerequisites(ref,v).missing.length,1);
 const unknown={...ref,description:'Pré-requisitos: treinado em especialização concedida pelo mestre.'};assert.equal(benefitPrerequisites(unknown,v).review.length,1);assert.deepEqual(benefitPrerequisites(unknown,v).missing,[]);
});
