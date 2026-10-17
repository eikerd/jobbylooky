import { Component, computed, input } from '@angular/core';
import type { ConversationHeat } from './conversation';

/**
 * The talking head on any row with a conversation, tinted by its heat (the owner, 2026-10-16:
 * "an icon of a person talking, showing that there's an active conversation"). Empty when none.
 */
@Component({
  selector: 'app-convo-heat',
  template: `@if (heat(); as it) {<span class="head" role="img" [attr.data-heat]="it.level" [class.waiting]="it.state === 'waiting'" [attr.aria-label]="label()">🗣</span>}`,
  styles: [`
    :host { display:inline-flex; flex:none; vertical-align:middle; }
    .head { --hue: var(--convo-live); display:inline-grid; place-items:center; width:22px; height:20px; border-radius:999px; font-size:13px; line-height:1;
      background: color-mix(in srgb, var(--hue) var(--mix), var(--card)); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--hue) 55%, transparent); }
    .head.waiting { --hue: var(--convo-waiting); }
    [data-heat='1'] { --mix: 15%; } [data-heat='2'] { --mix: 30%; } [data-heat='3'] { --mix: 45%; }
    [data-heat='4'] { --mix: 65%; } [data-heat='5'] { --mix: 85%; }
  `],
})
export class ConvoHeat {
  readonly heat = input<ConversationHeat | null | undefined>(null);
  readonly label = computed(() => {
    const it = this.heat();
    if (!it) return '';
    const count = `${it.messages} ${it.messages === 1 ? 'email' : 'emails'} back and forth`;
    return it.state === 'waiting' ? `Conversation waiting on them, ${count}` : `Active conversation, ${count}`;
  });
}
