import { Component, computed, signal, OnDestroy, ElementRef, viewChild, inject } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { mapLocations } from './location-map';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ageInDays } from './age';
import { formatEmailBody, urlRows } from './email-body';
import type { Opportunity, JobGroup, TrackedPhrase, PhraseKind } from './models';
import { Highlight } from './highlight.component';
import { Profiles } from './profiles.component';
import { SourceIcon } from './source-icon.component';

interface Connection {
  configured: boolean;
  syncing: boolean;
  error: string;
  lastSync: string | null;
  canReply?: boolean;
  replyPreview?: boolean;
}
type Folder = 'Inbox' | 'Pursuing' | 'Maybe' | 'Passed' | 'All opportunities';

@Component({
  selector: 'app-root',
  imports: [FormsModule, DatePipe, NgTemplateOutlet, Profiles, SourceIcon, Highlight],
  templateUrl: './app.html',
  styleUrls: ['./theme.css', './app.css', './groups.css', './phrases.css', './reply.css'],
})
export class App implements OnDestroy {
  private readonly sanitizer = inject(DomSanitizer);
  readonly locationMaps = computed(() => mapLocations(this.selected()?.location || '', this.selected()?.body || '').map(map => ({
    ...map,
    // The helper fixes the Google origin and URL-encodes all email-derived text.
    src: this.sanitizer.bypassSecurityTrustResourceUrl(map.embed),
    streetSrc: this.sanitizer.bypassSecurityTrustResourceUrl(map.streetMap),
  })));
  /**
   * Maps the owner asked to see, keyed by pitch and address. A foreign iframe anywhere on the
   * page makes Claude's built-in browser ask before every action, so none is rendered until clicked.
   */
  readonly shownMaps = signal<ReadonlySet<string>>(new Set());
  readonly detailPane = viewChild<ElementRef<HTMLElement>>('detailPane');
  readonly folders: Folder[] = ['Inbox', 'Pursuing', 'Maybe', 'Passed', 'All opportunities'];
  readonly statuses = ['New', 'Pursue', 'Maybe', 'Applied', 'Interviewing', 'Offer', 'Passed'];
  readonly jobGroups = signal<JobGroup[]>([]);
  readonly opportunities = computed(() => this.jobGroups().flatMap(group => group.pitches));
  readonly linking = signal(false);
  linkTarget = '';
  readonly folder = signal<Folder>('Inbox');
  readonly directoryMode = signal<'recruiters' | 'companies' | 'phrases' | null>(null);
  readonly profileMode = computed(() => {
    const mode = this.directoryMode();
    return mode === 'recruiters' || mode === 'companies' ? mode : null;
  });
  readonly phrases = signal<TrackedPhrase[]>([]);
  readonly phraseKinds: PhraseKind[] = ['negative', 'positive'];
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
  readonly connection = signal<Connection | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
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
  readonly visible = computed(() => {
    const folder = this.folder();
    const matchesFolder = (row: Opportunity) =>
      folder === 'All opportunities' ||
      (folder === 'Inbox' && row.status === 'New') ||
      (folder === 'Pursuing' && ['Pursue', 'Applied', 'Interviewing', 'Offer'].includes(row.status)) ||
      row.status === folder;
    return this.jobGroups()
      .filter(group => group.pitches.some(matchesFolder))
      .map(group => ({ ...group, representative: group.pitches.find(matchesFolder)! }))
      .sort((a, b) => Date.parse(b.representative.receivedAt) - Date.parse(a.representative.receivedAt));
  });
  readonly selectedGroup = computed(() =>
    this.jobGroups().find(group => group.pitches.some(row => row.id === this.selectedId())),
  );
  readonly linkOptions = computed(() => this.jobGroups().filter(group => group.id !== this.selectedGroup()?.id));

  readonly selected = computed(() =>
    this.opportunities().find((row) => row.id === this.selectedId()),
  );
  readonly emailBlocks = computed(() => this.blocks(this.selected()?.body || ''));
  /** The pitch an answer row replies to, and whether its email is shown under the answer. */
  readonly original = computed(() => {
    const id = this.selected()?.respondsTo;
    return id ? this.opportunities().find((row) => row.id === id) : undefined;
  });
  readonly showOriginal = signal(false);
  readonly originalBlocks = computed(() => (this.showOriginal() ? this.blocks(this.original()?.body || '') : []));
  private blocks(body: string) {
    return formatEmailBody(body).map((block) => ({
      ...block,
      rows: urlRows(block.kind === 'text' ? block.text : `${block.label}: ${block.value}`),
    }));
  }
  constructor() {
    void this.load();
    this.poll = setInterval(() => {
      if (!this.busy()) void this.refresh();
    }, 30000);
    window.addEventListener('beforeunload', this.beforeUnload);
  }
  private beforeUnload = (event: BeforeUnloadEvent) => {
    if (this.hasUnsavedWork()) event.preventDefault();
  };
  // An edited reply counts as unsaved work; the untouched greeting does not.
  private hasUnsavedWork() {
    return this.dirty() || (this.replying() && this.replyDraft !== this.replyTemplate);
  }
  ngOnDestroy() {
    clearInterval(this.poll);
    window.removeEventListener('beforeunload', this.beforeUnload);
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
      const [rows, connection, phrases] = await Promise.all([
        this.request<JobGroup[]>('groups'),
        this.request<Connection>('connection'),
        this.request<TrackedPhrase[]>('phrases'),
      ]);
      // A background response started before a decision must not undo its UI state.
      if (revision !== this.revision) return;
      this.jobGroups.set(rows);
      this.phrases.set(phrases);
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
  select(row: Opportunity) {
    if (this.busy() || !this.canLeave()) return;
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
    this.showOriginal.set(false);
    this.replyDraft = '';
  }
  changeFolder(folder: Folder) {
    if (this.busy() || !this.canLeave()) return;
    this.dirty.set(false);
    this.directoryMode.set(null);
    this.folder.set(folder);
    this.selectedId.set('');
    if (this.visible()[0]) this.select(this.visible()[0].representative);
  }
  openDirectory(mode: 'recruiters' | 'companies' | 'phrases', id = '') {
    if (this.busy() || !this.canLeave()) return;
    this.dirty.set(false);
    this.directoryMode.set(mode);
    this.profileFocus.set(id);
    this.notice.set('');
  }
  selectPitchId(id: string) {
    const row = this.opportunities().find(item=>item.id===id);
    if (row) this.select(row);
  }
  openProfilePitch(id: string) {
    const row = this.opportunities().find(item => item.id === id);
    if (!row || this.busy() || !this.canLeave()) return;
    this.dirty.set(false);
    this.directoryMode.set(null);
    this.folder.set('All opportunities');
    this.select(row);
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
    const body = {
      plain: `I'd like more information about this position.\n\n`,
      resume: `Thanks for reaching out ${about}. I'm interested, and I've attached my latest resume.\n\nHappy to find a time to talk.\n\nThanks,\nErnie`,
      client: `Thanks for reaching out ${about}. It sounds interesting.\n\nBefore we go further, could you share who the end client is? It helps me make sure I haven't already been submitted there through another firm, and lets me tailor my resume to their environment.\n\nThanks,\nErnie`,
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
    try {
      const updated = await this.request<Opportunity>(`opportunities/${encodeURIComponent(row.id)}/reply`, 'POST', {
        body,
        attachResume: this.replyResume() || undefined,
      });
      this.jobGroups.update((groups) => groups.map((group) => ({
        ...group, pitches: group.pitches.map((item) => (item.id === updated.id ? updated : item)),
      })));
      this.replying.set(false);
      this.replyDraft = '';
      this.notice.set(`Reply sent to ${this.sender(updated.replies?.at(-1)?.to ?? row.from)}.`);
    } catch (error) {
      this.error.set(this.message(error));
    } finally {
      this.busy.set(false);
    }
  }
  // Changing a phrase re-screens every pitch on the server, so fits are reloaded too.
  async addPhrase() {
    const phrase = this.phraseDraft.trim();
    if (phrase.length < 2) return;
    const kind = this.phraseKind;
    if (await this.changePhrases(() => this.request<TrackedPhrase[]>('phrases', 'POST', { phrase, kind })))
      this.phraseDraft = '';
  }
  phrasesOf(kind: PhraseKind) {
    return this.phrases().filter((row) => row.kind === kind);
  }
  togglePhrase(id: string) {
    this.openPhraseId.update((open) => (open === id ? '' : id));
  }
  removePhrase(row: TrackedPhrase) {
    void this.changePhrases(() => this.request<TrackedPhrase[]>(`phrases/${encodeURIComponent(row.id)}`, 'DELETE'));
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
      this.jobGroups.set(await this.request<JobGroup[]>('groups'));
    } catch (error) {
      this.error.set(`Phrase saved, but the list did not refresh: ${this.message(error)}`);
    } finally {
      this.busy.set(false);
    }
    return true;
  }
  async save(status = this.editStatus) {
    const row = this.selected();
    if (!row || this.busy()) return;
    this.busy.set(true);
    this.revision++;
    this.error.set('');
    this.notice.set('');
    try {
      const updated = await this.request<Opportunity>(
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
    } catch (error) {
      this.error.set(this.message(error));
    } finally {
      this.busy.set(false);
    }
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
      this.jobGroups.set(groups);
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
      : `https://mail.google.com/mail/u/0/#search/${encodeURIComponent('rfc822msgid:' + row.messageIds[0])}`;
  }
  sender(from: string) {
    return (
      from
        .replace(/<[^>]*>/g, '')
        .replace(/"/g, '')
        .trim() || from
    );
  }
  showMap(key: string) {
    this.shownMaps.update(shown => new Set(shown).add(key));
  }

  reasonMark(kind: string) {
    return kind === 'pass' ? '✓' : kind === 'fail' ? '×' : '?';
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
  ageLabel(receivedAt: string) {
    const days = ageInDays(receivedAt);
    return days === null ? 'Age unknown' : `${days} ${days === 1 ? 'day' : 'days'} old`;
  }
  due(date: string) {
    const today = new Date();
    const local = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return Boolean(date && date <= local);
  }
}
