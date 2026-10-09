import { Component, computed, input, signal } from '@angular/core';
import { ageText, dateHeat, daysSince } from './age';

const dayKey = () => new Date().toDateString();
/**
 * The local calendar day, shared by every age. It changes only when the date does, so a page
 * left open past midnight re-ages its dates; checked each minute so a sleeping laptop catches up.
 */
const today = signal(dayKey());
setInterval(() => today.set(dayKey()), 60_000);

/** Every date's age, coloured on the 30-day heat scale: hot today, cold at a month or more. */
@Component({
  selector: 'app-age',
  template: `@if (text()) {<span class="age" [style.color]="color()">{{ text() }}</span>}`,
  styles: `.age { font-weight: 700; white-space: nowrap; }`,
})
export class Age {
  readonly at = input<string | null | undefined>();
  private readonly days = computed(() => {
    today();
    return daysSince(this.at());
  });
  readonly text = computed(() => ageText(this.days()));
  readonly color = computed(() => dateHeat(this.days()));
}
