import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  calculateHealthSequence,
  type BattleState,
} from './shared/battle';
import './control.css';
import './scrollbars.css';

const parseHealthExpression = (value: string) => {
  const parts = value.trim().replace(',', '.').split('/');
  const total = Number(parts[0]);
  const hits = parts.length === 2 ? Number(parts[1]) : 1;
  if (
    parts.length > 2 ||
    !Number.isFinite(total) ||
    total <= 0 ||
    !Number.isInteger(hits) ||
    hits < 1 ||
    hits > 1000
  ) return null;
  return { total, hits };
};

const RequiredStar = ({ visible }: { visible: boolean }) =>
  visible ? <span className="required-star" aria-label="Requer aplicação">*</span> : null;

const healthButtonFontSize = (label: string, value: number) => {
  const overflowCharacters = Math.max(0, `${label} (${value})`.length - 17);
  return `${Math.max(0.52, 0.76 - overflowCharacters * 0.035)}rem`;
};

type NumericFieldProps = {
  label: string;
  value: string;
  required: boolean;
  min?: number;
  max?: number;
  onChange: (value: string) => void;
};

const NumericField = ({
  label,
  value,
  required,
  min = 0,
  max = 999,
  onChange,
}: NumericFieldProps) => (
  <label className="control-number-field">
    <span>{label}<RequiredStar visible={required} /></span>
    <input type="number" min={min} max={max} value={value} onChange={(event) => onChange(event.target.value)} />
  </label>
);

const ControlApp = () => {
  const [state, setState] = useState<BattleState | null>(null);
  const [bossName, setBossName] = useState('');
  const [amount, setAmount] = useState('50');
  const [applyDamageReduction, setApplyDamageReduction] = useState(true);
  const [maxHealth, setMaxHealth] = useState('500');
  const [attack, setAttack] = useState('10');
  const [rangedAttack, setRangedAttack] = useState('10');
  const [skills, setSkills] = useState('10');
  const [defense, setDefense] = useState('10');
  const [damageReduction, setDamageReduction] = useState('10');
  const [shield, setShield] = useState('0');
  const [actionDraft, setActionDraft] = useState('');
  const [formError, setFormError] = useState('');
  const [panelMinimized, setPanelMinimized] = useState(false);
  const [panelTransitioning, setPanelTransitioning] = useState(false);
  const loadedSource = useRef('');

  useEffect(() => {
    let active = true;
    window.bossAPI.getState().then((initialState) => {
      if (active) setState(initialState);
    });
    const unsubscribe = window.bossAPI.subscribe(setState);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const activeBoss = state?.bosses.find((boss) => boss.id === state.activeBossId);
  const bossSource = activeBoss
    ? [
        activeBoss.id,
        activeBoss.bossName,
        activeBoss.controlAmount,
        activeBoss.applyDamageReduction,
        activeBoss.maxHealth,
        activeBoss.attack,
        activeBoss.rangedAttack,
        activeBoss.skills,
        activeBoss.defense,
        activeBoss.damageReduction,
        activeBoss.shield,
        activeBoss.nextAction,
      ].join('\u0000')
    : '';

  useEffect(() => {
    if (!activeBoss || loadedSource.current === bossSource) return;
    loadedSource.current = bossSource;
    setBossName(activeBoss.bossName);
    setAmount(activeBoss.controlAmount);
    setApplyDamageReduction(activeBoss.applyDamageReduction);
    setMaxHealth(String(activeBoss.maxHealth));
    setAttack(String(activeBoss.attack));
    setRangedAttack(String(activeBoss.rangedAttack));
    setSkills(String(activeBoss.skills));
    setDefense(String(activeBoss.defense));
    setDamageReduction(String(activeBoss.damageReduction));
    setShield(String(activeBoss.shield));
    setActionDraft(activeBoss.nextAction);
    setFormError('');
  }, [activeBoss, bossSource]);

  const markIdentityUnprepared = () => {
    if (activeBoss?.identityPrepared) {
      window.bossAPI.dispatch({ type: 'mark-identity-unprepared', bossId: activeBoss.id });
    }
  };

  const updateIdentity = (
    setter: (value: string) => void,
    value: string,
  ) => {
    setter(value);
    markIdentityUnprepared();
  };

  const updateAction = (value: string) => {
    setActionDraft(value);
    if (activeBoss?.actionPrepared) {
      window.bossAPI.dispatch({ type: 'mark-action-unprepared', bossId: activeBoss.id });
    }
  };

  const applyIdentity = (event: FormEvent) => {
    event.preventDefault();
    if (!activeBoss) return;
    const numericValues = [maxHealth, attack, rangedAttack, skills, defense, damageReduction, shield].map(Number);
    if (!bossName.trim() || numericValues.some((value) => !Number.isFinite(value)) || !parseHealthExpression(amount)) {
      setFormError('Revise o nome, o valor e os atributos antes de aplicar.');
      return;
    }
    setFormError('');
    window.bossAPI.dispatch({
      type: 'configure',
      bossId: activeBoss.id,
      bossName,
      controlAmount: amount,
      applyDamageReduction,
      maxHealth: numericValues[0],
      attack: numericValues[1],
      rangedAttack: numericValues[2],
      skills: numericValues[3],
      defense: numericValues[4],
      damageReduction: numericValues[5],
      shield: numericValues[6],
    });
  };

  const parsedAmount = useMemo(() => parseHealthExpression(amount), [amount]);
  const rawSequence = parsedAmount
    ? calculateHealthSequence({
        type: 'damage',
        total: parsedAmount.total,
        hits: parsedAmount.hits,
        ignoreDamageReduction: true,
      })
    : null;
  const reducedSequence = parsedAmount && activeBoss
    ? calculateHealthSequence({
        type: 'damage',
        total: parsedAmount.total,
        hits: parsedAmount.hits,
        damageReduction: activeBoss.damageReduction,
      })
    : null;
  const damagingHits = parsedAmount && activeBoss
    ? Math.max(0, parsedAmount.hits - activeBoss.shield)
    : 0;
  const damagePerHit = applyDamageReduction
    ? reducedSequence?.effectiveAmountPerHit ?? 0
    : rawSequence?.effectiveAmountPerHit ?? 0;
  const displayedDamage = damagePerHit * damagingHits;
  const rawAmount = rawSequence?.effectiveTotal ?? 0;

  const applyHealthChange = async (type: 'damage' | 'heal') => {
    if (!activeBoss || !parsedAmount) {
      setFormError('Use um valor como 50 ou uma divisão como 100/5.');
      return;
    }
    setFormError('');
    const result = await window.bossAPI.applyHealthSequence({
      bossId: activeBoss.id,
      type,
      total: parsedAmount.total,
      hits: parsedAmount.hits,
      ignoreDamageReduction: type === 'damage' && !applyDamageReduction,
    });
    if (!result.ok) setFormError(result.error ?? 'Não foi possível aplicar o valor.');
  };

  const publishAction = (severity: 'normal' | 'grave') => {
    if (!activeBoss) return;
    window.bossAPI.dispatch({
      type: 'publish-action',
      bossId: activeBoss.id,
      text: actionDraft,
      severity,
    });
  };

  const togglePanel = async () => {
    if (panelTransitioning) return;
    const nextMinimized = !panelMinimized;
    setPanelTransitioning(true);
    const changed = await window.bossAPI.setControlPanelMinimized(nextMinimized);
    if (changed) setPanelMinimized(nextMinimized);
    setPanelTransitioning(false);
  };

  if (!state || !activeBoss) {
    return <main className="control-loading">Conectando ao encontro...</main>;
  }

  const identityRequired = !state.battleStarted && !activeBoss.identityPrepared;
  const actionRequired = !state.battleStarted && !activeBoss.actionPrepared;
  const missingHealth = Math.max(0, activeBoss.maxHealth - activeBoss.currentHealth);

  return (
    <main className={`control-shell ${panelMinimized ? 'is-minimized' : ''}`}>
      <header className="control-header">
        <nav className="control-tabs" aria-label="Chefões do encontro">
          {state.bosses.map((boss, index) => (
            <div className={`control-tab ${boss.id === activeBoss.id ? 'is-active' : ''}`} key={boss.id}>
              <button type="button" onClick={() => window.bossAPI.dispatch({ type: 'select-boss', bossId: boss.id })}>
                <span>0{index + 1}</span>{boss.bossName}
              </button>
              {state.bosses.length > 1 && (
                <button className="control-remove-boss" type="button" title="Remover chefão" onClick={() => window.bossAPI.dispatch({ type: 'remove-boss', bossId: boss.id })}>×</button>
              )}
            </div>
          ))}
          {state.bosses.length < 3 && (
            <button className="control-add-boss" type="button" onClick={() => window.bossAPI.dispatch({ type: 'add-boss' })}>+ Chefão</button>
          )}
        </nav>
        <div className="health-difference" title="Diferença entre a vida atual e a vida máxima">
          <span>PV</span><strong>{activeBoss.currentHealth}/{activeBoss.maxHealth}</strong><small>−{missingHealth}</small>
        </div>
        <button
          className="control-minimize-button"
          type="button"
          disabled={panelTransitioning}
          aria-expanded={!panelMinimized}
          title={panelMinimized ? 'Expandir painel' : 'Minimizar painel'}
          onClick={() => void togglePanel()}
        >
          <span className="panel-arrows" aria-hidden="true">
            {panelMinimized ? '<>' : '><'}
          </span>
        </button>
      </header>

      <form className="control-form" onSubmit={applyIdentity}>
        <div className="control-combat-row">
          <label className="control-name-field">
            <span>Nome do chefão<RequiredStar visible={identityRequired} /></span>
            <input maxLength={100} value={bossName} onChange={(event) => updateIdentity(setBossName, event.target.value)} />
          </label>
          <label className="control-amount-field">
            <span>Valor</span>
            <input inputMode="decimal" value={amount} onChange={(event) => {
              if (/^[0-9.,/]*$/.test(event.target.value)) updateIdentity(setAmount, event.target.value);
            }} />
          </label>
          <label className="control-rd-toggle">
            <span>RD</span>
            <input type="checkbox" checked={applyDamageReduction} onChange={(event) => {
              setApplyDamageReduction(event.target.checked);
              markIdentityUnprepared();
            }} />
          </label>
          <button className="control-damage" type="button" onClick={() => void applyHealthChange('damage')}><span style={{ fontSize: healthButtonFontSize('Dano', displayedDamage) }}>Dano <small>({displayedDamage})</small></span></button>
          <button className="control-heal" type="button" onClick={() => void applyHealthChange('heal')}><span style={{ fontSize: healthButtonFontSize('Cura', rawAmount) }}>Cura <small>({rawAmount})</small></span></button>
          <button className="control-full-heal" type="button" onClick={() => window.bossAPI.dispatch({ type: 'reset-health', bossId: activeBoss.id })}><span style={{ fontSize: healthButtonFontSize('Full Heal', activeBoss.maxHealth) }}>Full Heal <small>({activeBoss.maxHealth})</small></span></button>
        </div>

        <div className="control-attributes-row">
          <NumericField label="Vida máx." value={maxHealth} min={1} max={1_000_000} required={identityRequired} onChange={(value) => updateIdentity(setMaxHealth, value)} />
          <NumericField label="Ataque" value={attack} required={identityRequired} onChange={(value) => updateIdentity(setAttack, value)} />
          <NumericField label="Tiro" value={rangedAttack} required={identityRequired} onChange={(value) => updateIdentity(setRangedAttack, value)} />
          <NumericField label="Perícias" value={skills} required={identityRequired} onChange={(value) => updateIdentity(setSkills, value)} />
          <NumericField label="Defesa" value={defense} required={identityRequired} onChange={(value) => updateIdentity(setDefense, value)} />
          <NumericField label="RD" value={damageReduction} required={identityRequired} onChange={(value) => updateIdentity(setDamageReduction, value)} />
          <NumericField label="Escudo" value={shield} required={identityRequired} onChange={(value) => updateIdentity(setShield, value)} />
          <button className="control-apply" type="submit">Aplicar</button>
        </div>

        <div className="control-action-row">
          <label className="control-action-field">
            <span>Próxima ação<RequiredStar visible={actionRequired} /></span>
            <textarea maxLength={100} rows={2} value={actionDraft} placeholder="Descreva a próxima ação para preparar os jogadores." onChange={(event) => updateAction(event.target.value)} />
          </label>
          <button className="control-publish" type="button" onClick={() => publishAction('normal')}>Ação padrão</button>
          <button className="control-publish-danger" type="button" onClick={() => publishAction('grave')}>Ação grave</button>
        </div>
      </form>
      {formError && <p className="control-error">{formError}</p>}
    </main>
  );
};

const root = document.getElementById('root');
if (!root) throw new Error('Elemento raiz não encontrado.');
createRoot(root).render(<ControlApp />);
