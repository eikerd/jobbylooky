import { Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import { CRAYONS } from './crayons';

/** A swatch that opens the macOS-style crayon box; picking a crayon emits its hex. */
@Component({
  selector: 'app-crayon-picker',
  host: { '(document:click)': 'closeOutside($event)', '(keydown.escape)': 'open.set(false)' },
  template: `
    <button type="button" class="swatch" [style.background]="color()" [attr.aria-expanded]="open()"
      [attr.aria-label]="'Colour for ' + label() + ' phrases: ' + name()" (click)="open.set(!open())"></button>
    @if (open()) {
      <div class="crayon-box" role="group" [attr.aria-label]="label() + ' crayons'">
        @for (crayon of crayons; track crayon.hex) {
          <button type="button" class="crayon" [class.chosen]="crayon.hex === color()" [attr.aria-pressed]="crayon.hex === color()"
            [attr.aria-label]="crayon.name" [style.--crayon]="crayon.hex" (click)="choose(crayon.hex)"><span></span></button>
        }
      </div>
    }
  `,
  styles: [`
    :host { position: relative; display: inline-flex; }
    .swatch { width: 22px; height: 22px; border-radius: 50%; border: 1.5px solid var(--control-border); padding: 0; cursor: pointer; }
    .crayon-box {
      position: absolute; top: calc(100% + 6px); left: 0; z-index: 20;
      display: grid; grid-template-columns: repeat(12, 16px); gap: 6px 5px;
      padding: 14px 12px 10px; background: var(--side); border: 1px solid var(--line-strong);
      border-radius: 10px; box-shadow: 0 8px 24px rgb(0 0 0 / 0.14);
    }
    .crayon {
      width: 16px; height: 46px; padding: 0; border: 0; background: none; cursor: pointer;
      filter: drop-shadow(0 0 0.6px rgb(0 0 0 / 0.55)); transition: transform 120ms ease;
    }
    /* The tip and the paper wrapper band; the shadow sits on the button because clip-path would cut it off. */
    .crayon span {
      display: block; width: 100%; height: 100%;
      clip-path: polygon(30% 0, 70% 0, 100% 24%, 100% 100%, 0 100%, 0 24%);
      background: linear-gradient(var(--crayon) 0 44%, color-mix(in srgb, var(--crayon) 70%, black) 44% 50%, var(--crayon) 50% 100%);
    }
    .crayon:hover { transform: translateY(-3px); }
    .crayon.chosen { transform: translateY(-8px); }
    .crayon:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  `],
})
export class CrayonPicker {
  private readonly host = inject(ElementRef<HTMLElement>);
  readonly color = input.required<string>();
  readonly label = input.required<string>();
  readonly picked = output<string>();
  readonly open = signal(false);
  readonly crayons = CRAYONS;
  readonly name = computed(() => CRAYONS.find((crayon) => crayon.hex === this.color())?.name ?? this.color());

  choose(hex: string) {
    this.open.set(false);
    if (hex !== this.color()) this.picked.emit(hex);
  }
  closeOutside(event: Event) {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.open.set(false);
  }
}
