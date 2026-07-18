import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  createSceneRanges,
  MAX_SCENE_PHASES,
  type SceneBossDirective,
  type SceneBossPatch,
  type SceneMediaSlot,
  type ScenePhaseDraft,
  type ScenePlan,
  type ScenePlanDraft,
  type SceneTransitionKind,
  validateSceneRanges,
} from './shared/scene';
import './scene-editor.css';
import './scrollbars.css';

const transitionLabels: Record<SceneTransitionKind, string> = {
  fade: 'Fade',
  blackout: 'Blackout',
  explosion: 'Explosão',
};

const mediaLabels: Record<SceneMediaSlot, string> = {
  background: 'Fundo da fase',
  transitionSound: 'Som da transição',
  music: 'Música da fase',
};

const draftFromPlan = (plan: ScenePlan): ScenePlanDraft => ({
  bossSlots: plan.bossSlots.map((slot) => ({ ...slot })),
  showPhaseMarkers: plan.showPhaseMarkers,
  phases: plan.phases.map((phase) => ({
    ...phase,
    background: phase.background ? { ...phase.background } : null,
    transitionSound: phase.transitionSound ? { ...phase.transitionSound } : null,
    music: phase.music ? { ...phase.music } : null,
    bosses: phase.bosses.map((directive) => ({
      ...directive,
      patch: { ...directive.patch },
    })),
  })),
});

const createPhaseFromPrevious = (
  index: number,
  previous: ScenePhaseDraft,
  range: { startPercent: number; endPercent: number },
): ScenePhaseDraft => ({
  ...previous,
  id: `phase-${crypto.randomUUID()}`,
  name: `Fase ${index + 1}`,
  ...range,
  background: null,
  transitionSound: null,
  music: null,
  bosses: previous.bosses.map((directive) => ({
    ...directive,
    patch: { ...directive.patch },
  })),
});

const SceneEditorApp = () => {
  const [plan, setPlan] = useState<ScenePlan | null>(null);
  const [draft, setDraft] = useState<ScenePlanDraft | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [battleState, setBattleState] = useState<Awaited<ReturnType<typeof window.bossAPI.getState>> | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [phaseToDelete, setPhaseToDelete] = useState<number | null>(null);
  const [closeConfirmationOpen, setCloseConfirmationOpen] = useState(false);
  const dirtyRef = useRef(false);

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  useEffect(() => {
    let active = true;
    window.bossAPI.getScenePlan().then((state) => {
      if (!active) return;
      setPlan(state);
      setDraft(draftFromPlan(state));
    });
    const unsubscribe = window.bossAPI.subscribeScenePlan((state) => {
      if (!active) return;
      setPlan(state);
      if (!dirtyRef.current) setDraft(draftFromPlan(state));
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;
    window.bossAPI.getState().then((state) => {
      if (active) setBattleState(state);
    });
    const unsubscribe = window.bossAPI.subscribe((state) => {
      if (active) setBattleState(state);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(
    () => window.bossAPI.subscribeSceneEditorCloseRequested(() => {
      if (dirtyRef.current) setCloseConfirmationOpen(true);
      else window.bossAPI.confirmSceneEditorClose();
    }),
    [],
  );

  useEffect(
    () => window.bossAPI.subscribeBackgroundError(setMessage),
    [],
  );

  const currentPhase = draft?.phases[selectedIndex] ?? null;
  const rangeError = draft ? validateSceneRanges(draft.phases) : null;
  const markDirty = () => {
    dirtyRef.current = true;
    setDirty(true);
  };

  const updatePhase = (updater: (phase: ScenePhaseDraft) => ScenePhaseDraft) => {
    setDraft((current) => current ? {
      ...current,
      phases: current.phases.map((phase, index) =>
        index === selectedIndex ? updater(phase) : phase),
    } : current);
    markDirty();
    setMessage('');
  };

  const updateDirective = (
    bossId: string,
    updater: (directive: SceneBossDirective) => SceneBossDirective,
  ) => updatePhase((phase) => ({
    ...phase,
    bosses: phase.bosses.map((directive) =>
      directive.bossId === bossId ? updater(directive) : directive),
  }));

  const setPatchValue = (
    bossId: string,
    key: keyof SceneBossPatch,
    value: string,
  ) => updateDirective(bossId, (directive) => {
    const patch = { ...directive.patch };
    if (!value.trim()) {
      delete patch[key];
    } else if (key === 'bossName') {
      patch.bossName = value;
    } else {
      (patch as Record<string, string | number>)[key] = Number(value);
    }
    return { ...directive, patch };
  });

  const persistDraft = async (showSuccess = true) => {
    if (!draft) return null;
    setBusy(true);
    setMessage('');
    const result = await window.bossAPI.saveScenePlan(draft);
    setBusy(false);
    if (!result.ok || !result.state) {
      setMessage(result.error ?? 'Não foi possível salvar a cena.');
      return null;
    }
    setPlan(result.state);
    setDraft(draftFromPlan(result.state));
    dirtyRef.current = false;
    setDirty(false);
    if (showSuccess) setMessage('Cena salva. As fases estão prontas para a batalha.');
    return result.state;
  };

  const addPhase = () => {
    if (!draft || draft.phases.length >= MAX_SCENE_PHASES) return;
    const ranges = createSceneRanges(draft.phases.length + 1);
    const lastPhase = draft.phases[draft.phases.length - 1];
    const phases = [
      ...draft.phases.map((phase, index) => ({ ...phase, ...ranges[index] })),
      createPhaseFromPrevious(
        draft.phases.length,
        lastPhase,
        ranges[ranges.length - 1],
      ),
    ];
    setDraft({ ...draft, phases });
    setSelectedIndex(phases.length - 1);
    markDirty();
    setMessage('');
  };

  const deletePhase = () => {
    if (!draft || phaseToDelete === null || draft.phases.length === 1) return;
    const remaining = draft.phases.filter((_, index) => index !== phaseToDelete);
    const ranges = createSceneRanges(remaining.length);
    const phases = remaining.map((phase, index) => ({ ...phase, ...ranges[index] }));
    setDraft({ ...draft, phases });
    setSelectedIndex((index) => Math.min(
      index > phaseToDelete ? index - 1 : index,
      phases.length - 1,
    ));
    setPhaseToDelete(null);
    markDirty();
    setMessage('');
  };

  const chooseMedia = async (slot: SceneMediaSlot) => {
    if (!currentPhase) return;
    setBusy(true);
    const result = await window.bossAPI.chooseScenePhaseMedia(currentPhase.id, slot);
    setBusy(false);
    if (result.ok && result.media) {
      updatePhase((phase) => ({ ...phase, [slot]: result.media }));
      setMessage(`${mediaLabels[slot]} selecionado. Salve a cena para aplicar.`);
    } else if (!result.canceled) {
      setMessage(result.error ?? 'Não foi possível selecionar a mídia.');
    }
  };

  const clearMedia = async (slot: SceneMediaSlot) => {
    if (!currentPhase) return;
    setBusy(true);
    const result = await window.bossAPI.clearScenePhaseMedia(currentPhase.id, slot);
    setBusy(false);
    if (result.ok) {
      updatePhase((phase) => ({ ...phase, [slot]: null }));
      setMessage(`${mediaLabels[slot]} removido do rascunho. Salve para aplicar.`);
    } else {
      setMessage(result.error ?? 'Não foi possível remover a mídia.');
    }
  };

  const addBossSlot = () => {
    if (!draft || draft.bossSlots.length >= 3) return;
    const bossId = `scene-boss-${crypto.randomUUID()}`;
    const slot = {
      bossId,
      label: `Novo Chefão ${draft.bossSlots.length + 1}`,
      original: false,
    };
    setDraft({
      ...draft,
      bossSlots: [...draft.bossSlots, slot],
      phases: draft.phases.map((phase) => ({
        ...phase,
        bosses: [...phase.bosses, {
          bossId,
          presence: 'inherit' as const,
          patch: {},
        }],
      })),
    });
    markDirty();
    setMessage('Novo chefão adicionado ao rascunho da cena.');
  };

  const resolvedMedia = useMemo(() => {
    if (!draft || !currentPhase) return {} as Partial<Record<SceneMediaSlot, string>>;
    const values: Partial<Record<SceneMediaSlot, string>> = {};
    const targetIndex = draft.phases.findIndex((phase) => phase.id === currentPhase.id);
    for (let index = 0; index <= targetIndex; index += 1) {
      const phase = draft.phases[index];
      if (phase.background) values.background = phase.background.name;
      if (phase.transitionSound) values.transitionSound = phase.transitionSound.name;
      if (phase.music) values.music = phase.music.name;
    }
    return values;
  }, [currentPhase, draft]);

  const phaseMaximums = useMemo(() => {
    if (!draft) return [];
    const maxima = new Map(
      battleState?.bosses.map((boss) => [boss.id, boss.maxHealth]) ?? [],
    );
    draft.bossSlots.forEach((slot) => {
      if (!maxima.has(slot.bossId)) maxima.set(slot.bossId, 500);
    });
    return draft.phases.map((phase) => {
      phase.bosses.forEach((directive) => {
        if (directive.patch.maxHealth !== undefined) {
          maxima.set(directive.bossId, Math.max(1, directive.patch.maxHealth));
        }
      });
      return maxima.get(phase.triggerBossId) ?? 500;
    });
  }, [battleState, draft]);

  if (!plan || !draft || !currentPhase) {
    return <main className="scene-loading">Preparando o editor de cena...</main>;
  }

  return (
    <main className="scene-shell">
      <header className="scene-header">
        <div>
          <p>Direção do encontro</p>
          <h1>Editar cena</h1>
        </div>
        <label className="phase-markers-toggle">
          <input
            type="checkbox"
            checked={draft.showPhaseMarkers}
            onChange={(event) => {
              setDraft({ ...draft, showPhaseMarkers: event.target.checked });
              markDirty();
              setMessage('');
            }}
          />
          <span>Marcadores de mudança na barra de vida</span>
        </label>
      </header>

      <div className="scene-workspace">
        <aside className="phase-timeline">
          <div className="timeline-title">
            <span>Progressão</span>
            <button
              type="button"
              title="Adicionar fase"
              aria-label="Adicionar fase"
              disabled={draft.phases.length >= MAX_SCENE_PHASES}
              onClick={addPhase}
            >+</button>
          </div>
          {draft.phases.map((phase, index) => (
            <div
              className={index === selectedIndex ? 'is-selected' : ''}
              key={phase.id}
            >
              <button
                className="phase-select-button"
                type="button"
                onClick={() => setSelectedIndex(index)}
              >
                <span>{index + 1}</span>
                <strong>{phase.name}</strong>
                <small>
                  {Math.round((phaseMaximums[index] ?? 500) * phase.startPercent / 100)} →{' '}
                  {Math.round((phaseMaximums[index] ?? 500) * phase.endPercent / 100)} PV{' '}
                  ({phase.startPercent}% → {phase.endPercent}%)
                </small>
              </button>
              <button
                className="phase-delete-button"
                type="button"
                title="Excluir fase"
                aria-label={`Excluir ${phase.name}`}
                disabled={draft.phases.length === 1}
                onClick={() => setPhaseToDelete(index)}
              >×</button>
            </div>
          ))}
          <div className="timeline-active">
            {plan.activePhaseIndex >= 0
              ? `Em execução: Fase ${plan.activePhaseIndex + 1}`
              : 'Aguardando início da batalha'}
          </div>
        </aside>

        <section className="phase-editor">
          <section className="scene-card phase-identity-card">
            <div className="scene-card-heading">
              <div><small>Fase {selectedIndex + 1}</small><h2>Gatilho e identidade</h2></div>
              <label>
                <span>Nome da fase</span>
                <input maxLength={60} value={currentPhase.name} onChange={(event) => updatePhase((phase) => ({ ...phase, name: event.target.value }))} />
              </label>
            </div>
            <div className="trigger-grid">
              <label>
                <span>Chefão gatilho</span>
                <select value={currentPhase.triggerBossId} onChange={(event) => updatePhase((phase) => ({ ...phase, triggerBossId: event.target.value }))}>
                  {draft.bossSlots.map((slot) => <option value={slot.bossId} key={slot.bossId}>{slot.label}</option>)}
                </select>
              </label>
              <label><span>Começa em</span><div className="percent-input"><input type="number" min="1" max="100" value={currentPhase.startPercent} onChange={(event) => updatePhase((phase) => ({ ...phase, startPercent: Number(event.target.value) }))} /><b>%</b></div></label>
              <label><span>Encerra em</span><div className="percent-input"><input type="number" min="0" max="99" value={currentPhase.endPercent} onChange={(event) => updatePhase((phase) => ({ ...phase, endPercent: Number(event.target.value) }))} /><b>%</b></div></label>
              <label><span>Transição</span><select value={currentPhase.transition} onChange={(event) => updatePhase((phase) => ({ ...phase, transition: event.target.value as SceneTransitionKind }))}>{Object.entries(transitionLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            </div>
          </section>

          <section className="scene-card">
            <div className="scene-card-heading"><div><small>Atmosfera</small><h2>Mídia da fase</h2></div><p>Campos vazios herdam a mídia mais recente.</p></div>
            <div className="phase-media-grid">
              {(['background', 'transitionSound', 'music'] as const).map((slot) => {
                const ownMedia = currentPhase[slot];
                return (
                  <article className="phase-media" key={slot}>
                    <span>{mediaLabels[slot]}</span>
                    <strong title={ownMedia?.name ?? resolvedMedia[slot] ?? ''}>{ownMedia?.name ?? resolvedMedia[slot] ?? 'Não definido'}</strong>
                    <small>{ownMedia ? 'Definido nesta fase' : resolvedMedia[slot] ? 'Herdado de fase anterior' : slot === 'background' ? 'Sem fundo definido' : 'Sem áudio'}</small>
                    <div>
                      <button type="button" disabled={busy} onClick={() => void chooseMedia(slot)}>Upload</button>
                      {ownMedia && <button className="media-clear" type="button" disabled={busy} onClick={() => void clearMedia(slot)}>Remover</button>}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="scene-card">
            <div className="scene-card-heading roster-heading">
              <div><small>Elenco e atributos</small><h2>Chefões nesta fase</h2></div>
              <button className="add-scene-boss" type="button" disabled={busy || draft.bossSlots.length >= 3} onClick={addBossSlot}>+ Novo chefão</button>
            </div>
            <p className="inherit-note">Deixe um valor vazio para manter o valor da fase mais recente.</p>
            <div className="phase-boss-list">
              {draft.bossSlots.map((slot) => {
                const directive = currentPhase.bosses.find((item) => item.bossId === slot.bossId) ?? { bossId: slot.bossId, presence: 'inherit' as const, patch: {} };
                return (
                  <article className={`phase-boss ${directive.presence === 'absent' ? 'is-absent' : ''}`} key={slot.bossId}>
                    <header><strong>{directive.patch.bossName || slot.label}</strong><select value={directive.presence} onChange={(event) => updateDirective(slot.bossId, (item) => ({ ...item, presence: event.target.value as SceneBossDirective['presence'] }))}><option value="inherit">Manter estado</option><option value="present">Incluir na fase</option><option value="absent">Eliminar da fase</option></select></header>
                    <div className="boss-values">
                      <label className="boss-name-override"><span>Nome</span><input maxLength={100} placeholder="Herdar" value={directive.patch.bossName ?? ''} onChange={(event) => setPatchValue(slot.bossId, 'bossName', event.target.value)} /></label>
                      {([
                        ['maxHealth', 'Vida máx.'], ['attack', 'Ataque'], ['rangedAttack', 'Tiro'], ['skills', 'Perícias'],
                        ['defense', 'Def. CaC'], ['rangedDefense', 'Def. AaD'], ['damageReduction', 'RD'], ['shield', 'Escudo'],
                      ] as const).map(([key, label]) => <label key={key}><span>{label}</span><input type="number" placeholder="—" value={directive.patch[key] ?? ''} onChange={(event) => setPatchValue(slot.bossId, key, event.target.value)} /></label>)}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </section>
      </div>

      <footer className="scene-footer">
        <div>{rangeError ? <span className="scene-error">{rangeError}</span> : message ? <span className={message.startsWith('Cena salva') ? 'scene-success' : ''}>{message}</span> : dirty ? <span>Alterações ainda não salvas</span> : <span>Cena sincronizada</span>}</div>
        <button type="button" disabled={busy || Boolean(rangeError) || !dirty} onClick={() => void persistDraft()}>{busy ? 'Salvando...' : 'Salvar cena'}</button>
      </footer>

      {phaseToDelete !== null && (
        <div className="scene-modal-backdrop">
          <section className="scene-confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="delete-phase-title">
            <h2 id="delete-phase-title">Excluir fase?</h2>
            <p>
              A {draft.phases[phaseToDelete]?.name ?? 'fase selecionada'} e suas
              configurações serão removidas quando a cena for salva.
            </p>
            <div>
              <button type="button" onClick={() => setPhaseToDelete(null)}>Cancelar</button>
              <button className="is-destructive" type="button" onClick={deletePhase}>Excluir fase</button>
            </div>
          </section>
        </div>
      )}

      {closeConfirmationOpen && (
        <div className="scene-modal-backdrop">
          <section className="scene-confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="close-scene-title">
            <h2 id="close-scene-title">Descartar alterações?</h2>
            <p>Há mudanças ainda não salvas no editor de cena.</p>
            <div>
              <button type="button" onClick={() => setCloseConfirmationOpen(false)}>Continuar editando</button>
              <button className="is-destructive" type="button" onClick={() => window.bossAPI.confirmSceneEditorClose()}>Descartar e fechar</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
};

const root = document.getElementById('root');
if (!root) throw new Error('Elemento raiz não encontrado.');
createRoot(root).render(<SceneEditorApp />);
