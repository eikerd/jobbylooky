import { Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { Opportunity, RejectRule, RuleField, RuleMode } from './models';
import { Age } from './age.component';
import { TesterRuns } from './tester-runs';
import { compileRule, DEFAULT_TESTER_SORT, draftUnsaved, keptMatches, nextTesterSort, runTester, sortTester, type TesterKey, type RuleFields, type TesterResult, type TesterRow } from './reject-rules';

export interface RuleDraft { id: string | null; name: string; pattern: string; field: RuleField }
type RuleKey = 'name' | 'pattern' | 'field' | 'mode';

/** A tester run longer than this is a runaway regex: the worker is killed and the page stays live. */
const TESTER_DEADLINE_MS = 1500;
const TESTER_DEBOUNCE_MS = 150;

// The draft outlives the view: leaving Rules for a folder and coming back keeps what was typed.
const draft = {
  editingId: signal<string | null>(null),
  name: signal(''),
  pattern: signal(''),
  field: signal<RuleField>('any'),
  pasted: signal(''),
  /** The saved rule's fields as loaded for editing, to tell an edit from an untouched rule. */
  loaded: signal<RuleFields | null>(null),
};
/** For the page's unload guard: a rule typed or edited but not saved. */
export const hasRuleDraft = () =>
  draftUnsaved({ name: draft.name(), pattern: draft.pattern(), field: draft.field() }, draft.loaded());

/** Auto-reject rules and their tester. The tester only reads: it never changes or deletes mail. */
@Component({
  selector: 'app-rules',
  imports: [DatePipe, FormsModule, Age],
  templateUrl: './rules.html',
  styleUrl: './rules.css',
})
export class Rules {
  readonly rows = input.required<Opportunity[]>();
  readonly rules = input.required<RejectRule[]>();
  readonly busy = input(false);
  readonly save = output<RuleDraft>();
  readonly setMode = output<{ rule: RejectRule; mode: RuleMode }>();
  readonly remove = output<RejectRule>();
  readonly openPitch = output<string>();

  readonly fieldLabels: Record<RuleField, string> = { any: 'Subject + body', subject: 'Subject', body: 'Body' };
  readonly fields: RuleField[] = ['any', 'subject', 'body'];

  readonly editingId = draft.editingId;
  readonly name = draft.name;
  readonly pattern = draft.pattern;
  readonly field = draft.field;
  readonly pasted = draft.pasted;

  readonly compiled = computed(() => compileRule(this.pattern()));
  /** The latest finished tester run; null while there is no valid pattern or after a runaway. */
  readonly result = signal<TesterResult | null>(null);
  readonly tooSlow = signal(false);
  /** The pattern and field the last finished tester run covered; Save waits for the current pair. */
  private readonly testedFor = signal('');
  /** A tester run is scheduled or running; any input (pattern, field, pasted text, mail) can start one. */
  private readonly testing = signal(false);
  private pendingKey = '';
  private readonly draftKey = computed(() => `${this.field()}\n${this.pattern()}`);
  readonly matches = computed<TesterRow[]>(() => {
    const byId = new Map(this.rows().map((row) => [row.id, row]));
    return (this.result()?.hits ?? []).flatMap(({ id, snippet }) => {
      const pitch = byId.get(id);
      return pitch ? [{ pitch, snippet }] : [];
    });
  });
  readonly kept = computed(() => keptMatches(this.matches()));
  readonly pastedMatch = computed(() => this.result()?.pasted ?? null);

  private worker: Worker | null = null;
  private sentRows: Opportunity[] | null = null;
  private readonly runs = new TesterRuns(TESTER_DEADLINE_MS);
  private debounce: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    effect(() => {
      const job = { rows: this.rows(), pattern: this.pattern(), field: this.field(), pasted: this.pasted(), valid: this.compiled().regex !== null, key: this.draftKey() };
      clearTimeout(this.debounce);
      // Any new input makes an in-flight run stale at once, before the debounce fires its replacement.
      this.runs.invalidate();
      untracked(() => this.testing.set(true));
      this.debounce = setTimeout(() => this.test(job), TESTER_DEBOUNCE_MS);
    });
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.debounce);
      this.runs.end();
      this.worker?.terminate();
    });
  }

  /** Runs the tester in a worker with a deadline; a regex that backtracks forever cannot hang the page. */
  private test(job: { rows: Opportunity[]; pattern: string; field: RuleField; pasted: string; valid: boolean; key: string }) {
    this.pendingKey = job.key;
    this.tooSlow.set(false);
    if (!job.valid) {
      // A runaway from the previous pattern would otherwise keep a CPU core busy until the tab closes.
      if (this.runs.running) this.stopWorker();
      this.testing.set(false);
      return this.result.set(null);
    }
    if (typeof Worker === 'undefined') {
      this.result.set(runTester(job.rows, job.pattern, job.field, job.pasted));
      this.testing.set(false);
      return this.testedFor.set(job.key);
    }
    // A run still going is the old pattern's runaway, or soon stale: replace the worker.
    if (this.runs.running) this.stopWorker();
    if (!this.worker) {
      this.worker = new Worker(new URL('./tester.worker', import.meta.url), { type: 'module' });
      this.worker.onmessage = ({ data }) => {
        // A stale reply still ends its run, so its deadline cannot fire; only the current run shows.
        if (!this.runs.finish(data.seq)) return;
        this.result.set(data.result);
        this.testedFor.set(this.pendingKey);
        this.testing.set(false);
      };
    }
    if (this.sentRows !== job.rows) {
      this.worker.postMessage({ type: 'rows', rows: job.rows.map(({ id, subject, body }) => ({ id, subject, body })) });
      this.sentRows = job.rows;
    }
    const seq = this.runs.start((current) => {
      // A run past its deadline is a runaway either way; only the current one reports it.
      this.stopWorker();
      if (!current) return;
      this.result.set(null);
      this.tooSlow.set(true);
      this.testing.set(false);
    });
    this.worker.postMessage({ type: 'run', seq, pattern: job.pattern, field: job.field, pasted: job.pasted });
  }
  private stopWorker() {
    this.worker?.terminate();
    this.worker = null;
    this.sentRows = null;
    this.runs.end();
  }

  readonly testerColumns: { key: TesterKey; label: string }[] = [
    { key: 'received', label: 'Received' },
    { key: 'title', label: 'Job' },
    { key: 'sender', label: 'Sender' },
    { key: 'status', label: 'Status' },
    { key: 'fit', label: 'Fit' },
    { key: 'match', label: 'Match' },
  ];
  readonly testerSort = signal(DEFAULT_TESTER_SORT);
  readonly sortedMatches = computed(() => sortTester(this.matches(), this.testerSort()));
  sortTesterBy(key: TesterKey) {
    this.testerSort.update((sort) => nextTesterSort(sort, key));
  }
  testerAria(key: TesterKey) {
    const sort = this.testerSort();
    return sort.key !== key ? 'none' : sort.dir === 'asc' ? 'ascending' : 'descending';
  }

  readonly ruleColumns: { key: RuleKey; label: string }[] = [
    { key: 'name', label: 'Rule' },
    { key: 'pattern', label: 'Pattern' },
    { key: 'field', label: 'Looks in' },
    { key: 'mode', label: 'Mode' },
  ];
  readonly ruleSort = signal<{ key: RuleKey; dir: 'asc' | 'desc' }>({ key: 'name', dir: 'asc' });
  readonly sortedRules = computed(() => {
    const { key, dir } = this.ruleSort();
    const value = (rule: RejectRule) => (key === 'field' ? this.fieldLabels[rule.field] : rule[key]).toLowerCase();
    return [...this.rules()].sort((a, b) => value(a).localeCompare(value(b)) * (dir === 'asc' ? 1 : -1));
  });
  sortRulesBy(key: RuleKey) {
    this.ruleSort.update((sort) => ({ key, dir: sort.key === key && sort.dir === 'asc' ? 'desc' : 'asc' }));
  }
  ruleAria(key: RuleKey) {
    const sort = this.ruleSort();
    return sort.key !== key ? 'none' : sort.dir === 'asc' ? 'ascending' : 'descending';
  }

  canSave() {
    // A pattern saves only once the tester has run it over stored mail without timing out:
    // pressing Enter during the debounce or the run must not save a runaway the server probes miss.
    return !this.busy() && !this.tooSlow() && !this.testing() && this.testedFor() === this.draftKey() && this.name().trim().length > 0 && this.compiled().regex !== null;
  }
  submit() {
    if (!this.canSave()) return;
    this.save.emit({ id: this.editingId(), name: this.name().trim(), pattern: this.pattern().trim(), field: this.field() });
  }
  /** Called by the page once the server has stored the rule. */
  clear() {
    this.editingId.set(null);
    draft.loaded.set(null);
    this.name.set('');
    this.pattern.set('');
    this.field.set('any');
  }
  edit(rule: RejectRule) {
    // Loading another rule replaces the draft; unsaved work there is the owner's to discard.
    if (this.editingId() !== rule.id && hasRuleDraft() && !window.confirm('Discard the unsaved rule you were editing?')) return;
    this.editingId.set(rule.id);
    draft.loaded.set({ name: rule.name, pattern: rule.pattern, field: rule.field });
    this.name.set(rule.name);
    this.pattern.set(rule.pattern);
    this.field.set(rule.field);
  }
  toggleMode(rule: RejectRule) {
    const mode: RuleMode = rule.mode === 'live' ? 'test' : 'live';
    // Go live switches the saved rule; the edited pattern in the tester would not be what goes live.
    if (mode === 'live' && this.editingId() === rule.id && hasRuleDraft()) {
      window.alert(`Save or cancel your edits to "${rule.name}" first. Go live uses the saved pattern, not the one you are testing.`);
      return;
    }
    if (mode === 'live' && !window.confirm(`Make "${rule.name}" live? New mail it matches will be passed and deleted from Gmail.`)) return;
    this.setMode.emit({ rule, mode });
  }
  confirmRemove(rule: RejectRule) {
    if (window.confirm(`Delete the rule "${rule.name}"? Mail it already passed stays passed.`)) this.remove.emit(rule);
  }
}
