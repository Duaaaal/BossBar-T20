import {
  type CSSProperties,
  type FocusEvent,
  type FormEvent,
  type MouseEvent,
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
  type SoundboardState,
  initialEncounterEffectsState,
} from './shared/battle';
import { statusIconUrl } from './shared/bundled-assets';
import { installDisabledControlTooltips } from './shared/disabled-controls';
import { installUndoShortcut } from './shared/undo-shortcut';
import {
  deriveStatusAttributes,
  getStatusSkillAnnotations,
  type StatusSkillAnnotation,
} from './shared/status-rules';
import {
  getActiveStatusDescription,
  getActiveStatusName,
  getStatusDefinition,
  normalizeDamageFormula,
  STATUS_DEFINITIONS,
  type StatusId,
} from './shared/status';
import {
  StatusDamageValue,
  StatusRichText,
  StatusTurnValue,
} from './StatusRichText';
import './control.css';
import './scrollbars.css';

installDisabledControlTooltips();
installUndoShortcut(() => window.bossAPI.undoLastChange());

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

const numberFromDraft = (value: string, fallback: number) => {
  if (!value.trim()) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

type StatusTooltipState = {
  statusId: StatusId;
  left: number;
  top: number;
  placement: 'above' | 'below';
  annotationText?: string;
};

type NumericFieldProps = {
  id: string;
  label: string;
  value: string;
  required: boolean;
  min?: number;
  max?: number;
  effectiveValue?: number;
  modifier?: number;
  onChange: (value: string) => void;
};

const NumericField = ({
  id,
  label,
  value,
  required,
  min = 0,
  max = 999,
  effectiveValue,
  modifier = 0,
  onChange,
}: NumericFieldProps) => {
  const [focused, setFocused] = useState(false);
  const hasEffectiveValue = value.trim() !== '' &&
    Number.isFinite(effectiveValue) &&
    modifier !== 0;
  const displayedValue = !focused && hasEffectiveValue
    ? String(effectiveValue)
    : value;
  const modifierClass = !focused && modifier < 0
    ? 'is-penalized'
    : !focused && modifier > 0
      ? 'is-bonused'
      : '';
  const previewClass = modifier < 0 ? 'is-penalized' : 'is-bonused';

  return (
    <div className={`control-number-field ${modifierClass} ${focused ? 'is-focused' : ''}`}>
      <span className="control-number-heading">
        <label htmlFor={id}>{label}<RequiredStar visible={required} /></label>
      </span>
      <div className={`control-number-input-shell ${focused && hasEffectiveValue ? 'has-preview' : ''}`}>
        <input
          id={id}
          type="number"
          min={min}
          max={max}
          value={displayedValue}
          title={hasEffectiveValue ? `Valor base: ${value}; modificação: ${modifier > 0 ? '+' : ''}${modifier}` : undefined}
          onBlur={() => setFocused(false)}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => setFocused(true)}
        />
        {focused && hasEffectiveValue && (
          <span className={`control-effective-preview ${previewClass}`} aria-hidden="true">
            ({effectiveValue})
          </span>
        )}
      </div>
    </div>
  );
};

type SplitNumericFieldProps = {
  id: string;
  legend: string;
  leftLabel: string;
  rightLabel: string;
  leftAriaLabel: string;
  rightAriaLabel: string;
  leftValue: string;
  rightValue: string;
  effectiveLeft: number;
  effectiveRight: number;
  leftModifier: number;
  rightModifier: number;
  min: number;
  max?: number;
  required: boolean;
  onLeftChange: (value: string) => void;
  onRightChange: (value: string) => void;
};

const SplitNumericField = ({
  id,
  legend,
  leftLabel,
  rightLabel,
  leftAriaLabel,
  rightAriaLabel,
  leftValue,
  rightValue,
  effectiveLeft,
  effectiveRight,
  leftModifier,
  rightModifier,
  min,
  max = 999,
  required,
  onLeftChange,
  onRightChange,
}: SplitNumericFieldProps) => {
  const [focusedSide, setFocusedSide] = useState<'left' | 'right' | null>(null);
  const leftModified = leftValue.trim() !== '' && leftModifier !== 0;
  const rightModified = rightValue.trim() !== '' && rightModifier !== 0;
  const leftDisplay = focusedSide === 'left' || !leftModified
    ? leftValue
    : String(effectiveLeft);
  const rightDisplay = focusedSide === 'right' || !rightModified
    ? rightValue
    : String(effectiveRight);

  const tone = (modifier: number, focused: boolean, modified: boolean) => [
    focused ? 'is-focused' : '',
    modified ? 'has-effective-value' : '',
    !focused && modifier < 0 ? 'is-penalized' : '',
    !focused && modifier > 0 ? 'is-bonused' : '',
  ].filter(Boolean).join(' ');
  const previewTone = (modifier: number) => modifier < 0 ? 'is-penalized' : 'is-bonused';

  return (
    <div className="control-split-field" role="group" aria-labelledby={`${id}-heading`}>
      <span className="control-split-heading" id={`${id}-heading`}>
        {legend}<RequiredStar visible={required} />
      </span>
      <div className="control-split-inputs">
        <label className={tone(leftModifier, focusedSide === 'left', leftModified)}>
          <span className="control-split-side-label" aria-hidden="true">{leftLabel}</span>
          <input
            aria-label={leftAriaLabel}
            type="number"
            min={min}
            max={max}
            value={leftDisplay}
            title={leftModified ? `Valor base: ${leftValue}; modificação: ${leftModifier > 0 ? '+' : ''}${leftModifier}` : undefined}
            onBlur={() => setFocusedSide(null)}
            onChange={(event) => onLeftChange(event.target.value)}
            onFocus={() => setFocusedSide('left')}
          />
          {focusedSide === 'left' && leftModified && (
            <span className={`control-effective-preview ${previewTone(leftModifier)}`} aria-hidden="true">
              ({effectiveLeft})
            </span>
          )}
        </label>
        <span className="control-split-divider" aria-hidden="true" />
        <label className={tone(rightModifier, focusedSide === 'right', rightModified)}>
          <span className="control-split-side-label" aria-hidden="true">{rightLabel}</span>
          <input
            aria-label={rightAriaLabel}
            type="number"
            min={min}
            max={max}
            value={rightDisplay}
            title={rightModified ? `Valor base: ${rightValue}; modificação: ${rightModifier > 0 ? '+' : ''}${rightModifier}` : undefined}
            onBlur={() => setFocusedSide(null)}
            onChange={(event) => onRightChange(event.target.value)}
            onFocus={() => setFocusedSide('right')}
          />
          {focusedSide === 'right' && rightModified && (
            <span className={`control-effective-preview ${previewTone(rightModifier)}`} aria-hidden="true">
              ({effectiveRight})
            </span>
          )}
        </label>
      </div>
    </div>
  );
};

const ControlApp = () => {
  const [state, setState] = useState<BattleState | null>(null);
  const [encounterEffects, setEncounterEffects] = useState<EncounterEffectsState>(
    initialEncounterEffectsState,
  );
  const [soundboard, setSoundboard] = useState<SoundboardState | null>(null);
  const [bossName, setBossName] = useState('');
  const [amount, setAmount] = useState('50');
  const [applyDamageReduction, setApplyDamageReduction] = useState(true);
  const [maxHealth, setMaxHealth] = useState('500');
  const [attack, setAttack] = useState('10');
  const [rangedAttack, setRangedAttack] = useState('10');
  const [skills, setSkills] = useState('10');
  const [defense, setDefense] = useState('10');
  const [rangedDefense, setRangedDefense] = useState('10');
  const [damageReduction, setDamageReduction] = useState('10');
  const [shield, setShield] = useState('0');
  const [actionDraft, setActionDraft] = useState('');
  const [selectedStatusId, setSelectedStatusId] = useState<StatusId | null>(null);
  const [statusDamage, setStatusDamage] = useState('');
  const [statusTurns, setStatusTurns] = useState('1');
  const [statusTooltip, setStatusTooltip] = useState<StatusTooltipState | null>(null);
  const [customStatusOpen, setCustomStatusOpen] = useState(false);
  const [customStatusName, setCustomStatusName] = useState('');
  const [customStatusDescription, setCustomStatusDescription] = useState('');
  const [customStatusDamage, setCustomStatusDamage] = useState('');
  const [customStatusTurns, setCustomStatusTurns] = useState('1');
  const [customStatusError, setCustomStatusError] = useState('');
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
  const activeStatusesById = useMemo(
    () => new Map(
      (activeBoss?.activeStatuses ?? []).map((status) => [status.statusId, status]),
    ),
    [activeBoss?.activeStatuses],
  );
  const automaticStatusEffects = encounterEffects.general.automaticStatusEffects;
  const derivedAttributes = useMemo(() => deriveStatusAttributes(
    {
      attack: numberFromDraft(attack, activeBoss?.attack ?? 0),
      rangedAttack: numberFromDraft(rangedAttack, activeBoss?.rangedAttack ?? 0),
      skills: numberFromDraft(skills, activeBoss?.skills ?? 0),
      meleeDefense: numberFromDraft(defense, activeBoss?.defense ?? 0),
      rangedDefense: numberFromDraft(
        rangedDefense,
        activeBoss?.rangedDefense ?? activeBoss?.defense ?? 0,
      ),
      damageReduction: numberFromDraft(
        damageReduction,
        activeBoss?.damageReduction ?? 0,
      ),
      shield: numberFromDraft(shield, activeBoss?.shield ?? 0),
    },
    activeBoss?.activeStatuses ?? [],
    automaticStatusEffects,
  ), [
    activeBoss?.activeStatuses,
    activeBoss?.attack,
    activeBoss?.damageReduction,
    activeBoss?.defense,
    activeBoss?.rangedAttack,
    activeBoss?.rangedDefense,
    activeBoss?.shield,
    activeBoss?.skills,
    attack,
    automaticStatusEffects,
    damageReduction,
    defense,
    rangedAttack,
    rangedDefense,
    shield,
    skills,
  ]);
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
        activeBoss.attack,
        activeBoss.rangedAttack,
        activeBoss.skills,
        activeBoss.defense,
        activeBoss.rangedDefense,
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
    setRangedDefense(String(activeBoss.rangedDefense));
    setDamageReduction(String(activeBoss.damageReduction));
    setShield(String(activeBoss.shield));
    setActionDraft(activeBoss.nextAction);
    setFormError('');
  }, [activeBoss, bossSource]);

  useEffect(() => {
    setSelectedStatusId(null);
    setStatusDamage('');
    setStatusTurns('1');
    setStatusTooltip(null);
    setCustomStatusOpen(false);
    setCustomStatusError('');
  }, [activeBoss?.id]);

  const selectedStatusDefinition = selectedStatusId
    ? getStatusDefinition(selectedStatusId)
    : null;
  const selectedActiveStatus = selectedStatusId
    ? activeStatusesById.get(selectedStatusId)
    : undefined;
  const canAdvanceTurn = Boolean(
    state?.battleStarted &&
    activeBoss?.setupStatus === 'ready' &&
    activeBoss.currentHealth > 0,
  );

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
      setCustomStatusName(activeStatus?.customName ?? '');
      setCustomStatusDescription(activeStatus?.customDescription ?? '');
      setCustomStatusDamage(activeStatus?.damageFormula ?? '');
      setCustomStatusTurns(String(activeStatus?.turnsRemaining ?? 1));
      setCustomStatusError('');
      setCustomStatusOpen(true);
    }
  };

  const applyStatus = () => {
    if (!activeBoss || !selectedStatusDefinition || !selectedStatusId) {
      setFormError('Selecione uma condição antes de aplicar.');
      return;
    }
    if (selectedStatusDefinition.customizable) {
      setCustomStatusOpen(true);
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
    window.bossAPI.dispatch({
      type: 'apply-status',
      bossId: activeBoss.id,
      statusId: selectedStatusId,
      damageFormula,
      turns,
    });
  };

  const applyCustomStatus = () => {
    if (!activeBoss) return;
    const name = customStatusName.trim();
    const description = customStatusDescription.trim();
    const turns = Number(customStatusTurns);
    if (!name || name.length > 60) {
      setCustomStatusError('Informe um nome de atÃ© 60 caracteres.');
      return;
    }
    if (!description || description.length > 300) {
      setCustomStatusError('Descreva o efeito em atÃ© 300 caracteres.');
      return;
    }
    if (!Number.isInteger(turns) || turns < 1 || turns > 999) {
      setCustomStatusError('Informe uma duraÃ§Ã£o entre 1 e 999 turnos.');
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
    window.bossAPI.dispatch({
      type: 'apply-status',
      bossId: activeBoss.id,
      statusId: 'coringa',
      damageFormula,
      turns,
      customName: name,
      customDescription: description,
    });
    setCustomStatusOpen(false);
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

  const startTurn = () => {
    if (!activeBoss) return;
    setFormError('');
    window.bossAPI.dispatch({ type: 'start-turn', bossId: activeBoss.id });
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

  const applyIdentity = (event: FormEvent) => {
    event.preventDefault();
    if (!activeBoss) return;
    const numericDrafts = {
      maxHealth: Number(maxHealth),
      attack: Number(attack),
      rangedAttack: Number(rangedAttack),
      skills: Number(skills),
      defense: Number(defense),
      rangedDefense: Number(rangedDefense),
      damageReduction: Number(damageReduction),
      shield: Number(shield),
    };
    const hasEmptyAttribute = [
      maxHealth,
      attack,
      rangedAttack,
      skills,
      defense,
      rangedDefense,
      damageReduction,
      shield,
    ].some((value) => !value.trim());
    if (
      !bossName.trim() ||
      hasEmptyAttribute ||
      Object.values(numericDrafts).some((value) => !Number.isFinite(value)) ||
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
      ...numericDrafts,
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
        damageReduction:
          authoritativeAttributes?.values.damageReduction ?? activeBoss.damageReduction,
      })
    : null;
  const damagingHits = parsedAmount && activeBoss
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
        <div className="control-vitals">
          <div className="health-difference" title="Diferença entre a vida atual e a vida máxima">
            <span>PV</span><strong>{activeBoss.currentHealth}/{activeBoss.maxHealth}</strong><small>−{missingHealth}</small>
          </div>
          <span className="control-vitals-divider" aria-hidden="true" />
          <span className="control-turn-meter">Turno <strong>{activeBoss.turnCount}</strong></span>
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
          <NumericField
            id="control-max-health"
            label="Vida máx."
            value={maxHealth}
            min={1}
            max={1_000_000}
            required={identityRequired}
            onChange={(value) => updateIdentity(setMaxHealth, value)}
          />
          <SplitNumericField
            id="control-attacks"
            legend="Ataque / Tiro"
            leftLabel="Atq."
            rightLabel="Tiro"
            leftAriaLabel="Ataque corpo a corpo"
            rightAriaLabel="Ataque à distância"
            leftValue={attack}
            rightValue={rangedAttack}
            effectiveLeft={derivedAttributes.values.attack}
            effectiveRight={derivedAttributes.values.rangedAttack}
            leftModifier={derivedAttributes.modifiers.attack}
            rightModifier={derivedAttributes.modifiers.rangedAttack}
            min={-999}
            required={identityRequired}
            onLeftChange={(value) => updateIdentity(setAttack, value)}
            onRightChange={(value) => updateIdentity(setRangedAttack, value)}
          />
          <NumericField
            id="control-skills"
            label="Perícias"
            value={skills}
            min={-999}
            effectiveValue={derivedAttributes.values.skills}
            modifier={derivedAttributes.modifiers.skills}
            required={identityRequired}
            onChange={(value) => updateIdentity(setSkills, value)}
          />
          <SplitNumericField
            id="control-defenses"
            legend="Defesa"
            leftLabel="CaC"
            rightLabel="AaD"
            leftAriaLabel="Defesa corpo a corpo"
            rightAriaLabel="Defesa contra ataques à distância"
            leftValue={defense}
            rightValue={rangedDefense}
            effectiveLeft={derivedAttributes.values.meleeDefense}
            effectiveRight={derivedAttributes.values.rangedDefense}
            leftModifier={derivedAttributes.modifiers.meleeDefense}
            rightModifier={derivedAttributes.modifiers.rangedDefense}
            min={0}
            required={identityRequired}
            onLeftChange={(value) => updateIdentity(setDefense, value)}
            onRightChange={(value) => updateIdentity(setRangedDefense, value)}
          />
          <NumericField
            id="control-damage-reduction"
            label="RD"
            value={damageReduction}
            effectiveValue={derivedAttributes.values.damageReduction}
            modifier={derivedAttributes.modifiers.damageReduction}
            required={identityRequired}
            onChange={(value) => updateIdentity(setDamageReduction, value)}
          />
          <NumericField
            id="control-shield"
            label="Escudo"
            value={shield}
            effectiveValue={derivedAttributes.values.shield}
            modifier={derivedAttributes.modifiers.shield}
            required={identityRequired}
            onChange={(value) => updateIdentity(setShield, value)}
          />
          <button className="control-apply" type="submit">Aplicar</button>
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

              <div className="control-turn-controls">
                <button
                  className="control-start-turn"
                  type="button"
                  disabled={!canAdvanceTurn}
                  data-disabled-reason={
                    !state.battleStarted
                      ? 'Inicie a batalha primeiro'
                      : activeBoss.setupStatus !== 'ready'
                        ? 'Salve os dados deste chefão'
                        : 'Chefão derrotado não inicia turno'
                  }
                  title={
                    !state.battleStarted
                      ? 'Inicie a batalha para avançar os turnos.'
                      : activeBoss.setupStatus !== 'ready'
                        ? 'Salve os dados deste chefão antes de incluí-lo na luta.'
                        : activeBoss.currentHealth <= 0
                          ? 'Um chefão derrotado não pode iniciar um turno.'
                          : undefined
                  }
                  onClick={startTurn}
                >
                  Iniciar turno
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
        </div>

        <div className="control-soundboard-row">
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
          <div className="control-soundboard-volume">
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
          </div>
        </div>
      </form>
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
      {customStatusOpen && (
        <div className="control-modal-backdrop" role="presentation">
          <section className="control-status-modal" role="dialog" aria-modal="true" aria-labelledby="custom-status-title">
            <header>
              <img src={statusIconUrl('status-36-coringa.png')} alt="" />
              <div>
                <h2 id="custom-status-title">Status personalizado</h2>
              </div>
            </header>
            <label>
              <span>Nome do status</span>
              <input autoFocus maxLength={60} value={customStatusName} onChange={(event) => setCustomStatusName(event.target.value)} placeholder="Ex.: Marcado pela tormenta" />
            </label>
            <label>
              <span>Descrição do efeito</span>
              <textarea maxLength={300} rows={3} value={customStatusDescription} onChange={(event) => setCustomStatusDescription(event.target.value)} placeholder="Explique brevemente o que esta condição faz." />
            </label>
            <div className="control-status-modal-values">
              <label>
                <span>Dano por turno <small>(opcional)</small></span>
                <input maxLength={128} value={customStatusDamage} onChange={(event) => setCustomStatusDamage(event.target.value)} placeholder="Ex.: 1d6 + 2d8 + 10" />
              </label>
              <label>
                <span>Turnos</span>
                <input type="number" min={1} max={999} value={customStatusTurns} onChange={(event) => setCustomStatusTurns(event.target.value)} />
              </label>
            </div>
            {customStatusError && <p className="control-status-modal-error" role="alert">{customStatusError}</p>}
            <footer>
              <button type="button" className="control-status-modal-cancel" onClick={() => setCustomStatusOpen(false)}>Cancelar</button>
              <button type="button" className="control-status-modal-apply" onClick={applyCustomStatus}>Aplicar</button>
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
