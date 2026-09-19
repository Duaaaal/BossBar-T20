import { createHash } from 'node:crypto';
import type { CharacterSheetIssue, CharacterSheetEditorField } from '../shared/character-sheet.ts';

/** Unknown data and calculation/migration warnings always require review. */
export const reviewableSheetIssues = (issues: CharacterSheetIssue[], fields: CharacterSheetEditorField[]) => {
  const values = new Map(fields.map(({ name, value }) => [name, value]));
  return issues.map((issue) => ({
    ...issue,
    dismissible: issue.severity === 'warning' && (Boolean(issue.comparison) || issue.id.startsWith('catalog:ability-alias:') || issue.id.startsWith('attributes:limit:')),
    fingerprint: createHash('sha256').update(JSON.stringify([
      issue.id, issue.message, issue.expected, issue.actual, issue.source,
      issue.field ? values.get(issue.field) : null,
    ])).digest('hex'),
  }));
};

export const visibleSheetIssues = (issues: CharacterSheetIssue[], dismissed: Record<string, string>) =>
  issues.filter((issue) => !issue.dismissible || dismissed[issue.id] !== issue.fingerprint);
