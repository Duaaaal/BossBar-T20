/** Tormenta20 Jogo do Ano, pp. 143, 224–225 and 230. */
export const DAMAGE_TYPES = ['Ácido', 'Corte', 'Eletricidade', 'Essência', 'Fogo', 'Frio', 'Impacto', 'Luz', 'Perfuração', 'Psíquico', 'Trevas'] as const;
export const ATTACK_RANGES = ['Adjacente', 'Pessoal', 'Toque', 'Curto (9m)', 'Médio (30m)', 'Longo (90m)', 'Ilimitado', 'Raio', 'Cone', 'Linha', 'Cilindro', 'Esfera', 'Quadrado', 'Cubo'] as const;
export const METRIC_RANGES: readonly string[] = ['Raio', 'Cone', 'Linha', 'Cilindro', 'Esfera', 'Quadrado', 'Cubo'];
const normalizeLabel = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
export const normalizeDamageType = (value: string): string | null => {
  const normalized = normalizeLabel(value);
  const aliases: Record<string, string> = { cortante: 'Corte', perfurante: 'Perfuração', contundente: 'Impacto', eletrico: 'Eletricidade' };
  return DAMAGE_TYPES.find((type) => normalizeLabel(type) === normalized) ?? aliases[normalized] ?? null;
};
export const normalizeAttackRange = (value: string): string | null => {
  const normalized = normalizeLabel(value).replace(/\s*(\d+)\s*m\b/g, '$1m');
  const exact = ATTACK_RANGES.find((range) => normalizeLabel(range).replace(/\s*(\d+)\s*m\b/g, '$1m') === normalized);
  if (exact) return exact;
  const aliases: Record<string, string> = { 'corpo a corpo': 'Adjacente', curto: 'Curto (9m)', medio: 'Médio (30m)', longo: 'Longo (90m)', '9m': 'Curto (9m)', '30m': 'Médio (30m)', '90m': 'Longo (90m)', '1,5m': 'Adjacente', '1.5m': 'Adjacente' };
  if (aliases[normalized]) return aliases[normalized];
  const metric = /^(raio|cone|linha|cilindro|esfera|quadrado|cubo)\s*(\d{1,4})m$/.exec(normalized);
  return metric && Number(metric[2]) > 0 ? `${METRIC_RANGES.find((range) => normalizeLabel(range) === metric[1])} ${Number(metric[2])}m` : null;
};
export const parseAttackRange = (value: string) => {
  const match = /^(Raio|Cone|Linha|Cilindro|Esfera|Quadrado|Cubo)(?:\s+(\d+)m)?$/.exec(value);
  return match ? { kind: match[1], meters: Number(match[2] ?? 1) } : { kind: value, meters: 1 };
};
