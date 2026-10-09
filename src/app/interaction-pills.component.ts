import { Component, computed, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ageHeat, ageInDays } from './age';
import { interactions } from './interactions';
import type { Opportunity } from './models';

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/**
 * What has passed between the owner and a job's sender, as pills on its row in Pursuing: emails sent,
 * the resume, their replies, calls and voicemails, the thread's size and how long since the last contact
 * (the owner, 2026-10-09). Each pill shows only when it applies.
 */
@Component({
  selector: 'app-interaction-pills',
  imports: [DatePipe],
  template: `@let it = summary();
    @if (it.sent.length) {
      <span class="pill sent" [title]="sentTitle()">✉ Sent {{ it.sent.length }}</span>
    }
    @if (it.resume.length) {
      <span class="pill resume" [title]="'Resume sent ' + (it.resume.at(-1)!.sentAt | date: 'MMM d')">📄 Resume</span>
    }
    @if (it.isAnswer) {
      <span class="pill reply">↩ Their reply</span>
    } @else if (it.replies.length) {
      <span class="pill reply" [title]="'Last reply ' + (it.replies.at(-1)!.receivedAt | date: 'MMM d, h:mm a')">↩ {{ plural(it.replies.length, 'reply', 'replies') }}</span>
    }
    @if (it.calls) {
      <span class="pill call">☎ {{ plural(it.calls, 'call') }}</span>
    }
    @if (it.voicemails) {
      <span class="pill call">🎙 {{ plural(it.voicemails, 'voicemail') }}</span>
    }
    @if (it.thread > 1 && it.lastContact) {
      <span class="thread">{{ it.thread }} in thread</span>
    }
    @if (it.lastContact; as at) {
      <span class="last" [style.color]="heat(at)" [title]="at | date: 'MMM d, h:mm a'">Last contact {{ ago(at) }}</span>
    }`,
  styles: [`
    :host { display:flex; flex-wrap:wrap; align-items:center; gap:6px; margin-top:8px; white-space:nowrap; }
    :host:empty { display:none; }
    .pill { display:inline-flex; align-items:center; height:20px; padding:0 8px; border-radius:999px; font-size:12px; font-weight:700; }
    .sent { background:var(--accent-soft); color:var(--accent-ink); }
    .resume { background:var(--warn-soft); color:var(--warn); }
    .reply { background:#fbe0f0; color:#a3175f; }
    .call { background:var(--side); color:var(--ink-strong); border:1px solid var(--line); }
    .thread, .last { font-size:12px; font-weight:700; }
    .thread { color:var(--soft); }
  `],
})
export class InteractionPills {
  readonly pitches = input.required<Opportunity[]>();
  /** Every pitch on the page, so an answer filed as its own row is found. */
  readonly all = input.required<Opportunity[]>();
  readonly summary = computed(() => interactions(this.pitches(), this.all()));
  readonly sentTitle = computed(() =>
    this.summary()
      .sent.map((reply) => `${new Date(reply.sentAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} to ${reply.to}${reply.attachment ? ' (resume)' : ''}`)
      .join('\n'),
  );
  readonly plural = plural;
  ago(at: string) {
    const days = ageInDays(at);
    return days === null ? '' : days === 0 ? 'today' : `${days}d`;
  }
  heat(at: string) {
    return ageHeat(ageInDays(at));
  }
}
