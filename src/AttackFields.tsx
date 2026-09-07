import { ATTACK_RANGES, DAMAGE_TYPES, METRIC_RANGES, parseAttackRange } from './shared/attack-options';

export function DamageTypeField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <select aria-label="Tipo de dano" value={value} onChange={(event) => onChange(event.target.value)}>
    {!DAMAGE_TYPES.some((type) => type === value) && <option value={value}>{value || 'Selecione'}</option>}
    {DAMAGE_TYPES.map((type) => <option key={type}>{type}</option>)}
  </select>;
}
export function AttackRangeField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { kind, meters } = parseAttackRange(value);
  const metric = METRIC_RANGES.includes(kind);
  return <span className="attack-range-fields">
    <select aria-label="Alcance" value={kind} onChange={(event) => onChange(METRIC_RANGES.includes(event.target.value) ? `${event.target.value} ${meters}m` : event.target.value)}>
      {!ATTACK_RANGES.some((range) => range === kind) && <option value={kind}>{kind || 'Selecione'}</option>}
      {ATTACK_RANGES.map((range) => <option key={range}>{range}</option>)}
    </select>
    {metric && <input aria-label="Alcance em metros" type="text" inputMode="numeric" value={meters} onChange={(event) => { if (/^\d{1,4}$/.test(event.target.value)) onChange(`${kind} ${Math.max(1, Number(event.target.value))}m`); }} />}
  </span>;
}
