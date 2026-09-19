import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCharacterSkills, recalculateCharacterSkills, initializeSkillEffects } from '../src/shared/character-skills.ts';
import { allSkillRules, characterSkillRules, skillDisplayName } from '../src/shared/skill-definitions.ts';
import { SKILL_TRAINING_FIELD, synchronizeSkillTraining, skillTraining, parseTrainingPlan } from '../src/shared/skill-training.ts';
import { SKILL_EFFECTS_FIELD, SKILL_MECHANICS, characterSkillMechanics, emptySkillEffectsPlan,skillEffectIssues } from '../src/shared/skill-mechanics.ts';
import { rollSkill } from '../src/shared/skill-roll.ts';
import { createSkillCalculationContext, availableSkillSituations, skillForSituation } from '../src/shared/skill-test-context.ts';
import { CHARACTER_OPTIONS } from '../src/shared/character-options.ts';

const base = () => ({ Lv:'1', CLASSE:'Guerreiro 1', 'RAÇA':'Elfo', ORIGEM:'', ModFor:'3', ModDes:'2', ModCon:'1', ModInt:'1', ModSab:'0', ModCar:'-1', [SKILL_EFFECTS_FIELD]:JSON.stringify({...emptySkillEffectsPlan(),reviewed:true}) });
const skill = name => allSkillRules.find(r => r.name === name);

test('fontes raciais e passivas são aplicadas uma vez e removidas ao trocar de raça', () => {
  const v=base(); recalculateCharacterSkills(v);
  assert.equal(calculateCharacterSkills(v).get(skill('Misticismo').code).total,3);
  v['RAÇA']='Goblin'; recalculateCharacterSkills(v);
  assert.equal(calculateCharacterSkills(v).get(skill('Misticismo').code).total,1);
  assert.equal(calculateCharacterSkills(v).get(skill('Fortitude').code).total,5);
  v['BossBar.Habilidades.Gerais']='- Vitalidade: treinamento vigoroso\n- Vitalidade: texto duplicado';
  assert.equal(calculateCharacterSkills(v).get(skill('Fortitude').code).total,7);
});

test('treinamentos fixos são automáticos; mudança de fonte preserva o mestre e escolhas válidas', () => {
  const v={...base(),'RAÇA':'Hobgoblin',ORIGEM:'Boticário'}; synchronizeSkillTraining(v);
  for(const name of ['Guerra','Fortitude','Cura']) assert.equal(v[skill(name).trainedField],'Yes',name);
  const craft=characterSkillRules(v).find(r=>skillDisplayName(r,v)==='Ofício (alquimista)');assert.ok(craft);assert.equal(v[craft.trainedField],'Yes');
  const plan=parseTrainingPlan(v[SKILL_TRAINING_FIELD]);plan.extra.push({skill:skill('Guerra').code,source:'Mestre',note:'Academia militar'});v[SKILL_TRAINING_FIELD]=JSON.stringify(plan);
  v['RAÇA']='Elfo';v.ORIGEM='';synchronizeSkillTraining(v);
  assert.equal(v[skill('Guerra').trainedField],'Yes'); assert.equal(v[skill('Cura').trainedField],'Off');
  assert.equal(v[craft.trainedField],'Off');assert.ok(parseTrainingPlan(v[SKILL_TRAINING_FIELD]).retired.length);
});

test('diminuição de Inteligência permanente retira apenas as escolhas excedentes dessa fonte', () => {
  const v={...base(),ModInt:'2','RAÇA':''};
  for(const name of ['Luta','Fortitude','Iniciativa','Reflexos','Misticismo','Cura'])v[skill(name).trainedField]='Yes';
  synchronizeSkillTraining(v);const before=parseTrainingPlan(v[SKILL_TRAINING_FIELD]);
  const intelligence=Object.entries(before.automatic).filter(([,owners])=>owners.includes('intelligence')).map(([code])=>code);assert.equal(intelligence.length,2);
  v.ModInt='1';synchronizeSkillTraining(v);
  assert.equal(intelligence.filter(code=>v[allSkillRules.find(r=>r.code===code).trainedField]==='Yes').length,1);
  assert.equal(skillTraining(v).unmatched.length,0);
});

test('especializações de Ofício são independentes e suportam mais de duas profissões', () => {
  const v={...base(),ModInt:'4'};const crafts=allSkillRules.filter(r=>r.nameField).slice(0,5);
  crafts.forEach((r,i)=>{v[r.nameField]=['alquimista','armeiro','cozinheiro','artesão','pescador'][i];v[r.trainedField]=i%2?'Off':'Yes';});
  recalculateCharacterSkills(v);const calculated=calculateCharacterSkills(v);
  assert.equal(characterSkillRules(v).filter(r=>r.nameField).length,5);
  crafts.forEach((r,i)=>assert.equal(calculated.get(r.code).training,i%2?0:2));
});

test('importação deduz bônus conhecidos pelo total e evita somar novamente a mesma fonte', () => {
  const v=base();delete v[SKILL_EFFECTS_FIELD];v['204']='2';v['200']='3';initializeSkillEffects(v);
  assert.equal(JSON.parse(v[SKILL_EFFECTS_FIELD]).reviewed,true);
  assert.equal(v['204'],'0');
  assert.equal(calculateCharacterSkills(v).get('200').total,3);
});

test('efeitos condicionais são autorizados pela ficha e não aceitam fórmulas ou fontes forjadas', () => {
  const v={...base(),'RAÇA':'Anão'};recalculateCharacterSkills(v);
  const context=createSkillCalculationContext(v);const rules=characterSkillRules(v);
  const summary={skillContext:context,skills:rules.map(r=>{const s=calculateCharacterSkills(v).get(r.code);return {id:r.code,name:r.name,total:s.total,trained:s.trained,trainedOnly:s.trainedOnly};})};
  const options=availableSkillSituations(context,skill('Percepção').code);assert.ok(options.length);
  const option=options.find(o=>o.name==='Conhecimento das Rochas');assert.ok(option);
  const normal=skillForSituation(summary,skill('Percepção').code,[]).skill;
  const boosted=skillForSituation(summary,skill('Percepção').code,[{id:option.id,situation:'Explorando uma caverna'}]).skill;
  assert.equal(boosted.total,normal.total+2);
  assert.ok(skillForSituation(summary,skill('Percepção').code,[{id:'forged',situation:'x',value:999}]).error);
  assert.ok(skillForSituation(summary,skill('Percepção').code,[{id:option.id,situation:''}]).error);
  assert.equal(calculateCharacterSkills(v).get(skill('Percepção').code).total,normal.total);
});
test('fichas aprovadas antigas permitem testes comuns sem liberar efeitos não cadastrados',()=>{
  const original={id:'270',name:'Reflexos',total:7,trained:true,trainedOnly:false};const summary={skills:[original]};
  assert.equal(skillForSituation(summary,'270',[]).skill,original);
  assert.equal(skillForSituation(summary,'270').skill,original);
  assert.ok(skillForSituation(summary,'270',[{id:'forged',situation:'Qualquer',value:999}]).error);
  assert.ok(skillForSituation(summary,'270',{}).error);
});

test('catálogo contém referências válidas, ids únicos e nenhuma concessão opcional automática', () => {
  assert.equal(new Set(SKILL_MECHANICS.map(r=>r.id)).size,SKILL_MECHANICS.length);
  for(const r of SKILL_MECHANICS){assert.ok(r.page>0);assert.ok(['core','heroes','threats','atlas','gods','minor'].includes(r.sourceId),r.sourceId);}
  assert.equal(characterSkillMechanics(base()).some(r=>/Domínio|Turrão|Rabugento/.test(r.name)),false);
});

test('atributo-chave pode somar outra vez por habilidade; fontes de atributo repetidas não acumulam',()=>{
  const v={...base(),'RAÇA':'',CLASSE:'Caçador 3',Lv:'3',ModSab:'3'};
  const explorer=characterSkillMechanics(v).find(r=>r.name==='Explorador');assert.ok(explorer);
  const plan=emptySkillEffectsPlan();plan.terrains[explorer.id+':0']={Floresta:1};plan.active[explorer.id+':0']={situation:'Na floresta escolhida',value:3};v[SKILL_EFFECTS_FIELD]=JSON.stringify(plan);
  assert.equal(calculateCharacterSkills(v).get(skill('Percepção').code).total,7);
  v['BossBar.Habilidades.Gerais']='- Passo do Caçador: fonte da campanha';
  assert.equal(calculateCharacterSkills(v).get(skill('Furtividade').code).total,6,'duas fontes de SAB somam apenas uma vez');
});

test('magias usam maior bônus e Oração acumula; conhecer magia não ativa efeito',()=>{
  const v=base();const plan=emptySkillEffectsPlan();
  for(const name of ['Proteção Divina','Aura Divina','Oração']){const r=SKILL_MECHANICS.find(r=>r.kind==='spell'&&r.name===name);plan.registered.push(r.id);plan.active[r.id+':0']={situation:'Efeito recebido',value:name==='Aura Divina'?10:2};}
  v[SKILL_EFFECTS_FIELD]=JSON.stringify(plan);
  assert.equal(calculateCharacterSkills(v).get(skill('Fortitude').code).total,13);
  v['BossBar.Magia.1.Nome']='Concentração de Combate';
  assert.equal(calculateCharacterSkills(v).get(skill('Luta').code).roll,null);
});

test('troca de atributo por fonte é reversível e não deixa a seleção apontando para valor incorreto',()=>{
  const v={...base(),'RAÇA':'Eiradaan',ModSab:'4',ModInt:'1'};recalculateCharacterSkills(v);
  const modifier=skill('Misticismo').modifierField;const selector=modifier.replace('ModAtrib','SeleAtrib');
  assert.equal(v[selector],'SAB');assert.equal(v[modifier],'4');
  v['RAÇA']='Humano';recalculateCharacterSkills(v);assert.equal(v[selector],'INT');assert.equal(v[modifier],'1');
});

test('Biblioteca Divina concede vagas por patamar e opcionais só após registro',()=>{
  for(const [level,count]of [[1,1],[5,2],[11,3],[17,4]]){
    const v={...base(),Lv:String(level),CLASSE:'Guerreiro '+level,'BossBar.Habilidades.Gerais':'- Biblioteca Divina: dom de Tanna-Toh'};
    assert.equal(skillTraining(v).sources.find(s=>s.label.includes('Biblioteca Divina')).count,count);
  }
  const v=base();const plan=emptySkillEffectsPlan();const optional=SKILL_MECHANICS.find(r=>r.name==='Domínio: Biblioteca');plan.registered=[optional.id];v[SKILL_EFFECTS_FIELD]=JSON.stringify(plan);
  assert.ok(skillTraining(v).sources.some(s=>s.label.includes('Domínio: Biblioteca')));
});

test('dados extras não alteram a face natural e melhor/pior resultado usam dois d20',()=>{
  const values=[2,19,4];const result=rollSkill({total:5,rollMode:'best',bonusDice:['1d6']},()=>values.shift());
  assert.equal(result.die,19);assert.equal(result.total,28);assert.deepEqual(result.rolls,[2,19,4]);assert.equal(result.modifier,5);
});

test('escolhas ausentes e removidas apontam para revisão, sem conceder bônus desconhecido',()=>{
  const v={...base(),'RAÇA':'Moreau (Raposa)'};assert.ok(skillEffectIssues(v).some(i=>i.message.includes('escolha 2')));
  const plan=emptySkillEffectsPlan();plan.choices['removed:0']=['190'];v[SKILL_EFFECTS_FIELD]=JSON.stringify(plan);
  assert.ok(skillEffectIssues(v).some(i=>i.message.includes('removida')));
});

test('escolhas explícitas no nome do poder são reconhecidas e decisões existentes são preservadas',()=>{
  const v={...base(),'BossBar.Habilidades.Gerais':'- Foco em Perícia (Enganação): habilidade escolhida', [skill('Enganação').trainedField]:'Yes'};
  initializeSkillEffects(v); const rule=characterSkillMechanics(v).find(r=>r.name==='Foco em Perícia');
  assert.deepEqual(JSON.parse(v[SKILL_EFFECTS_FIELD]).choices[rule.id+':0'],[skill('Enganação').code]);
  const plan=JSON.parse(v[SKILL_EFFECTS_FIELD]);plan.choices[rule.id+':0']=[skill('Cura').code];v[SKILL_EFFECTS_FIELD]=JSON.stringify(plan);
  initializeSkillEffects(v);assert.deepEqual(JSON.parse(v[SKILL_EFFECTS_FIELD]).choices[rule.id+':0'],[skill('Cura').code]);
});

test('bônus condicional do mestre depende de situação e não permite trocar seu valor na requisição',()=>{
  const v=base();const plan=emptySkillEffectsPlan();plan.extra=[{id:'amigo',skill:'250',name:'Vigia',amount:3,dice:'1d4',condition:'Vigia auxilia na busca',active:false,note:'Aprovado pelo mestre'}];v[SKILL_EFFECTS_FIELD]=JSON.stringify(plan);
  recalculateCharacterSkills(v);const result=calculateCharacterSkills(v).get('250');const summary={skillContext:createSkillCalculationContext(v),skills:[{id:'250',name:'Percepção',total:result.total,trained:false,trainedOnly:false}]};
  assert.equal(availableSkillSituations(summary.skillContext,'250').find(s=>s.id==='master:amigo').name,'Vigia');
  const active=skillForSituation(summary,'250',[{id:'master:amigo',situation:'O vigia procura pistas comigo'}]).skill;
  assert.equal(active.total,result.total+3);assert.deepEqual(active.bonusDice,['1d4']);
  assert.equal(calculateCharacterSkills(v).get('250').total,result.total);
});

test('Vassalo só recebe +2 quando a perícia é paga por outra fonte válida',()=>{
  const v={...base(),'RAÇA':'',CLASSE:'Vassalo 1',ModInt:'0'};synchronizeSkillTraining(v);
  const id=characterSkillMechanics(v).find(r=>r.name==='Jovem Pajem').id;const code=skill('Adestramento').code;
  const plan=parseTrainingPlan(v[SKILL_TRAINING_FIELD]);plan.duplicates={[id]:true};plan.selections[id]=[code];v[SKILL_TRAINING_FIELD]=JSON.stringify(plan);
  assert.ok(skillTraining(v).issues.some(i=>i.id==='training:duplicate:'+id));
  assert.equal(calculateCharacterSkills(v).get(code).sources.some(s=>s.id===id),false);
  plan.extra.push({skill:code,source:'Mestre',note:'Treinamento anterior'});v[skill('Adestramento').trainedField]='Yes';v[SKILL_TRAINING_FIELD]=JSON.stringify(plan);synchronizeSkillTraining(v);
  assert.equal(skillTraining(v).issues.some(i=>i.id==='training:duplicate:'+id),false);
  assert.equal(calculateCharacterSkills(v).get(code).sources.find(s=>s.id===id).amount,2);
});

test('Lefou conta somente as deformidades escolhidas, além dos poderes da Tormenta registrados',()=>{
  const v={...base(),'RAÇA':'Lefou','BossBar.Habilidades.Gerais':'- Antenas: poder da Tormenta\n- Carapaça: poder da Tormenta'};
  const plan=emptySkillEffectsPlan();const id=characterSkillMechanics(v).find(r=>r.name==='Deformidade').id;
  plan.choices[id+':0']=['190'];v[SKILL_EFFECTS_FIELD]=JSON.stringify(plan);
  assert.equal(calculateCharacterSkills(v).get('250').sources.find(s=>s.name==='Antenas').amount,2);
  plan.choices[id+':0']=['190','260'];v[SKILL_EFFECTS_FIELD]=JSON.stringify(plan);
  assert.equal(calculateCharacterSkills(v).get('250').sources.find(s=>s.name==='Antenas').amount,2);
  v['BossBar.Habilidades.Gerais']+='\n- Mente Aberrante: poder da Tormenta';
  assert.equal(calculateCharacterSkills(v).get('250').sources.find(s=>s.name==='Antenas').amount,3);
});

test('variantes recebem suas próprias habilidades e progressões, sem herdar as substituídas',()=>{
  const own=(name,level)=>characterSkillMechanics({...base(),CLASSE:name+' '+level,Lv:String(level)});
  assert.equal(own('Duelista',1).some(r=>r.name==='Audácia'),false);assert.ok(own('Duelista',1).some(r=>r.name==='Duelo'));
  assert.equal(own('Ventanista',1).some(r=>r.name==='Especialista'),false);assert.ok(own('Ventanista',1).some(r=>r.name==='Charme'));
  const v={...base(),CLASSE:'Necromante 8',Lv:'8'};
  assert.equal(calculateCharacterSkills(v).get('100').sources.find(r=>r.name==='Necrologia').amount,3);
  assert.equal(own('Seteiro',7).some(r=>r.name==='Explorador'||r.name==='Rastreador'),false);
});

test('terrenos usam os níveis da classe e exigem redistribuir apenas as escolhas afetadas',()=>{
  const v={...base(),CLASSE:'Caçador 7 / Guerreiro 3',Lv:'10',ModSab:'3'};const id=characterSkillMechanics(v).find(r=>r.name==='Explorador').id+':0';
  const plan=emptySkillEffectsPlan();plan.terrains[id]={Floresta:2};plan.active[id]={situation:'Na floresta',value:5};v[SKILL_EFFECTS_FIELD]=JSON.stringify(plan);
  assert.equal(skillEffectIssues(v).some(i=>i.id.includes(':terrain')),false);
  assert.equal(calculateCharacterSkills(v).get('250').sources.find(r=>r.id===id).amount,5);
  v.CLASSE='Caçador 3 / Guerreiro 7';assert.ok(skillEffectIssues(v).some(i=>i.id.includes(':terrain')));
  assert.equal(calculateCharacterSkills(v).get('250').sources.some(r=>r.id===id),false);
  plan.terrains[id]={Floresta:1};plan.active[id].value=3;v[SKILL_EFFECTS_FIELD]=JSON.stringify(plan);
  assert.equal(calculateCharacterSkills(v).get('250').sources.find(r=>r.id===id).amount,3);
});

test('item no inventário disponibiliza a fonte; usá-la é explícito e os bônus de itens não acumulam',()=>{
  const v={...base(),Item1:'Bandana',Item2:'Melhoria: Macabro'};recalculateCharacterSkills(v);
  const context=createSkillCalculationContext(v);const options=availableSkillSituations(context,'140');assert.equal(options.length,2);
  const normal=calculateCharacterSkills(v).get('140');const summary={skillContext:context,skills:[{id:'140',name:'Intimidação',total:normal.total,trained:false,trainedOnly:false}]};
  const active=skillForSituation(summary,'140',options.map(r=>({id:r.id,situation:'Itens vestidos'}))).skill;
  assert.equal(active.total,normal.total+2);
  v['BossBar.Item.1.Quantidade']='0';assert.equal(availableSkillSituations(createSkillCalculationContext(v),'140').length,1);
});

test('pré-requisitos, Fúria Titânica e bônus de classe respeitam a fonte e o nível',()=>{
  const v={...base(),CLASSE:'Bárbaro 20',Lv:'20','BossBar.Habilidades.Gerais':'- Estilo de Arremesso:\n- Força Indomável:'};
  assert.equal(availableSkillSituations(createSkillCalculationContext(v),'260').some(r=>r.name==='Estilo de Arremesso'),false);
  v['BossBar.Habilidades.Gerais']+='\n- Saque Rápido:';
  assert.ok(availableSkillSituations(createSkillCalculationContext(v),'260').some(r=>r.name==='Estilo de Arremesso'));
  const fury=availableSkillSituations(createSkillCalculationContext(v),'190').find(r=>r.name==='Fúria');assert.deepEqual(fury.options,[4,6,8,10]);
  v.CLASSE='Bárbaro 5 / Guerreiro 15';const own=characterSkillMechanics(v).find(r=>r.name==='Força Indomável');const plan=emptySkillEffectsPlan();plan.active[own.id+':0']={situation:'Esforço antes de resolver o teste'};v[SKILL_EFFECTS_FIELD]=JSON.stringify(plan);
  assert.equal(calculateCharacterSkills(v).get('030').sources.find(r=>r.name==='Força Indomável').amount,5);
});

test('dados de auxílio oferecem fórmulas aprovadas e não se somam entre magias',()=>{
  const v={...base(),'BossBar.Magia.1.Nome':'Comunhão Com a Natureza','BossBar.Magia.2.Nome':'Contato Extraplanar'};recalculateCharacterSkills(v);
  const context=createSkillCalculationContext(v);const options=availableSkillSituations(context,'250');assert.equal(options.length,2);
  assert.ok(Object.values(options[0].optionLabels).includes('2d4'));assert.ok(Object.values(options[1].optionLabels).includes('1d6'));
  const initial=calculateCharacterSkills(v).get('250');const summary={skillContext:context,skills:[{id:'250',name:'Percepção',total:initial.total,trained:false,trainedOnly:false}]};
  const evaluated=skillForSituation(summary,'250',options.map(r=>({id:r.id,value:1,situation:'Auxílio disponível, gastos controlados manualmente'}))).skill;
  const dice=[10,4,3,6];const result=rollSkill(evaluated,()=>dice.shift());
  assert.equal(result.extra,7);assert.equal(result.total,10+initial.total+7);assert.match(result.expression,/maior/);
  assert.ok(skillForSituation(summary,'250',[{id:options[0].id,value:999,situation:'inválido'}]).error);
});

test('dados de uma magia competem com o bônus fixo da mesma categoria; fontes do mestre somam',()=>{
  const skill={total:8,bonusDice:['1d6','1d4'],sources:[{id:'a',name:'Magia fixa',amount:3,stack:'spell',reference:''},{id:'b',name:'Magia de auxílio',amount:0,dice:'1d6',stack:'spell',reference:''},{id:'m',name:'Mestre',amount:0,dice:'1d4',reference:''}]};
  const low=[10,2,4];assert.equal(rollSkill(skill,()=>low.shift()).total,22);
  const high=[10,6,4];assert.equal(rollSkill(skill,()=>high.shift()).total,25);
});

test('as 30 classes avançam de 1 a 20 sem treino sem fonte nem totais inválidos',()=>{
  for(const option of CHARACTER_OPTIONS.filter(option=>option.kind==='class')){
    const v=base();
    for(let level=1;level<=20;level++){
      v.CLASSE=option.name+' '+level;v.Lv=String(level);recalculateCharacterSkills(v);
      assert.equal(skillTraining(v).unmatched.length,0,option.name+' '+level);
      for(const entry of calculateCharacterSkills(v).values()){
        assert.ok(Number.isFinite(entry.total),option.name+' '+level+' '+entry.rule.name);
        assert.equal(entry.training,entry.trained?(level>=15?6:level>=7?4:2):0);
      }
    }
  }
  const v={...base(),CLASSE:'Guerreiro 5',Lv:'5'};
  assert.deepEqual(availableSkillSituations(createSkillCalculationContext(v),'190').find(source=>source.name==='Ataque Especial').options,[2,4,8]);
  v['BossBar.Habilidades.Classe']='- Familiar: animal a escolher';assert.ok(skillEffectIssues(v).some(issue=>issue.id==='skill-effect:familiar-type'));
});

test('texto de uma fonte antiga não mantém bônus depois de mudar a identidade, inclusive em combate',()=>{
  const v={...base(),CLASSE:'Ladino 3',Lv:'3','BossBar.Habilidades.Classe':'- Sombra: bônus de Furtividade'};
  assert.ok(calculateCharacterSkills(v).get('110').sources.some(source=>source.name==='Sombra'));
  v.CLASSE='Guerreiro 3';recalculateCharacterSkills(v);
  assert.equal(calculateCharacterSkills(v).get('110').sources.some(source=>source.name==='Sombra'),false);
  assert.ok(skillEffectIssues(v).some(issue=>issue.id.includes('identity:')));
  assert.equal(calculateCharacterSkills(createSkillCalculationContext(v).values).get('110').sources.some(source=>source.name==='Sombra'),false);
  assert.equal(v['BossBar.Habilidades.Classe'],'- Sombra: bônus de Furtividade');
});
