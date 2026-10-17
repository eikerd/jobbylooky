import { Component, computed, input } from '@angular/core';
import { highlight } from './highlight';
import type { TrackedPhrase } from './models';

/** Renders text with tracked phrases bolded and highlighted; never uses innerHTML. */
@Component({
  selector: 'app-hl',
  template: `@for (segment of segments(); track $index) {@if (segment.hit) {<mark [class]="'tracked ' + segment.hit"><strong>{{ segment.text }}</strong></mark>} @else {{{ segment.text }}}}`,
  styles: [`
    :host { display: contents; }
    .tracked { border-radius: 3px; padding: 0 2px; }
    .tracked.negative { background: var(--negative-mark); color: var(--negative-ink); }
    .tracked.positive { background: var(--positive-mark); color: var(--positive-ink); }
    .tracked.neutral { background: var(--neutral-mark); color: var(--neutral-ink); }
    .tracked.purple { background: var(--purple-mark); color: var(--purple-ink); }
    .tracked.pink { background: var(--pink-mark); color: var(--pink-ink); }
    .tracked strong { font-weight: 700; }
  `],
})
export class Highlight {
  readonly text = input.required<string>();
  readonly phrases = input<TrackedPhrase[]>([]);
  readonly segments = computed(() => highlight(this.text(), this.phrases()));
}
