import { ATTRIBUTES, ATTRIBUTE_PLAN_FIELD, attributePlanIssues, parseAttributePlan } from './character-attributes.ts';
import { characterClassIssues } from './character-classes.ts';
import { characterResources } from './character-resources.ts';

/** Readiness is about calculations. Missing narrative choices stay in the review. */
export const sheetReadyForAutomaticValidation = (values: Record<string, string>) => {
  if (!values['RAÇA']?.trim() || !values.CLASSE?.trim() || characterClassIssues(values).length || !characterResources(values)) return false;
  if (ATTRIBUTES.some(([code]) => !/^[+-]?\d+$/.test(values['Mod' + code] ?? ''))) return false;
  const plan = parseAttributePlan(values[ATTRIBUTE_PLAN_FIELD]);
  if (!plan) return false;
  return !attributePlanIssues(values).some(({ severity, id }) => severity === 'error' || id === 'attributes:budget' || id === 'attributes:unknown' || id.startsWith('attributes:choice:') || id.startsWith('attributes:source:'));
};

/** One request in flight, coalesced edits, and no stale result after edit/close/switch. */
export class SheetAutoValidation<T> {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private revision = 0;
  private running = false;
  private idleWaiters = new Set<() => void>();
  private lastStarted = 0;
  private latest: { value: T; key: string } | undefined;
  private completedKey = '';
  private readonly options: {
    validate: (value: T) => Promise<void | (() => void)>;
    error: (error: unknown) => void;
    delay?: number;
    interval?: number;
  };
  constructor(options: SheetAutoValidation<T>['options']) { this.options = options; }
  cancel() { this.revision++; this.latest = undefined; clearTimeout(this.timer); this.completedKey = ''; }
  async cancelAndWait() {
    this.cancel();
    if (this.running) await new Promise<void>(resolve => this.idleWaiters.add(resolve));
  }
  schedule(value: T, key: string) {
    if (this.latest?.key === key || this.completedKey === key) return;
    this.latest = { value, key }; this.revision++;
    this.queue();
  }
  private queue() {
    clearTimeout(this.timer);
    if (!this.latest || this.running) return;
    const wait = Math.max(this.options.delay ?? 500, (this.options.interval ?? 2000) - (Date.now() - this.lastStarted));
    this.timer = setTimeout(() => void this.run(), wait);
  }
  private async run() {
    const snapshot = this.latest; if (!snapshot || this.running) return;
    const revision = this.revision; this.running = true; this.lastStarted = Date.now();
    try {
      const apply = await this.options.validate(snapshot.value);
      if (this.revision === revision) { this.completedKey = snapshot.key; this.latest = undefined; apply?.(); }
    } catch (error) { if (this.revision === revision) { this.latest = undefined; this.options.error(error); } }
    finally { this.running = false; for (const resolve of this.idleWaiters) resolve(); this.idleWaiters.clear(); this.queue(); }
  }
}
