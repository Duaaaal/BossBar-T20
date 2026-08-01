import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type {
  EncounterDebugCreature,
  EncounterDebugSnapshot,
} from './shared/encounter-debugger';
import './encounter-debugger.css';
import './scrollbars.css';

const kindLabels: Record<EncounterDebugCreature['kind'], string> = {
  boss: 'Chefão',
  player: 'Jogador',
  npc: 'NPC',
};

const serialize = (creature: EncounterDebugCreature | null) =>
  creature ? JSON.stringify(creature.data, null, 2) : '';

const EncounterDebugger = () => {
  const [snapshot, setSnapshot] = useState<EncounterDebugSnapshot>({
    creatures: [],
    revision: 0,
  });
  const [selectedKey, setSelectedKey] = useState('');
  const [draft, setDraft] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  const selected = useMemo(
    () => snapshot.creatures.find(
      ({ id, kind }) => `${kind}:${id}` === selectedKey,
    ) ?? null,
    [selectedKey, snapshot.creatures],
  );

  const load = async (preferredKey = selectedKey) => {
    const next = await window.bossAPI.getEncounterDebugSnapshot();
    setSnapshot(next);
    const key = next.creatures.some(
      ({ id, kind }) => `${kind}:${id}` === preferredKey,
    )
      ? preferredKey
      : next.creatures[0]
        ? `${next.creatures[0].kind}:${next.creatures[0].id}`
        : '';
    setSelectedKey(key);
    const creature = next.creatures.find(
      ({ id, kind }) => `${kind}:${id}` === key,
    ) ?? null;
    setDraft(serialize(creature));
  };

  useEffect(() => {
    void load('');
  }, []);

  const selectCreature = (creature: EncounterDebugCreature) => {
    setSelectedKey(`${creature.kind}:${creature.id}`);
    setDraft(serialize(creature));
    setFeedback('');
  };

  const apply = async () => {
    if (!selected || busy) return;
    let data: unknown;
    try {
      data = JSON.parse(draft);
    } catch {
      setFeedback('JSON inválido. Corrija a estrutura antes de aplicar.');
      return;
    }
    setBusy(true);
    const result = await window.bossAPI.overwriteEncounterDebugCreature({
      id: selected.id,
      kind: selected.kind,
      data,
    });
    setBusy(false);
    if (!result.ok) {
      setFeedback(result.error ?? 'Não foi possível aplicar os valores.');
      return;
    }
    const next = result.snapshot ?? await window.bossAPI.getEncounterDebugSnapshot();
    setSnapshot(next);
    const updated = next.creatures.find(
      ({ id, kind }) => id === selected.id && kind === selected.kind,
    ) ?? null;
    setDraft(serialize(updated));
    setFeedback('Valores validados, aplicados e sincronizados.');
  };

  return (
    <main className="debugger-shell">
      <header>
        <div>
          <p>Ferramenta administrativa</p>
          <h1>Depurador do encontro</h1>
        </div>
        <button type="button" onClick={() => void load()} disabled={busy}>
          Atualizar
        </button>
      </header>
      <p className="debugger-warning">
        Altere somente valores que você reconhece. Identificadores internos são preservados pelo aplicativo.
      </p>
      <section className="debugger-workspace">
        <nav aria-label="Criaturas presentes">
          {snapshot.creatures.length > 0 ? snapshot.creatures.map((creature) => {
            const key = `${creature.kind}:${creature.id}`;
            return (
              <button
                type="button"
                className={key === selectedKey ? 'is-selected' : ''}
                onClick={() => selectCreature(creature)}
                key={key}
              >
                <small>{kindLabels[creature.kind]}</small>
                <strong>{creature.name}</strong>
              </button>
            );
          }) : <p>Nenhuma criatura presente no encontro.</p>}
        </nav>
        <article>
          <div className="debugger-editor-heading">
            <div>
              <small>{selected ? kindLabels[selected.kind] : 'Sem seleção'}</small>
              <h2>{selected?.name ?? 'Selecione uma criatura'}</h2>
            </div>
            <button
              className="debugger-reset-button"
              type="button"
              disabled={!selected || busy}
              onClick={() => {
                setDraft(serialize(selected));
                setFeedback('');
              }}
            >
              Restaurar editor
            </button>
          </div>
          <textarea
            aria-label="Valores da criatura em JSON"
            value={draft}
            disabled={!selected || busy}
            spellCheck={false}
            onChange={(event) => {
              setDraft(event.target.value);
              setFeedback('');
            }}
          />
          <footer>
            <span role="status" className={feedback.startsWith('Valores') ? 'is-success' : ''}>
              {feedback}
            </span>
            <button type="button" disabled={!selected || busy} onClick={() => void apply()}>
              {busy ? 'Aplicando…' : 'Aplicar sobrescrita'}
            </button>
          </footer>
        </article>
      </section>
    </main>
  );
};

createRoot(document.getElementById('root')!).render(<EncounterDebugger />);
