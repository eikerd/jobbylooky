import { Component, computed, inject, input, signal } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import type { MapPlace } from './location-map';

/**
 * Address links with Google map thumbnails that render only once asked for. A foreign iframe
 * anywhere on the page makes Claude's built-in browser ask before every action, so nothing is
 * embedded until "Show map" is pressed. Revealed maps stay revealed for the life of the view,
 * per scope (a pitch or a company), so one click never opens maps on other pages.
 */
@Component({
  selector: 'app-location-maps',
  template: `@for (place of maps(); track place.query) {
    <section class="location-map" aria-label="Address previews">
      <a [href]="place.link" target="_blank" rel="noopener noreferrer">{{ place.source }}: {{ place.query }} ↗</a>
      @if (shown().has(scope() + ' ' + place.query)) {
        <iframe [src]="place.src" [title]="'Map of ' + place.query" loading="lazy" referrerpolicy="no-referrer" allowfullscreen></iframe>
      } @else {
        <button type="button" class="button secondary" (click)="show(place.query)">Show map</button>
      }
    </section>
  }`,
  styles: [`
    :host { display:block; min-width:0; }
    .location-map { margin:14px 0; min-width:0; }
    .location-map a { display:block; margin-bottom:6px; color:var(--accent-ink); font-size:14px; }
    iframe { display:block; width:200px; max-width:100%; height:200px; border:1px solid var(--line); border-radius:8px; }
    .button { display:inline-flex; align-items:center; justify-content:center; padding:8px 16px; min-height:38px; border-radius:999px; font:inherit; font-size:14px; font-weight:700; cursor:pointer; white-space:nowrap; border:1.5px solid var(--control-border); background:var(--card); color:var(--ink); }
    .button:hover { background:var(--hover); }
    .button:focus-visible { outline:2px solid var(--accent); outline-offset:2px; }
  `],
})
export class LocationMaps {
  private readonly sanitizer = inject(DomSanitizer);
  readonly places = input.required<MapPlace[]>();
  /** The pitch or company the places belong to; revealed maps are remembered per scope. */
  readonly scope = input('');
  readonly shown = signal<ReadonlySet<string>>(new Set());
  // placeMap fixes the Google origin and URL-encodes every email-derived value.
  readonly maps = computed(() => this.places().map((place) => ({ ...place, src: this.sanitizer.bypassSecurityTrustResourceUrl(place.embed) })));
  show(query: string) {
    this.shown.update((shown) => new Set(shown).add(this.scope() + ' ' + query));
  }
}
