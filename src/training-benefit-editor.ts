import { benefitSlots, trainingBenefitSources, permittedTrainingBenefits, benefitPrerequisites, chooseTrainingBenefits, parseBenefitGrants } from './shared/training-benefits';
import { catalogKey, sourceCitation } from './shared/rules-catalog';
import { sheetEditorPopup } from './sheet-editor-popup';
import { appendRuleText } from './rule-presentation';

const node=<K extends keyof HTMLElementTagNameMap>(tag:K,text='',className='')=>{const n=document.createElement(tag);n.textContent=text;n.className=className;return n;};
export const trainingBenefitEditor=(values:Record<string,string>,sourceId:string,changed:()=>void)=>{
  const area=node('div','','training-benefit-choices');
  const source=trainingBenefitSources(values).find(s=>s.id===sourceId);if(!source)return area;
  const slots=benefitSlots(values,source);if(!slots)return area;
  const refs=permittedTrainingBenefits(values,source);const plan=JSON.parse(values['BossBar.Pericias.Fontes']||'{}');
  const ids=parseBenefitGrants(plan.benefits)[sourceId]?.ids||[];
  area.append(node('p',`${slots} benefício(s) em poderes ou habilidades`,'training-muted'));
  for(let index=0;index<slots;index++){
    const selected=refs.find(r=>r.id===ids[index]);
    const button=node('button',selected?.name||`Escolher benefício ${index+1}`,'training-benefit-button');button.type='button';
    button.addEventListener('click',()=>{
      const popup=sheetEditorPopup('Escolher poder ou habilidade');popup.dialog.classList.add('training-benefit-popup');
      const search=node('input');search.type='search';search.placeholder='Buscar na lista permitida';search.setAttribute('aria-label','Buscar poder');
      const list=node('select');list.size=7;list.setAttribute('aria-label','Poder permitido');
      const detail=node('div','','training-benefit-detail');const confirm=node('button','Escolher este benefício');confirm.type='button';
      const show=()=>{const ref=refs.find(r=>r.id===list.value);detail.replaceChildren();confirm.disabled=!ref;if(!ref)return;
        const p=benefitPrerequisites(ref,values);detail.append(node('strong',ref.name),node('p',ref.description));const citation=node('small');appendRuleText(citation,sourceCitation(ref));detail.append(citation);
        if(p.missing.length){detail.append(node('p','Pré-requisitos não atendidos: '+p.missing.join('; '),'training-benefit-blocked'));confirm.disabled=true;}
        if(p.review.length)detail.append(node('p','Revisão do mestre: '+p.review.join('; '),'training-benefit-review'));
      };
      const render=()=>{const old=list.value||selected?.id;list.replaceChildren();for(const ref of refs.filter(r=>catalogKey(r.name).includes(catalogKey(search.value))&&!ids.some((id,i)=>i!==index&&id===r.id))){const missing=benefitPrerequisites(ref,values).missing.length;const option=new Option(ref.name+(missing?' · requisito pendente':''),ref.id,false,ref.id===old);list.add(option);}if(!list.value&&list.options.length)list.selectedIndex=0;show();};
      search.addEventListener('input',render);list.addEventListener('change',show);
      confirm.addEventListener('click',()=>{const next=[...ids];next[index]=list.value;if(chooseTrainingBenefits(values,sourceId,next.filter(Boolean))){changed();popup.close();}});
      popup.body.append(node('p',source.owner+' · escolha dentro dos benefícios desta fonte','training-muted'),search,list,detail);popup.actions.append(confirm);render();search.focus();
    });
    area.append(button);
    if(selected){const p=benefitPrerequisites(selected,values);if(p.missing.length||p.review.length)area.append(node('small',p.missing.length?'Pré-requisitos pendentes':'Pré-requisitos sujeitos à revisão do mestre','training-benefit-review'));}
  }
  return area;
};
