import { ATTRIBUTES, attributeSourceTotals, type AttributePlan, type AttributeCode } from './character-attributes.ts';

export const attributeCalculationDescription = (plan: AttributePlan, code: AttributeCode) => {
  const source = attributeSourceTotals(plan, code); const bonus = source.race + source.permanent + source.temporary;
  const base = plan.base[code].trim() && Number.isFinite(Number(plan.base[code])) ? Number(plan.base[code]) : null;
  return `${ATTRIBUTES.find(([key]) => key === code)![1]} = ${base ?? '?'} (base) + ${source.race} (fontes) + ${source.permanent} (permanentes) + ${source.temporary} (temporários) = ${base === null ? 'a confirmar' : base + bonus}`;
};
