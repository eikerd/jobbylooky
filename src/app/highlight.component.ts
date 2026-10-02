import { Component, computed, input } from '@angular/core';
import { highlight } from './highlight';
import type { TrackedPhrase } from './models';

/** Renders text with tracked phrases bolded and highlighted; never uses innerHTML. */
@Component({
  selector: 'app-hl',
  template: `@for (segment of segments(); track $index) {@if (segment.hit) {<mark [class]="'tracked ' + segment.hit"><strong>{{ segment.text }}</strong></mark>} @else {{{ segment.text }}}}`,
  styles: [`
    :host { display: contents; }
    .tracked { background: var(--bad-soft); color: var(--bad); border-radius: 3px; padding: 0 2px; }
    .tracked.positive { background: var(--mark); color: var(--ink-strong); }
    .tracked strong { font-weight: 700; }
  `],
})
export class Highlight {
  readonly text = input.required<string>();
  readonly phrases = input<TrackedPhrase[]>([]);
  readonly segments = computed(() => highlight(this.text(), this.phrases()));
}
