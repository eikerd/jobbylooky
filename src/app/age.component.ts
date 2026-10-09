import { Component, computed, input } from '@angular/core';
import { ageText, dateHeat, daysSince } from './age';

/** Every date's age, coloured on the 30-day heat scale: hot today, cold at a month or more. */
@Component({
  selector: 'app-age',
  template: `@if (text()) {<span class="age" [style.color]="color()">{{ text() }}</span>}`,
  styles: `.age { font-weight: 700; white-space: nowrap; }`,
})
export class Age {
  readonly at = input<string | null | undefined>();
  private readonly days = computed(() => daysSince(this.at()));
  readonly text = computed(() => ageText(this.days()));
  readonly color = computed(() => dateHeat(this.days()));
}
