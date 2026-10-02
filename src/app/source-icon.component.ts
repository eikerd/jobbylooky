import { Component, computed, input } from '@angular/core';
import { emailSource } from './source-icon';

@Component({
  selector: 'app-source-icon',
  template: `<span [class]="'source-icon ' + icon().kind" role="img" [attr.aria-label]="icon().name">{{ icon().mark }}</span>`,
  styles: [`
    :host { display:inline-flex; flex-shrink:0; vertical-align:middle; }
    .source-icon { display:inline-flex; align-items:center; justify-content:center; width:26px; height:26px; border-radius:7px; font:700 14px Arial,sans-serif; background:var(--side); color:var(--ink-strong); }
    .linkedin { background:#0a66c2; color:white; }
    .dice { background:#b71928; color:white; font-size:10px; }
    .indeed { background:#1647b5; color:white; font-size:19px; }
    .ziprecruiter { background:#32633b; color:white; }
    .glassdoor { background:#17694b; color:white; }
  `],
})
export class SourceIcon {
  readonly from = input.required<string>();
  readonly icon = computed(() => emailSource(this.from()));
}
