import { Component, computed, signal, OnDestroy, ElementRef, viewChild } from '@angular/core';
import { mapLocations } from './location-map';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ageText, daysSince } from './age';
import { phoneText, telHref } from './phone';
import { Age } from './age.component';
import { conversationHeat, conversationState, planDecision, type ConversationHeat, type GroupDecision } from './conversation';
import { conversationIndex, interactions } from './interactions';
import { newestFirst, quoteStart, threadOf, type ThreadNode } from './thread';
import { ConvoHeat } from './convo-heat.component';
import { Rules, hasRuleDraft, type RuleDraft } from './rules.component';
import { DEFAULT_RELATED_SORT, RELATED_COLUMNS, nextRelatedSort, relatedRows, sortRelated, type RelatedKey } from './related-grid';
import { formatEmailBody, urlRows } from './email-body';
import { daysUp, jobState } from './link-state';
import type { RejectRule, RuleMode, Opportunity, JobGroup, TrackedPhrase, PhraseKind, PitchVoicemail, LinkCheck, DeletePreview, DeletePhrase, Client } from './models';
import { Highlight } from './highlight.component';
import { Profiles } from './profiles.component';
import { SourceIcon } from './source-icon.component';
import { CrayonPicker } from './crayon-picker.component';
import { DEFAULT_PHRASE_COLORS, phraseColorStyle } from './crayons';
import { PlaceLinks } from './place-links.component';
import { SelectionPhrase } from './selection-phrase.component';
import { Postings } from './postings.component';
import { Clients, clearClientDraft, hasClientDraft } from './clients.component';
import { clientLabel, clientsByPitch, fingerprintKey } from './clients';
import { ConvoTrail } from './convo-trail.component';
import { folderRows } from './folder';

interface Connection {
  configured: boolean;
  syncing: boolean;
  error: string;
  lastSync: string | null;
  canReply?: boolean;
  replyPreview?: boolean;
}
type Folder = 'Inbox' | 'Pursuing' | 'Maybe' | 'Passed' | 'All opportunities';
type TrashOutcome = 'deleted' | 'gone' | 'preview' | 'skipped' | 'failed';
const TRASH_TOASTS: Partial<Record<TrashOutcome, string>> = {
  deleted: 'Deleted from Gmail',
  gone: 'Already gone from Gmail',
  preview: 'Preview: Gmail not touched',
};

@Component({
  selector: 'app-root',
  imports: [FormsModule, DatePipe, NgTemplateOutlet, Profiles, SourceIcon, Highlight, PlaceLinks, CrayonPicker, SelectionPhrase, Postings, Clients, Rules, Age, ConvoTrail, ConvoHeat],
  templateUrl: './app.html',
  styleUrls: ['./theme.css', './app.css', './groups.css', './phrases.css', './reply.css', './thread.css', './toast.css', './bulk.css', './voicemail.css', './links.css'],
  // Each kind's crayon becomes --<kind>-mark/-soft/-ink, inherited by highlights in every child component.
  host: { '[style]': 'phraseStyle()' },
})
export class App implements OnDestroy {
  readonly locationMaps = computed(() => mapLocations(this.selected()?.location || ''));
  readonly detailPane = viewChild<ElementRef<HTMLElement>>('detailPane');
  readonly folders: Folder[] = ['Inbox', 'Pursuing', 'Maybe', 'Passed', 'All opportunities'];
  readonly statuses = ['New', 'Pursue', 'Maybe', 'Applied', 'Interviewing', 'Offer', 'Passed'];
  readonly jobGroups = signal<JobGroup[]>([]);
  readonly opportunities = computed(() => this.jobGroups().flatMap(group => group.pitches));
  /** Each pitch's job conversation heat, counted once per change rather than on every render. */
  /** Every pitch indexed for following conversations, built once per change and shared by every card. */
  readonly conversationIndex = computed(() => conversationIndex(this.opportunities()));
  readonly heatByPitch = computed(() => {
    const all = this.conversationIndex();
    const heat = new Map<string, ConversationHeat>();
    for (const group of this.jobGroups()) {
      // Most jobs have no conversation: only those pay for following their emails.
      const state = conversationState(group.pitches);
      const found = state && conversationHeat(state, interactions(group.pitches, all));
      if (found) for (const pitch of group.pitches) heat.set(pitch.id, found);
    }
    return heat;
  });
  readonly linking = signal(false);
  linkTarget = '';
  readonly folder = signal<Folder>('Inbox');
  readonly directoryMode = signal<'recruiters' | 'companies' | 'clients' | 'phrases' | 'deletes' | 'postings' | 'rules' | null>(null);
  readonly clients = signal<Client[]>([]);
  /** The client each pitch is known to be for, by the cities its location names. */
  readonly clientByPitch = computed(() => clientsByPitch(this.opportunities(), this.clients()));
  readonly clientLabel = clientLabel;
  /** The owner's delete phrases, apart from the tracked ones; mail carrying one goes to Gmail Trash. */
  readonly deletePhrases = signal<DeletePhrase[]>([]);
  readonly deleteSortDir = signal<'asc' | 'desc'>('asc');
  readonly sortedDeletePhrases = computed(() => {
    const dir = this.deleteSortDir() === 'asc' ? 1 : -1;
    return [...this.deletePhrases()].sort((a, b) => dir * a.phrase.localeCompare(b.phrase, undefined, { sensitivity: 'base' }));
  });
  deletePhraseDraft = '';
  /** Set from Add until the check is answered, so a second press never opens a second check. */
  readonly checkingDelete = signal(false);
  readonly rejectRules = signal<RejectRule[]>([]);
  readonly rulesView = viewChild(Rules);
  readonly profileMode = computed(() => {
    const mode = this.directoryMode();
    return mode === 'recruiters' || mode === 'companies' ? mode : null;
  });
  readonly phrases = signal<TrackedPhrase[]>([]);
  readonly phraseKinds: PhraseKind[] = ['negative', 'positive', 'neutral', 'purple', 'pink'];
  readonly phraseKindLabels: Record<PhraseKind, string> = { negative: 'Negative', positive: 'Positive', neutral: 'Neutral', purple: 'Purple', pink: 'Pink' };
  readonly phraseColors = signal<Record<PhraseKind, string>>(DEFAULT_PHRASE_COLORS);
  readonly phraseStyle = computed(() => phraseColorStyle(this.phraseColors()));
  readonly phraseKindMarks: Record<PhraseKind, string> = { negative: '×', positive: '✓', neutral: '•', purple: '•', pink: '•' };
  readonly openPhraseId = signal('');
  /** Pitches per phrase id, from the reasons the server recorded, newest first. */
  readonly phraseMatches = computed(() => {
    const byPhrase = new Map<string, Opportunity[]>();
    const rows = [...this.opportunities()].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
    for (const tracked of this.phrases()) {
      const key = tracked.phrase.toLowerCase();
      byPhrase.set(tracked.id, rows.filter((row) => row.reasons.some((reason) => reason.phrase?.toLowerCase() === key)));
    }
    return byPhrase;
  });
  phraseDraft = '';
  readonly replying = signal(false);
  replyDraft = '';
  readonly replyTo = signal('');
  private replyTemplate = '';
  /** Set while the composer will attach the resume folder's newest file. */
  readonly replyResume = signal('');
  phraseKind: PhraseKind = 'negative';
  readonly profileFocus = signal('');
  readonly selectedId = signal('');
  /** Pitches ticked in the queue for a bulk Pass, apart from the one open in the detail pane. */
  readonly emptyChecked: ReadonlySet<string> = new Set();
  readonly checked = signal<ReadonlySet<string>>(this.emptyChecked);
  readonly connection = signal<Connection | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  /** Short-lived confirmations; each removes itself. */
  readonly toasts = signal<{ id: number; text: string }[]>([]);
  private toastId = 0;
  /** Gmail deletes are collected one at a time, in the order they were passed. */
  private trashWait: Promise<void> = Promise.resolve();
  /** While a Pass is saving, a poll could read the list from before it and show the pitch again. */
  private passesSaving = 0;
  /** Pitches whose Gmail delete failed, listed together while the banner still shows them. */
  private trashFailures: string[] = [];
  private trashFailureText = '';
  readonly adding = signal(false);
  readonly dirty = signal(false);
  notes = '';
  nextAction = '';
  followUp = '';
  editStatus = 'New';
  importSubject = '';
  importFrom = '';
  importBody = '';
  private poll: ReturnType<typeof setInterval>;
  private revision = 0;
  /**
   * Voicemails marked seen in this page ("pitchId voicemailId"). A poll that read the server just
   * before the seen request committed cannot make them unseen again; a voicemail that arrives later can.
   */
  private readonly seenHere = new Set<string>();
  private withSeenHere(groups: JobGroup[]): JobGroup[] {
    if (!this.seenHere.size) return groups;
    const apply = (row: Opportunity): Opportunity => {
      if (!row.voicemails?.some((item) => !item.seen && this.seenHere.has(`${row.id} ${item.id}`))) return row;
      const voicemails = row.voicemails.map((item) => (this.seenHere.has(`${row.id} ${item.id}`) ? { ...item, seen: true } : item));
      return { ...row, voicemails, voicemailUnseen: voicemails.some((item) => !item.seen) };
    };
    return groups.map((group) => ({ ...group, pitches: group.pitches.map(apply) }));
  }
  readonly visible = computed(() => folderRows(this.jobGroups(), this.folder()));
  /** Ticks on rows that left the folder since, or were passed already, are ignored, not counted. */
  readonly checkedRows = computed(() => {
    const ids = this.checked();
    return this.visible().map((group) => group.representative).filter((row) => ids.has(row.id) && row.status !== 'Passed');
  });
  /** The newest voicemail across a job's pitches, for its row badge. */
  groupVoicemail(group: JobGroup) {
    const all = group.pitches.flatMap((row) => row.voicemails ?? []);
    const newest = all.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))[0];
    return newest ? { ...newest, unseen: group.pitches.some((row) => row.voicemailUnseen) } : null;
  }
  readonly selectedGroup = computed(() =>
    this.jobGroups().find(group => group.pitches.some(row => row.id === this.selectedId())),
  );
  readonly relatedColumns = RELATED_COLUMNS;
  readonly relatedSort = signal(DEFAULT_RELATED_SORT);
  /** Every email for the open job, as grid rows in the chosen order. */
  readonly related = computed(() => {
    const group = this.selectedGroup();
    return group ? sortRelated(relatedRows(group), this.relatedSort()) : [];
  });
  sortRelatedBy(key: RelatedKey) {
    this.relatedSort.update((sort) => nextRelatedSort(sort, key));
  }
  ariaSort(key: RelatedKey) {
    const sort = this.relatedSort();
    return sort.key !== key ? 'none' : sort.dir === 'asc' ? 'ascending' : 'descending';
  }
  /** A decision on a job with duplicate pitches waits here for the owner to confirm its reach. */
  readonly decision = signal<GroupDecision | null>(null);
  /** Duplicates ticked for passing alongside the decision. */
  readonly decisionTicks = signal<ReadonlySet<string>>(new Set());
  readonly decisionSort = signal(DEFAULT_RELATED_SORT);
  /** The pitches the open decision was made on, for "Just this one". */
  private decisionChosen: readonly Opportunity[] = [];
  readonly decisionChosenCount = signal(0);
  readonly decisionDialog = viewChild<ElementRef<HTMLDialogElement>>('decisionDialog');
  readonly deleteCheckDialog = viewChild<ElementRef<HTMLDialogElement>>('deleteCheckDialog');
  readonly deleteCheck = signal<DeletePreview | null>(null);
  private settleDeleteCheck: ((go: boolean) => void) | null = null;
  readonly decisionRows = computed(() => {
    const plan = this.decision();
    if (!plan) return [];
    const rows = [...plan.decide, ...plan.others].map((pitch) => ({ id: pitch.id, from: pitch.from, receivedAt: pitch.receivedAt, pitch }));
    return sortRelated(rows, this.decisionSort());
  });
  /** How many pitches the confirm button passes. */
  readonly decisionPassing = computed(() => {
    const plan = this.decision();
    if (!plan) return 0;
    const ticked = plan.others.filter((row) => this.decisionTicks().has(row.id)).length;
    return plan.status === 'Passed' ? ticked + plan.decide.length : ticked;
  });
  /** What a row's status becomes if the decision is confirmed as ticked. */
  decisionStatus(row: Opportunity) {
    const plan = this.decision();
    if (!plan) return row.status;
    if (plan.decide.some((item) => item.id === row.id)) return plan.keptStatus;
    return this.decisionTicks().has(row.id) ? 'Passed' : row.status;
  }
  isDecided(row: Opportunity) {
    return !!this.decision()?.decide.some((item) => item.id === row.id);
  }
  toggleDecisionTick(id: string) {
    this.decisionTicks.update((ids) => {
      const next = new Set(ids);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }
  sortDecisionBy(key: RelatedKey) {
    this.decisionSort.update((sort) => nextRelatedSort(sort, key));
  }
  decisionAriaSort(key: RelatedKey) {
    const sort = this.decisionSort();
    return sort.key !== key ? 'none' : sort.dir === 'asc' ? 'ascending' : 'descending';
  }
  /** Opens the dialog when the decision reaches other pitches of the same job; false when it does not. */
  private offerDecision(rows: Opportunity[], status: string) {
    const plan = planDecision(this.jobGroups(), rows, status);
    if (!plan) return false;
    this.decisionTicks.set(new Set(plan.others.map((row) => row.id)));
    this.decisionSort.set(DEFAULT_RELATED_SORT);
    this.decision.set(plan);
    this.decisionDialog()?.nativeElement.showModal();
    return true;
  }
  closeDecision() {
    this.decision.set(null);
    const dialog = this.decisionDialog()?.nativeElement;
    if (dialog?.open) dialog.close();
  }
  /** Applies the decision to every ticked pitch, or with `alone`, only to the pitch it was made on. */
  async confirmDecision(alone: boolean) {
    const plan = this.decision();
    const chosen = this.decisionChosen;
    if (!plan) return;
    const ticked = alone ? [] : plan.others.filter((row) => this.decisionTicks().has(row.id));
    const passing = plan.status === 'Passed' ? (alone ? chosen : [...plan.decide, ...ticked]) : ticked;
    // Passing the open pitch closes its reply composer; an edited reply is the owner's to discard.
    if (passing.some((row) => row.id === this.selectedId()) && !this.canDropReply()) return;
    this.closeDecision();
    if (plan.status === 'Passed') return this.passRows(alone ? [...chosen] : [...plan.decide, ...ticked]);
    const kept = alone ? chosen[0] : plan.decide[0];
    const status = alone ? plan.status : plan.keptStatus;
    if (kept.id === this.selectedId()) {
      if (!(await this.saveStatus(status))) return;
    } else if (kept.status !== status && !(await this.setStatus(kept, status))) return;
    if (ticked.length) await this.passRows(ticked);
    // The kept pitch is where the conversation with the recruiter continues.
    if (kept.id !== this.selectedId()) {
      const fresh = this.opportunities().find((row) => row.id === kept.id);
      if (fresh) this.select(fresh);
    }
  }
  /** Saves a status on a pitch that is not open, leaving its notes as they are. */
  private async setStatus(row: Opportunity, status: string) {
    this.busy.set(true);
    this.revision++;
    this.error.set('');
    try {
      const updated = await this.request<Opportunity>(`opportunities/${encodeURIComponent(row.id)}`, 'PATCH', { status });
      this.replaceRow(updated);
      return true;
    } catch (error) {
      this.error.set(`${row.title}: ${this.message(error)}`);
      return false;
    } finally {
      this.busy.set(false);
    }
  }
  readonly linkOptions = computed(() => this.jobGroups().filter(group => group.id !== this.selectedGroup()?.id));

  readonly selected = computed(() =>
    this.opportunities().find((row) => row.id === this.selectedId()),
  );
  /** The open job's thread as a tree, newest first, or null when nobody wrote either way. */
  readonly thread = computed(() => {
    const row = this.selected();
    const thread = row && threadOf(this.selectedGroup()?.pitches ?? [row], this.conversationIndex());
    return thread ? newestFirst(thread) : null;
  });
  /** Where the open email's quoted history starts; folded, since those emails are nodes in the thread. */
  readonly quoteAt = computed(() => (this.thread() ? quoteStart(this.selected()?.body ?? '') : -1));
  readonly showQuoted = signal(false);
  /** The thread node opened to show the owner's email or a voicemail transcript under it. */
  readonly openNodeKey = signal('');
  readonly emailBlocks = computed(() => {
    const row = this.selected();
    const at = this.quoteAt();
    return this.blocks(row, at > 0 && !this.showQuoted() ? row!.body.slice(0, at) : row?.body);
  });
  openNode(node: ThreadNode) {
    const row = node.rowId ? this.opportunities().find((item) => item.id === node.rowId) : undefined;
    if (row) {
      if (row.id !== this.selectedId()) this.open(row);
      return;
    }
    this.openNodeKey.set(this.openNodeKey() === node.key ? '' : node.key);
  }
  /** The email as blocks, each link carrying what the daily link sweep found there. */
  private blocks(row: Opportunity | undefined, body = row?.body) {
    const checks = new Map((row?.linkChecks ?? []).map((check) => [check.url, check]));
    return formatEmailBody(body || '').map((block) => ({
      ...block,
      rows: urlRows(block.kind === 'text' ? block.text : `${block.label}: ${block.value}`).map((line) =>
        line.kind === 'links' ? { ...line, parts: line.parts.map((part) => ({ ...part, check: part.url ? checks.get(part.text) : undefined })) } : line,
      ),
    }));
  }
  constructor() {
    void this.load();
    this.poll = setInterval(() => {
      if (!this.busy()) void this.refresh();
    }, 30000);
    window.addEventListener('beforeunload', this.beforeUnload);
    window.addEventListener('keydown', this.shortcut);
  }
  // P passes the open pitch, unless a key is being typed into a field.
  private shortcut = (event: KeyboardEvent) => {
    if (event.key.toLowerCase() !== 'p' || event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target;
    // An open modal owns the keyboard even when focus has dropped to the page behind it.
    if ((target instanceof Element && target.closest('input:not([type=checkbox]), textarea, select, [contenteditable]')) || this.directoryMode() || document.querySelector('dialog[open]')) return;
    event.preventDefault();
    void this.pass();
  };
  private beforeUnload = (event: BeforeUnloadEvent) => {
    // A rule or client draft survives moving between views, but not a reload or a closed tab.
    if (this.hasUnsavedWork() || hasRuleDraft() || hasClientDraft()) event.preventDefault();
  };
  // An edited reply counts as unsaved work; the untouched greeting does not.
  private hasUnsavedWork() {
    return this.dirty() || (this.replying() && this.replyDraft !== this.replyTemplate);
  }
  ngOnDestroy() {
    clearInterval(this.poll);
    window.removeEventListener('beforeunload', this.beforeUnload);
    window.removeEventListener('keydown', this.shortcut);
  }
  private async request<T>(path: string, method = 'GET', data?: unknown): Promise<T> {
    const response = await fetch(new URL(`api/${path}`, document.baseURI), {
      method,
      headers: data === undefined ? {} : { 'Content-Type': 'application/json' },
      body: data === undefined ? undefined : JSON.stringify(data),
      signal: AbortSignal.timeout(120000),
    });
    // A proxy error page or an empty body must not hide the HTTP status behind a SyntaxError.
    const text = await response.text();
    let result: { error?: string } | null = null;
    try {
      result = text ? JSON.parse(text) : null;
    } catch {
      result = null;
    }
    if (!response.ok)
      throw new Error(result?.error || `The request failed (HTTP ${response.status}).`);
    if (result === null) throw new Error('The server returned an unreadable response.');
    return result as T;
  }
  async load() {
    this.error.set('');
    await this.refresh();
    if (!this.selectedId() && this.visible()[0]) this.select(this.visible()[0].representative);
    this.loading.set(false);
  }
  private async refresh() {
    const revision = this.revision;
    try {
      const [rows, connection, phrases, colors, rules, deletes, clients] = await Promise.all([
        this.request<JobGroup[]>('groups'),
        this.request<Connection>('connection'),
        this.request<TrackedPhrase[]>('phrases'),
        this.request<Record<PhraseKind, string>>('phrase-colors'),
        this.request<RejectRule[]>('reject-rules'),
        this.request<DeletePhrase[]>('delete-phrases'),
        this.request<Client[]>('clients'),
      ]);
      // A background response started before a decision must not undo its UI state.
      if (revision !== this.revision || this.passesSaving) return;
      this.jobGroups.set(this.withSeenHere(rows));
      this.phrases.set(phrases);
      this.phraseColors.set(colors);
      this.rejectRules.set(rules);
      this.deletePhrases.set(deletes);
      this.clients.set(clients);
      this.connection.set(connection);
    } catch (error) {
      this.error.set(this.message(error));
    }
  }
  private message(error: unknown) {
    return error instanceof Error ? error.message : 'Something went wrong. Please retry.';
  }
  canLeave() {
    return !this.hasUnsavedWork() || window.confirm('Discard your unsaved changes?');
  }
  /**
   * A click or a pick from the group list. Opening a pitch marks the voicemails it shows as seen.
   * A queue row opens the job's pitch that has an unseen voicemail, so what is marked seen is what
   * is on screen; another pitch's voicemail keeps the job's badge yellow until it is opened too.
   * Load, folder changes and moving on after a Pass call select() and mark nothing seen.
   */
  open(row: Opportunity, fromQueue = false) {
    const group = this.jobGroups().find((item) => item.pitches.some((pitch) => pitch.id === row.id));
    const target = (fromQueue && !row.voicemailUnseen && group?.pitches.find((pitch) => pitch.voicemailUnseen)) || row;
    if (!this.select(target) || !target.voicemailUnseen || !group) return;
    void this.markVoicemailsSeen(target);
  }
  private async markVoicemailsSeen({ id, voicemails = [] }: Opportunity) {
    const keys = voicemails.filter((item) => !item.seen).map((item) => `${id} ${item.id}`);
    keys.forEach((key) => this.seenHere.add(key));
    this.jobGroups.update((groups) => this.withSeenHere(groups));
    try {
      await this.request(`opportunities/${encodeURIComponent(id)}/voicemails-seen`, 'POST', {});
    } catch (error) {
      // Unseen again at once, with the reason, rather than reappearing unexplained at the next poll.
      keys.forEach((key) => this.seenHere.delete(key));
      this.revision++;
      void this.refresh();
      this.error.set(`Could not mark the voicemail seen: ${this.message(error)}`);
    }
  }
  audioUrl(voicemail: PitchVoicemail) {
    return new URL(`api/voicemails/${encodeURIComponent(voicemail.id)}/audio`, document.baseURI).href;
  }
  readonly phone = phoneText;
  readonly telHref = telHref;
  duration(seconds: number) {
    const whole = Math.round(seconds);
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
  }
  /** False when nothing changed: busy, or the user kept their unsaved work. */
  select(row: Opportunity) {
    if (this.busy() || !this.canLeave()) return false;
    this.selectedId.set(row.id);
    this.detailPane()?.nativeElement.scrollTo({ top: 0 });
    this.notes = row.notes;
    this.nextAction = row.nextAction;
    this.followUp = row.followUp;
    this.editStatus = row.status;
    this.dirty.set(false);
    this.notice.set('');
    this.linking.set(false);
    this.linkTarget = '';
    this.replying.set(false);
    this.showQuoted.set(false);
    this.openNodeKey.set('');
    this.replyDraft = '';
    return true;
  }
  changeFolder(folder: Folder) {
    if (this.busy() || !this.canLeave()) return;
    this.dirty.set(false);
    this.directoryMode.set(null);
    this.folder.set(folder);
    this.checked.set(this.emptyChecked);
    this.selectedId.set('');
    if (this.visible()[0]) this.select(this.visible()[0].representative);
  }
  openDirectory(mode: 'recruiters' | 'companies' | 'clients' | 'phrases' | 'deletes' | 'postings' | 'rules', id = '') {
    if (this.busy() || !this.canLeave()) return;
    this.dirty.set(false);
    this.directoryMode.set(mode);
    this.profileFocus.set(id);
    this.notice.set('');
  }
  toggleChecked(id: string) {
    this.checked.update((ids) => {
      const next = new Set(ids);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }
  selectPitchId(id: string) {
    const row = this.opportunities().find(item=>item.id===id);
    if (row) this.open(row);
  }
  openProfilePitch(id: string) {
    const row = this.opportunities().find(item => item.id === id);
    if (!row || this.busy() || !this.canLeave()) return;
    // Discarding was just confirmed; open() must not ask a second time.
    this.dirty.set(false);
    this.replying.set(false);
    this.directoryMode.set(null);
    this.folder.set('All opportunities');
    // Opened from a profile or the "Original pitch" link: its voicemail is on screen, so it is seen.
    this.open(row);
  }
  async startReply(row: Opportunity, kind: 'plain' | 'resume' | 'client' = 'plain') {
    // Ask the server: it picks the recipient with the same rule it sends with.
    this.error.set('');
    try {
      this.replyTo.set((await this.request<{ to: string }>(`opportunities/${encodeURIComponent(row.id)}/reply-to`)).to);
      this.replyResume.set(kind === 'resume' ? (await this.request<{ name: string }>('resume')).name : '');
    } catch (error) {
      this.error.set(this.message(error));
      return;
    }
    const name = row.from.match(/^\s*"?([A-Za-z][A-Za-z'-]*)[^<]*</)?.[1] ?? '';
    const role = row.title.split(' @ ')[0].trim();
    const about = role ? `about the ${role} role` : 'about this role';
    const signOff = `Thanks,\nErnie\nUS Citizen - w2 + benefits only`;
    const body = {
      plain: `I'd like more information about this position.\n\n${signOff}`,
      resume: `Thanks for reaching out ${about}. I'm interested, and I've attached my latest resume.\n\nHappy to find a time to talk.\n\n${signOff}`,
      client: `Thanks for reaching out ${about}. It sounds interesting.\n\nBefore we go further, could you share who the end client is? It helps me make sure I haven't already been submitted there through another firm, and lets me tailor my resume to their environment.\n\n${signOff}`,
    }[kind];
    this.replyTemplate = `Hi${name ? ` ${name}` : ''},\n\n${body}`;
    this.replyDraft = this.replyTemplate;
    this.replying.set(true);
  }
  cancelReply() {
    if (this.replyDraft !== this.replyTemplate && !window.confirm('Discard this reply?')) return;
    this.replying.set(false);
  }
  async sendReply() {
    const row = this.selected();
    const body = this.replyDraft.trim();
    if (!row || !body || this.busy()) return;
    this.busy.set(true);
    this.revision++;
    this.error.set('');
    let pursued: Opportunity | null = null;
    try {
      const updated = await this.request<Opportunity>(`opportunities/${encodeURIComponent(row.id)}/reply`, 'POST', {
        body,
        attachResume: this.replyResume() || undefined,
      });
      this.replaceRow(updated);
      // A resume reply can move the pitch to Pursue; a later save must not send the old status back.
      // A status picked but not yet saved is the owner's newer choice and stays.
      if (updated.status !== row.status && this.editStatus === row.status && updated.id === this.selectedId())
        this.editStatus = updated.status;
      this.replying.set(false);
      this.replyDraft = '';
      this.notice.set(`Reply sent to ${this.sender(updated.replies?.at(-1)?.to ?? row.from)}.`);
      pursued = updated.status === 'Pursue' && row.status !== 'Pursue' ? updated : null;
    } catch (error) {
      this.error.set(this.message(error));
    } finally {
      this.busy.set(false);
    }
    // The reply moved the job to Pursue, so its other copies are offered for passing too.
    if (pursued && pursued.id === this.selectedId()) this.ask([pursued], 'Pursue');
  }
  // Changing a phrase re-screens every pitch on the server, so fits are reloaded too.
  async addPhrase() {
    const phrase = this.phraseDraft.trim();
    if (phrase.length < 2) return;
    const kind = this.phraseKind;
    if (await this.changePhrases(() => this.request<TrackedPhrase[]>('phrases', 'POST', { phrase, kind })))
      this.phraseDraft = '';
  }
  /** Text selected in a pitch and tracked from the selection modal: null once saved, else why not. */
  readonly trackSelection = async (phrase: string, kind: PhraseKind) => {
    if (this.busy()) return 'Still saving the last change; try again in a moment.';
    if (!(await this.changePhrases(() => this.request<TrackedPhrase[]>('phrases', 'POST', { phrase, kind }))))
      return this.error() || 'The phrase was not saved.';
    this.toast(`Tracking “${phrase}” as ${this.phraseKindLabels[kind]}`);
    return null;
  };
  /**
   * A delete phrase is saved only after the owner has seen how much mail it reaches (the owner,
   * 2026-10-17). Null to go ahead, '' when the owner cancelled, else why not.
   */
  private async checkDeletePhrase(phrase: string): Promise<string | null> {
    let preview: DeletePreview;
    try {
      preview = await this.request<DeletePreview>(`delete-phrases/preview?phrase=${encodeURIComponent(phrase)}`);
    } catch (error) {
      const reason = this.message(error);
      this.error.set(reason);
      return reason;
    }
    this.deleteCheck.set(preview);
    this.deleteCheckDialog()?.nativeElement.showModal();
    const go = await new Promise<boolean>((resolve) => (this.settleDeleteCheck = resolve));
    return go ? null : '';
  }
  answerDeleteCheck(go: boolean) {
    const settle = this.settleDeleteCheck;
    this.settleDeleteCheck = null;
    const dialog = this.deleteCheckDialog()?.nativeElement;
    if (dialog?.open) dialog.close();
    this.deleteCheck.set(null);
    settle?.(go);
  }
  // Optimistic: the crayon shows at once and is put back if the server refuses it. Each answer touches
  // only its own kind, and only while it is still that kind's latest pick, so a slow or failed earlier
  // request never undoes a newer crayon.
  private readonly latestColorPick = new Map<PhraseKind, number>();
  async pickPhraseColor(kind: PhraseKind, color: string) {
    const previous = this.phraseColors()[kind];
    const pick = (this.latestColorPick.get(kind) ?? 0) + 1;
    this.latestColorPick.set(kind, pick);
    const setKind = (value: string) => this.phraseColors.update((colors) => ({ ...colors, [kind]: value }));
    this.revision++;
    setKind(color);
    try {
      const saved = await this.request<Record<PhraseKind, string>>('phrase-colors', 'PATCH', { kind, color });
      if (this.latestColorPick.get(kind) === pick) setKind(saved[kind]);
    } catch (error) {
      if (this.latestColorPick.get(kind) === pick) setKind(previous);
      this.error.set(this.message(error));
    }
  }
  phrasesOf(kind: PhraseKind) {
    return this.phrases().filter((row) => row.kind === kind);
  }
  togglePhrase(id: string) {
    this.openPhraseId.update((open) => (open === id ? '' : id));
  }
  async addDeletePhrase() {
    const phrase = this.deletePhraseDraft.trim();
    if (phrase.length < 2) return;
    if ((await this.saveDeletePhrase(phrase)) === null) this.deletePhraseDraft = '';
  }
  /** Text selected in a pitch and made a delete phrase from the selection modal: null once saved, '' if cancelled, else why not. */
  readonly deleteSelection = (phrase: string) => this.saveDeletePhrase(phrase);
  /** Saved only after the owner has seen how much mail the phrase reaches. */
  private async saveDeletePhrase(phrase: string): Promise<string | null> {
    if (this.busy() || this.checkingDelete()) return 'Still saving the last change; try again in a moment.';
    this.checkingDelete.set(true);
    let refused: string | null;
    try {
      refused = await this.checkDeletePhrase(phrase);
    } finally {
      this.checkingDelete.set(false);
    }
    if (refused !== null) return refused;
    if (!(await this.changeDeletePhrases(() => this.request<DeletePhrase[]>('delete-phrases', 'POST', { phrase }))))
      return this.error() || 'The delete phrase was not added.';
    this.toast(`Deleting mail with “${phrase}”`);
    // The pitches it passed leave the Inbox now, not at the next background refresh.
    void this.refresh();
    return null;
  }
  removeDeletePhrase(row: DeletePhrase) {
    void this.changeDeletePhrases(() => this.request<DeletePhrase[]>(`delete-phrases/${encodeURIComponent(row.id)}`, 'DELETE'));
  }
  private async changeDeletePhrases(change: () => Promise<DeletePhrase[]>) {
    // Confirmed while another save ran: say so rather than drop the phrase without a word.
    if (this.busy()) {
      this.error.set('Still saving the last change; the delete phrase was not added. Try again.');
      return false;
    }
    this.busy.set(true);
    this.revision++;
    this.error.set('');
    try {
      this.deletePhrases.set(await change());
      return true;
    } catch (error) {
      this.error.set(this.message(error));
      return false;
    } finally {
      this.busy.set(false);
    }
  }
  async saveClient({ name, cities }: { name: string; cities: string[] }) {
    if (!(await this.changeClients(() => this.request<Client[]>('clients', 'POST', { name, cities })))) return;
    clearClientDraft(fingerprintKey(cities));
    this.toast(`${cities.join(' · ')} is ${name}`);
  }
  removeClient(client: Client) {
    void this.changeClients(() => this.request<Client[]>(`clients/${encodeURIComponent(client.id)}`, 'DELETE'));
  }
  private async changeClients(change: () => Promise<Client[]>) {
    if (this.busy()) return false;
    this.busy.set(true);
    this.revision++;
    this.error.set('');
    try {
      this.clients.set(await change());
      return true;
    } catch (error) {
      this.error.set(this.message(error));
      return false;
    } finally {
      this.busy.set(false);
    }
  }
  removePhrase(row: TrackedPhrase) {
    void this.changePhrases(() => this.request<TrackedPhrase[]>(`phrases/${encodeURIComponent(row.id)}`, 'DELETE'));
  }
  async saveRule(draft: RuleDraft) {
    const { id, ...rule } = draft;
    const saved = await this.changeRules(() =>
      id ? this.request<RejectRule[]>(`reject-rules/${encodeURIComponent(id)}`, 'PATCH', rule) : this.request<RejectRule[]>('reject-rules', 'POST', rule),
    );
    if (saved) this.rulesView()?.clear();
  }
  setRuleMode({ rule, mode }: { rule: RejectRule; mode: RuleMode }) {
    void this.changeRules(() => this.request<RejectRule[]>(`reject-rules/${encodeURIComponent(rule.id)}`, 'PATCH', { mode }));
  }
  removeRule(rule: RejectRule) {
    void this.changeRules(() => this.request<RejectRule[]>(`reject-rules/${encodeURIComponent(rule.id)}`, 'DELETE'));
  }
  /** Rules change no pitch until new mail arrives, so nothing else needs reloading. */
  private async changeRules(change: () => Promise<RejectRule[]>) {
    if (this.busy()) return false;
    this.busy.set(true);
    // A poll that started before this change must not restore the old rules.
    this.revision++;
    this.error.set('');
    try {
      this.rejectRules.set(await change());
      return true;
    } catch (error) {
      this.error.set(this.message(error));
      return false;
    } finally {
      this.busy.set(false);
    }
  }
  private async changePhrases(change: () => Promise<TrackedPhrase[]>) {
    if (this.busy()) return false;
    this.busy.set(true);
    this.revision++;
    this.error.set('');
    try {
      this.phrases.set(await change());
    } catch (error) {
      this.error.set(this.message(error));
      this.busy.set(false);
      return false;
    }
    // The phrase change is committed; a failed reload is reported and the next poll reconciles fits.
    try {
      this.jobGroups.set(this.withSeenHere(await this.request<JobGroup[]>('groups')));
    } catch (error) {
      this.error.set(`Phrase saved, but the list did not refresh: ${this.message(error)}`);
    } finally {
      this.busy.set(false);
    }
    return true;
  }
  /** A status change on a job with duplicates asks first; notes alone save straight away. */
  async save(status = this.editStatus) {
    const row = this.selected();
    if (!row || this.busy()) return;
    if (status !== row.status && this.ask([row], status)) return;
    await this.saveStatus(status);
  }
  private ask(rows: Opportunity[], status: string) {
    this.decisionChosen = rows;
    this.decisionChosenCount.set(rows.length);
    return this.offerDecision(rows, status);
  }
  private async saveStatus(status: string) {
    const row = this.selected();
    if (!row || this.busy()) return false;
    this.busy.set(true);
    this.revision++;
    this.error.set('');
    this.notice.set('');
    try {
      const { trashQueued, ...updated } = await this.request<Opportunity & { trashQueued?: boolean }>(
        `opportunities/${encodeURIComponent(row.id)}`,
        'PATCH',
        { status, notes: this.notes, nextAction: this.nextAction, followUp: this.followUp },
      );
      this.jobGroups.update(groups => groups.map(group => ({
        ...group, pitches: group.pitches.map(item => item.id === updated.id ? updated : item),
      })));
      this.editStatus = updated.status;
      this.dirty.set(false);
      this.notice.set('Saved.');
      if (trashQueued) void this.collectTrash(updated).then((outcome) => this.toastTrash([{ outcome, title: updated.title }]));
      return true;
    } catch (error) {
      this.error.set(this.message(error));
      return false;
    } finally {
      this.busy.set(false);
    }
  }
  /**
   * Pass hides the pitch at once and moves to the next one; the save and the Gmail delete
   * finish behind it, so a run of Passes never waits. A save that fails puts the pitch back.
   */
  async pass() {
    const row = this.selected();
    if (!row || this.busy()) return;
    // With duplicates the dialog asks about an edited reply on confirm, so it is asked only once.
    if (this.ask([row], 'Passed') || !this.canDropReply()) return;
    await this.passRows([row]);
  }
  /** Passes every ticked row the same way, with one toast for all their Gmail deletes. */
  async passChecked() {
    const rows = this.checkedRows();
    if (!rows.length || this.busy()) return;
    if (this.ask(rows, 'Passed')) return;
    if (rows.some((row) => row.id === this.selectedId()) && !this.canDropReply()) return;
    await this.passRows(rows);
  }
  private canDropReply() {
    return !this.replying() || this.replyDraft === this.replyTemplate || window.confirm('Discard this reply?');
  }
  private async passRows(rows: Opportunity[]) {
    const openId = this.selectedId();
    const before = this.visible();
    const position = before.findIndex((group) => group.pitches.some((item) => item.id === openId));
    // The open pitch passes with the notes being edited; the others keep what they have.
    const passes = rows.map((row) => ({
      row,
      fields: row.id === openId
        ? { status: 'Passed', notes: this.notes, nextAction: this.nextAction, followUp: this.followUp }
        : { status: 'Passed', notes: row.notes, nextAction: row.nextAction, followUp: row.followUp },
    }));
    this.revision++;
    // The error banner is left alone: it may hold an earlier pitch's Gmail failure.
    this.notice.set('');
    for (const { row, fields } of passes) this.replaceRow({ ...row, ...fields });
    // A passed row stays listed in All opportunities; its tick must not offer a second Pass.
    const passed = new Set(rows.map((row) => row.id));
    this.checked.update((ids) => new Set([...ids].filter((id) => !passed.has(id))));
    if (passed.has(openId)) {
      this.dirty.set(false);
      this.replying.set(false);
      this.editStatus = 'Passed';
    }
    const after = this.visible();
    // Only a passed open pitch moves the pane; an open pitch deeper in a group is not a representative.
    if (position >= 0 && passed.has(openId) && !after.some((group) => group.representative.id === openId)) {
      // The open job's group if it is still listed, else the nearest one below it, else above it.
      const order = [...before.slice(position), ...before.slice(0, position).reverse()];
      const next = order.map((group) => after.find((item) => item.id === group.id)).find(Boolean);
      if (next) this.select(next.representative);
      else this.selectedId.set('');
    }
    const results = await Promise.all(passes.map(({ row, fields }) => this.savePass(row, fields)));
    // Every pitch whose Pass failed is back in the list, so the banner names every one of them.
    const failures = results.flatMap((result) => (result.failure ? [result.failure] : []));
    if (failures.length) this.error.set(failures.length === 1 ? failures[0] : `${failures.length} Passes did not save. ${failures.join(' ')}`);
    const queued = results.flatMap((result) => (result.queued ? [result.queued] : []));
    if (!queued.length) return;
    const outcomes = await Promise.all(queued.map(async (row) => ({ outcome: await this.collectTrash(row), title: row.title })));
    this.toastTrash(outcomes);
  }
  /** Saves one Pass; returns the pitch when the server queued its Gmail delete, or why it failed. */
  private async savePass(row: Opportunity, fields: Pick<Opportunity, 'status' | 'notes' | 'nextAction' | 'followUp'>) {
    this.passesSaving++;
    try {
      const { trashQueued, ...updated } = await this.request<Opportunity & { trashQueued?: boolean }>(
        `opportunities/${encodeURIComponent(row.id)}`,
        'PATCH',
        fields,
      );
      this.revision++;
      this.replaceRow(updated);
      return { queued: trashQueued ? updated : null };
    } catch (error) {
      this.revision++;
      this.replaceRow(row);
      // Edits that rode on the failed Pass come back as unsaved work on their pitch.
      const edited = fields.notes !== row.notes || fields.nextAction !== row.nextAction || fields.followUp !== row.followUp;
      if (edited && this.selectedId() !== row.id && !this.hasUnsavedWork()) this.select(row);
      // A draft typed while the Pass was saving is newer than the one sent, and is kept as it is.
      if (this.selectedId() === row.id && !this.dirty()) {
        this.notes = fields.notes;
        this.nextAction = fields.nextAction;
        this.followUp = fields.followUp;
        this.editStatus = row.status;
        this.dirty.set(edited);
      }
      const lost = edited && this.selectedId() !== row.id ? ' Its note edits were not saved either.' : '';
      return { queued: null, failure: `${row.title}: Pass did not save: ${this.message(error)}${lost}` };
    } finally {
      this.passesSaving--;
    }
  }
  private replaceRow(updated: Opportunity) {
    this.jobGroups.update((groups) => groups.map((group) => ({
      ...group, pitches: group.pitches.map((item) => (item.id === updated.id ? updated : item)),
    })));
    if (updated.id === this.selectedId() && !this.dirty()) this.editStatus = updated.status;
  }
  /**
   * Waits for the server's Gmail delete, then confirms it with a toast or reports the failure.
   * Only the outcome is used: the row it carries was read when the delete ran and may be older
   * than a change made since, so the next poll brings the row up to date instead.
   */
  private collectTrash({ id, title }: Opportunity): Promise<TrashOutcome> {
    const outcome = this.trashWait.then(async (): Promise<TrashOutcome> => {
      try {
        const { trashed, trashError, skipped, preview } = await this.request<{ trashed?: number; trashError?: string; skipped?: boolean; preview?: boolean }>(
          `opportunities/${encodeURIComponent(id)}/trash`,
        );
        if (trashError) {
          this.reportTrashFailure(title, trashError);
          return 'failed';
        }
        return skipped ? 'skipped' : preview ? 'preview' : trashed ? 'deleted' : 'gone';
      } catch (error) {
        this.reportTrashFailure(title, `Could not confirm the delete: ${this.message(error)}`);
        return 'failed';
      }
    });
    this.trashWait = outcome.then(() => undefined);
    return outcome;
  }
  /**
   * One toast per Pass action, naming the pitch, or counting the pitches when several share an
   * outcome. Failed deletes are left out: the banner names those.
   */
  private toastTrash(results: { outcome: TrashOutcome; title: string }[]) {
    const titles = new Map<string, string[]>();
    for (const { outcome, title } of results) {
      const text = TRASH_TOASTS[outcome];
      if (text) titles.set(text, [...(titles.get(text) ?? []), title]);
    }
    const parts = [...titles];
    if (!parts.length) return;
    if (parts.length > 1) return this.toast(parts.map(([text, names]) => `${text}: ${names.length}`).join(' · '));
    const [text, names] = parts[0];
    this.toast(`${text} · ${names.length === 1 ? names[0] : `${names.length} pitches`}`);
  }
  /** A run of Passes can fail together (Gmail down, no credentials); every failed pitch stays named. */
  private reportTrashFailure(title: string, reason: string) {
    if (this.error() !== this.trashFailureText) this.trashFailures = [];
    if (!this.trashFailures.includes(title)) this.trashFailures = [...this.trashFailures, title];
    const count = this.trashFailures.length;
    const which = count === 1 ? title : `${count} passed pitches (${this.trashFailures.join('; ')})`;
    this.trashFailureText = `Not deleted from Gmail: ${which}. ${reason}`;
    this.error.set(this.trashFailureText);
  }
  private toast(text: string) {
    const id = ++this.toastId;
    this.toasts.update((list) => [...list, { id, text }]);
    setTimeout(() => this.toasts.update((list) => list.filter((item) => item.id !== id)), 2400);
  }
  async groupCurrent(action: 'link' | 'separate' | 'auto') {
    const row = this.selected();
    if (!row || this.busy() || !this.canLeave()) return;
    this.busy.set(true);
    this.revision++;
    this.error.set('');
    try {
      const groups = await this.request<JobGroup[]>('grouping', 'POST', {
        action, sourceId: row.id, targetId: action === 'link' ? this.linkTarget : undefined,
      });
      this.jobGroups.set(this.withSeenHere(groups));
      this.notes = row.notes;
      this.nextAction = row.nextAction;
      this.followUp = row.followUp;
      this.editStatus = row.status;
      this.dirty.set(false);
      this.linking.set(false);
      this.linkTarget = '';
      this.notice.set(action === 'link' ? 'Pitches grouped. Each recruiter keeps their own status and notes.' : action === 'separate' ? 'This pitch is now separate.' : 'Automatic matching restored.');
    } catch (error) {
      this.error.set(this.message(error));
    } finally {
      this.busy.set(false);
    }
  }
  async checkMail() {
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    try {
      const result = await this.request<{ added: number }>('sync', 'POST', {});
      await this.refresh();
      this.notice.set(
        result.added
          ? `${result.added} new opportunities imported.`
          : 'Mail checked. No new opportunities.',
      );
    } catch (error) {
      this.error.set(this.message(error));
    } finally {
      this.busy.set(false);
    }
  }
  async importEmail() {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.request('import', 'POST', {
        subject: this.importSubject,
        from: this.importFrom,
        body: this.importBody,
      });
      this.adding.set(false);
      this.importSubject = '';
      this.importFrom = '';
      this.importBody = '';
      await this.refresh();
      this.notice.set('Email added to the inbox.');
    } catch (error) {
      this.error.set(this.message(error));
    } finally {
      this.busy.set(false);
    }
  }
  gmailUrl(row: Opportunity) {
    return row.source === 'gmail'
      ? `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(row.account || '')}#all/${encodeURIComponent(row.threadId)}`
      : // The server finds the Gmail thread by Message-ID; a Gmail search breaks on '=' and '+' in the ID.
        new URL(`api/opportunities/${encodeURIComponent(row.id)}/gmail`, document.baseURI).href;
  }
  sender(from: string) {
    return (
      from
        .replace(/<[^>]*>/g, '')
        .replace(/"/g, '')
        .trim() || from
    );
  }
  reasonMark(kind: string) {
    return kind === 'pass' ? '✓' : kind === 'fail' ? '×' : '?';
  }
  // A tracked phrase's tone is its kind, so its tag wears the crayon picked for that kind.
  reasonTagClass(reason: Opportunity['reasons'][number]) {
    return reason.tone ? `${reason.kind} ${reason.tone}` : reason.kind;
  }
  // Tags compress "How it fits": a tag repeating an earlier one with the same verdict (tracked "java" ×
  // beside screened "Java" ×) is not shown twice. Tracked phrases come first, so their crayon-coloured tag
  // is the one kept. Conflicting verdicts both stay, so a positive tracked phrase never hides a mismatch.
  // × tags lead, so the two-line strip never scrolls a mismatch out of sight; the sort is stable, so
  // every other tag keeps its screening order.
  fitTags(row: Opportunity) {
    const seen = new Set<string>();
    return row.reasons
      .filter((reason) => {
        const key = this.tagKey(reason.kind, reason.label || reason.text);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => Number(b.kind === 'fail') - Number(a.kind === 'fail'));
  }
  hasFitTag(row: Opportunity, kind: string, label: string) {
    const key = this.tagKey(kind, label);
    return row.reasons.some((reason) => this.tagKey(reason.kind, reason.label || reason.text) === key);
  }
  private tagKey(kind: string, label: string) {
    return `${kind} ${label.toLowerCase()}`;
  }
  reasonCount(row: Opportunity, kind: 'pass' | 'fail') {
    return row.reasons.filter((reason) => reason.kind === kind).length;
  }
  // The row icons are compact; screen readers get the reasons as words.
  reasonSummary(row: Opportunity) {
    return row.reasons.map((reason) => `${this.reasonMark(reason.kind)} ${reason.text}`).join('; ');
  }
  fitClass(fit: string) {
    return fit.toLowerCase().replaceAll(' ', '-');
  }
  money(value: number) {
    return (Math.round(value) || 0).toLocaleString('en-US');
  }
  sourceText(body: string) {
    return body.replace(/\$/g, '');
  }
  readonly jobState = jobState;
  /** Why the sweep passed a pitch, for the line under its title. */
  autoPassedReason(row: Opportunity) {
    if (row.autoPassed?.reason === 'dead') return 'its job link is dead';
    const indeed = row.linkChecks?.some((check) => check.kind === 'posting' && check.status === 'closed' && /(^|\.)indeed\.com$/.test(check.host));
    return indeed ? 'the job closed on Indeed' : 'the job posting closed';
  }
  /** "52d": how long a posting has been up, or nothing when its posted date is unknown. */
  upFor(check: LinkCheck) {
    const days = daysUp(check);
    return days === null ? '' : `${days}d`;
  }
  /** The date pipe throws on a string it cannot parse; a fallback row can carry one. */
  isDate(value: string) {
    return Number.isFinite(Date.parse(value));
  }
  /** Orange while the owner waits on an answer, bright pink once they have written back. */
  conversation(pitches: readonly Opportunity[]) {
    return conversationState(pitches);
  }
  /** One pitch's own heat, for the same-job grid where its rows differ. */
  pitchHeat(pitch: Opportunity) {
    const state = conversationState([pitch]);
    return state && conversationHeat(state, interactions([pitch], this.conversationIndex()));
  }
  /** Plain-text age for spots that cannot hold the coloured one, like a select option. */
  ageWords(date: string) {
    return ageText(daysSince(date));
  }
  due(date: string) {
    const today = new Date();
    const local = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return Boolean(date && date <= local);
  }
}
