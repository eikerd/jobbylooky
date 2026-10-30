import { Component, ElementRef, OnDestroy, computed, input, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { DeletePhrase, PhraseKind, TrackedPhrase } from './models';
import { widenEnd, widenStart } from './phrase-edges';
import { afterSave, cleanPhrase as clean, onList } from './phrase-modal';

/** The server's limits on a tracked phrase (server/store.mjs addPhrase). */
const MIN_PHRASE = 2;
const MAX_PHRASE = 100;
/** How far above the hovered line the Track button sits, in px. */
const OFFER_LIFT = 30;

/**
 * The selection widened at both edges (./phrase-edges). The middle comes from the Selection, not the
 * Range: only the Selection puts a line break between blocks, so a title and the line under it do not
 * run together as "TitleCompany".
 */
function wholeWords(selection: Selection, range: Range) {
  const { startContainer: start, startOffset, endContainer: end, endOffset } = range;
  const startText = start.nodeType === Node.TEXT_NODE ? start.textContent ?? '' : '';
  const endText = end.nodeType === Node.TEXT_NODE ? end.textContent ?? '' : '';
  // An element edge has no text of its own, so it slices to nothing and is left as selected.
  const before = startText.slice(widenStart(startText, startOffset), startOffset);
  const after = endText.slice(endOffset, widenEnd(endText, endOffset));
  return before + selection.toString() + after;
}

/**
 * Select text inside `within`, hover the selection, and a Track button appears; it opens a modal
 * holding the selection, where one click tracks it as a phrase of any kind or makes it a delete phrase.
 */
@Component({
  selector: 'app-selection-phrase',
  imports: [FormsModule],
  host: {
    '(document:selectionchange)': 'selectionChanged()',
    '(document:mousemove)': 'hover($event)',
    '(document:keyup)': 'keyed()',
  },
  template: `
    @if (offer(); as at) {
      <button type="button" class="offer" [style.left.px]="at.x" [style.top.px]="at.y"
        (mousedown)="$event.preventDefault()" (click)="openModal()">+ Track phrase</button>
    }
    <dialog #dialog aria-labelledby="track-phrase-title" (close)="closed()">
      <h2 id="track-phrase-title">Track phrase</h2>
      <label class="visually-hidden" for="track-phrase-text">Phrase</label>
      <input id="track-phrase-text" name="phrase" [ngModel]="draft()" (ngModelChange)="edit($event)"
        [maxlength]="maxPhrase" autocomplete="off" />
      <div class="kinds" role="group" aria-label="Track as">
        @for (kind of kinds(); track kind) {
          <button type="button" [class]="'kind ' + kind" [disabled]="!canSave()" (click)="choose(kind)">
            {{ marks()[kind] }} {{ labels()[kind] }}@if (kind === 'negative') { (blocks)}
          </button>
        }
      </div>
      <button type="button" class="delete" [disabled]="!canDelete()" (click)="chooseDelete()">🗑 Delete phrase</button>
      @if (existing(); as row) {
        <p class="note">Already tracked as {{ labels()[row.kind] }}.</p>
      }
      @if (deleting()) {
        <p class="note">Already a delete phrase.</p>
      }
      @if (failure()) {
        <p class="note error" role="alert">{{ failure() }}</p>
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
    .delete {
      margin: 12px 8px 0 0; padding: 5px 12px; border: 1.5px solid var(--bad); border-radius: 8px;
      background: var(--bad-soft); color: var(--bad); font: inherit; font-size: 14px; font-weight: 700; cursor: pointer;
    }
    .delete:disabled { opacity: 0.45; cursor: default; }
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
  /** Saves the phrase; resolves null once saved, or the reason it was not. */
  readonly save = input.required<(phrase: string, kind: PhraseKind) => Promise<string | null>>();
  readonly deletePhrases = input<DeletePhrase[]>([]);
  /** Checks, confirms and saves a delete phrase; resolves null once saved, '' if cancelled, or the reason it was not. */
  readonly saveDelete = input.required<(phrase: string) => Promise<string | null>>();
  readonly busy = input(false);

  readonly maxPhrase = MAX_PHRASE;
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  /** Where the Track button sits, in viewport px; null while it is hidden. */
  readonly offer = signal<{ x: number; y: number } | null>(null);
  readonly draft = signal('');
  /** Why the last save failed; only this modal's own save sets it, so an unrelated error never shows here. */
  readonly failure = signal('');
  private range: Range | null = null;
  private selected = '';
  private readonly noHover = window.matchMedia('(hover: none)');
  readonly existing = computed(() => onList(this.phrases(), this.draft()));
  /** The draft is already a delete phrase. */
  readonly deleting = computed(() => !!onList(this.deletePhrases(), this.draft()));
  private readonly fits = computed(() => {
    const length = clean(this.draft()).length;
    return !this.busy() && length >= MIN_PHRASE && length <= MAX_PHRASE;
  });
  readonly canSave = computed(() => this.fits() && !this.existing());
  // A tracked phrase can still become a delete phrase: the two lists are kept apart (server/delete-phrases.mjs).
  readonly canDelete = computed(() => this.fits() && !this.deleting());

  // The pane scrolls inside itself, and scroll events do not bubble, so the listener captures. Without
  // hover (touch) nothing would bring the button back, so it follows the selection once scrolling settles.
  private replace = 0;
  private readonly scrolled = () => {
    this.offer.set(null);
    if (!this.noHover.matches || !this.range) return;
    cancelAnimationFrame(this.replace);
    this.replace = requestAnimationFrame(() => this.placeAtSelection());
  };
  constructor() {
    document.addEventListener('scroll', this.scrolled, true);
  }
  ngOnDestroy() {
    document.removeEventListener('scroll', this.scrolled, true);
    cancelAnimationFrame(this.replace);
  }
  private forget() {
    this.range = null;
    this.selected = '';
    this.offer.set(null);
  }

  selectionChanged() {
    if (this.dialog().nativeElement.open) return;
    const selection = document.getSelection();
    const region = this.within();
    const range = selection && !selection.isCollapsed && selection.rangeCount ? selection.getRangeAt(0) : null;
    const node = range?.commonAncestorContainer;
    const element = node instanceof Element ? node : node?.parentElement;
    // Region first, so a select-all over the page is dismissed before any text is read.
    if (!selection || !range || !node || !region?.contains(node) || element?.closest('input, textarea, [contenteditable]'))
      return this.forget();
    const text = clean(wholeWords(selection, range));
    if (text.length < MIN_PHRASE || text.length > MAX_PHRASE) return this.forget();
    if (text === this.selected && this.range === range) return;
    this.range = range;
    this.selected = text;
    this.offer.set(null);
    // A touch screen has no hover, so the button shows as soon as the selection settles.
    if (this.noHover.matches) this.placeAtSelection();
  }

  /** A selection made with Shift and the arrow keys has no pointer over it, so it gets the button at once. */
  keyed() {
    if (this.range && !this.offer() && !this.dialog().nativeElement.open) this.placeAtSelection();
  }

  private placeAtSelection() {
    const first = this.range?.getClientRects()[0];
    if (first) this.place(first.left + first.width / 2, first.top);
  }

  /** The button appears once the pointer rests on the selected text, not while it is still being dragged. */
  hover(event: MouseEvent) {
    if (!this.range || this.offer() || event.buttons || this.dialog().nativeElement.open) return;
    const line = [...this.range.getClientRects()].find((rect) =>
      event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom);
    if (line) this.place(event.clientX, line.top);
  }

  private place(x: number, top: number) {
    this.offer.set({ x: Math.min(Math.max(x, 70), window.innerWidth - 70), y: Math.max(top - OFFER_LIFT, 4) });
  }

  openModal() {
    this.draft.set(this.selected);
    this.failure.set('');
    // Focusing the modal's input moves the page selection, and the pane re-renders once a phrase is saved,
    // so the held range is dropped now rather than offered again over text that has changed.
    this.forget();
    this.dialog().nativeElement.showModal();
  }

  edit(value: string) {
    this.draft.set(value);
    this.failure.set('');
  }

  async choose(kind: PhraseKind) {
    if (!this.canSave()) return;
    this.failure.set('');
    this.settle(await this.save()(clean(this.draft()), kind));
  }

  /** The page's own check opens over this modal; cancelling it leaves this one open as it was. */
  async chooseDelete() {
    if (!this.canDelete()) return;
    this.failure.set('');
    this.settle(await this.saveDelete()(clean(this.draft())));
  }

  private settle(answer: string | null) {
    const { close, failure } = afterSave(answer);
    this.failure.set(failure);
    if (!close) return;
    document.getSelection()?.removeAllRanges();
    this.dialog().nativeElement.close();
  }

  closed() {
    this.forget();
    this.failure.set('');
  }
}
