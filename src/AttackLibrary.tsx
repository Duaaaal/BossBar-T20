import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { createInitialBossAttack, isAttackStatusEffect, normalizeBossAttack, type BossAttack } from './shared/boss-attacks';
import { STATUS_DEFINITIONS } from './shared/status';
import { BOSS_SKILL_DEFINITIONS } from './shared/boss-skills';
import { AttackRangeField, DamageTypeField } from './AttackFields';
import './attack-library.css';

function AttackBonusField({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);
  return <input type="text" inputMode="numeric" value={text} onBlur={() => setText(String(value))} onChange={(event) => {
    const next = event.target.value;
    if (!/^-?\d{0,2}$/.test(next)) return;
    setText(next);
    if (next !== '' && next !== '-') onChange(Number(next));
  }} />;
}

export function AttackLibrary({ onClose, onSelect, context }: {
  onClose: () => void;
  onSelect?: (attack: BossAttack) => void;
  context?: string;
}) {
  const [attacks, setAttacks] = useState<BossAttack[]>([]);
  const [draft, setDraft] = useState<BossAttack | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => { let active = true; void window.bossAPI.getAttackLibrary().then((entries) => { if (active) setAttacks(entries); }).catch(() => { if (active) setError('Não foi possível abrir a biblioteca.'); }); return () => { active = false; }; }, []);
  const save = async (remove = false) => {
    if (!draft || busy) return;
    const normalized = normalizeBossAttack(draft, draft.id);
    if (!normalized || (!remove && (
      !draft.name.trim() || (draft.attackCount ?? 1) < 1 || (draft.attackCount ?? 1) > 20 ||
      draft.criticalThreat < 2 || draft.criticalThreat > 20 ||
      draft.criticalMultiplier < 2 || draft.criticalMultiplier > 10 ||
      !(draft.statusEffects ?? []).every(isAttackStatusEffect)
    ))) { setError('Confira o nome, as fórmulas, os limites do ataque e os turnos/CD dos efeitos.'); return; }
    setBusy(true);
    try {
      const result = await window.bossAPI.saveLibraryAttack(normalized, remove);
      if (!result.ok || !result.attacks) { setError(result.error ?? 'Não foi possível salvar.'); return; }
      setAttacks(result.attacks); setDraft(null); setDeleting(false); setError('');
    } catch { setError('Não foi possível salvar a biblioteca.'); }
    finally { setBusy(false); }
  };
  const patch = (value: Partial<BossAttack>) => setDraft((current) => current ? { ...current, ...value } : current);
  const visibleAttacks = attacks.filter((attack) => `${attack.name} ${attack.tags?.join(' ')}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  return createPortal(<div className="attack-library-backdrop">
    <section className={`attack-library${draft ? ' is-editing' : ''}`} role="dialog" aria-modal="true" aria-label="Biblioteca de ataques">
      <header><div><h2>Biblioteca de ataques</h2>{context && <small>{context}</small>}</div><button className="attack-library-close" type="button" title="Fechar" aria-label="Fechar biblioteca de ataques" onClick={onClose}>×</button></header>
      <div className="attack-library-toolbar"><input type="search" aria-label="Buscar ataque ou tag" placeholder="Buscar nome, chefão ou fase…" value={search} onChange={(event) => setSearch(event.target.value)} /><button className="is-primary" type="button" onClick={() => { setDraft({ ...createInitialBossAttack('library'), id: crypto.randomUUID(), name: 'Novo ataque' }); setDeleting(false); }}>Novo ataque</button></div>
      <div className="attack-library-content">
        <div className="attack-library-list" aria-label="Ataques salvos">{visibleAttacks.map((attack) => <article className={draft?.id === attack.id ? 'is-selected' : ''} key={attack.id}>
          <div className="attack-library-summary"><strong title={attack.name}>{attack.name}</strong><small>{attack.attackCount ?? 1} ataque(s) · {attack.damageFormula} · {attack.damageType} · {attack.range}</small>{Boolean(attack.tags?.length) && <div className="attack-library-tags">{attack.tags!.map((tag, index) => <span key={`${tag}-${index}`}>{tag}</span>)}</div>}</div>
          <div className="attack-library-row-actions">
          <button type="button" onClick={() => { setDraft(structuredClone(attack)); setDeleting(false); }}>Editar</button>
          {onSelect && <button className="is-primary" type="button" onClick={() => onSelect(structuredClone(attack))}>Selecionar</button>}
          </div>
        </article>)}{!visibleAttacks.length && <p className="attack-library-empty">{attacks.length ? 'Nenhum ataque corresponde à busca.' : 'Nenhum ataque salvo.'}</p>}</div>
        {draft && <form className="attack-library-editor" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <div className="attack-library-editor-fields">
          <h3>{attacks.some((attack) => attack.id === draft.id) ? 'Editar ataque' : 'Novo ataque'}</h3>
          <div className="attack-library-fields">
            <label className="attack-library-wide">Nome<input maxLength={60} value={draft.name} onChange={(event) => patch({ name: event.target.value })} /></label>
            <label className="attack-library-wide">Tags (separadas por vírgula)<input placeholder="Chefão: Dragão, Fase: 2" value={draft.tags?.join(',') ?? ''} onChange={(event) => patch({ tags: event.target.value.split(',') })} /></label>
            <label>Teste<select value={draft.attackType} onChange={(event) => patch({ attackType: event.target.value as BossAttack['attackType'] })}><option value="melee">Luta</option><option value="ranged">Pontaria</option></select></label>
            <label>Bônus de ataque<AttackBonusField key={draft.id} value={draft.attackModifier} onChange={(attackModifier) => patch({ attackModifier })} /></label>
            <label>Dano por acerto<input value={draft.damageFormula} onChange={(event) => patch({ damageFormula: event.target.value })} /></label>
            <label>Ataques (1–20)<input type="text" inputMode="numeric" value={draft.attackCount ?? 1} onChange={(event) => { if (/^\d{0,2}$/.test(event.target.value)) patch({ attackCount: Number(event.target.value) }); }} /></label>
            <label>Margem crítica<input type="text" inputMode="numeric" value={draft.criticalThreat} onChange={(event) => { if (/^\d{0,2}$/.test(event.target.value)) patch({ criticalThreat: Number(event.target.value) }); }} /></label>
            <label>Multiplicador<input type="text" inputMode="numeric" value={draft.criticalMultiplier} onChange={(event) => { if (/^\d{0,2}$/.test(event.target.value)) patch({ criticalMultiplier: Number(event.target.value) }); }} /></label>
            <label>Tipo de dano<DamageTypeField value={draft.damageType} onChange={(damageType) => patch({ damageType })} /></label>
            <label>Alcance / área<AttackRangeField value={draft.range} onChange={(range) => patch({ range })} /></label>
          </div>
          <h3>Efeitos ao acertar</h3>
          {(draft.statusEffects ?? []).map((effect, index) => <div className="attack-status-row" key={index}>
            <label className="attack-status-condition">Condição<select aria-label="Condição" value={effect.statusId} onChange={(event) => patch({ statusEffects: draft.statusEffects!.map((entry, at) => at === index ? { ...entry, statusId: event.target.value as typeof effect.statusId } : entry) })}>{STATUS_DEFINITIONS.filter((status) => !status.customizable).map((status) => <option value={status.id} key={status.id}>{status.name}</option>)}</select></label>
            <label className="attack-status-resistance">Resistência<select aria-label="Perícia de resistência" value={effect.resistanceSkill} onChange={(event) => patch({ statusEffects: draft.statusEffects!.map((entry, at) => at === index ? { ...entry, resistanceSkill: event.target.value as typeof effect.resistanceSkill } : entry) })}>{BOSS_SKILL_DEFINITIONS.map(([id, name]) => <option value={id} key={id}>{name}</option>)}</select></label>
            {(['dc', 'turns'] as const).map((key) => <label key={key}>{key === 'dc' ? 'CD' : 'Turnos'}<input type="text" inputMode="numeric" value={effect[key]} onChange={(event) => { if (/^\d{0,3}$/.test(event.target.value)) patch({ statusEffects: draft.statusEffects!.map((entry, at) => at === index ? { ...entry, [key]: Number(event.target.value) } : entry) }); }} /></label>)}
            <label>Dano/turno<input value={effect.damageFormula} onChange={(event) => patch({ statusEffects: draft.statusEffects!.map((entry, at) => at === index ? { ...entry, damageFormula: event.target.value } : entry) })} /></label>
            <button className="attack-effect-remove is-destructive" type="button" title="Remover efeito" aria-label={`Remover efeito ${index + 1}`} onClick={() => patch({ statusEffects: draft.statusEffects!.filter((_, at) => at !== index) })}>×</button>
          </div>)}
          <button className="attack-add-effect" type="button" disabled={(draft.statusEffects?.length ?? 0) >= 10} data-disabled-reason="Limite de dez efeitos por ataque" onClick={() => patch({ statusEffects: [...(draft.statusEffects ?? []), { statusId: 'abalado', resistanceSkill: 'vontade', dc: 15, turns: 1, damageFormula: '0' }] })}>Adicionar efeito</button>
          </div>
          <footer><button type="button" onClick={() => setDraft(null)}>Cancelar edição</button>{attacks.some((attack) => attack.id === draft.id) && <button className="is-destructive" type="button" disabled={busy} onClick={() => setDeleting(true)}>Excluir</button>}<button className="is-primary" disabled={busy} type="submit">Salvar ataque</button></footer>
        </form>}
      </div>
      {error && <p className="attack-library-error" role="alert">{error}</p>}
      {deleting && <div className="attack-library-confirmation"><section role="alertdialog" aria-modal="true" aria-label="Excluir ataque"><header><h3>Excluir ataque?</h3><button className="attack-library-close" type="button" aria-label="Fechar confirmação" onClick={() => setDeleting(false)}>×</button></header><p>Excluir este ataque da biblioteca? Os arsenais já configurados serão preservados.</p><footer><button type="button" onClick={() => setDeleting(false)}>Cancelar</button><button className="is-destructive" type="button" disabled={busy} onClick={() => void save(true)}>Excluir ataque</button></footer></section></div>}
    </section>
  </div>, document.body);
}
