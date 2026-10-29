import { Component, computed, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Age } from './age.component';
import { interactions, type Step } from './interactions';
import type { Opportunity } from './models';

/** Longer trails keep the opening step and the newest ones. */
const SHOWN = 6;

const glyphs = (step: Step) =>
  step.kind === 'reply' ? '↩' : step.kind === 'call' ? '☎' : step.kind === 'voicemail' ? '🎙' : step.resume || step.client ? '' : '✉';

const what = (step: Step) =>
  step.kind === 'reply' ? 'They replied'
  : step.kind === 'call' ? 'They called'
  : step.kind === 'voicemail' ? 'They left a voicemail'
  : step.resume && step.client ? 'You sent your resume and asked the end client'
  : step.resume ? 'You sent your resume'
  : step.client ? 'You asked who the end client is'
  : 'You wrote';

/**
 * A job's back-and-forth as a row of icons, oldest first (the owner, 2026-10-29: "a series of icons
 * representing back-and-forths"). Outlined white chips are the owner's moves, green ones theirs; the
 * resume and the end-client question each have their own icon. Empty when nobody wrote.
 */
@Component({
  selector: 'app-convo-trail',
  imports: [DatePipe, Age],
  template: `@let it = summary();
    @if (it.trail.length) {
      <span class="trail" role="img" [attr.aria-label]="label()">
        @for (step of shown(); track $index) {
          @if ($index) {<span class="link" aria-hidden="true">{{ step ? '›' : '' }}</span>}
          @if (step) {
            <span class="step" [class.in]="step.way === 'in'" [title]="what(step) + ' · ' + (step.at | date: 'MMM d, h:mm a')" aria-hidden="true">
              @if (step.resume) {<span>📄</span>}
              @if (step.client) {<span class="client">🏢<b>?</b></span>}
              {{ glyphs(step) }}
            </span>
          } @else {
            <span class="more" aria-hidden="true">+{{ it.trail.length - SHOWN }}</span>
          }
        }
        <span class="since" aria-hidden="true">@if (it.trail.at(-1)!.way === 'out') {⏳ }<app-age [at]="it.trail.at(-1)!.at" /></span>
      </span>
    }`,
  styles: [`
    :host { display:block; margin-top:8px; }
    :host:empty { display:none; }
    .trail { display:flex; flex-wrap:wrap; align-items:center; gap:3px; }
    .step { display:inline-flex; align-items:center; justify-content:center; gap:2px; min-width:30px; height:26px; padding:0 5px; box-sizing:border-box;
      border-radius:7px; border:2px solid var(--ink-strong); background:var(--card); color:var(--ink-strong); font-size:16px; font-weight:800; line-height:1; }
    .step.in { background:var(--accent-soft); border-color:var(--accent); color:var(--accent-ink); }
    .client { position:relative; padding-right:6px; }
    .client b { position:absolute; right:-1px; top:-6px; font-size:12px; color:var(--bad); }
    .link { color:var(--muted); font-weight:700; }
    .more { font-size:12px; font-weight:700; color:var(--soft); }
    .since { margin-left:6px; font-size:12px; }
  `],
})
export class ConvoTrail {
  readonly pitches = input.required<Opportunity[]>();
  /** Every pitch on the page, so an answer filed as its own row is found. */
  readonly all = input.required<Opportunity[]>();
  readonly summary = computed(() => interactions(this.pitches(), this.all()));
  /** The steps to draw; null stands for the hidden middle of a long trail. */
  readonly shown = computed<(Step | null)[]>(() => {
    const trail = this.summary().trail;
    return trail.length <= SHOWN ? trail : [trail[0], null, ...trail.slice(-(SHOWN - 1))];
  });
  readonly label = computed(() => this.summary().trail.map(what).join(', then '));
  readonly SHOWN = SHOWN;
  readonly glyphs = glyphs;
  readonly what = what;
}
