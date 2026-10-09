import { Component, computed, inject, input, signal } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import type { MapPlace } from './location-map';

/**
 * A job's places as inline links in the received line, "Remote" when nothing maps. Clicking a
 * place toggles its map below the line; no iframe exists until then, because a foreign iframe
 * makes Claude's built-in browser ask before every action. Revealed maps are remembered per scope.
 * The host is display:contents, so the links sit in the parent's flex row and the map wraps
 * to the end of it.
 */
@Component({
  selector: 'app-place-links',
  template: `@for (place of maps(); track place.query) {
      <button type="button" class="place" [attr.aria-expanded]="isShown(place.query)" (click)="toggle(place.query)">{{ place.query }}</button>
    } @empty {
      <span>Remote</span>
    }
    @for (place of maps(); track place.query) {
      @if (isShown(place.query)) {
        <div class="map"><iframe [src]="place.src" [title]="'Map of ' + place.query" loading="lazy" referrerpolicy="no-referrer" allowfullscreen></iframe></div>
      }
    }`,
  styles: [`
    :host { display:contents; }
    .place { padding:0; border:0; background:none; font:inherit; color:var(--accent-ink); text-decoration:underline; text-underline-offset:2px; cursor:pointer; }
    .place:hover { color:var(--ink-strong); }
    .place:focus-visible { outline:2px solid var(--accent); outline-offset:2px; border-radius:2px; }
    .map { order:1; flex-basis:100%; }
    iframe { display:block; width:200px; max-width:100%; height:200px; border:1px solid var(--line); border-radius:8px; }
  `],
})
export class PlaceLinks {
  private readonly sanitizer = inject(DomSanitizer);
  readonly places = input.required<MapPlace[]>();
  /** The pitch the places belong to; revealed maps are remembered per scope. */
  readonly scope = input('');
  readonly shown = signal<ReadonlySet<string>>(new Set());
  // placeMap fixes the Google origin and URL-encodes every email-derived value.
  readonly maps = computed(() => this.places().map((place) => ({ ...place, src: this.sanitizer.bypassSecurityTrustResourceUrl(place.embed) })));
  isShown(query: string) {
    return this.shown().has(this.scope() + ' ' + query);
  }
  toggle(query: string) {
    const key = this.scope() + ' ' + query;
    this.shown.update((shown) => {
      const next = new Set(shown);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }
}
