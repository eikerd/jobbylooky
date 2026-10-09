import { Component, computed, input, output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { Opportunity, RejectRule, RuleField, RuleMode } from './models';
import { ageHeat, ageInDays } from './age';
import { compileRule, DEFAULT_TESTER_SORT, keptMatches, matchSnippet, nextTesterSort, sortTester, testerRows, type TesterKey } from './reject-rules';

export interface RuleDraft { id: string | null; name: string; pattern: string; field: RuleField }
type RuleKey = 'name' | 'pattern' | 'field' | 'mode';

/** Auto-reject rules and their tester. The tester only reads: it never changes or deletes mail. */
@Component({
  selector: 'app-rules',
  imports: [DatePipe, FormsModule],
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

  readonly editingId = signal<string | null>(null);
  readonly name = signal('');
  readonly pattern = signal('');
  readonly field = signal<RuleField>('any');
  readonly pasted = signal('');

  readonly compiled = computed(() => compileRule(this.pattern()));
  readonly matches = computed(() => testerRows(this.rows(), this.compiled().regex, this.field()));
  readonly kept = computed(() => keptMatches(this.matches()));
  readonly pastedMatch = computed(() => {
    const regex = this.compiled().regex;
    return regex && this.pasted().trim() ? matchSnippet(regex, this.pasted()) : null;
  });

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

  ageLabel(receivedAt: string) {
    const days = ageInDays(receivedAt);
    return days === null ? 'Age unknown' : `${days} ${days === 1 ? 'day' : 'days'} old`;
  }
  ageColor(receivedAt: string) {
    return ageHeat(ageInDays(receivedAt));
  }
  canSave() {
    return !this.busy() && this.name().trim().length > 0 && this.compiled().regex !== null;
  }
  submit() {
    if (!this.canSave()) return;
    this.save.emit({ id: this.editingId(), name: this.name().trim(), pattern: this.pattern().trim(), field: this.field() });
  }
  /** Called by the page once the server has stored the rule. */
  clear() {
    this.editingId.set(null);
    this.name.set('');
    this.pattern.set('');
    this.field.set('any');
  }
  edit(rule: RejectRule) {
    this.editingId.set(rule.id);
    this.name.set(rule.name);
    this.pattern.set(rule.pattern);
    this.field.set(rule.field);
  }
  toggleMode(rule: RejectRule) {
    const mode: RuleMode = rule.mode === 'live' ? 'test' : 'live';
    if (mode === 'live' && !window.confirm(`Make "${rule.name}" live? New mail it matches will be passed and deleted from Gmail.`)) return;
    this.setMode.emit({ rule, mode });
  }
  confirmRemove(rule: RejectRule) {
    if (window.confirm(`Delete the rule "${rule.name}"? Mail it already passed stays passed.`)) this.remove.emit(rule);
  }
}
