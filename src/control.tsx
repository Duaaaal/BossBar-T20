import {
  type CSSProperties,
  type FocusEvent,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createRoot } from 'react-dom/client';
import {
  calculateHealthSequence,
  type BattleState,
  type EncounterEffectsState,
  type MusicState,
  type SoundboardState,
  initialEncounterEffectsState,
} from './shared/battle';
import { statusIconUrl } from './shared/bundled-assets';
import {
  CUSTOM_STATUS_AFFECTED_TARGET_LABELS,
  CUSTOM_STATUS_AFFECTED_TARGETS,
  type CustomStatusAffectedTarget,
  type CustomStatusPreset,
} from './shared/custom-status-library';
import { installDisabledControlTooltips } from './shared/disabled-controls';
import { installUndoShortcut } from './shared/undo-shortcut';
import {
  emptyEncounterTurnState,
  type EncounterFaction,
  type EncounterTurnState,
  type PlayerHudState,
} from './shared/player-combat';
import {
  deriveStatusAttributes,
  getStatusSkillAnnotations,
  type StatusSkillAnnotation,
} from './shared/status-rules';
import {
  BOSS_SKILL_DEFINITIONS,
  createBossSkillValues,
  inferManuallyEditedBossSkills,
  updateInheritedBossSkillDrafts,
  type BossSkillId,
} from './shared/boss-skills';
import {
  createInitialBossAttack,
  MAX_BOSS_ATTACKS,
  normalizeBossAttacks,
  selectedBossAttack,
  type BossAttack,
} from './shared/boss-attacks';
import {
  getActiveStatusDescription,
  getActiveStatusName,
  getStatusDefinition,
  normalizeDamageFormula,
  STATUS_DEFINITIONS,
  type ActiveBossStatus,
  type StatusId,
} from './shared/status';
import {
  StatusDamageValue,
  StatusRichText,
  StatusTurnValue,
} from './StatusRichText';

const BOSS_ADDITIONAL_SKILL_DEFINITIONS = BOSS_SKILL_DEFINITIONS.filter(
  ([id]) => id !== 'luta' && id !== 'pontaria',
);
import './control.css';
import './scrollbars.css';

installDisabledControlTooltips();
installUndoShortcut(() => window.bossAPI.undoLastChange());

// Mantém a implementação pronta para a etapa em que o dano em área voltar ao painel.

const parseHealthExpression = (value: string) => {
  const normalized = value.trim().replace(',', '.');
  if (/[dD]/.test(normalized)) {
    const formula = normalizeDamageFormula(normalized);
    return formula
      ? { kind: 'formula' as const, formula, total: 0, hits: 1 }
      : null;
  }
  const parts = normalized.split('/');
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
  return { kind: 'sequence' as const, total, hits, formula: null };
};

const RequiredStar = ({ visible }: { visible: boolean }) =>
  visible ? <span className="required-star" aria-label="Requer aplicação">*</span> : null;

const healthButtonFontSize = (label: string, value: number | string) => {
  const overflowCharacters = Math.max(0, `${label} (${value})`.length - 17);
  return `${Math.max(0.52, 0.76 - overflowCharacters * 0.035)}rem`;
};

type StatusTooltipState = {
  statusId: StatusId;
  left: number;
  top: number;
  placement: 'above' | 'below';
  annotationText?: string;
};

const bossAttackSummary = (attack: BossAttack) => {
  const modifier = attack.attackModifier >= 0
    ? `+${attack.attackModifier}`
    : String(attack.attackModifier);
  return [
    `Dano ${attack.damageFormula}`,
    `Tipo ${attack.attackType === 'melee' ? 'corpo a corpo' : 'à distância'}`,
    `Mod. ${modifier}`,
    `Margem ${attack.criticalThreat}`,
    `Mult. x${attack.criticalMultiplier}`,
    `Tipo de dano ${attack.damageType || 'não definido'}`,
    `Alcance ${attack.range || 'não definido'}`,
  ].join(' · ');
};

type EncounterTarget = {
  id: string;
  sourceId: string;
  kind: 'player' | 'boss' | 'npc';
  name: string;
  faction: EncounterFaction;
};

type PendingBossDamage = {
  id: string;
  bossId: string;
  attackName: string;
  bossTargetIds: string[];
  fallbackDamage: number;
  hits: number;
};

type TargetSelectionGroup = 'all' | 'characters' | 'bosses';

const targetBelongsToGroup = (
  target: EncounterTarget,
  group: TargetSelectionGroup,
) => group === 'all' ||
  (group === 'bosses'
    ? target.kind === 'boss'
    : target.kind !== 'boss');

const TargetPickerModal = ({
  title,
  subtitle,
  instruction,
  targets,
  selectedIds,
  onSelectionChange,
  onCancel,
  onApply,
  applyLabel,
  error,
  children,
  headerActions,
}: {
  title: string;
  subtitle?: string;
  instruction: string;
  targets: EncounterTarget[];
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  onCancel: () => void;
  onApply: () => void;
  applyLabel: string;
  error?: string;
  children?: ReactNode;
  headerActions?: ReactNode;
}) => {
  const toggleGroup = (group: TargetSelectionGroup) => {
    const groupIds = targets
      .filter((target) => targetBelongsToGroup(target, group))
      .map(({ id }) => id);
    const allSelected =
      groupIds.length > 0 && groupIds.every((id) => selectedIds.has(id));
    const next = new Set(selectedIds);
    for (const id of groupIds) {
      if (allSelected) next.delete(id);
      else next.add(id);
    }
    onSelectionChange(next);
  };

  return (
    <div className="control-modal-backdrop" role="presentation">
      <section
        className="control-status-modal control-target-picker-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="control-target-picker-title"
      >
        <header className="control-status-target-header">
          <div>
            <h2 id="control-target-picker-title">{title}</h2>
            {subtitle && <span>{subtitle}</span>}
          </div>
          <div className="control-target-header-actions">
            {headerActions}
            <button
              type="button"
              aria-label="Fechar seleção de alvos"
              onClick={onCancel}
            >
              ×
            </button>
          </div>
        </header>
        {children}
        <div className="control-status-target-toolbar">
          <span>{instruction}</span>
          <div
            className="control-target-filter-buttons"
            role="group"
            aria-label="Filtros de alvos"
          >
            {([
              ['all', 'Todos'],
              ['characters', 'Personagens'],
              ['bosses', 'Chefões'],
            ] as const).map(([group, label]) => {
              const groupTargets = targets.filter((target) =>
                targetBelongsToGroup(target, group));
              const selected =
                groupTargets.length > 0 &&
                groupTargets.every(({ id }) => selectedIds.has(id));
              return (
                <button
                  className={selected ? 'is-selected' : ''}
                  type="button"
                  aria-pressed={selected}
                  disabled={groupTargets.length === 0}
                  data-disabled-reason={`Nenhum ${
                    group === 'characters'
                      ? 'personagem'
                      : group === 'bosses' ? 'chefão' : 'alvo'
                  } disponível`}
                  key={group}
                  onClick={() => toggleGroup(group)}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="control-status-target-list">
          {targets.length > 0 ? targets.map((target) => (
            <label
              className={`is-${target.faction}`}
              data-target-faction={target.faction}
              key={target.id}
            >
              <input
                type="checkbox"
                checked={selectedIds.has(target.id)}
                onChange={(event) => {
                  const next = new Set(selectedIds);
                  if (event.target.checked) next.add(target.id);
                  else next.delete(target.id);
                  onSelectionChange(next);
                }}
              />
              <span>{target.name}</span>
              <small>
                {target.kind === 'player'
                  ? 'Jogador'
                  : target.kind === 'boss' ? 'Chefão' : 'NPC'}
              </small>
            </label>
          )) : (
            <p>Nenhum alvo disponível.</p>
          )}
        </div>
        {error && (
          <p className="control-status-modal-error" role="alert">{error}</p>
        )}
        <footer className="control-target-modal-actions">
          <button
            className="control-status-modal-cancel"
            type="button"
            onClick={onCancel}
          >
            Cancelar
          </button>
          <button
            className="control-status-modal-apply"
            type="button"
            disabled={selectedIds.size === 0}
            data-disabled-reason="Selecione ao menos um alvo"
            onClick={onApply}
          >
            {applyLabel}
          </button>
        </footer>
      </section>
    </div>
  );
};

type PendingTargetAction = {
  kind: 'status';
  value: number;
  status?: ActiveBossStatus;
};

type ExtremeAdvantageWarning =
  | { kind: 'skill'; skillId: BossSkillId; label: string }
  | { kind: 'damage' };

type OffTurnWarning = {
  actionLabel: string;
  bossName: string;
};

import { AttackLibrary } from './AttackLibrary';
import { AttackRangeField, DamageTypeField } from './AttackFields';

const ControlApp = () => {
  const [attackLibraryOpen, setAttackLibraryOpen] = useState(false);
  const [state, setState] = useState<BattleState | null>(null);
  const [encounterEffects, setEncounterEffects] = useState<EncounterEffectsState>(
    initialEncounterEffectsState,
  );
  const [soundboard, setSoundboard] = useState<SoundboardState | null>(null);
  const [music, setMusic] = useState<MusicState | null>(null);
  const [bossName, setBossName] = useState('');
  const [amount, setAmount] = useState('50');
  const [applyDamageReduction, setApplyDamageReduction] = useState(true);
  const [maxHealth, setMaxHealth] = useState('500');
  const [currentHealth, setCurrentHealth] = useState('500');
  const [attack, setAttack] = useState('10');
  const [rangedAttack, setRangedAttack] = useState('10');
  const [skills, setSkills] = useState('10');
  const [defense, setDefense] = useState('10');
  const [rangedDefense, setRangedDefense] = useState('10');
  const [damageReduction, setDamageReduction] = useState('0');
  const [shield, setShield] = useState('0');
  const [skillValues, setSkillValues] = useState<Record<BossSkillId, string>>(
    () => Object.fromEntries(
      Object.entries(createBossSkillValues(10)).map(([id, value]) => [
        id,
        String(value),
      ]),
    ) as Record<BossSkillId, string>,
  );
  const [manuallyEditedSkills, setManuallyEditedSkills] = useState<Set<BossSkillId>>(
    () => new Set(),
  );
  const [attributesOpen, setAttributesOpen] = useState(false);
  const [actionDraft, setActionDraft] = useState('');
  const [selectedStatusId, setSelectedStatusId] = useState<StatusId | null>(null);
  const [statusDamage, setStatusDamage] = useState('');
  const [statusTurns, setStatusTurns] = useState('1');
  const [statusTooltip, setStatusTooltip] = useState<StatusTooltipState | null>(null);
  const [customStatusLibrary, setCustomStatusLibrary] = useState<CustomStatusPreset[]>([]);
  const [customStatusLibraryOpen, setCustomStatusLibraryOpen] = useState(false);
  const [customStatusLibraryLoading, setCustomStatusLibraryLoading] = useState(false);
  const [customStatusOpen, setCustomStatusOpen] = useState(false);
  const [customStatusApplyOpen, setCustomStatusApplyOpen] = useState(false);
  const [selectedCustomStatus, setSelectedCustomStatus] = useState<CustomStatusPreset | null>(null);
  const [customStatusDeleteCandidate, setCustomStatusDeleteCandidate] = useState<CustomStatusPreset | null>(null);
  const [customStatusName, setCustomStatusName] = useState('');
  const [customStatusDescription, setCustomStatusDescription] = useState('');
  const [customStatusInflictedStatusId, setCustomStatusInflictedStatusId] = useState('');
  const [customStatusAffectedTarget, setCustomStatusAffectedTarget] =
    useState<CustomStatusAffectedTarget>('none');
  const [customStatusDamage, setCustomStatusDamage] = useState('');
  const [customStatusTurns, setCustomStatusTurns] = useState('1');
  const [customStatusError, setCustomStatusError] = useState('');
  const [formError, setFormError] = useState('');
  const [turnState, setTurnState] = useState<EncounterTurnState>(
    emptyEncounterTurnState,
  );
  const [turnConfirmationOpen, setTurnConfirmationOpen] = useState(false);
  const [turnError, setTurnError] = useState('');
  const [playerHuds, setPlayerHuds] = useState<PlayerHudState[]>([]);
  const [targetReflexDc, setTargetReflexDc] = useState('20');
  const [targetDamagePicker, setTargetDamagePicker] =
    useState<'damage' | null>(null);
  const [targetAreaDamage, setTargetAreaDamage] = useState(false);
  const [targetActionError, setTargetActionError] = useState('');
  const [pendingBossDamage, setPendingBossDamage] =
    useState<PendingBossDamage | null>(null);
  const [bossAttacks, setBossAttacks] = useState<BossAttack[]>([]);
  const [selectedBossAttackId, setSelectedBossAttackId] = useState('');
  const [bossArsenalOpen, setBossArsenalOpen] = useState(false);
  const [bossArsenalSelectedId, setBossArsenalSelectedId] = useState('');
  const [attackQuickPickerOpen, setAttackQuickPickerOpen] = useState(false);
  const [bossExtremeAdvantage, setBossExtremeAdvantage] = useState(false);
  const [extremeAdvantageWarning, setExtremeAdvantageWarning] =
    useState<ExtremeAdvantageWarning | null>(null);
  const [offTurnWarning, setOffTurnWarning] =
    useState<OffTurnWarning | null>(null);
  const offTurnResolver = useRef<((approved: boolean) => void) | null>(null);
  const [bossSkillPickerOpen, setBossSkillPickerOpen] = useState(false);
  const [linkBossSkillToPrevious, setLinkBossSkillToPrevious] = useState(false);
  const [statusTargetSelectionOpen, setStatusTargetSelectionOpen] =
    useState(false);
  const [selectedTargetIds, setSelectedTargetIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [pendingTargetAction, setPendingTargetAction] =
    useState<PendingTargetAction | null>(null);
  const [panelMinimized, setPanelMinimized] = useState(false);
  const [panelTransitioning, setPanelTransitioning] = useState(false);
  const loadedSource = useRef('');
  const loadedAmountSource = useRef('');

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
    let active = true;
    window.bossAPI.getPlayerHuds().then((players) => {
      if (active) setPlayerHuds(players);
    });
    const unsubscribe = window.bossAPI.subscribePlayerHuds((players) => {
      if (active) setPlayerHuds(players);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;
    window.bossAPI.getEncounterTurnState().then((nextState) => {
      if (active) setTurnState(nextState);
    });
    const unsubscribe = window.bossAPI.subscribeEncounterTurn((nextState) => {
      if (active) setTurnState(nextState);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const loadCustomStatusLibrary = async () => {
    setCustomStatusLibraryLoading(true);
    try {
      setCustomStatusLibrary(await window.bossAPI.getCustomStatusLibrary());
    } catch {
      setCustomStatusError('Não foi possível carregar a biblioteca de status.');
    } finally {
      setCustomStatusLibraryLoading(false);
    }
  };

  useEffect(() => {
    void loadCustomStatusLibrary();
  }, []);

  useEffect(() => {
    let active = true;
    window.bossAPI.getSoundboardState().then((nextState) => {
      if (active) setSoundboard(nextState);
    });
    const unsubscribe = window.bossAPI.subscribeSoundboard((nextState) => {
      if (active) setSoundboard(nextState);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;
    window.bossAPI.getMusicState().then((nextState) => {
      if (active) setMusic(nextState);
    });
    const unsubscribe = window.bossAPI.subscribeMusic((nextState) => {
      if (active) setMusic(nextState);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;
    window.bossAPI.getEncounterEffectsState().then((nextState) => {
      if (active) setEncounterEffects(nextState);
    });
    const unsubscribe = window.bossAPI.subscribeEncounterEffects((nextState) => {
      if (active) setEncounterEffects(nextState);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const activeBoss = state?.bosses.find((boss) => boss.id === state.activeBossId);
  useEffect(() => {
    let active = true;
    if (activeBoss) void window.bossAPI.getPendingBossDamage(activeBoss.id).then((pending) => {
      if (active) setPendingBossDamage(pending);
    });
    return () => { active = false; };
  }, [activeBoss?.id, turnState.revision]);
  const activeStatusesById = useMemo(
    () => new Map(
      (activeBoss?.activeStatuses ?? []).map((status) => [status.statusId, status]),
    ),
    [activeBoss?.activeStatuses],
  );
  const automaticStatusEffects = encounterEffects.general.automaticStatusEffects;
  const authoritativeAttributes = useMemo(() => activeBoss
    ? deriveStatusAttributes(
        {
          attack: activeBoss.attack,
          rangedAttack: activeBoss.rangedAttack,
          skills: activeBoss.skills,
          meleeDefense: activeBoss.defense,
          rangedDefense: activeBoss.rangedDefense,
          damageReduction: activeBoss.damageReduction,
          shield: activeBoss.shield,
        },
        activeBoss.activeStatuses,
        automaticStatusEffects,
      )
    : null, [activeBoss, automaticStatusEffects]);
  const skillAnnotations = useMemo(
    () => getStatusSkillAnnotations(activeBoss?.activeStatuses ?? []),
    [activeBoss?.activeStatuses],
  );
  const bossSource = activeBoss
    ? [
        activeBoss.id,
        activeBoss.bossName,
        activeBoss.controlAmount,
        activeBoss.applyDamageReduction,
        activeBoss.maxHealth,
        activeBoss.currentHealth,
        activeBoss.attack,
        activeBoss.rangedAttack,
        activeBoss.skills,
        JSON.stringify(activeBoss.skillValues),
        JSON.stringify(activeBoss.skillOverrides),
        activeBoss.defense,
        activeBoss.rangedDefense,
        activeBoss.damageReduction,
        activeBoss.shield,
        JSON.stringify(activeBoss.attacks),
        activeBoss.selectedAttackId,
        activeBoss.nextAction,
      ].join('\u0000')
    : '';

  useEffect(() => {
    if (!activeBoss || loadedSource.current === bossSource) return;
    loadedSource.current = bossSource;
    setBossName(activeBoss.bossName);
    const amountSource = `${activeBoss.id}\u0000${activeBoss.controlAmount}`;
    if (loadedAmountSource.current !== amountSource) {
      loadedAmountSource.current = amountSource;
      setAmount(activeBoss.controlAmount);
    }
    setApplyDamageReduction(activeBoss.applyDamageReduction);
    setMaxHealth(String(activeBoss.maxHealth));
    setCurrentHealth(String(activeBoss.currentHealth));
    setAttack(String(activeBoss.attack));
    setRangedAttack(String(activeBoss.rangedAttack));
    setSkills(String(activeBoss.skills));
    setSkillValues(
      Object.fromEntries(
        BOSS_SKILL_DEFINITIONS.map(([id]) => [
          id,
          String(activeBoss.skillValues?.[id] ?? activeBoss.skills),
        ]),
      ) as Record<BossSkillId, string>,
    );
    setManuallyEditedSkills(new Set(
      activeBoss.skillOverrides ?? inferManuallyEditedBossSkills(
        activeBoss.skills,
        activeBoss.skillValues ?? createBossSkillValues(activeBoss.skills),
      ),
    ));
    setDefense(String(activeBoss.defense));
    setRangedDefense(String(activeBoss.rangedDefense));
    setDamageReduction(String(activeBoss.damageReduction));
    setShield(String(activeBoss.shield));
    const nextAttacks = normalizeBossAttacks(activeBoss.attacks, activeBoss.id);
    const nextSelectedAttack = selectedBossAttack(
      nextAttacks,
      activeBoss.selectedAttackId,
    );
    setBossAttacks(nextAttacks);
    setSelectedBossAttackId(nextSelectedAttack?.id ?? '');
    setBossArsenalSelectedId(nextSelectedAttack?.id ?? '');
    setActionDraft(activeBoss.nextAction);
    setFormError('');
  }, [activeBoss, bossSource]);

  useEffect(() => {
    setSelectedStatusId(null);
    setStatusDamage('');
    setStatusTurns('1');
    setStatusTooltip(null);
    setCustomStatusLibraryOpen(false);
    setCustomStatusOpen(false);
    setCustomStatusApplyOpen(false);
    setSelectedCustomStatus(null);
    setCustomStatusDeleteCandidate(null);
    setCustomStatusError('');
    setStatusTargetSelectionOpen(false);
    setTargetDamagePicker(null);
    setBossSkillPickerOpen(false);
    setLinkBossSkillToPrevious(false);
    setBossArsenalOpen(false);
    setAttackQuickPickerOpen(false);
    setBossExtremeAdvantage(false);
    setExtremeAdvantageWarning(null);
  }, [activeBoss?.id]);

  const selectedStatusDefinition = selectedStatusId
    ? getStatusDefinition(selectedStatusId)
    : null;
  const selectedActiveStatus = selectedStatusId
    ? activeStatusesById.get(selectedStatusId)
    : undefined;
  const activeTurnParticipant = turnState.participants.find(
    ({ id }) => id === turnState.activeParticipantId,
  );
  const activeBossInitiativeParticipant = activeBoss
    ? turnState.participants.find(
      ({ id }) => id === `boss:${activeBoss.id}`,
    )
    : null;
  const bossInitiativePending = Boolean(
    state?.battleStarted &&
    !turnState.started &&
    activeBossInitiativeParticipant?.initiativeRolled === false,
  );
  const activeSelectedAttack = selectedBossAttack(
    bossAttacks,
    selectedBossAttackId,
  );
  const arsenalDraftAttack = selectedBossAttack(
    bossAttacks,
    bossArsenalSelectedId,
  );
  const canAdvanceTurn = Boolean(
    !turnState.connectionPause &&
    state?.battleStarted &&
    turnState.participants.length > 0 &&
    (turnState.started || turnState.initiativeReady !== false),
  );
  const previousRollResult = turnState.rollResults.at(-1);
  const previousRollCorrelationId = previousRollResult
    ? previousRollResult.correlationId ??
      previousRollResult.actionId ??
      previousRollResult.id
    : undefined;
  const encounterTargets = useMemo<EncounterTarget[]>(() => {
    const targets: EncounterTarget[] = playerHuds.map((player) => ({
      id: `player:${player.id}`,
      sourceId: player.id,
      kind: 'player',
      name: player.characterName,
      faction: player.faction,
    }));
    for (const boss of state?.bosses ?? []) {
      targets.push({
        id: `boss:${boss.id}`,
        sourceId: boss.id,
        kind: 'boss',
        name: boss.bossName,
        faction: 'bosses',
      });
    }
    for (const participant of turnState.participants) {
      if (
        participant.kind === 'npc' &&
        !targets.some(({ id }) => id === participant.id)
      ) {
        targets.push({
          id: participant.id,
          sourceId: participant.sourceId,
          kind: 'npc',
          name: participant.name,
          // Participantes antigos não carregavam facção. Mantemos o NPC
          // ao lado do chefão apenas como fallback de compatibilidade.
          faction: participant.faction ?? 'bosses',
        });
      }
    }
    return targets;
  }, [playerHuds, state?.bosses, turnState.participants]);

  useEffect(() => {
    if (!state || !turnState.started || !turnState.activeParticipantId) return;
    if (!turnState.activeParticipantId.startsWith('boss:')) return;
    const bossId = turnState.activeParticipantId.slice('boss:'.length);
    if (
      bossId !== state.activeBossId &&
      state.bosses.some(({ id }) => id === bossId)
    ) {
      window.bossAPI.dispatch({ type: 'select-boss', bossId });
    }
  }, [state, turnState.activeParticipantId, turnState.started]);

  useEffect(() => () => {
    offTurnResolver.current?.(false);
    offTurnResolver.current = null;
  }, []);

  useEffect(() => {
    const validIds = new Set(encounterTargets.map(({ id }) => id));
    setSelectedTargetIds((current) => {
      const next = new Set([...current].filter((id) => validIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [encounterTargets]);

  useEffect(() => {
    if (!selectedStatusId || !activeBoss) return;
    const definition = getStatusDefinition(selectedStatusId);
    const activeStatus = activeStatusesById.get(selectedStatusId);
    setStatusDamage(
      activeStatus?.damageFormula ?? definition.defaultDamageFormula ?? '',
    );
    setStatusTurns(String(activeStatus?.turnsRemaining ?? 1));
  }, [activeBoss?.id, activeStatusesById, selectedStatusId]);

  const positionStatusTooltip = (
    statusId: StatusId,
    target: HTMLElement,
    annotationText?: string,
  ) => {
    const bounds = target.getBoundingClientRect();
    const tooltipWidth = Math.min(330, window.innerWidth - 16);
    const left = Math.max(
      8,
      Math.min(
        window.innerWidth - tooltipWidth - 8,
        bounds.left + bounds.width / 2 - tooltipWidth / 2,
      ),
    );
    const placement = bounds.top > 150 ? 'above' : 'below';
    setStatusTooltip({
      statusId,
      left,
      top: placement === 'above' ? bounds.top - 8 : bounds.bottom + 8,
      placement,
      annotationText,
    });
  };

  const showStatusTooltipFromMouse = (
    statusId: StatusId,
    event: MouseEvent<HTMLButtonElement>,
  ) => positionStatusTooltip(statusId, event.currentTarget);

  const showStatusTooltipFromFocus = (
    statusId: StatusId,
    event: FocusEvent<HTMLButtonElement>,
  ) => positionStatusTooltip(statusId, event.currentTarget);

  const showSkillAnnotationTooltip = (
    annotation: StatusSkillAnnotation,
    target: HTMLElement,
  ) => positionStatusTooltip(annotation.statusId, target, annotation.text);

  const selectStatus = (statusId: StatusId) => {
    const definition = getStatusDefinition(statusId);
    const activeStatus = activeStatusesById.get(statusId);
    setSelectedStatusId(statusId);
    setStatusDamage(
      activeStatus?.damageFormula ?? definition?.defaultDamageFormula ?? '',
    );
    setStatusTurns(String(activeStatus?.turnsRemaining ?? 1));
    setFormError('');
    if (definition.customizable) {
      setCustomStatusDamage(activeStatus?.damageFormula ?? '');
      setCustomStatusTurns(String(activeStatus?.turnsRemaining ?? 1));
      setCustomStatusError('');
      setCustomStatusLibraryOpen(true);
      void loadCustomStatusLibrary();
    }
  };

  const applyStatus = () => {
    if (!activeBoss || !selectedStatusDefinition || !selectedStatusId) {
      setFormError('Selecione uma condição antes de aplicar.');
      return;
    }
    if (selectedStatusDefinition.customizable) {
      setCustomStatusLibraryOpen(true);
      return;
    }

    const turns = Number(statusTurns);
    if (!Number.isInteger(turns) || turns < 1 || turns > 999) {
      setFormError('Informe uma duração entre 1 e 999 turnos.');
      return;
    }

    const damageFormula = selectedStatusDefinition.damageCapable
      ? normalizeDamageFormula(statusDamage)
      : null;
    if (selectedStatusDefinition.damageCapable && !damageFormula) {
      setFormError('Use um dano inteiro ou uma expressão como 1d6 + 2d8 + 10.');
      return;
    }

    setFormError('');
    if (damageFormula) setStatusDamage(damageFormula);
    setStatusTurns(String(turns));
    setTargetDamagePicker(null);
    setStatusTargetSelectionOpen(true);
  };

  const applyCustomStatus = () => {
    if (!activeBoss || !selectedCustomStatus) return;
    const turns = Number(customStatusTurns);
    if (!Number.isInteger(turns) || turns < 1 || turns > 999) {
      setCustomStatusError('Informe uma duração entre 1 e 999 turnos.');
      return;
    }
    const damageFormula = customStatusDamage.trim()
      ? normalizeDamageFormula(customStatusDamage)
      : null;
    if (customStatusDamage.trim() && !damageFormula) {
      setCustomStatusError('Use um dano inteiro ou uma expressão como 1d6 + 2d8 + 10.');
      return;
    }

    setCustomStatusError('');
    setCustomStatusDamage(damageFormula ?? '');
    setCustomStatusTurns(String(turns));
    setCustomStatusApplyOpen(false);
    setTargetDamagePicker(null);
    setStatusTargetSelectionOpen(true);
  };

  const openCustomStatusEditor = () => {
    setCustomStatusName('');
    setCustomStatusDescription('');
    setCustomStatusInflictedStatusId('');
    setCustomStatusAffectedTarget('none');
    setCustomStatusError('');
    setCustomStatusLibraryOpen(false);
    setCustomStatusOpen(true);
  };

  const saveCustomStatusPreset = async () => {
    const name = customStatusName.trim();
    const description = customStatusDescription.trim();
    if (!name || name.length > 60) {
      setCustomStatusError('Informe um nome de até 60 caracteres.');
      return;
    }
    if (!description || description.length > 300) {
      setCustomStatusError('Descreva o efeito em até 300 caracteres.');
      return;
    }
    setCustomStatusError('');
    const result = await window.bossAPI.createCustomStatusPreset({
      name,
      description,
      inflictedStatusId: customStatusInflictedStatusId
        ? customStatusInflictedStatusId as Exclude<StatusId, 'coringa'>
        : null,
      affectedTarget: customStatusAffectedTarget,
    });
    if (!result.ok || !result.preset) {
      setCustomStatusError(result.error ?? 'Não foi possível salvar o status.');
      return;
    }
    await loadCustomStatusLibrary();
    setCustomStatusOpen(false);
    setCustomStatusLibraryOpen(true);
  };

  const chooseCustomStatus = (preset: CustomStatusPreset) => {
    const activeStatus = activeStatusesById.get('coringa');
    const sameActivePreset = activeStatus?.customPresetId === preset.id;
    setSelectedCustomStatus(preset);
    setCustomStatusDamage(sameActivePreset ? activeStatus.damageFormula ?? '' : '');
    setCustomStatusTurns(String(sameActivePreset ? activeStatus.turnsRemaining : 1));
    setCustomStatusError('');
    setCustomStatusLibraryOpen(false);
    setCustomStatusApplyOpen(true);
  };

  const deleteCustomStatusPreset = async () => {
    if (!customStatusDeleteCandidate) return;
    const result = await window.bossAPI.deleteCustomStatusPreset(
      customStatusDeleteCandidate.id,
    );
    if (!result.ok) {
      setCustomStatusError(result.error ?? 'Não foi possível excluir o status.');
    }
    setCustomStatusDeleteCandidate(null);
    await loadCustomStatusLibrary();
  };

  const removeStatus = () => {
    if (!activeBoss || !selectedStatusId || !selectedActiveStatus) {
      setFormError('Selecione uma condição ativa para remover.');
      return;
    }
    setFormError('');
    window.bossAPI.dispatch({
      type: 'remove-status',
      bossId: activeBoss.id,
      statusId: selectedStatusId,
    });
  };

  const advanceTurn = async () => {
    setFormError('');
    setTurnError('');
    const result = await window.bossAPI.advanceEncounterTurn(
      activeTurnParticipant?.id ?? null,
    );
    if (!result.ok) {
      setTurnError(result.error ?? 'Não foi possível avançar o turno.');
    }
    setTurnConfirmationOpen(false);
  };

  const requestTurnAdvance = () => {
    if (!canAdvanceTurn) return;
    if (!activeTurnParticipant) {
      void advanceTurn();
      return;
    }
    setTurnConfirmationOpen(true);
  };

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

  const openAttributesEditor = () => {
    if (!activeBoss) return;
    setMaxHealth(String(activeBoss.maxHealth));
    setCurrentHealth(String(activeBoss.currentHealth));
    setAttack(String(activeBoss.attack));
    setRangedAttack(String(activeBoss.rangedAttack));
    setSkills(String(activeBoss.skills));
    setDefense(String(activeBoss.defense));
    setRangedDefense(String(activeBoss.rangedDefense));
    setDamageReduction(String(activeBoss.damageReduction));
    setShield(String(activeBoss.shield));
    const nextAttacks = normalizeBossAttacks(activeBoss.attacks, activeBoss.id);
    const nextSelectedAttack = selectedBossAttack(
      nextAttacks,
      activeBoss.selectedAttackId,
    );
    setBossAttacks(nextAttacks);
    setSelectedBossAttackId(nextSelectedAttack?.id ?? '');
    setBossArsenalSelectedId(nextSelectedAttack?.id ?? '');
    setSkillValues(
      Object.fromEntries(
        BOSS_SKILL_DEFINITIONS.map(([id]) => [
          id,
          String(activeBoss.skillValues?.[id] ?? activeBoss.skills),
        ]),
      ) as Record<BossSkillId, string>,
    );
    setManuallyEditedSkills(new Set(
      activeBoss.skillOverrides ?? inferManuallyEditedBossSkills(
        activeBoss.skills,
        activeBoss.skillValues ?? createBossSkillValues(activeBoss.skills),
      ),
    ));
    setFormError('');
    setAttributesOpen(true);
  };

  const applyIdentity = (event: FormEvent) => {
    event.preventDefault();
    if (!activeBoss) return;
    const numericDrafts = {
      maxHealth: Number(maxHealth),
      currentHealth: Number(currentHealth),
      attack: Number(attack),
      rangedAttack: Number(rangedAttack),
      skills: Number(skills),
      defense: Number(defense),
      rangedDefense: Number(rangedDefense),
      damageReduction: Number(damageReduction),
      shield: Number(shield),
    };
    const rawSkillValues = Object.fromEntries(
      BOSS_SKILL_DEFINITIONS.map(([id]) => [id, Number(skillValues[id])]),
    ) as Record<BossSkillId, number>;
    rawSkillValues.luta = Number(attack);
    rawSkillValues.pontaria = Number(rangedAttack);
    const numericSkillValues = rawSkillValues;
    numericDrafts.attack = numericSkillValues.luta;
    numericDrafts.rangedAttack = numericSkillValues.pontaria;
    const hasEmptyAttribute = [
      maxHealth,
      currentHealth,
      attack,
      rangedAttack,
      skills,
      defense,
      rangedDefense,
      damageReduction,
      shield,
      ...Object.values(skillValues),
    ].some((value) => !value.trim());
    if (
      !bossName.trim() ||
      hasEmptyAttribute ||
      Object.values(numericDrafts).some((value) => !Number.isFinite(value)) ||
      Object.values(numericSkillValues).some(
        (value) =>
          !Number.isInteger(value) ||
          value < -99 ||
          value > 99,
      ) ||
      numericDrafts.currentHealth < 0 ||
      numericDrafts.currentHealth > numericDrafts.maxHealth ||
      !parseHealthExpression(amount)
    ) {
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
      skillValues: numericSkillValues,
      skillOverrides: [...manuallyEditedSkills],
      ...numericDrafts,
    });
    setAttributesOpen(false);
  };

  const parsedAmount = useMemo(() => parseHealthExpression(amount), [amount]);
  const rawSequence = parsedAmount?.kind === 'sequence'
    ? calculateHealthSequence({
        type: 'damage',
        total: parsedAmount.total,
        hits: parsedAmount.hits,
        ignoreDamageReduction: true,
      })
    : null;
  const reducedSequence = parsedAmount?.kind === 'sequence' && activeBoss
    ? calculateHealthSequence({
        type: 'damage',
        total: parsedAmount.total,
        hits: parsedAmount.hits,
        damageReduction:
          authoritativeAttributes?.values.damageReduction ?? activeBoss.damageReduction,
      })
    : null;
  const damagingHits = parsedAmount?.kind === 'sequence' && activeBoss
    ? Math.max(
        0,
        parsedAmount.hits -
          (authoritativeAttributes?.values.shield ?? activeBoss.shield),
      )
    : 0;
  const damagePerHit = applyDamageReduction
    ? reducedSequence?.effectiveAmountPerHit ?? 0
    : rawSequence?.effectiveAmountPerHit ?? 0;
  const displayedDamage = damagePerHit * damagingHits;
  const rawAmount = rawSequence?.effectiveTotal ?? 0;
  const displayedFormulaValue = parsedAmount?.kind === 'formula'
    ? parsedAmount.formula
    : null;

  const resolvePanelValue = async (
    draft: ReturnType<typeof parseHealthExpression>,
    label: string,
  ) => {
    if (!draft || !activeBoss) return null;
    if (draft.kind === 'sequence') {
      return { total: draft.total, hits: draft.hits, rollId: undefined };
    }
    const rolled = await window.bossAPI.rollEncounterFormula({
      participantId: `boss:${activeBoss.id}`,
      label,
      formula: draft.formula,
      category: 'damage',
      targetParticipantId: `boss:${activeBoss.id}`,
      targetName: activeBoss.bossName,
    });
    if (!rolled.ok || rolled.total === undefined) {
      setFormError(rolled.error ?? 'Não foi possível rolar a fórmula.');
      return null;
    }
    return { total: rolled.total, hits: 1, rollId: rolled.resultId };
  };

  const applyHealthChange = async (type: 'damage' | 'heal') => {
    if (!activeBoss || !parsedAmount) {
      setFormError('Use um valor, divisão ou fórmula como 1d20 + 3d5.');
      return;
    }
    const resolved = await resolvePanelValue(
      parsedAmount,
      type === 'damage' ? 'Dano' : 'Cura',
    );
    if (!resolved) return;
    setFormError('');
    const result = await window.bossAPI.applyHealthSequence({
      bossId: activeBoss.id,
      type,
      total: resolved.total,
      hits: resolved.hits,
      ignoreDamageReduction: type === 'damage' && !applyDamageReduction,
      ...(resolved.rollId ? { relatedRollId: resolved.rollId } : {}),
    });
    if (!result.ok) setFormError(result.error ?? 'Não foi possível aplicar o valor.');
  };

  const selectedStatusForTarget = (): ActiveBossStatus | null => {
    if (!selectedStatusId || !selectedStatusDefinition) return null;
    const customizable = selectedStatusDefinition.customizable;
    const turns = Number(customizable ? customStatusTurns : statusTurns);
    if (!Number.isInteger(turns) || turns < 1 || turns > 999) return null;
    const rawDamage = customizable ? customStatusDamage : statusDamage;
    const damageFormula = rawDamage.trim()
      ? normalizeDamageFormula(rawDamage)
      : null;
    if (rawDamage.trim() && !damageFormula) return null;
    if (customizable && !selectedCustomStatus) return null;
    return {
      statusId: selectedStatusId,
      damageFormula,
      turnsRemaining: turns,
      ...(customizable && selectedCustomStatus
        ? {
          customName: selectedCustomStatus.name,
          customDescription: selectedCustomStatus.description,
          customPresetId: selectedCustomStatus.id,
          customInflictedStatusId:
            selectedCustomStatus.inflictedStatusId ?? undefined,
          customAffectedTarget: selectedCustomStatus.affectedTarget,
        }
        : {}),
    };
  };

  const requestStatusTargetAction = () => {
    if (selectedTargetIds.size === 0) {
      setFormError('Selecione ao menos um alvo.');
      return;
    }
    const status = selectedStatusForTarget();
    if (!status) {
      setFormError('Selecione e configure uma condição válida.');
      return;
    }
    setPendingTargetAction({ kind: 'status', value: 0, status });
    setFormError('');
  };

  const selectedEncounterTargets = () => encounterTargets.filter(({ id }) =>
    selectedTargetIds.has(id));

  const requestBossTurnPermission = (actionLabel: string) => {
    if (
      !activeBoss ||
      !state?.battleStarted ||
      !turnState.started ||
      turnState.activeParticipantId === `boss:${activeBoss.id}`
    ) {
      return Promise.resolve(true);
    }
    offTurnResolver.current?.(false);
    setOffTurnWarning({ actionLabel, bossName: activeBoss.bossName });
    return new Promise<boolean>((resolve) => {
      offTurnResolver.current = resolve;
    });
  };

  const resolveOffTurnWarning = (approved: boolean) => {
    const resolve = offTurnResolver.current;
    offTurnResolver.current = null;
    setOffTurnWarning(null);
    resolve?.(approved);
  };

  const nextPaint = () => new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });

  const persistBossArsenal = (attacks = bossAttacks, selectedId = selectedBossAttackId) => {
    if (!activeBoss) return false;
    const normalized = normalizeBossAttacks(attacks, activeBoss.id);
    if (normalized.length !== attacks.length) {
      setFormError('Revise o nome, o dano e os valores do arsenal antes de aplicar.');
      return false;
    }
    const selected = selectedBossAttack(normalized, selectedId);
    window.bossAPI.dispatch({
      type: 'configure',
      bossId: activeBoss.id,
      bossName: activeBoss.bossName,
      controlAmount: activeBoss.controlAmount,
      applyDamageReduction: activeBoss.applyDamageReduction,
      maxHealth: activeBoss.maxHealth,
      currentHealth: activeBoss.currentHealth,
      attack: activeBoss.attack,
      rangedAttack: activeBoss.rangedAttack,
      skills: activeBoss.skills,
      skillValues: activeBoss.skillValues,
      skillOverrides: activeBoss.skillOverrides,
      defense: activeBoss.defense,
      rangedDefense: activeBoss.rangedDefense,
      damageReduction: activeBoss.damageReduction,
      shield: activeBoss.shield,
      attacks: normalized,
      selectedAttackId: selected?.id,
    });
    setBossAttacks(normalized);
    setSelectedBossAttackId(selected?.id ?? '');
    setBossArsenalSelectedId(selected?.id ?? '');
    setFormError('');
    return true;
  };

  const updateArsenalAttack = <K extends keyof BossAttack,>(
    key: K,
    value: BossAttack[K],
  ) => {
    if (!arsenalDraftAttack) return;
    setBossAttacks((current) => current.map((attackEntry) =>
      attackEntry.id === arsenalDraftAttack.id
        ? { ...attackEntry, [key]: value }
        : attackEntry));
  };

  const addArsenalAttack = () => {
    if (!activeBoss || bossAttacks.length >= MAX_BOSS_ATTACKS) return;
    const nextIndex = bossAttacks.length + 1;
    const next = {
      ...createInitialBossAttack(activeBoss.id),
      id: `boss-attack:${activeBoss.id}:${crypto.randomUUID()}`,
      name: `Ataque ${nextIndex}`,
    };
    setBossAttacks((current) => [...current, next]);
    setBossArsenalSelectedId(next.id);
  };

  const removeArsenalAttack = () => {
    if (!arsenalDraftAttack || bossAttacks.length <= 1) return;
    const next = bossAttacks.filter(({ id }) => id !== arsenalDraftAttack.id);
    setBossAttacks(next);
    setBossArsenalSelectedId(next[0]?.id ?? '');
    if (selectedBossAttackId === arsenalDraftAttack.id) {
      setSelectedBossAttackId(next[0]?.id ?? '');
    }
  };

  const executeDamageTargetAction = async (
    kind: 'damage' | 'area-damage',
  ) => {
    if (!activeBoss || selectedTargetIds.size === 0) {
      setTargetActionError('Selecione ao menos um alvo.');
      return;
    }
    const selectedAttack = activeSelectedAttack;
    if (!selectedAttack) {
      setTargetActionError('Configure e selecione uma arma ou ataque primeiro.');
      return;
    }
    const valueDraft = parseHealthExpression(selectedAttack.damageFormula);
    if (!valueDraft) {
      setTargetActionError('Use um valor, divisão ou fórmula de dados válida.');
      return;
    }
    const reflexDc = Number(targetReflexDc);
    if (
      kind === 'area-damage' &&
      (!Number.isInteger(reflexDc) || reflexDc < 0 || reflexDc > 999)
    ) {
      setTargetActionError('Informe uma CD de Reflexos entre 0 e 999.');
      return;
    }
    if (!await requestBossTurnPermission(
      kind === 'area-damage' ? 'causar dano em área' : 'realizar um ataque',
    )) return;

    const targets = selectedEncounterTargets();
    setTargetDamagePicker(null);
    setTargetActionError('');
    setFormError('');
    // Nenhuma fonte aleatória é consultada antes de a seleção de alvos sair
    // da tela. Em alvos web, a própria sessão resolve a fórmula de modo
    // autoritativo depois de validar o ataque.
    await nextPaint();
    const fixedValue = valueDraft.kind === 'sequence'
      ? Math.ceil(valueDraft.total)
      : 1;
    const requestedHits = valueDraft.kind === 'sequence'
      ? valueDraft.hits
      : 1;
    const damageFormula = valueDraft.kind === 'formula'
      ? valueDraft.formula
      : undefined;
    const actionId = `boss-action:${crypto.randomUUID()}`;

    const playerIds = targets
      .filter(({ kind }) => kind === 'player')
      .map(({ sourceId }) => sourceId);
    const bosses = targets.filter(({ kind }) => kind === 'boss');
    const skipped = targets
      .filter(({ kind }) => kind === 'npc')
      .map(({ name }) => name);
    let resolvedDamageForBosses: number | null =
      damageFormula ? null : fixedValue;

    if (kind === 'damage') {
      if (playerIds.length > 0) {
        const result = await window.bossAPI.applyDirectPlayerDamage({
          playerIds,
          bossTargetIds: bosses.map(({ sourceId }) => sourceId),
          damage: fixedValue,
          hits: selectedAttack.attackCount ?? requestedHits,
          independentHits: (selectedAttack.attackCount ?? 1) > 1,
          statusEffects: selectedAttack.statusEffects,
          ...(damageFormula ? { damageFormula } : {}),
          attackType: selectedAttack.attackType,
          attackBonus: (selectedAttack.attackType === 'melee'
            ? authoritativeAttributes?.values.attack ?? activeBoss.attack
            : authoritativeAttributes?.values.rangedAttack ?? activeBoss.rangedAttack) +
            selectedAttack.attackModifier,
          attackName: selectedAttack.name,
          criticalThreat: selectedAttack.criticalThreat,
          criticalMultiplier: selectedAttack.criticalMultiplier,
          extremeAdvantage: bossExtremeAdvantage,
          attackerParticipantId: `boss:${activeBoss.id}`,
          actionId,
          correlationId: actionId,
          deferDamage: true,
        });
        const anyPlayerHit = result.impacts?.some(({ hit }) => hit) ?? false;
        resolvedDamageForBosses =
          damageFormula && bosses.length > 0 && !anyPlayerHit
            ? null
            : result.rolledDamage ?? resolvedDamageForBosses;
        skipped.push(...result.skippedPlayers);
        if (!result.ok) {
          setFormError(result.error ?? 'Falha ao aplicar o dano.');
          return;
        }
        if (result.pendingDamageId) {
          setPendingBossDamage({
            id: result.pendingDamageId,
            bossId: activeBoss.id,
            attackName: selectedAttack.name,
            bossTargetIds: bosses.map(({ sourceId }) => sourceId),
            fallbackDamage: fixedValue,
            hits: requestedHits,
          });
          return;
        }
      }
    } else {
      if (playerIds.length > 0) {
        const result = await window.bossAPI.applyAreaDamage({
          playerIds,
          damage: fixedValue,
          hits: requestedHits,
          ...(damageFormula ? { damageFormula } : {}),
          reflexDc,
          attackerParticipantId: `boss:${activeBoss.id}`,
          actionId,
          correlationId: actionId,
        });
        resolvedDamageForBosses = result.rolledDamage ?? resolvedDamageForBosses;
        skipped.push(...result.skippedPlayers);
        if (!result.ok) {
          setFormError(result.error ?? 'Falha ao aplicar o dano em área.');
          return;
        }
      }
    }

    if (bosses.length > 0 && resolvedDamageForBosses === null) {
      const resolvedValue = await resolvePanelValue(
        valueDraft,
        kind === 'area-damage' ? 'Dano em área' : 'Dano',
      );
      resolvedDamageForBosses = resolvedValue
        ? Math.ceil(resolvedValue.total)
        : null;
    }
    if (
      bosses.length > 0 &&
      (
        resolvedDamageForBosses === null ||
        !Number.isFinite(resolvedDamageForBosses) ||
        resolvedDamageForBosses < 1 ||
        resolvedDamageForBosses > 999_999
      )
    ) {
      setFormError('Não foi possível calcular um valor de dano válido.');
      return;
    }
    for (const boss of bosses) {
      await window.bossAPI.applyHealthSequence({
        bossId: boss.sourceId,
        type: 'damage',
        total: resolvedDamageForBosses ?? fixedValue,
        hits: requestedHits,
        ignoreDamageReduction: true,
      });
    }
    if (skipped.length > 0) {
      setFormError(`Sem dados de combate para: ${[...new Set(skipped)].join(', ')}.`);
    }
  };

  const resolveBossDamage = async () => {
    const pending = pendingBossDamage;
    if (!pending) return;
    setFormError('');
    const result = await window.bossAPI.resolveDirectPlayerDamage(pending.id);
    if (!result.ok) {
      setFormError(result.error ?? 'Não foi possível calcular o dano pendente.');
      return;
    }
    const resolvedDamage = result.rolledDamage ?? pending.fallbackDamage;
    for (const bossId of pending.bossTargetIds) {
      await window.bossAPI.applyHealthSequence({
        bossId,
        type: 'damage',
        total: resolvedDamage,
        hits: pending.hits,
        ignoreDamageReduction: true,
      });
    }
    setPendingBossDamage(null);
  };

  const executeStatusTargetAction = async () => {
    if (!pendingTargetAction?.status) return;
    if (!await requestBossTurnPermission('aplicar uma condição')) return;
    const targets = selectedEncounterTargets();
    const playerIds = targets
      .filter(({ kind }) => kind === 'player')
      .map(({ sourceId }) => sourceId);
    const bosses = targets.filter(({ kind }) => kind === 'boss');
    const skipped = targets
      .filter(({ kind }) => kind === 'npc')
      .map(({ name }) => name);
    if (playerIds.length > 0) {
      const result = await window.bossAPI.applyPlayerStatus({
        playerIds,
        status: pendingTargetAction.status,
      });
      skipped.push(...result.skippedPlayers);
      if (!result.ok) setFormError(result.error ?? 'Falha ao aplicar a condição.');
    }
    for (const boss of bosses) {
      const status = pendingTargetAction.status;
      window.bossAPI.dispatch({
        type: 'apply-status',
        bossId: boss.sourceId,
        statusId: status.statusId,
        damageFormula: status.damageFormula,
        turns: status.turnsRemaining,
        customName: status.customName,
        customDescription: status.customDescription,
        customPresetId: status.customPresetId,
        customInflictedStatusId: status.customInflictedStatusId,
        customAffectedTarget: status.customAffectedTarget,
      });
    }
    if (skipped.length > 0) {
      setFormError(`Sem dados de combate para: ${[...new Set(skipped)].join(', ')}.`);
    }
    setPendingTargetAction(null);
  };

  const updateSkillDraft = (skillId: BossSkillId, value: string) => {
    if (!/^-?\d{0,2}$/.test(value)) return;
    setSkillValues((current) => ({ ...current, [skillId]: value }));
    setManuallyEditedSkills((current) => new Set(current).add(skillId));
    markIdentityUnprepared();
  };

  const updatePrimarySkillDraft = (
    skillId: 'luta' | 'pontaria',
    setter: (value: string) => void,
    value: string,
  ) => {
    if (!/^-?\d{0,2}$/.test(value)) return;
    setter(value);
    setSkillValues((current) => ({ ...current, [skillId]: value }));
    setManuallyEditedSkills((current) => new Set(current).add(skillId));
    markIdentityUnprepared();
  };

  const updateBaseSkillDraft = (value: string) => {
    if (!/^-?\d{0,2}$/.test(value)) return;
    setSkills(value);
    setSkillValues((current) => updateInheritedBossSkillDrafts(
      value,
      current,
      manuallyEditedSkills,
    ));
    if (!manuallyEditedSkills.has('luta')) setAttack(value);
    if (!manuallyEditedSkills.has('pontaria')) setRangedAttack(value);
    markIdentityUnprepared();
  };

  const rollBossSkill = async (
    skillId: BossSkillId,
    label: string,
    extremeAdvantageConfirmed = false,
  ) => {
    if (!activeBoss) return;
    if (bossExtremeAdvantage && !extremeAdvantageConfirmed) {
      setExtremeAdvantageWarning({ kind: 'skill', skillId, label });
      return;
    }
    if (!await requestBossTurnPermission(`realizar o teste de ${label}`)) return;
    const generalSkillDelta =
      (authoritativeAttributes?.values.skills ?? activeBoss.skills) -
      activeBoss.skills;
    const value = (activeBoss.skillValues?.[skillId] ?? activeBoss.skills) +
      generalSkillDelta;
    setBossSkillPickerOpen(false);
    setFormError('');
    await nextPaint();
    if (
      skillId === 'iniciativa' &&
      bossInitiativePending &&
      activeBossInitiativeParticipant
    ) {
      const initiativeResult = await window.bossAPI.rollEncounterInitiative(
        activeBossInitiativeParticipant.id,
        bossExtremeAdvantage,
      );
      if (!initiativeResult.ok) {
        setFormError(
          initiativeResult.error ?? 'Não foi possível rolar a iniciativa.',
        );
      }
      setLinkBossSkillToPrevious(false);
      return;
    }
    const result = await window.bossAPI.rollEncounterFormula({
      participantId: `boss:${activeBoss.id}`,
      label,
      formula: `1d20 ${value >= 0 ? '+' : '-'} ${Math.abs(value)}`,
      ...(bossExtremeAdvantage ? { rollMode: 'sum-capped' as const } : {}),
      category: 'test',
      ...(linkBossSkillToPrevious && previousRollCorrelationId
        ? { correlationId: previousRollCorrelationId }
        : {}),
    });
    setLinkBossSkillToPrevious(false);
    if (!result.ok) {
      setFormError(result.error ?? 'Não foi possível realizar o teste.');
    }
  };

  const saveShieldValue = () => {
    if (!activeBoss) return;
    const nextShield = Number(shield);
    if (!Number.isInteger(nextShield) || nextShield < 0 || nextShield > 999) {
      setShield(String(activeBoss.shield));
      setFormError('O escudo deve ser um número entre 0 e 999.');
      return;
    }
    window.bossAPI.dispatch({
      type: 'configure',
      bossId: activeBoss.id,
      bossName: activeBoss.bossName,
      controlAmount: activeBoss.controlAmount,
      applyDamageReduction: activeBoss.applyDamageReduction,
      maxHealth: activeBoss.maxHealth,
      currentHealth: activeBoss.currentHealth,
      attack: activeBoss.attack,
      rangedAttack: activeBoss.rangedAttack,
      skills: activeBoss.skills,
      skillValues: activeBoss.skillValues,
      skillOverrides: activeBoss.skillOverrides,
      defense: activeBoss.defense,
      rangedDefense: activeBoss.rangedDefense,
      damageReduction: activeBoss.damageReduction,
      shield: nextShield,
    });
    setFormError('');
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
    setPanelMinimized(nextMinimized);
    try {
      const changed = await window.bossAPI.setControlPanelMinimized(nextMinimized);
      if (!changed) setPanelMinimized(!nextMinimized);
    } catch {
      setPanelMinimized(!nextMinimized);
    } finally {
      setPanelTransitioning(false);
    }
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
        <div className="control-vitals">
          <div className="health-difference" title="Diferença entre a vida atual e a vida máxima">
            <span>PV</span><strong>{activeBoss.currentHealth}/{activeBoss.maxHealth}</strong><small>−{missingHealth}</small>
          </div>
          <span className="control-vitals-divider" aria-hidden="true" />
          <div className="control-turn-stack">
            <span className="control-turn-meter">
              Turno <strong>{turnState.round}</strong>
            </span>
            <button
              className="control-start-turn control-header-turn"
              type="button"
              aria-label={turnState.started ? 'Próximo turno' : 'Iniciar turno'}
              data-app-tooltip={turnState.started
                ? 'Avançar para o próximo turno'
                : 'Iniciar o primeiro turno'}
              disabled={!canAdvanceTurn}
              data-disabled-reason={
                !state.battleStarted
                  ? 'Inicie a batalha primeiro'
                  : turnState.initiativeReady === false
                    ? 'Aguarde todas as iniciativas'
                    : 'Nenhum participante apto'
              }
              onClick={requestTurnAdvance}
            >
              <span aria-hidden="true">›</span>
            </button>
            {turnError && <small className="control-turn-error">{turnError}</small>}
          </div>
        </div>
        <button
          className="control-minimize-button"
          type="button"
          disabled={panelTransitioning}
          data-disabled-reason="Aguarde o painel terminar de ajustar"
          aria-expanded={!panelMinimized}
          title={panelMinimized ? 'Expandir painel' : 'Minimizar painel'}
          onClick={() => void togglePanel()}
        >
          <span className="panel-arrows" aria-hidden="true">
            {panelMinimized ? '<>' : '—'}
          </span>
        </button>
      </header>

      <form
        className="control-form"
        onSubmit={(event) => event.preventDefault()}
      >
        <div className="control-combat-row">
          <label className="control-name-field">
            <span>Nome do chefão<RequiredStar visible={identityRequired} /></span>
            <input maxLength={100} value={bossName} onChange={(event) => updateIdentity(setBossName, event.target.value)} />
          </label>
          <label className="control-amount-field">
            <span>Valor</span>
            <input inputMode="text" value={amount} onChange={(event) => {
              if (/^[0-9dD+\-.,/\s]*$/.test(event.target.value)) {
                updateIdentity(setAmount, event.target.value);
              }
            }} />
          </label>
          <label className="control-rd-toggle">
            <span>RD</span>
            <input type="checkbox" checked={applyDamageReduction} onChange={(event) => {
              setApplyDamageReduction(event.target.checked);
              markIdentityUnprepared();
            }} />
          </label>
          <button className="control-damage" type="button" onClick={() => void applyHealthChange('damage')}><span style={{ fontSize: healthButtonFontSize('Dano', displayedFormulaValue ?? displayedDamage) }}>Dano <small>({displayedFormulaValue ?? displayedDamage})</small></span></button>
          <button className="control-heal" type="button" onClick={() => void applyHealthChange('heal')}><span style={{ fontSize: healthButtonFontSize('Cura', displayedFormulaValue ?? rawAmount) }}>Cura <small>({displayedFormulaValue ?? rawAmount})</small></span></button>
          <button className="control-full-heal" type="button" onClick={() => window.bossAPI.dispatch({ type: 'reset-health', bossId: activeBoss.id })}><span style={{ fontSize: healthButtonFontSize('Full Heal', activeBoss.maxHealth) }}>Full Heal <small>({activeBoss.maxHealth})</small></span></button>
        </div>

        <div className="control-attributes-row">
          <button
            className="control-open-attributes"
            type="button"
            onClick={openAttributesEditor}
          >
            Alterar Perícias<RequiredStar visible={identityRequired} />
          </button>
          <div className="control-shield-control">
            <span>Escudo</span>
            <div className="control-shield-input-group">
              <input
                aria-label="Valor do escudo"
                type="number"
                inputMode="numeric"
                min={0}
                max={999}
                value={shield}
                onChange={(event) => {
                  if (/^\d{0,3}$/.test(event.target.value)) {
                    setShield(event.target.value);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    saveShieldValue();
                    event.currentTarget.blur();
                  }
                }}
              />
              <button type="button" onClick={saveShieldValue}>OK</button>
            </div>
          </div>
          <button
            className="control-boss-arsenal-button"
            type="button"
            onClick={() => {
              setFormError('');
              setBossArsenalSelectedId(activeSelectedAttack?.id ?? bossAttacks[0]?.id ?? '');
              setBossArsenalOpen(true);
            }}
          >
            Armas/Ataques
          </button>
          <button
            className={`control-target-damage ${
              pendingBossDamage?.bossId === activeBoss.id ? 'is-pending-damage' : ''
            }`}
            type="button"
            onClick={() => {
              if (pendingBossDamage?.bossId === activeBoss.id) {
                void resolveBossDamage();
                return;
              }
              setSelectedTargetIds(new Set());
              setTargetActionError('');
              setTargetAreaDamage(false);
              setTargetDamagePicker('damage');
            }}
          >
            {pendingBossDamage?.bossId === activeBoss.id
              ? `Rolar dano · ${pendingBossDamage.attackName}`
              : 'Dano em jogador'}
          </button>
          <div
            className="control-attack-selection"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) {
                setAttackQuickPickerOpen(false);
              }
            }}
          >
            <span className="control-attack-arrow" aria-hidden="true">→</span>
            <button
              className="control-selected-attack"
              type="button"
              aria-haspopup="listbox"
              aria-expanded={attackQuickPickerOpen}
              data-app-tooltip={activeSelectedAttack
                ? bossAttackSummary(activeSelectedAttack)
                : undefined}
              disabled={bossAttacks.length === 0}
              data-disabled-reason="Crie um ataque no arsenal do chefão"
              onClick={() => setAttackQuickPickerOpen((open) => !open)}
            >
              <strong>{activeSelectedAttack?.name ?? 'Sem ataque'}</strong>
              {activeSelectedAttack && <small>{bossAttackSummary(activeSelectedAttack)}</small>}
              <i aria-hidden="true">▾</i>
            </button>
            {attackQuickPickerOpen && (
              <div className="control-attack-options" role="listbox" aria-label="Ataque atual do chefão">
                {bossAttacks.map((attackEntry) => (
                  <button
                    className={attackEntry.id === activeSelectedAttack?.id ? 'is-selected' : ''}
                    type="button"
                    role="option"
                    aria-selected={attackEntry.id === activeSelectedAttack?.id}
                    key={attackEntry.id}
                    onClick={() => {
                      persistBossArsenal(bossAttacks, attackEntry.id);
                      setAttackQuickPickerOpen(false);
                    }}
                  >
                    <span>{attackEntry.name}</span>
                    <small>{bossAttackSummary(attackEntry)}</small>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            className={`control-skill-test-button ${
              bossInitiativePending ? 'is-initiative-pending' : ''
            }`}
            type="button"
            data-app-tooltip={bossInitiativePending
              ? 'Role Iniciativa para liberar os turnos'
              : 'Realizar um teste de perícia'}
            disabled={!state.battleStarted}
            data-disabled-reason="Inicie a batalha para realizar testes"
            onClick={() => {
              setLinkBossSkillToPrevious(false);
              setBossSkillPickerOpen(true);
            }}
          >
            Teste de perícia
          </button>
        </div>

        <div className="control-status-row">
          <div className="control-status-picker" role="group" aria-label="Condições do chefão">
            {STATUS_DEFINITIONS.map((definition) => {
              const activeStatus = activeStatusesById.get(definition.id);
              const statusName = activeStatus
                ? getActiveStatusName(activeStatus)
                : definition.name;
              const selected = selectedStatusId === definition.id;
              return (
                <button
                  className={`control-status-icon ${selected ? 'is-selected' : ''} ${activeStatus ? 'is-active' : ''}`}
                  type="button"
                  aria-label={`${statusName}${activeStatus ? `, ativo por ${activeStatus.turnsRemaining} turnos` : ''}`}
                  aria-pressed={selected}
                  aria-describedby={statusTooltip?.statusId === definition.id ? 'control-status-tooltip' : undefined}
                  key={definition.id}
                  onBlur={() => setStatusTooltip(null)}
                  onClick={() => selectStatus(definition.id)}
                  onFocus={(event) => showStatusTooltipFromFocus(definition.id, event)}
                  onMouseEnter={(event) => showStatusTooltipFromMouse(definition.id, event)}
                  onMouseLeave={() => setStatusTooltip(null)}
                >
                  <img
                    src={statusIconUrl(definition.iconFile)}
                    alt=""
                    draggable={false}
                  />
                  {activeStatus && <span className="control-status-active-mark" aria-hidden="true" />}
                </button>
              );
            })}
          </div>

          <div className="control-status-controls">
            <div className="control-status-skill-summary">
              <span>Perícias afetadas:</span>
              {skillAnnotations.length > 0 ? (
                <div className="control-status-skill-icons">
                  {skillAnnotations.map((annotation) => {
                    const definition = getStatusDefinition(annotation.statusId);
                    return (
                      <button
                        className={`control-skill-annotation is-${annotation.tone}`}
                        type="button"
                        aria-label={`${definition.name}: ${annotation.text}`}
                        key={annotation.statusId}
                        onBlur={() => setStatusTooltip(null)}
                        onFocus={(event) => showSkillAnnotationTooltip(annotation, event.currentTarget)}
                        onMouseEnter={(event) => showSkillAnnotationTooltip(annotation, event.currentTarget)}
                        onMouseLeave={() => setStatusTooltip(null)}
                      >
                        <img src={statusIconUrl(definition.iconFile)} alt="" draggable={false} />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <small>Nenhuma</small>
              )}
            </div>
            <div className="control-status-command-row">
              <div className="control-status-settings">
                <label className="control-status-damage">
                  <span>Dano</span>
                  <input
                    aria-label="Dano da condição"
                    disabled={!selectedStatusDefinition?.damageCapable || selectedStatusDefinition.customizable}
                    data-disabled-reason={!selectedStatusDefinition
                      ? 'Selecione uma condição'
                      : selectedStatusDefinition.customizable
                        ? 'Defina o dano no modal personalizado'
                        : 'Esta condição não causa dano'}
                    maxLength={128}
                    placeholder={selectedStatusDefinition?.damageCapable && !selectedStatusDefinition.customizable ? '1d6' : '—'}
                    value={statusDamage}
                    onChange={(event) => setStatusDamage(event.target.value)}
                  />
                </label>
                <label className="control-status-turns">
                  <span>Turnos</span>
                  <input
                    aria-label="Duração da condição em turnos"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={999}
                    value={statusTurns}
                    onChange={(event) => setStatusTurns(event.target.value)}
                  />
                </label>
                <button
                  className="control-status-apply"
                  type="button"
                  disabled={!selectedStatusDefinition || selectedStatusDefinition.customizable}
                  data-disabled-reason={!selectedStatusDefinition
                    ? 'Selecione uma condição'
                    : 'Use o modal do status personalizado'}
                  onClick={applyStatus}
                >
                  Aplicar
                </button>
                <button
                  className="control-status-remove"
                  type="button"
                  disabled={!selectedActiveStatus}
                  data-disabled-reason="A condição selecionada não está ativa"
                  onClick={removeStatus}
                >
                  Remover
                </button>
              </div>

            </div>
          </div>
        </div>

        <div className="control-action-row">
          <label className="control-action-field">
            <span>Próxima ação<RequiredStar visible={actionRequired} /></span>
            <textarea maxLength={100} rows={2} value={actionDraft} placeholder="Descreva a próxima ação para preparar os jogadores." onChange={(event) => updateAction(event.target.value)} />
          </label>
          <button className="control-publish" type="button" onClick={() => publishAction('normal')}>Ação padrão</button>
          <button className="control-publish-danger" type="button" onClick={() => publishAction('grave')}>Ação grave</button>
          <div className="control-music-controls control-inline-audio-controls">
            <span>Música:</span>
            <input
              type="range"
              min="0"
              max="100"
              aria-label="Volume da música"
              value={Math.round((music?.volume ?? 0.8) * 100)}
              onChange={(event) => {
                const volume = Number(event.target.value) / 100;
                setMusic((current) => current ? {
                  ...current,
                  volume,
                } : current);
                window.bossAPI.dispatchMusicControl({
                  type: 'set-volume',
                  volume,
                });
              }}
            />
            <button
              type="button"
              className={music?.muted ? 'is-active' : ''}
              title={music?.muted ? 'Ativar música' : 'Mutar música'}
              onClick={() => {
                const muted = !(music?.muted ?? false);
                setMusic((current) => current ? { ...current, muted } : current);
                window.bossAPI.dispatchMusicControl({
                  type: 'set-muted',
                  muted,
                });
              }}
            >{music?.muted ? '🔇' : '🔊'}</button>
            <button
              type="button"
              className={music?.loop ? 'is-active' : ''}
              title="Repetir faixa"
              onClick={() => window.bossAPI.dispatchMusicControl({
                type: 'set-loop',
                loop: !(music?.loop ?? false),
              })}
            >↻</button>
            <button
              type="button"
              title="Abrir playlist da fase atual"
              disabled={!music?.tracks.length}
              data-disabled-reason="A fase atual não possui playlist"
              onClick={() => void window.bossAPI.openActivePhasePlaylist()}
            >☷</button>
          </div>
        </div>

        <div className="control-soundboard-row">
          <div className="control-soundboard-primary">
            <button className="control-open-soundboard" type="button" onClick={() => void window.bossAPI.openSoundboardWindow()}>Soundboard</button>
            <div className="control-soundboard-shortcuts" aria-label="Atalhos do soundboard">
              {(soundboard?.slots ?? []).map((slot) => (
                <button
                  className={slot.assigned ? 'is-assigned' : ''}
                  type="button"
                  title={slot.name ?? `Atalho ${slot.index}`}
                  aria-label={slot.assigned ? `Reproduzir ${slot.name}` : `Atalho ${slot.index} vazio`}
                  disabled={!slot.assigned}
                  data-disabled-reason="Nenhum som atribuído a este atalho"
                  key={slot.index}
                  onClick={() => window.bossAPI.dispatchSoundboard({ type: 'play', index: slot.index })}
                >
                  {slot.index}
                </button>
              ))}
            </div>
          </div>
          <div className="control-inline-audio-controls">
            <span>Soundboard:</span>
            <input
              type="range"
              min="0"
              max="100"
              aria-label="Volume do soundboard"
              disabled={!soundboard}
              data-disabled-reason="O soundboard ainda não está disponível"
              value={Math.round((soundboard?.volume ?? 0.8) * 100)}
              onChange={(event) => window.bossAPI.dispatchSoundboard({
                type: 'set-volume',
                volume: Number(event.target.value) / 100,
              })}
            />
            <button type="button" className={soundboard?.muted ? 'is-active' : ''} title={soundboard?.muted ? 'Ativar soundboard' : 'Mutar soundboard'} disabled={!soundboard} data-disabled-reason="O soundboard ainda não está disponível" onClick={() => window.bossAPI.dispatchSoundboard({ type: 'toggle-mute' })}>{soundboard?.muted ? '🔇' : '🔊'}</button>
            <button type="button" className={soundboard?.loop ? 'is-active' : ''} title="Repetir sons" disabled={!soundboard} data-disabled-reason="O soundboard ainda não está disponível" onClick={() => window.bossAPI.dispatchSoundboard({ type: 'toggle-loop' })}>↻</button>
            <span aria-hidden="true" />
          </div>
        </div>
      </form>
      {targetDamagePicker && (
        <TargetPickerModal
          title="Dano em jogador"
          subtitle={activeSelectedAttack
            ? `${activeSelectedAttack.name} · ${activeSelectedAttack.damageFormula}`
            : 'Nenhum ataque selecionado'}
          instruction="Selecione quem receberá o ataque."
          targets={encounterTargets}
          selectedIds={selectedTargetIds}
          onSelectionChange={setSelectedTargetIds}
          onCancel={() => setTargetDamagePicker(null)}
          onApply={() => {
            if (!targetAreaDamage && bossExtremeAdvantage) {
              setExtremeAdvantageWarning({ kind: 'damage' });
              return;
            }
            void executeDamageTargetAction(
              targetAreaDamage ? 'area-damage' : 'damage',
            );
          }}
          applyLabel={targetAreaDamage ? 'Aplicar dano em área' : 'Aplicar dano'}
          error={targetActionError}
          headerActions={!targetAreaDamage ? (
            <label className="control-extreme-advantage-choice is-inline">
              <input
                type="checkbox"
                checked={bossExtremeAdvantage}
                onChange={(event) => setBossExtremeAdvantage(event.target.checked)}
              />
              Extrema vantagem
            </label>
          ) : undefined}
        >
          <div className="control-area-damage-options">
            <label>
              <input
                type="checkbox"
                checked={targetAreaDamage}
                onChange={(event) => setTargetAreaDamage(event.target.checked)}
              />
              Dano em área
            </label>
            <label className={!targetAreaDamage ? 'is-disabled' : ''}>
              <span>CD</span>
              <input
                aria-label="CD do dano em área"
                type="text"
                inputMode="numeric"
                maxLength={3}
                disabled={!targetAreaDamage}
                data-disabled-reason="Ative o dano em área"
                value={targetReflexDc}
                onChange={(event) => {
                  if (/^\d{0,3}$/.test(event.target.value)) {
                    setTargetReflexDc(event.target.value);
                  }
                }}
              />
            </label>
          </div>
        </TargetPickerModal>
      )}
      {bossSkillPickerOpen && (
        <div className="control-modal-backdrop" role="presentation">
          <section
            className="control-status-modal control-skill-picker-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="control-skill-picker-title"
          >
            <header className="control-status-target-header">
              <div>
                <h2 id="control-skill-picker-title">Teste de perícia</h2>
                <span>{activeBoss.bossName}</span>
              </div>
              <div className="control-skill-picker-actions">
                <label className="control-extreme-advantage-choice is-inline">
                  <input
                    type="checkbox"
                    checked={bossExtremeAdvantage}
                    onChange={(event) => setBossExtremeAdvantage(event.target.checked)}
                  />
                  Extrema vantagem
                </label>
                <button
                  type="button"
                  aria-label="Fechar lista de perícias"
                  onClick={() => {
                    setLinkBossSkillToPrevious(false);
                    setBossSkillPickerOpen(false);
                  }}
                >
                  ×
                </button>
              </div>
            </header>
            {turnState.started && previousRollResult && (
              <label className="control-skill-correlation">
                <input
                  type="checkbox"
                  checked={linkBossSkillToPrevious}
                  onChange={(event) =>
                    setLinkBossSkillToPrevious(event.target.checked)}
                />
                <span>
                  Vincular ao último teste
                  <small>
                    {Number.isInteger(previousRollResult.sequence)
                      ? `#${previousRollResult.sequence} · `
                      : ''}
                    {previousRollResult.label}
                  </small>
                </span>
              </label>
            )}
            <div className="control-skill-picker-list">
              {BOSS_SKILL_DEFINITIONS.map(([id, label]) => {
                const generalSkillDelta =
                  (authoritativeAttributes?.values.skills ?? activeBoss.skills) -
                  activeBoss.skills;
                const value = (activeBoss.skillValues?.[id] ?? activeBoss.skills) +
                  generalSkillDelta;
                const initiativeRequired =
                  id === 'iniciativa' && bossInitiativePending;
                return (
                  <div
                    className={`control-skill-picker-item ${
                      initiativeRequired ? 'is-initiative-required' : ''
                    }`}
                    key={id}
                  >
                    <button
                      type="button"
                      aria-label={`Rolar ${label}`}
                      onClick={() => void rollBossSkill(id, label)}
                    >
                      <span>{label}</span>
                      <strong>{value >= 0 ? '+' : ''}{value}</strong>
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}
      {attackLibraryOpen && <AttackLibrary context={activeBoss.bossName} onClose={() => setAttackLibraryOpen(false)} onSelect={(attack) => {
        setBossAttacks((current) => normalizeBossAttacks([...current.filter((entry) => entry.id !== attack.id), attack], activeBoss.id));
        setBossArsenalSelectedId(attack.id); setSelectedBossAttackId(attack.id); setAttackLibraryOpen(false);
      }} />}
      {bossArsenalOpen && arsenalDraftAttack && (
        <div className="control-modal-backdrop" role="presentation">
          <section
            className="control-status-modal control-boss-arsenal-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="control-boss-arsenal-title"
          >
            <header className="control-status-target-header">
              <div>
                <h2 id="control-boss-arsenal-title">Armas e ataques</h2>
                <span>{activeBoss.bossName}</span>
              </div>
              <button className="control-open-attack-library" type="button" onClick={() => setAttackLibraryOpen(true)}>Biblioteca de ataques</button>
              <button
                type="button"
                aria-label="Fechar arsenal"
                onClick={() => {
                  const restored = normalizeBossAttacks(activeBoss.attacks, activeBoss.id);
                  setBossAttacks(restored);
                  setBossArsenalSelectedId(
                    selectedBossAttack(restored, activeBoss.selectedAttackId)?.id ?? '',
                  );
                  setBossArsenalOpen(false);
                }}
              >
                ×
              </button>
            </header>
            <div className="control-boss-arsenal-layout">
              <aside className="control-boss-attack-list">
                {bossAttacks.map((attackEntry) => (
                  <button
                    className={attackEntry.id === arsenalDraftAttack.id ? 'is-selected' : ''}
                    type="button"
                    key={attackEntry.id}
                    onClick={() => setBossArsenalSelectedId(attackEntry.id)}
                  >
                    {attackEntry.name}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={bossAttacks.length >= MAX_BOSS_ATTACKS}
                  data-disabled-reason="Limite de 20 ataques alcançado"
                  onClick={addArsenalAttack}
                >
                  + Novo ataque
                </button>
              </aside>
              <div className="control-boss-attack-editor">
                <label>
                  <span>Nome</span>
                  <input
                    type="text"
                    maxLength={60}
                    value={arsenalDraftAttack.name}
                    onChange={(event) => updateArsenalAttack('name', event.target.value)}
                  />
                </label>
                <label>
                  <span>Tipo</span>
                  <select
                    value={arsenalDraftAttack.attackType}
                    onChange={(event) => updateArsenalAttack(
                      'attackType',
                      event.target.value as BossAttack['attackType'],
                    )}
                  >
                    <option value="melee">Corpo a corpo (Luta)</option>
                    <option value="ranged">À distância (Pontaria)</option>
                  </select>
                </label>
                <label>
                  <span>Modificador adicional</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={3}
                    value={arsenalDraftAttack.attackModifier}
                    onChange={(event) => {
                      if (/^-?\d{0,2}$/.test(event.target.value)) {
                        updateArsenalAttack('attackModifier', Number(event.target.value || 0));
                      }
                    }}
                  />
                </label>
                <label>
                  <span>Dano</span>
                  <input
                    type="text"
                    maxLength={80}
                    value={arsenalDraftAttack.damageFormula}
                    placeholder="Ex.: 2d8 + 6"
                    onChange={(event) => updateArsenalAttack('damageFormula', event.target.value)}
                  />
                </label>
                <label>
                  <span>Margem de crítico</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={2}
                    value={arsenalDraftAttack.criticalThreat}
                    onChange={(event) => {
                      if (/^\d{0,2}$/.test(event.target.value)) {
                        updateArsenalAttack('criticalThreat', Number(event.target.value || 0));
                      }
                    }}
                  />
                </label>
                <label>
                  <span>Multiplicador</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={2}
                    value={arsenalDraftAttack.criticalMultiplier}
                    onChange={(event) => {
                      if (/^\d{0,2}$/.test(event.target.value)) {
                        updateArsenalAttack('criticalMultiplier', Number(event.target.value || 0));
                      }
                    }}
                  />
                </label>
                <label><span>Tipo de dano</span><DamageTypeField value={arsenalDraftAttack.damageType} onChange={(value) => updateArsenalAttack('damageType', value)} /></label>
                <label>
                  <span>Alcance</span>
                  <AttackRangeField value={arsenalDraftAttack.range} onChange={(value) => updateArsenalAttack('range', value)} />
                </label>
              </div>
            </div>
            {formError && (
              <p className="control-status-modal-error" role="alert">{formError}</p>
            )}
            <footer className="control-boss-arsenal-actions">
              <button
                className="is-remove"
                type="button"
                disabled={bossAttacks.length <= 1}
                data-disabled-reason="O chefão precisa ter ao menos um ataque"
                onClick={removeArsenalAttack}
              >
                Remover
              </button>
              <button
                className={selectedBossAttackId === arsenalDraftAttack.id ? 'is-selected' : ''}
                aria-pressed={selectedBossAttackId === arsenalDraftAttack.id}
                type="button"
                onClick={() => setSelectedBossAttackId(arsenalDraftAttack.id)}
              >
                {selectedBossAttackId === arsenalDraftAttack.id
                  ? 'Pré-selecionado'
                  : 'Pré-selecionar'}
              </button>
              <button
                className="is-apply"
                type="button"
                onClick={() => {
                  if (!persistBossArsenal()) return;
                  setBossArsenalOpen(false);
                }}
              >
                Aplicar
              </button>
            </footer>
          </section>
        </div>
      )}
      {extremeAdvantageWarning && (
        <div className="control-modal-backdrop control-extreme-warning-layer" role="presentation">
          <section
            className="control-status-modal control-extreme-warning-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="control-extreme-warning-title"
          >
            <header className="control-status-target-header">
              <h2 id="control-extreme-warning-title">Confirmar extrema vantagem</h2>
            </header>
            <p>
              Chefões geralmente não possuem Extrema Vantagem. Use-a apenas
              quando fizer sentido narrativamente e estiver claro para a mesa.
            </p>
            <footer className="control-target-modal-actions">
              <button type="button" onClick={() => setExtremeAdvantageWarning(null)}>
                Voltar
              </button>
              <button
                className="control-status-modal-apply"
                type="button"
                onClick={() => {
                  const warning = extremeAdvantageWarning;
                  setExtremeAdvantageWarning(null);
                  if (warning.kind === 'skill') {
                    void rollBossSkill(warning.skillId, warning.label, true);
                  } else {
                    void executeDamageTargetAction('damage');
                  }
                }}
              >
                Confirmar
              </button>
            </footer>
          </section>
        </div>
      )}
      {offTurnWarning && (
        <div className="control-modal-backdrop control-off-turn-warning-layer" role="presentation">
          <section
            className="control-status-modal control-off-turn-warning-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="control-off-turn-warning-title"
          >
            <header className="control-status-target-header">
              <h2 id="control-off-turn-warning-title">Ação fora do turno</h2>
            </header>
            <p>
              {offTurnWarning.bossName} não está no próprio turno. Deseja mesmo{' '}
              {offTurnWarning.actionLabel} agora?
            </p>
            <footer className="control-target-modal-actions">
              <button type="button" onClick={() => resolveOffTurnWarning(false)}>
                Voltar
              </button>
              <button
                className="control-status-modal-apply"
                type="button"
                onClick={() => resolveOffTurnWarning(true)}
              >
                Prosseguir
              </button>
            </footer>
          </section>
        </div>
      )}
      {statusTargetSelectionOpen && (
        <TargetPickerModal
          title="Escolher alvos"
          subtitle={selectedStatusId
            ? getActiveStatusName(
              selectedStatusForTarget() ?? {
                statusId: selectedStatusId,
                damageFormula: null,
                turnsRemaining: 1,
              },
            )
            : 'Condição'}
          instruction="Selecione quem receberá a condição."
          targets={encounterTargets}
          selectedIds={selectedTargetIds}
          onSelectionChange={setSelectedTargetIds}
          onCancel={() => setStatusTargetSelectionOpen(false)}
          onApply={() => {
            if (selectedTargetIds.size === 0) return;
            setStatusTargetSelectionOpen(false);
            requestStatusTargetAction();
          }}
          applyLabel="Aplicar"
        />
      )}
      {pendingTargetAction && (
        <div className="control-modal-backdrop" role="presentation">
          <section
            className="control-status-modal control-target-confirmation"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="control-target-confirmation-title"
          >
            <h2 id="control-target-confirmation-title">Confirmar ação do chefão</h2>
            <p>
              Aplicar{' '}
              {pendingTargetAction.status
                ? getActiveStatusName(pendingTargetAction.status)
                : 'condição'}
            </p>
            <strong>
              Alvos: {encounterTargets
                .filter(({ id }) => selectedTargetIds.has(id))
                .map(({ name }) => name)
                .join(', ')}
            </strong>
            <div className="control-status-modal-actions">
              <button
                type="button"
                onClick={() => setPendingTargetAction(null)}
              >Cancelar</button>
              <button
                className="control-status-modal-apply"
                type="button"
                onClick={() => void executeStatusTargetAction()}
              >Confirmar</button>
            </div>
          </section>
        </div>
      )}
      {attributesOpen && (
        <div className="control-modal-backdrop" role="presentation">
          <form
            className="control-status-modal control-attributes-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="control-attributes-title"
            onSubmit={applyIdentity}
          >
            <header className="control-attributes-modal-header">
              <div className="control-attributes-modal-heading">
                <h2 id="control-attributes-title">
                  Alterar perícias - {activeBoss.bossName} - Base
                </h2>
                <label className="control-base-skill-field">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={3}
                    aria-label="Perícia base"
                    value={skills}
                    onChange={(event) => updateBaseSkillDraft(event.target.value)}
                  />
                </label>
              </div>
              <div className="control-attributes-modal-actions">
                <button className="control-status-modal-apply" type="submit">
                  Aplicar
                </button>
                <button
                  className="control-attributes-modal-close"
                  type="button"
                  aria-label="Fechar editor de perícias"
                  onClick={() => {
                    setAttributesOpen(false);
                    setFormError('');
                  }}
                >
                  ×
                </button>
              </div>
            </header>
            <div className="control-attribute-modal-grid">
              {([
                ['Vida máxima', maxHealth, setMaxHealth, 1, 1_000_000],
                ['Vida atual', currentHealth, setCurrentHealth, 0, 1_000_000],
                ['Luta', attack, setAttack, -99, 99],
                ['Pontaria', rangedAttack, setRangedAttack, -99, 99],
                ['Defesa CaC', defense, setDefense, 0, 999],
                ['Defesa AaD', rangedDefense, setRangedDefense, 0, 999],
                ['RD', damageReduction, setDamageReduction, 0, 999],
              ] as const).map(([label, value, setter, min, max]) => (
                <label key={label}>
                  <span title={label}>{label}</span>
                  <input
                    type="number"
                    min={min}
                    max={max}
                    value={value}
                    onChange={(event) => label === 'Luta'
                      ? updatePrimarySkillDraft('luta', setAttack, event.target.value)
                      : label === 'Pontaria'
                        ? updatePrimarySkillDraft('pontaria', setRangedAttack, event.target.value)
                        : updateIdentity(setter, event.target.value)}
                  />
                </label>
              ))}
            </div>
            <section className="control-exact-skills">
              <h3>Valores exatos de perícia</h3>
              <div>
                {BOSS_ADDITIONAL_SKILL_DEFINITIONS.map(([id, label]) => (
                  <label key={id}>
                    <span title={label}>{label}</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={3}
                      value={skillValues[id]}
                      onChange={(event) => updateSkillDraft(id, event.target.value)}
                    />
                  </label>
                ))}
              </div>
            </section>
            {formError && (
              <p className="control-status-modal-error" role="alert">
                {formError}
              </p>
            )}
          </form>
        </div>
      )}
      {turnConfirmationOpen && activeTurnParticipant && (
        <div className="control-modal-backdrop control-confirm-backdrop" role="presentation">
          <section
            className="control-status-modal control-status-confirm-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="turn-confirm-title"
          >
            <h2 id="turn-confirm-title">Encerrar este turno?</h2>
            <p>
              O turno de <strong>{activeTurnParticipant.name}</strong> será encerrado
              e o próximo participante começará a agir.
            </p>
            <footer>
              <button
                type="button"
                className="control-status-modal-cancel"
                onClick={() => setTurnConfirmationOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="control-status-modal-delete-confirm"
                onClick={() => void advanceTurn()}
              >
                Encerrar turno
              </button>
            </footer>
          </section>
        </div>
      )}
      {statusTooltip && (() => {
        const definition = getStatusDefinition(statusTooltip.statusId);
        if (!definition) return null;
        const activeStatus = activeStatusesById.get(statusTooltip.statusId);
        const tooltipName = activeStatus
          ? getActiveStatusName(activeStatus)
          : definition.name;
        const tooltipDescription = statusTooltip.annotationText ?? (
          activeStatus
            ? getActiveStatusDescription(activeStatus)
            : definition.description
        );
        const turnLabel = activeStatus
          ? activeStatus.turnsRemaining === 1
            ? '1 turno restante'
            : `${activeStatus.turnsRemaining} turnos restantes`
          : null;
        return (
          <div
            className={`control-status-tooltip is-${statusTooltip.placement}`}
            id="control-status-tooltip"
            role="tooltip"
            style={{
              '--status-tooltip-left': `${statusTooltip.left}px`,
              '--status-tooltip-top': `${statusTooltip.top}px`,
            } as CSSProperties}
          >
            <span className="control-status-tooltip-header">
              <img src={statusIconUrl(definition.iconFile)} alt="" />
              <strong>{tooltipName}</strong>
            </span>
            <p><StatusRichText text={tooltipDescription} /></p>
            {activeStatus?.damageFormula && (
              <span className="control-status-tooltip-detail">
                Dano: <StatusDamageValue>{activeStatus.damageFormula}</StatusDamageValue>
              </span>
            )}
            {turnLabel && (
              <span className="control-status-tooltip-detail">
                Duração: <StatusTurnValue>{turnLabel}</StatusTurnValue>
              </span>
            )}
          </div>
        );
      })()}
      {customStatusLibraryOpen && (
        <div className="control-modal-backdrop" role="presentation">
          <section className="control-status-modal control-status-library-modal" role="dialog" aria-modal="true" aria-labelledby="custom-status-library-title">
            <header>
              <img src={statusIconUrl('status-36-coringa.png')} alt="" />
              <div>
                <h2 id="custom-status-library-title">Biblioteca de status</h2>
                <span>Condições personalizadas do mestre</span>
              </div>
            </header>
            <div className="control-status-library-list" aria-live="polite">
              {customStatusLibraryLoading ? (
                <p className="control-status-library-empty">Carregando biblioteca...</p>
              ) : customStatusLibrary.length === 0 ? (
                <p className="control-status-library-empty">Nenhum status personalizado foi criado.</p>
              ) : customStatusLibrary.map((preset) => (
                <article className="control-status-library-item" key={preset.id}>
                  <button type="button" className="control-status-library-select" onClick={() => chooseCustomStatus(preset)}>
                    <strong>{preset.name}</strong>
                    <span>{preset.description}</span>
                    <small>
                      {preset.inflictedStatusId
                        ? `Também inflige ${getStatusDefinition(preset.inflictedStatusId).name}`
                        : 'Não inflige outra condição'}
                      {' · '}
                      {CUSTOM_STATUS_AFFECTED_TARGET_LABELS[preset.affectedTarget]}
                    </small>
                  </button>
                  <button
                    type="button"
                    className="control-status-library-delete"
                    aria-label={`Excluir ${preset.name}`}
                    title="Excluir da biblioteca"
                    onClick={() => setCustomStatusDeleteCandidate(preset)}
                  >×</button>
                </article>
              ))}
            </div>
            {customStatusError && <p className="control-status-modal-error" role="alert">{customStatusError}</p>}
            <footer>
              <button type="button" className="control-status-modal-cancel" onClick={() => setCustomStatusLibraryOpen(false)}>Fechar</button>
              <button type="button" className="control-status-modal-apply" onClick={openCustomStatusEditor}>+ Criar novo</button>
            </footer>
          </section>
        </div>
      )}
      {customStatusOpen && (
        <div className="control-modal-backdrop" role="presentation">
          <section className="control-status-modal" role="dialog" aria-modal="true" aria-labelledby="custom-status-title">
            <header>
              <img src={statusIconUrl('status-36-coringa.png')} alt="" />
              <div><h2 id="custom-status-title">Criar status personalizado</h2></div>
            </header>
            <label>
              <span>Nome do status</span>
              <input autoFocus maxLength={60} value={customStatusName} onChange={(event) => setCustomStatusName(event.target.value)} placeholder="Ex.: Marcado pela tormenta" />
            </label>
            <label>
              <span>Descrição do efeito</span>
              <textarea maxLength={300} rows={3} value={customStatusDescription} onChange={(event) => setCustomStatusDescription(event.target.value)} placeholder="Explique brevemente o que esta condição faz." />
            </label>
            <div className="control-status-modal-values control-status-preset-values">
              <label>
                <span>Também inflige <small>(opcional)</small></span>
                <select value={customStatusInflictedStatusId} onChange={(event) => setCustomStatusInflictedStatusId(event.target.value)}>
                  <option value="">Nenhum outro status</option>
                  {STATUS_DEFINITIONS.filter(({ id }) => id !== 'coringa').map((definition) => (
                    <option key={definition.id} value={definition.id}>{definition.name}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Valor afetado</span>
                <select value={customStatusAffectedTarget} onChange={(event) => setCustomStatusAffectedTarget(event.target.value as CustomStatusAffectedTarget)}>
                  {CUSTOM_STATUS_AFFECTED_TARGETS.map((target) => (
                    <option key={target} value={target}>{CUSTOM_STATUS_AFFECTED_TARGET_LABELS[target]}</option>
                  ))}
                </select>
              </label>
            </div>
            {customStatusError && <p className="control-status-modal-error" role="alert">{customStatusError}</p>}
            <footer>
              <button type="button" className="control-status-modal-cancel" onClick={() => { setCustomStatusOpen(false); setCustomStatusLibraryOpen(true); }}>Cancelar</button>
              <button type="button" className="control-status-modal-apply" onClick={() => void saveCustomStatusPreset()}>Salvar na biblioteca</button>
            </footer>
          </section>
        </div>
      )}
      {customStatusApplyOpen && selectedCustomStatus && (
        <div className="control-modal-backdrop" role="presentation">
          <section className="control-status-modal control-status-runtime-modal" role="dialog" aria-modal="true" aria-labelledby="custom-status-apply-title">
            <header>
              <img src={statusIconUrl('status-36-coringa.png')} alt="" />
              <div>
                <h2 id="custom-status-apply-title">{selectedCustomStatus.name}</h2>
                <span>Aplicar status personalizado</span>
              </div>
            </header>
            <p className="control-status-runtime-description">{selectedCustomStatus.description}</p>
            <div className="control-status-runtime-details">
              <span>{CUSTOM_STATUS_AFFECTED_TARGET_LABELS[selectedCustomStatus.affectedTarget]}</span>
              {selectedCustomStatus.inflictedStatusId && (
                <span>Também inflige {getStatusDefinition(selectedCustomStatus.inflictedStatusId).name}</span>
              )}
            </div>
            <div className="control-status-modal-values">
              <label>
                <span>Dano por turno <small>(opcional)</small></span>
                <input autoFocus maxLength={128} value={customStatusDamage} onChange={(event) => setCustomStatusDamage(event.target.value)} placeholder="Ex.: 1d6 + 2d8 + 10" />
              </label>
              <label>
                <span>Turnos</span>
                <input type="number" min={1} max={999} value={customStatusTurns} onChange={(event) => setCustomStatusTurns(event.target.value)} />
              </label>
            </div>
            {customStatusError && <p className="control-status-modal-error" role="alert">{customStatusError}</p>}
            <footer>
              <button type="button" className="control-status-modal-cancel" onClick={() => { setCustomStatusApplyOpen(false); setCustomStatusLibraryOpen(true); }}>Voltar</button>
              <button type="button" className="control-status-modal-apply" onClick={applyCustomStatus}>Aplicar</button>
            </footer>
          </section>
        </div>
      )}
      {customStatusDeleteCandidate && (
        <div className="control-modal-backdrop control-confirm-backdrop" role="presentation">
          <section className="control-status-modal control-status-confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="custom-status-delete-title">
            <h2 id="custom-status-delete-title">Excluir status personalizado?</h2>
            <p>“{customStatusDeleteCandidate.name}” será removido da biblioteca. Condições já ativas permanecem até o fim de sua duração.</p>
            <footer>
              <button type="button" className="control-status-modal-cancel" onClick={() => setCustomStatusDeleteCandidate(null)}>Cancelar</button>
              <button type="button" className="control-status-modal-delete-confirm" onClick={() => void deleteCustomStatusPreset()}>Sim, excluir</button>
            </footer>
          </section>
        </div>
      )}
      {formError && <p className="control-error" role="alert">{formError}</p>}
    </main>
  );
};

const root = document.getElementById('root');
if (!root) throw new Error('Elemento raiz não encontrado.');
createRoot(root).render(<ControlApp />);
