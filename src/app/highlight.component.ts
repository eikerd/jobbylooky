import { Component, computed, input } from '@angular/core';
import { highlight } from './highlight';

/** Renders text with tracked phrases bolded and highlighted; never uses innerHTML. */
@Component({
  selector: 'app-hl',
  template: `@for (segment of segments(); track $index) {@if (segment.hit) {<mark class="tracked"><strong>{{ segment.text }}</strong></mark>} @else {{{ segment.text }}}}`,
  styles: [`
    :host { display: contents; }
    .tracked { background: #5a1f1c; color: #ffb4ab; border-radius: 2px; padding: 0 2px; }
    .tracked strong { font-weight: 700; }
  `],
})
export class Highlight {
  readonly text = input.required<string>();
  readonly phrases = input<string[]>([]);
  readonly segments = computed(() => highlight(this.text(), this.phrases()));
}
