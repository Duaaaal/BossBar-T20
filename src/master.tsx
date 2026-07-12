import { FormEvent, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { initialBattleState, type BattleState } from './shared/battle';
import './master.css';

type CompactNumberFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  className?: string;
};

const CompactNumberField = ({
  label,
  value,
  onChange,
  min = 0,
  max = 999,
  className = '',
}: CompactNumberFieldProps) => (
  <label className={`compact-field ${className}`.trim()}>
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
  const [bossName, setBossName] = useState('');
  const [maxHealth, setMaxHealth] = useState('');
  const [attack, setAttack] = useState('10');
  const [rangedAttack, setRangedAttack] = useState('10');
  const [defense, setDefense] = useState('10');
  const [skills, setSkills] = useState('10');
  const [damageReduction, setDamageReduction] = useState('10');
  const [amount, setAmount] = useState('10');
  const [actionDraft, setActionDraft] = useState('');
  const [backgroundError, setBackgroundError] = useState('');
  const [pendingBackgroundName, setPendingBackgroundName] = useState<
    string | null
  >(null);
  const [pendingBackgroundRemoval, setPendingBackgroundRemoval] =
    useState(false);
  const [resetConfirmationOpen, setResetConfirmationOpen] = useState(false);
  const cancelResetButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let active = true;

    window.bossAPI.getState().then((initialState) => {
      if (!active) return;
      setState(initialState);
      setBossName(initialState.bossName);
      setMaxHealth(String(initialState.maxHealth));
      setAttack(String(initialState.attack));
      setRangedAttack(String(initialState.rangedAttack));
      setDefense(String(initialState.defense));
      setSkills(String(initialState.skills));
      setDamageReduction(String(initialState.damageReduction));
      setActionDraft(initialState.nextAction);
    });

    const unsubscribe = window.bossAPI.subscribe((nextState) => {
      setState(nextState);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(
    () =>
      window.bossAPI.subscribeBackgroundError((message) => {
        setBackgroundError(message);
      }),
    [],
  );

  useEffect(() => {
    if (!resetConfirmationOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setResetConfirmationOpen(false);
      }
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
    window.bossAPI.dispatch({
      type: 'configure',
      bossName,
      maxHealth: Number(maxHealth),
      attack: Number(attack),
      rangedAttack: Number(rangedAttack),
      defense: Number(defense),
      skills: Number(skills),
      damageReduction: Number(damageReduction),
    });
    setPendingBackgroundName(null);
    setPendingBackgroundRemoval(false);
  };

  const applyHealthChange = (type: 'damage' | 'heal') => {
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return;
    window.bossAPI.dispatch({ type, amount: parsedAmount });
  };

  const resetBattle = () => {
    setBossName(initialBattleState.bossName);
    setMaxHealth(String(initialBattleState.maxHealth));
    setAttack(String(initialBattleState.attack));
    setRangedAttack(String(initialBattleState.rangedAttack));
    setDefense(String(initialBattleState.defense));
    setSkills(String(initialBattleState.skills));
    setDamageReduction(String(initialBattleState.damageReduction));
    setAmount('10');
    setActionDraft(initialBattleState.nextAction);
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
    }
    if (!result.ok && !result.canceled) {
      setBackgroundError(result.error ?? 'Não foi possível carregar o arquivo.');
    }
  };

  const clearBackground = async () => {
    setBackgroundError('');
    const staged = await window.bossAPI.clearBackground();
    if (staged) {
      setPendingBackgroundName(null);
      setPendingBackgroundRemoval(true);
    }
  };

  const publishAction = (severity: 'normal' | 'grave') => {
    window.bossAPI.dispatch({
      type: 'publish-action',
      text: actionDraft,
      severity,
    });
  };

  if (!state) {
    return <main className="master-loading">Conectando à luta...</main>;
  }

  const healthPercent = Math.max(
    0,
    Math.min(100, (state.currentHealth / state.maxHealth) * 100),
  );

  return (
    <main className="master-shell">
      <header className="master-header">
        <p className="eyebrow">Painel privado</p>
        <h1>Controle do Mestre</h1>
        <p>Esta janela não deve ser compartilhada no Discord.</p>
      </header>

      <section className="session-actions" aria-label="Controles da sessão">
        <button
          className="presentation-button"
          type="button"
          onClick={() => void window.bossAPI.openPresentation()}
        >
          Abrir apresentação
        </button>
        <button
          className="reset-button"
          type="button"
          onClick={() => setResetConfirmationOpen(true)}
        >
          Resetar tudo
        </button>
        <button
          className="start-battle-button"
          type="button"
          disabled={state.battleStarted}
          onClick={() => window.bossAPI.dispatch({ type: 'start-battle' })}
        >
          {state.battleStarted ? 'Batalha em andamento' : 'Iniciar batalha'}
        </button>
      </section>

      <section className="status-card" aria-label="Estado atual do chefão">
        <div>
          <span>Chefão atual</span>
          <strong>{state.bossName}</strong>
        </div>
        <div className="health-numbers">
          <strong>{state.currentHealth}</strong>
          <span>/ {state.maxHealth} PV</span>
        </div>
        <div className="health-track">
          <div className="health-fill" style={{ width: `${healthPercent}%` }} />
        </div>
        <div className="boss-summary-stats">
          {[
            ['Ataque', state.attack],
            ['Tiro', state.rangedAttack],
            ['Defesa', state.defense],
            ['Perícias', state.skills],
            ['RD', state.damageReduction],
          ].map(([label, value]) => (
            <div className="summary-stat" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      </section>

      <form className="panel" onSubmit={saveBoss}>
        <div className="panel-title">
          <span className="step">01</span>
          <h2>Identidade</h2>
        </div>
        <label>
          Nome do chefão
          <input
            value={bossName}
            maxLength={100}
            onChange={(event) => setBossName(event.target.value)}
          />
        </label>
        <div className="identity-grid">
          <CompactNumberField
            label="Vida máx."
            value={maxHealth}
            min={1}
            max={1_000_000}
            onChange={setMaxHealth}
          />
          <CompactNumberField label="Ataque" value={attack} onChange={setAttack} />
          <CompactNumberField
            label="Tiro"
            value={rangedAttack}
            onChange={setRangedAttack}
          />
          <CompactNumberField
            label="Defesa"
            value={defense}
            onChange={setDefense}
          />
          <CompactNumberField
            label="Perícias"
            value={skills}
            onChange={setSkills}
          />
          <CompactNumberField
            label="RD"
            value={damageReduction}
            onChange={setDamageReduction}
          />
        </div>
        <div className="background-control">
          <div className="background-copy">
            <strong>Imagem ou GIF de fundo</strong>
            <span>
              {pendingBackgroundRemoval
                ? 'O fundo será removido ao salvar'
                : pendingBackgroundName
                  ? `${pendingBackgroundName} — pendente`
                  : state.backgroundName ?? 'Nenhum arquivo selecionado'}
            </span>
          </div>
          <div className="background-actions">
            <button
              className="background-button"
              type="button"
              onClick={() => void chooseBackground()}
            >
              Escolher arquivo
            </button>
            {(state.backgroundName || pendingBackgroundName) &&
              !pendingBackgroundRemoval && (
              <button
                className="background-remove-button"
                type="button"
                onClick={() => void clearBackground()}
              >
                Remover
              </button>
            )}
          </div>
        </div>
        {backgroundError && <p className="upload-error">{backgroundError}</p>}
        <p className="background-note">
          Recomendado: 1920 × 1080 px (16:9). Aceita PNG, JPG, JFIF, WebP,
          GIF, BMP ou AVIF de até 25 MB. O fundo só muda ao salvar os dados.
        </p>
        <button className="secondary-button" type="submit">
          Salvar dados do chefão
        </button>
      </form>

      <section className="panel">
        <div className="panel-title">
          <span className="step">02</span>
          <h2>Vida</h2>
        </div>
        <div className="health-action-row">
          <CompactNumberField
            className="amount-field"
            label="Valor"
            value={amount}
            min={1}
            max={1_000_000}
            onChange={setAmount}
          />
          <button
            className="damage-button"
            type="button"
            onClick={() => applyHealthChange('damage')}
          >
            Dano
          </button>
          <button
            className="heal-button"
            type="button"
            onClick={() => applyHealthChange('heal')}
          >
            Cura
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={() => window.bossAPI.dispatch({ type: 'reset-health' })}
          >
            Full Heal
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="panel-title">
          <span className="step">03</span>
          <h2>Próxima ação</h2>
        </div>
        <label>
          Rascunho privado
          <textarea
            value={actionDraft}
            maxLength={100}
            rows={2}
            onChange={(event) => setActionDraft(event.target.value)}
          />
        </label>
        <div className="field-meta">
          <p className="field-note">
            O texto só aparece para os jogadores depois de ser publicado.
          </p>
          <span>{actionDraft.length}/100</span>
        </div>
        <div className="publish-action-grid">
          <button
            className="publish-button"
            type="button"
            onClick={() => publishAction('normal')}
          >
            Publicar ação
          </button>
          <button
            className="publish-danger-button"
            type="button"
            onClick={() => publishAction('grave')}
          >
            Publicar ação grave
          </button>
        </div>
      </section>

      {resetConfirmationOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setResetConfirmationOpen(false);
            }
          }}
        >
          <section
            className="confirmation-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-modal-title"
            aria-describedby="reset-modal-description"
          >
            <p className="modal-eyebrow">Confirmação</p>
            <h2 id="reset-modal-title">Resetar toda a luta?</h2>
            <p id="reset-modal-description">
              O nome, a vida, os atributos, o fundo e a próxima ação voltarão
              aos valores padrão.
            </p>
            <div className="modal-actions">
              <button
                ref={cancelResetButton}
                className="modal-cancel-button"
                type="button"
                onClick={() => setResetConfirmationOpen(false)}
              >
                Cancelar
              </button>
              <button
                className="modal-confirm-button"
                type="button"
                onClick={resetBattle}
              >
                Sim, resetar tudo
              </button>
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
