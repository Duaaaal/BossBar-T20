import { FormEvent, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  createInitialBoss,
  type BattleState,
  type BossState,
} from './shared/battle';
import './master.css';

type CompactNumberFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
};

const CompactNumberField = ({
  label,
  value,
  onChange,
  min = 0,
  max = 999,
}: CompactNumberFieldProps) => (
  <label className="compact-field">
    {label}
    <input
      value={value}
      min={min}
      max={max}
      type="number"
      onChange={(event) => onChange(event.target.value)}
    />
  </label>
);

const MasterApp = () => {
  const [state, setState] = useState<BattleState | null>(null);
  const [appVersion, setAppVersion] = useState('1.0.0');
  const [bossName, setBossName] = useState('');
  const [maxHealth, setMaxHealth] = useState('');
  const [attack, setAttack] = useState('10');
  const [rangedAttack, setRangedAttack] = useState('10');
  const [defense, setDefense] = useState('10');
  const [skills, setSkills] = useState('10');
  const [damageReduction, setDamageReduction] = useState('10');
  const [amount, setAmount] = useState('50');
  const [healthError, setHealthError] = useState('');
  const [actionDraft, setActionDraft] = useState('');
  const [backgroundError, setBackgroundError] = useState('');
  const [pendingBackgroundName, setPendingBackgroundName] = useState<string | null>(null);
  const [pendingBackgroundRemoval, setPendingBackgroundRemoval] = useState(false);
  const [resetConfirmationOpen, setResetConfirmationOpen] = useState(false);
  const cancelResetButton = useRef<HTMLButtonElement>(null);
  const loadedBossId = useRef<string | null>(null);

  const loadBossForm = (boss: BossState) => {
    loadedBossId.current = boss.id;
    setBossName(boss.bossName);
    setMaxHealth(String(boss.maxHealth));
    setAttack(String(boss.attack));
    setRangedAttack(String(boss.rangedAttack));
    setDefense(String(boss.defense));
    setSkills(String(boss.skills));
    setDamageReduction(String(boss.damageReduction));
    setActionDraft(boss.nextAction);
    setHealthError('');
  };

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

  useEffect(() => {
    window.bossAPI.getAppVersion().then(setAppVersion);
  }, []);

  const activeBoss = state?.bosses.find((boss) => boss.id === state.activeBossId);

  useEffect(() => {
    if (activeBoss && loadedBossId.current !== activeBoss.id) loadBossForm(activeBoss);
  }, [activeBoss]);

  useEffect(
    () => window.bossAPI.subscribeBackgroundError(setBackgroundError),
    [],
  );

  useEffect(() => {
    if (!resetConfirmationOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setResetConfirmationOpen(false);
    };
    cancelResetButton.current?.focus();
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [resetConfirmationOpen]);

  const saveBoss = (event: FormEvent) => {
    event.preventDefault();
    if (!activeBoss) return;
    window.bossAPI.dispatch({
      type: 'configure',
      bossId: activeBoss.id,
      bossName,
      maxHealth: Number(maxHealth),
      attack: Number(attack),
      rangedAttack: Number(rangedAttack),
      defense: Number(defense),
      skills: Number(skills),
      damageReduction: Number(damageReduction),
    });
  };

  const applyHealthChange = async (type: 'damage' | 'heal') => {
    if (!activeBoss) return;
    const parts = amount.trim().replace(',', '.').split('/');
    const total = Number(parts[0]);
    const hits = parts.length === 2 ? Number(parts[1]) : 1;
    if (
      parts.length > 2 ||
      !Number.isFinite(total) ||
      total <= 0 ||
      !Number.isInteger(hits) ||
      hits < 1 ||
      hits > 1000
    ) {
      setHealthError('Use um valor como 50 ou uma divisão como 100/5.');
      return;
    }

    setHealthError('');
    const result = await window.bossAPI.applyHealthSequence({
      bossId: activeBoss.id,
      type,
      total,
      hits,
    });
    if (!result.ok) setHealthError(result.error ?? 'Não foi possível aplicar o valor.');
  };

  const resetBattle = () => {
    const initialBoss = createInitialBoss('boss-1');
    loadBossForm(initialBoss);
    setAmount('50');
    setBackgroundError('');
    setPendingBackgroundName(null);
    setPendingBackgroundRemoval(false);
    window.bossAPI.dispatch({ type: 'reset-all' });
    setResetConfirmationOpen(false);
  };

  const chooseBackground = async () => {
    setBackgroundError('');
    const result = await window.bossAPI.chooseBackground();
    if (result.ok) {
      setPendingBackgroundName(result.name ?? null);
      setPendingBackgroundRemoval(false);
    } else if (!result.canceled) {
      setBackgroundError(result.error ?? 'Não foi possível carregar o arquivo.');
    }
  };

  const clearBackground = async () => {
    setBackgroundError('');
    if (await window.bossAPI.clearBackground()) {
      setPendingBackgroundName(null);
      setPendingBackgroundRemoval(true);
    }
  };

  const applyBackground = () => {
    window.bossAPI.dispatch({ type: 'commit-background' });
    setPendingBackgroundName(null);
    setPendingBackgroundRemoval(false);
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

  if (!state || !activeBoss) return <main className="master-loading">Conectando à luta...</main>;

  const healthPercent = Math.max(0, Math.min(100, (activeBoss.currentHealth / activeBoss.maxHealth) * 100));
  const backgroundPending = Boolean(pendingBackgroundName || pendingBackgroundRemoval);

  return (
    <main className="master-shell">
      <header className="master-header">
        <h1 className="master-title">
          <span>Painel Privado</span><i aria-hidden="true" /><strong>Controle do Mestre</strong>
        </h1>
        <p>Esta janela não deve ser compartilhada no Discord.</p>
      </header>

      <section className="session-actions" aria-label="Controles da sessão">
        <button className="presentation-button" type="button" onClick={() => void window.bossAPI.openPresentation()}>Abrir apresentação</button>
        <button className="reset-button" type="button" onClick={() => setResetConfirmationOpen(true)}>Resetar tudo</button>
        <button className="hud-toggle-button" type="button" onClick={() => window.bossAPI.dispatch({ type: 'set-hud-visible', visible: !state.hudVisible })}>
          {state.hudVisible ? 'Esconder HUD' : 'Mostrar HUD'}
        </button>
        <button className="music-window-button" type="button" onClick={() => void window.bossAPI.openMusicWindow()}>Trilha sonora</button>
        <button
          className={`start-battle-button ${state.battleStarted ? 'is-ending' : ''}`}
          type="button"
          onClick={() => window.bossAPI.dispatch({ type: state.battleStarted ? 'end-battle' : 'start-battle' })}
        >
          {state.battleStarted ? 'Encerrar batalha' : 'Iniciar batalha'}
        </button>
      </section>

      <section className="global-background-control" aria-label="Fundo universal da apresentação">
        <div className="background-control">
          <div className="background-copy">
            <strong>Imagem ou GIF de fundo</strong>
            <span>{pendingBackgroundRemoval ? 'Remoção pendente' : pendingBackgroundName ? `${pendingBackgroundName} — pendente` : state.backgroundName ?? 'Nenhum arquivo selecionado'}</span>
          </div>
          <div className="background-actions">
            <button className="background-button" type="button" onClick={() => void chooseBackground()}>Upload</button>
            {(state.backgroundName || pendingBackgroundName) && !pendingBackgroundRemoval && <button className="background-remove-button" type="button" onClick={() => void clearBackground()}>Remover</button>}
            <button className="background-apply-button" type="button" disabled={!backgroundPending} onClick={applyBackground}>Aplicar</button>
          </div>
        </div>
        {backgroundError && <p className="upload-error">{backgroundError}</p>}
        <p className="background-note">Fundo universal · recomendado: 1920 × 1080 px (16:9) · até 25 MB.</p>
      </section>

      <nav className="boss-tabs" aria-label="Chefões da batalha">
        {state.bosses.map((boss, index) => (
          <div className={`boss-tab ${boss.id === activeBoss.id ? 'is-active' : ''}`} key={boss.id}>
            <button type="button" onClick={() => window.bossAPI.dispatch({ type: 'select-boss', bossId: boss.id })}>
              <span>0{index + 1}</span>{boss.bossName}
            </button>
            {state.bosses.length > 1 && (
              <button className="remove-boss-button" type="button" title="Remover chefão" onClick={() => window.bossAPI.dispatch({ type: 'remove-boss', bossId: boss.id })}>×</button>
            )}
          </div>
        ))}
        {state.bosses.length < 3 && (
          <button className="add-boss-button" type="button" onClick={() => window.bossAPI.dispatch({ type: 'add-boss' })}>+ Chefão</button>
        )}
      </nav>

      <section className="status-card" aria-label="Estado atual do chefão">
        <div><span>Chefão atual</span><strong>{activeBoss.bossName}</strong></div>
        <div className="health-numbers"><strong>{activeBoss.currentHealth}</strong><span>/ {activeBoss.maxHealth} PV</span></div>
        <div className="health-track"><div className="health-fill" style={{ width: `${healthPercent}%` }} /></div>
        <div className="health-action-row status-health-actions">
          <label className="compact-field amount-field">Valor
            <input aria-label="Valor de dano ou cura" inputMode="decimal" value={amount} onChange={(event) => { if (/^[0-9.,/]*$/.test(event.target.value)) setAmount(event.target.value); }} />
          </label>
          <button className="damage-button" type="button" onClick={() => void applyHealthChange('damage')}>Dano</button>
          <button className="heal-button" type="button" onClick={() => void applyHealthChange('heal')}>Cura</button>
          <button className="full-heal-button" type="button" onClick={() => window.bossAPI.dispatch({ type: 'reset-health', bossId: activeBoss.id })}>Full Heal</button>
        </div>
        {healthError && <p className="health-error">{healthError}</p>}
        <div className="boss-summary-stats">
          {[
            ['Ataque', activeBoss.attack], ['Tiro', activeBoss.rangedAttack], ['Perícias', activeBoss.skills], ['Defesa', activeBoss.defense], ['RD', activeBoss.damageReduction],
          ].map(([label, value]) => <div className="summary-stat" key={label}><span>{label}</span><strong>{value}</strong></div>)}
        </div>

      </section>

      <form className="panel" onSubmit={saveBoss}>
        <div className="panel-title"><span className="step">01</span><h2>Identidade</h2></div>
        <label>Nome do chefão<input value={bossName} maxLength={100} onChange={(event) => setBossName(event.target.value)} /></label>
        <div className="identity-grid">
          <CompactNumberField label="Vida máx." value={maxHealth} min={1} max={1_000_000} onChange={setMaxHealth} />
          <CompactNumberField label="Ataque" value={attack} onChange={setAttack} />
          <CompactNumberField label="Tiro" value={rangedAttack} onChange={setRangedAttack} />
          <CompactNumberField label="Defesa" value={defense} onChange={setDefense} />
          <CompactNumberField label="Perícias" value={skills} onChange={setSkills} />
          <CompactNumberField label="RD" value={damageReduction} onChange={setDamageReduction} />
        </div>
        <button className="secondary-button" type="submit">Salvar dados do chefão</button>
      </form>

      <section className="panel">
        <div className="panel-title"><span className="step">02</span><h2>Próxima ação</h2></div>
        <textarea aria-label="Próxima ação do chefão" value={actionDraft} maxLength={100} rows={2} onChange={(event) => setActionDraft(event.target.value)} />
        <div className="field-meta"><p className="field-note">O texto só aparece para os jogadores depois de ser publicado.</p><span>{actionDraft.length}/100</span></div>
        <div className="publish-action-grid">
          <button className="publish-button" type="button" onClick={() => publishAction('normal')}>Publicar ação</button>
          <button className="publish-danger-button" type="button" onClick={() => publishAction('grave')}>Publicar ação grave</button>
        </div>
      </section>

      <footer className="master-footer">
        @Criado por: Brian Nascimento - Versão {appVersion}
      </footer>

      {resetConfirmationOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setResetConfirmationOpen(false); }}>
          <section className="confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="reset-modal-title" aria-describedby="reset-modal-description">
            <p className="modal-eyebrow">Confirmação</p><h2 id="reset-modal-title">Resetar toda a luta?</h2>
            <p id="reset-modal-description">Todos os chefões, a vida, os atributos, o fundo e as próximas ações voltarão aos valores padrão.</p>
            <div className="modal-actions">
              <button ref={cancelResetButton} className="modal-cancel-button" type="button" onClick={() => setResetConfirmationOpen(false)}>Cancelar</button>
              <button className="modal-confirm-button" type="button" onClick={resetBattle}>Sim, resetar tudo</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
};

const root = document.getElementById('root');
if (!root) throw new Error('Elemento raiz não encontrado.');
createRoot(root).render(<MasterApp />);
