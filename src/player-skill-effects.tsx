import { useEffect,useMemo,useState,useRef } from 'react';
import { createPortal } from 'react-dom';
import type { PlayerHudState } from './shared/player-combat';
import { availableCharacterSkillEffects } from './shared/skill-test-context';
import { skillEffectDurationLabel,type SkillEffectDuration,type SkillEffectChange } from './shared/skill-effect-runtime';
import { appendRuleText } from './rule-presentation';
import './player-skill-effects.css';

const Reference=({text}:{text:string})=>{const ref=useRef<HTMLElement>(null);useEffect(()=>{if(ref.current){ref.current.replaceChildren();appendRuleText(ref.current,text);}},[text]);return <small ref={ref}/>;};
export const PlayerSkillEffectsControl=({player,round,disabled}:{player:PlayerHudState;round:number;disabled:boolean})=>{
  const [open,setOpen]=useState(false);const [query,setQuery]=useState('');const [onlyActive,setOnlyActive]=useState(false);
  const [drafts,setDrafts]=useState<Record<string,SkillEffectChange>>({});const [busy,setBusy]=useState<string|null>(null);const [error,setError]=useState('');
  const options=useMemo(()=>availableCharacterSkillEffects(player.summary),[player.summary]);const active=player.skillEffects||[];
  useEffect(()=>{if(!open)return;const close=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.stopPropagation();setOpen(false);}};document.addEventListener('keydown',close,true);return()=>document.removeEventListener('keydown',close,true);},[open]);
  const change=async(id:string,draft:SkillEffectChange)=>{setBusy(id);setError('');try{const result=await window.bossAPI.setPlayerSkillEffect(player.id,draft);if(!result.ok)setError(result.error||'Não foi possível alterar o efeito.');else setDrafts(old=>{const next={...old};delete next[id];return next;});}catch{setError('A conexão falhou. Confira o estado do efeito antes de tentar novamente.');}finally{setBusy(null);}};
  return <><button type="button" className={active.length?'has-active-skill-effects':''} aria-label="Efeitos e bônus" data-app-tooltip={`Efeitos e bônus${active.length?' · '+active.length+' ativo(s)':''}`} disabled={disabled} onClick={()=>{setDrafts({});setError('');setOpen(true);}}>✦{active.length>0&&<sup>{active.length}</sup>}</button>
    {open&&createPortal(<div className="player-combat-modal-layer skill-effects-layer"><section role="dialog" aria-modal="true" aria-labelledby="player-skill-effects-title" className="player-effects-dialog">
      <header><div><h2 id="player-skill-effects-title">Efeitos e bônus</h2><p>{player.characterName} · {active.length} ativo(s)</p></div><button type="button" aria-label="Fechar efeitos e bônus" onClick={()=>setOpen(false)}>×</button></header>
      <div className="player-effects-search"><input type="search" aria-label="Buscar efeito" placeholder="Buscar por efeito ou perícia" value={query} onChange={event=>setQuery(event.target.value)}/><button type="button" aria-pressed={onlyActive} onClick={()=>setOnlyActive(!onlyActive)}>Ativos</button></div>
      <p className="player-effects-note">Ative apenas na situação indicada. Custos de PM continuam manuais. Durações usam tempo de jogo: 1 minuto = 10 rodadas.</p>
      {error&&<p role="alert" className="player-effects-error">{error}</p>}
      <div className="player-effects-list">
      {!options.length&&<p>Nenhum efeito ativável na ficha aprovada. Registre as fontes em Perícias → Fontes de treinamento.</p>}
      {options.filter(option=>(!onlyActive||active.some(e=>e.id===option.id))&&(option.name+' '+option.skills.join(' ')).toLocaleLowerCase('pt-BR').includes(query.toLocaleLowerCase('pt-BR'))).map(option=>{
        const running=active.find(e=>e.id===option.id);const draft=drafts[option.id]||{id:option.id,active:true,situation:running?.situation||'',value:running?.value,duration:running?.duration||option.duration};
        const duration=draft.duration!;const update=(patch:Partial<SkillEffectChange>)=>setDrafts(old=>({...old,[option.id]:{...draft,...patch}}));
        const invalid=!draft.situation?.trim()||Boolean(option.options&&!option.options.includes(draft.value!));
        return <article key={option.id} className={running?'is-active':''}><div className="player-effect-heading"><strong>{option.name}</strong>{running&&<span>{skillEffectDurationLabel(running,round)}</span>}</div>
          <p>{option.condition}</p><small className="player-effect-skills">{option.skills.join(' · ')}</small><Reference text={option.reference}/>
          <div className="player-effect-settings"><label>Situação<input aria-label={`Situação de ${option.name}`} maxLength={500} value={draft.situation||''} placeholder="Informe quando se aplica" onChange={event=>update({situation:event.target.value})}/></label>
            {option.options&&<label>Valor<select aria-label={`Valor de ${option.name}`} value={draft.value??''} onChange={event=>update({value:event.target.value?Number(event.target.value):undefined})}><option value="">Escolha…</option>{option.options.map(value=><option key={value} value={value}>{option.optionLabels[value]||value}</option>)}</select></label>}
            <label>Duração<select aria-label={`Duração de ${option.name}`} value={duration.unit} onChange={event=>update({duration:{unit:event.target.value as SkillEffectDuration['unit'],amount:1}})}><option value="scene">Até encerrar combate</option><option value="test">Próximo teste</option><option value="turn">Turno atual</option><option value="rounds">Rodadas</option><option value="minutes">Minutos de jogo</option><option value="hours">Horas de jogo</option></select></label>
            {['rounds','minutes','hours'].includes(duration.unit)&&<label>Quantidade<input type="number" min={1} max={1000} aria-label={`Quantidade da duração de ${option.name}`} value={duration.amount} onChange={event=>update({duration:{...duration,amount:Number(event.target.value)}})}/></label>}
          </div><div className="player-effect-actions">{running&&<button type="button" disabled={busy!==null||disabled} onClick={()=>void change(option.id,{id:option.id,active:false})}>Desativar</button>}<button type="button" disabled={busy!==null||disabled||invalid||duration.amount<1||duration.amount>1000} onClick={()=>void change(option.id,draft)}>{busy===option.id?'Aplicando…':running?'Atualizar efeito':'Ativar efeito'}</button></div>
        </article>;
      })}</div>
      <footer>As ativações terminam também ao trocar a ficha.</footer>
    </section></div>,document.body)}
  </>;
};
