import { Component, ElementRef, OnDestroy, computed, input, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { PhraseKind, TrackedPhrase } from './models';

/** The server's limits on a tracked phrase (server/store.mjs addPhrase). */
const MIN_PHRASE = 2;
const MAX_PHRASE = 100;
/** How far above the hovered line the Track button sits, in px. */
const OFFER_LIFT = 30;
const clean = (text: string) => text.replace(/\s+/g, ' ').trim();
const isWord = (char: string | undefined) => !!char && /\w/.test(char);

/**
 * Phrases match whole words only (server/screen.mjs phrasePattern), so a selection that starts or ends
 * mid-word is widened to the whole word; a fragment like "me permanent role for a S" could never match.
 */
function wholeWords(range: Range) {
  const widened = range.cloneRange();
  const { startContainer: start, endContainer: end } = widened;
  if (start.nodeType === Node.TEXT_NODE) {
    const text = start.textContent ?? '';
    let at = widened.startOffset;
    while (at > 0 && isWord(text[at - 1]) && isWord(text[at])) at--;
    widened.setStart(start, at);
  }
  if (end.nodeType === Node.TEXT_NODE) {
    const text = end.textContent ?? '';
    let at = widened.endOffset;
    while (at < text.length && isWord(text[at - 1]) && isWord(text[at])) at++;
    widened.setEnd(end, at);
  }
  return widened.toString();
}

/**
 * Select text inside `within`, hover the selection, and a Track button appears; it opens a modal
 * holding the selection, where one click tracks it as a phrase of any kind.
 */
@Component({
  selector: 'app-selection-phrase',
  imports: [FormsModule],
  host: {
    '(document:selectionchange)': 'selectionChanged()',
    '(document:mousemove)': 'hover($event)',
  },
  template: `
    @if (offer(); as at) {
      <button type="button" class="offer" [style.left.px]="at.x" [style.top.px]="at.y"
        (mousedown)="$event.preventDefault()" (click)="openModal()">+ Track phrase</button>
    }
    <dialog #dialog aria-labelledby="track-phrase-title" (close)="closed()">
      <h2 id="track-phrase-title">Track phrase</h2>
      <label class="visually-hidden" for="track-phrase-text">Phrase</label>
      <input id="track-phrase-text" name="phrase" [ngModel]="draft()" (ngModelChange)="draft.set($event)"
        [maxlength]="maxPhrase" autocomplete="off" />
      <div class="kinds" role="group" aria-label="Track as">
        @for (kind of kinds(); track kind) {
          <button type="button" [class]="'kind ' + kind" [disabled]="!canSave()" (click)="choose(kind)">
            {{ marks()[kind] }} {{ labels()[kind] }}@if (kind === 'negative') { (blocks)}
          </button>
        }
      </div>
      @if (existing(); as row) {
        <p class="note">Already tracked as {{ labels()[row.kind] }}.</p>
      } @else if (failed() && error()) {
        <p class="note error" role="alert">{{ error() }}</p>
      }
      <button type="button" class="cancel" (click)="dialog.close()">Cancel</button>
    </dialog>
  `,
  styles: [`
    .offer {
      position: fixed; z-index: 40; transform: translateX(-50%);
      padding: 3px 10px; border: 1px solid var(--line-strong); border-radius: 6px;
      background: var(--ink-strong); color: var(--page); font: inherit; font-size: 13px; font-weight: 700;
      white-space: nowrap; cursor: pointer; box-shadow: 0 4px 12px rgb(0 0 0 / 0.18);
    }
    dialog {
      width: min(440px, calc(100vw - 32px)); padding: 18px 20px; border: 1px solid var(--line-strong);
      border-radius: 10px; background: var(--side); color: var(--ink); box-shadow: 0 12px 32px rgb(0 0 0 / 0.2);
    }
    dialog::backdrop { background: rgb(29 45 53 / 0.35); }
    h2 { margin: 0 0 10px; font-size: 16px; color: var(--ink-strong); }
    input {
      box-sizing: border-box; width: 100%; padding: 8px 11px; border: 1.5px solid var(--control-border);
      border-radius: 8px; background: var(--card); color: var(--ink); font: inherit; font-size: 15px; font-weight: 700;
    }
    .kinds { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0 4px; }
    .kind {
      padding: 6px 12px; border: 1.5px solid currentColor; border-radius: 8px;
      font: inherit; font-size: 14px; font-weight: 700; cursor: pointer;
    }
    .kind:disabled { opacity: 0.45; cursor: default; }
    .kind.negative { background: var(--negative-mark); color: var(--negative-ink); }
    .kind.positive { background: var(--positive-mark); color: var(--positive-ink); }
    .kind.neutral { background: var(--neutral-mark); color: var(--neutral-ink); }
    .kind.purple { background: var(--purple-mark); color: var(--purple-ink); }
    .kind.pink { background: var(--pink-mark); color: var(--pink-ink); }
    .note { margin: 8px 0 0; font-size: 14px; color: var(--soft); }
    .note.error { color: var(--bad); }
    .cancel {
      margin-top: 12px; padding: 5px 12px; border: 1.5px solid var(--control-border); border-radius: 8px;
      background: var(--card); color: var(--ink); font: inherit; font-size: 14px; cursor: pointer;
    }
    .visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  `],
})
export class SelectionPhrase implements OnDestroy {
  /** Only text selected inside this element can become a phrase. */
  readonly within = input<HTMLElement | undefined>();
  readonly phrases = input<TrackedPhrase[]>([]);
  readonly kinds = input.required<PhraseKind[]>();
  readonly labels = input.required<Record<PhraseKind, string>>();
  readonly marks = input.required<Record<PhraseKind, string>>();
  /** Saves the phrase; resolves false when the server refused it (the reason is then in `error`). */
  readonly save = input.required<(phrase: string, kind: PhraseKind) => Promise<boolean>>();
  readonly busy = input(false);
  readonly error = input('');

  readonly maxPhrase = MAX_PHRASE;
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  /** Where the Track button sits, in viewport px; null while it is hidden. */
  readonly offer = signal<{ x: number; y: number } | null>(null);
  readonly draft = signal('');
  readonly failed = signal(false);
  private range: Range | null = null;
  private selected = '';
  private readonly noHover = window.matchMedia('(hover: none)');
  readonly existing = computed(() => {
    const phrase = clean(this.draft()).toLowerCase();
    return this.phrases().find((row) => row.phrase.toLowerCase() === phrase);
  });
  readonly canSave = computed(() => {
    const length = clean(this.draft()).length;
    return !this.busy() && !this.existing() && length >= MIN_PHRASE && length <= MAX_PHRASE;
  });

  // The pane scrolls inside itself, and scroll events do not bubble, so the listener captures.
  private readonly hide = () => this.offer.set(null);
  constructor() {
    document.addEventListener('scroll', this.hide, true);
  }
  ngOnDestroy() {
    document.removeEventListener('scroll', this.hide, true);
  }

  selectionChanged() {
    if (this.dialog().nativeElement.open) return;
    const selection = document.getSelection();
    const region = this.within();
    const range = selection && !selection.isCollapsed && selection.rangeCount ? selection.getRangeAt(0) : null;
    const node = range?.commonAncestorContainer;
    const element = node instanceof Element ? node : node?.parentElement;
    const text = range ? clean(wholeWords(range)) : '';
    const usable = range && region?.contains(node!) && !element?.closest('input, textarea, [contenteditable]')
      && text.length >= MIN_PHRASE && text.length <= MAX_PHRASE;
    if (!usable) {
      this.range = null;
      this.offer.set(null);
      return;
    }
    if (text === this.selected && this.range === range) return;
    this.range = range;
    this.selected = text;
    this.offer.set(null);
    // A touch screen has no hover, so the button shows as soon as the selection settles.
    if (this.noHover.matches) {
      const first = range.getClientRects()[0];
      if (first) this.place(first.left + first.width / 2, first.top);
    }
  }

  /** The button appears once the pointer rests on the selected text, not while it is still being dragged. */
  hover(event: MouseEvent) {
    if (!this.range || this.offer() || event.buttons) return;
    const line = [...this.range.getClientRects()].find((rect) =>
      event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom);
    if (line) this.place(event.clientX, line.top);
  }

  private place(x: number, top: number) {
    this.offer.set({ x: Math.min(Math.max(x, 70), window.innerWidth - 70), y: Math.max(top - OFFER_LIFT, 4) });
  }

  openModal() {
    this.draft.set(this.selected);
    this.failed.set(false);
    this.offer.set(null);
    this.dialog().nativeElement.showModal();
  }

  async choose(kind: PhraseKind) {
    if (!this.canSave()) return;
    this.failed.set(false);
    if (await this.save()(clean(this.draft()), kind)) {
      document.getSelection()?.removeAllRanges();
      this.dialog().nativeElement.close();
    } else {
      this.failed.set(true);
    }
  }

  closed() {
    this.offer.set(null);
    this.failed.set(false);
  }
}
