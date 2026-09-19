import { trainingBenefitEditor } from './training-benefit-editor';
import { synchronizeTrainingBenefits } from './shared/training-benefits';
import { characterSkillMechanics, SKILL_MECHANICS, SKILL_EFFECTS_FIELD, SKILL_TERRAINS, parseSkillEffects, inferSkillEffectChoices, terrainChoiceCount, skillMatches, effectChoiceCount, skillRuleCitation, skillEffectAmount, skillEffectIssues, skillEffectAvailable } from './shared/skill-mechanics';
import { characterSkillRules, skillDisplayName } from './shared/skill-definitions';
import { initializeSkillEffects, skillImportDiscrepancies, reconcileImportedSkillSources } from './shared/character-skills';
import { appendRuleText } from './rule-presentation';
import { sheetEditorPopup } from './sheet-editor-popup';
import { catalogKey } from './shared/rules-catalog';

const node=<K extends keyof HTMLElementTagNameMap>(tag:K,text='',className='')=>{const el=document.createElement(tag);el.textContent=text;el.className=className;return el;};
/** All effects stay in the enclosing draft and follow its existing master approval. */
export const skillEffectsEditor=(values:Record<string,string>,changed:()=>void)=>{
  initializeSkillEffects(values,Boolean(values['BossBar.Recursos.Automaticos']));
  const plan=inferSkillEffectChoices(values,parseSkillEffects(values[SKILL_EFFECTS_FIELD]));const section=node('details','','training-effects');
  const summary=node('summary','Efeitos e bônus');section.append(summary);
  const discrepancies=skillImportDiscrepancies(values);const pending=skillEffectIssues(values).length+discrepancies.length;
  summary.textContent='Efeitos e bônus'+(pending?` · ${pending} para revisar`:'');
  section.open=pending>0;
  const save=()=>{const before={...values};plan.active={};values[SKILL_EFFECTS_FIELD]=JSON.stringify(plan);synchronizeTrainingBenefits(values);reconcileImportedSkillSources(values,before);changed();refreshDiscrepancies();};
  const rerender=()=>{const next=skillEffectsEditor(values,changed);next.open=section.open;section.replaceWith(next);};
  const help=node('p','Fontes fixas são calculadas automaticamente. Configure aqui as fontes e escolhas permanentes. Ative efeitos condicionais pelo botão ✦ Efeitos e bônus ao lado do HUD.','training-muted');section.append(help);
  const ownedIds=new Set(characterSkillMechanics(values).flatMap(rule=>(rule.effects||[]).map((_,index)=>rule.id+':'+index)));
  for(const e of plan.extra)ownedIds.add('master:'+e.id);
  if([...Object.keys(plan.choices),...Object.keys(plan.terrains),...Object.keys(plan.active)].some(id=>!ownedIds.has(id))){
    const review=node('div','','training-import-review');review.append(node('p','Uma fonte mudou ou foi removida. As escolhas anteriores dessa fonte não concedem mais bônus.','training-muted'));
    const confirm=node('button','Confirmar fontes atuais','training-confirm');confirm.type='button';confirm.addEventListener('click',()=>{for(const id of Object.keys(plan.choices))if(!ownedIds.has(id))delete plan.choices[id];for(const id of Object.keys(plan.terrains))if(!ownedIds.has(id))delete plan.terrains[id];for(const id of Object.keys(plan.active))if(!ownedIds.has(id))delete plan.active[id];save();rerender();});review.append(confirm);section.append(review);
  }
  const discrepancyArea=node('div');section.append(discrepancyArea);
  const refreshDiscrepancies=()=>{
    const discrepancies=skillImportDiscrepancies(values);discrepancyArea.replaceChildren();
    const pending=skillEffectIssues(values).length+discrepancies.length;summary.textContent='Efeitos e bônus'+(pending?` · ${pending} para revisar`:'');
    if(!discrepancies.length)return;
    const review=node('div','','training-discrepancies');review.append(node('p','Há diferenças sem fonte identificada. Ajuste Outros na perícia, use o cálculo das fontes conhecidas ou registre a fonte que falta.','training-muted'));
    for(const entry of discrepancies){
      const row=node('div','','training-discrepancy');row.dataset.skill=entry.code;
      row.append(node('strong',entry.name),node('span',`${entry.total} na ficha · ${entry.expected} pelas fontes · diferença ${entry.difference>0?'+':''}${entry.difference}`));
      const correct=node('button','Usar calculado');correct.type='button';correct.addEventListener('click',()=>{values[entry.field]='0';save();rerender();});
      const register=node('button','Registrar fonte');register.type='button';register.disabled=plan.extra.length>=50;
      register.addEventListener('click',()=>{
        const popup=sheetEditorPopup('Fonte da diferença — '+entry.name);
        const name=node('input');name.placeholder='Nome da fonte';name.setAttribute('aria-label','Nome da fonte da diferença');name.maxLength=160;
        const note=node('input');note.placeholder='Justificativa ou livro e página';note.setAttribute('aria-label','Justificativa da diferença');note.maxLength=500;
        const amount=node('input');amount.type='number';amount.min='-999';amount.max='999';amount.step='1';amount.value=String(entry.difference);amount.setAttribute('aria-label','Valor da fonte da diferença');
        const add=node('button','Registrar fonte');add.type='button';popup.body.append(node('p',`Diferença ${entry.difference>0?'+':''}${entry.difference}. O valor registrado sai de Outros e passa a ser calculado por esta fonte, uma única vez.`),name,amount,note);popup.actions.append(add);
        add.addEventListener('click',()=>{if(!name.value.trim()){name.focus();return;}if(!note.value.trim()){note.focus();return;}if(!amount.value||!amount.checkValidity()){amount.reportValidity();return;}
          plan.extra.push({id:crypto.randomUUID(),name:name.value.trim(),skill:entry.code,amount:Number(amount.value),dice:'',condition:'',active:false,note:note.value.trim()});values[entry.field]=String(Number(values[entry.field]||0)-Number(amount.value));save();popup.close();rerender();});
      });row.append(correct,register);review.append(row);
    }discrepancyArea.append(review);
  };refreshDiscrepancies();
  const list=node('div','','training-effect-list');section.append(list);
  for(const rule of characterSkillMechanics(values).filter((r)=>r.effects?.length)){
    const card=node('article','','training-effect-card');const heading=node('div','','training-effect-heading');
    heading.append(node('strong',rule.name));const ref=node('small');appendRuleText(ref,skillRuleCitation(rule));heading.append(ref);card.append(heading);
    for(const [index,effect]of rule.effects!.entries()){
      if(!skillEffectAvailable(effect,values))continue;
      const id=`${rule.id}:${index}`;const eligible=characterSkillRules(values).filter((skill)=>skillMatches(values,skill,effect.skills)&&(!effect.exclude||!skillMatches(values,skill,effect.exclude))&&(!effect.trained||values[skill.trainedField]==='Yes'));
      if(!eligible.length)continue;
      const area=node('div','','training-effect');const count=effectChoiceCount(effect,values);const choiceNames=(plan.choices[id]||[]).map((code)=>eligible.find((r)=>r.code===code)).filter(Boolean);
      const benefit=effect.attribute?`Atributo alternativo: ${effect.attribute}`:effect.replaceSkill?`Pode usar ${effect.replaceSkill} no lugar da perícia`:effect.train?'Treinamento durante o efeito':effect.untrained?'Permite testes sem treinamento':effect.roll?`Rolar dois dados e usar o ${effect.roll==='best'?'melhor':'pior'}`:effect.dice?`Dado adicional: +${effect.dice}`:`Bônus: ${skillEffectAmount(effect,rule,values,eligible[0],true)>=0?'+':''}${skillEffectAmount(effect,rule,values,eligible[0],true)}`;
      area.append(node('p',effect.diceValues?'Dados de auxílio: escolha os dados disponíveis ao ativar':benefit,'training-effect-benefit'));
      if(effect.terrain) {
        const ranks=plan.terrains[id]||{};const budget=terrainChoiceCount(rule);const used=Object.values(ranks).reduce((sum,n)=>sum+n,0);
        area.append(node('p',`${used} / ${budget} escolhas · terreno novo ou +2 em um terreno conhecido`,'training-muted'));
        const grid=node('div','','training-terrain-grid');
        for(const name of SKILL_TERRAINS){const label=node('label',name);const select=node('select');select.setAttribute('aria-label',`${rule.name}: ${name}`);const current=ranks[name]||0;select.add(new Option('Não escolhido','0',false,!current));
          for(let rank=1;rank<=Math.max(current,budget-used+current);rank++){const bonus=Math.max(1,Number(values.ModSab)||0)+2*(rank-1);select.add(new Option(`+${bonus} · ${rank} escolha(s)`,String(rank),false,current===rank));}
          select.addEventListener('change',()=>{const next={...ranks};if(Number(select.value))next[name]=Number(select.value);else delete next[name];plan.terrains[id]=next;save();rerender();});label.append(select);grid.append(label);}
        area.append(grid);
      }
      if(count&&!effect.chooseAtUse){
        const choices=node('details','','training-effect-choices');choices.open=choiceNames.length<(effect.minimum??count);
        const title=node('summary');choices.append(title);const selected=new Set(plan.choices[id]||[]);
        const refresh=()=>{const valid=eligible.filter((r)=>selected.has(r.code));title.textContent=`${valid.length} / ${count} escolhida(s)${valid.length?' · '+valid.map((r)=>skillDisplayName(r,values)).join(', '):' — escolha as perícias'}`;};
        const checks:{input:HTMLInputElement;code:string}[]=[];const grid=node('div','','training-effect-choice-grid');
        for(const skill of eligible){const label=node('label');const input=node('input');input.type='checkbox';input.checked=selected.has(skill.code);input.setAttribute('aria-label',`${rule.name}: ${skillDisplayName(skill,values)}`);label.append(input,node('span',skillDisplayName(skill,values)));grid.append(label);checks.push({input,code:skill.code});
          input.addEventListener('change',()=>{if(input.checked&&selected.size>=count){input.checked=false;return;}if(input.checked)selected.add(skill.code);else selected.delete(skill.code);plan.choices[id]=[...selected];for(const c of checks)c.input.disabled=!c.input.checked&&selected.size>=count;refresh();save();});}
        refresh();choices.append(grid);area.append(choices);
      }else area.append(node('p',effect.chooseAtUse?'A perícia é escolhida na hora do teste.':eligible.length>12?'Todas as perícias abrangidas pela fonte':eligible.map((r)=>skillDisplayName(r,values)).join(' · '),'training-muted'));
      if(effect.condition)area.append(node('small','Ativação no HUD · '+effect.condition,'training-muted'));
      if(rule.id==='core:race:lefou:deformidade'){const host=node('div');const update=()=>host.replaceChildren(trainingBenefitEditor(values,'race:lefou',()=>{save();update();}));update();area.addEventListener('change',()=>{save();update();});area.append(node('p','Deformidade: dois bônus de +2, ou um bônus e um poder da Tormenta.','training-muted'),host);}
      card.append(area);
    }
    if(card.childElementCount>1)list.append(card);
  }
  const register=node('button','+ Efeito recebido ou regra opcional','training-add-source');register.type='button';section.append(register);
  register.addEventListener('click',()=>{
    const popup=sheetEditorPopup('Registrar fonte de perícia');const search=node('input');search.type='search';search.placeholder='Buscar magia, item ou regra opcional';search.setAttribute('aria-label','Buscar fonte de perícia');
    const select=node('select');select.size=8;select.setAttribute('aria-label','Fonte de perícia');
    const description=node('p','','training-muted');const add=node('button','Registrar fonte','training-confirm');add.type='button';
    const options=SKILL_MECHANICS.filter(r=>['spell','item','optional'].includes(r.kind)&&!plan.registered.includes(r.id));
    const render=()=>{select.replaceChildren();for(const r of options.filter(r=>catalogKey(r.name+' '+skillRuleCitation(r)).includes(catalogKey(search.value))))select.add(new Option(r.name,r.id));show();};
    const show=()=>{const rule=options.find(r=>r.id===select.value);description.replaceChildren();if(rule)appendRuleText(description,skillRuleCitation(rule));add.disabled=!rule;};
    search.addEventListener('input',render);select.addEventListener('change',show);
    popup.body.append(node('p','Registre efeitos recebidos de outras criaturas e regras opcionais utilizadas na mesa. A fonte será revisada pelo mestre ao salvar a ficha.','training-muted'),search,select,description);popup.actions.append(add);
    add.addEventListener('click',()=>{if(!select.value)return;plan.registered.push(select.value);save();popup.close();rerender();});render();search.focus();
  });
  if(plan.registered.length){const registered=node('div','','training-registered');section.append(registered);
    for(const id of plan.registered){const rule=SKILL_MECHANICS.find(r=>r.id===id);if(!rule)continue;const row=node('div');const remove=node('button','×','training-remove');remove.type='button';remove.setAttribute('aria-label','Remover fonte '+rule.name);row.append(node('span',rule.name),remove);registered.append(row);remove.addEventListener('click',()=>{plan.registered=plan.registered.filter(v=>v!==id);for(const key of Object.keys(plan.choices))if(key.startsWith(id+':'))delete plan.choices[key];for(const key of Object.keys(plan.active))if(key.startsWith(id+':'))delete plan.active[key];save();rerender();});}
  }
  const master=node('details','','training-master-effects');master.append(node('summary','Bônus adicionais do mestre'));
  master.append(node('p','Registre bônus que dependem da mesa ou de uma fonte personalizada. A aprovação acontece ao salvar a ficha.','training-muted'));
  const rows=node('div');master.append(rows);
  const add=node('button','+ Bônus do mestre','training-add-source');add.type='button';master.append(add);section.append(master);
  const render=()=>{
    rows.replaceChildren();
    for(const e of plan.extra){const card=node('article','','training-master-effect-card');const row=node('div','','training-master-effect-row');
      const skill=node('select');skill.setAttribute('aria-label','Perícia do bônus');for(const r of characterSkillRules(values))skill.add(new Option(skillDisplayName(r,values),r.code,false,r.code===e.skill));
      const name=node('input');name.placeholder='Nome da fonte';name.value=e.name;name.required=true;name.setAttribute('aria-label','Nome da fonte do bônus');
      const amount=node('input');amount.type='number';amount.min='-999';amount.max='999';amount.value=String(e.amount);amount.setAttribute('aria-label','Bônus numérico');
      const dice=node('input');dice.placeholder='Ex.: 1d6';dice.value=e.dice;dice.pattern='(?:[1-9]|[1-9][0-9])d(?:[2-9]|[1-9][0-9]|100)';dice.setAttribute('aria-label','Dados adicionais');
      const note=node('input');note.placeholder='Justificativa ou referência';note.value=e.note;note.required=true;note.setAttribute('aria-label','Justificativa do bônus');
      const remove=node('button','×','training-remove');remove.type='button';remove.setAttribute('aria-label','Remover bônus adicional');remove.addEventListener('click',()=>{plan.extra=plan.extra.filter((x)=>x!==e);delete plan.active['master:'+e.id];render();save();});
      for(const input of[skill,name,amount,dice,note])input.addEventListener('input',()=>{e.skill=skill.value;e.name=name.value;e.amount=Number(amount.value)||0;e.dice=dice.value;e.note=note.value;save();});
      row.append(skill,name,amount,dice,note,remove);card.append(row);
      const condition=node('input');condition.placeholder='Condição (vazio = bônus passivo)';condition.value=e.condition;condition.maxLength=300;condition.setAttribute('aria-label','Condição do bônus do mestre');
      condition.addEventListener('input',()=>{e.condition=condition.value.trim();delete plan.active['master:'+e.id];save();});card.append(condition);rows.append(card);
    }
  };
  add.addEventListener('click',()=>{if(plan.extra.length>=50)return;plan.extra.push({id:crypto.randomUUID(),skill:'010',name:'Mestre',amount:0,dice:'',condition:'',active:false,note:''});render();});render();
  return section;
};
