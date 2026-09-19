/** Normalize a numeric zero without rewriting formulas, names or unknown values. */
export const normalizeSheetNumber = (value: string) => /^[+−-]?0+(?:[.,]0+)?$/.test(value.trim()) ? '0' : value;
