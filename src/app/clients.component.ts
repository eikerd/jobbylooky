import { Component, computed, input, output, signal } from '@angular/core';
import { Age } from './age.component';
import type { Opportunity } from './models';
import { fingerprintRows, sortFingerprints, type Client, type FingerprintColumn, type FingerprintRow } from './clients';

/**
 * Names typed into unnamed rows, by the row's key, until each is saved. Module state, like the
 * Rules draft, so opening a pitch from the grid and coming back does not lose what was typed.
 */
const drafts = signal<ReadonlyMap<string, string>>(new Map());
export const hasClientDraft = () => [...drafts().values()].some((value) => value.trim());

/**
 * Clients: every set of two or more cities a pitch names, and the client it is known as.
 * The owner names a set once a recruiter has said whose it is; from then on every pitch
 * carrying that set is that client's.
 */
@Component({
  selector: 'app-clients',
  imports: [Age],
  templateUrl: './clients.html',
  styleUrl: './clients.css',
})
export class Clients {
  readonly rows = input.required<Opportunity[]>();
  readonly clients = input.required<Client[]>();
  readonly busy = input(false);
  readonly save = output<{ name: string; cities: string[] }>();
  readonly remove = output<Client>();
  readonly openPitch = output<string>();
  readonly columns: { key: FingerprintColumn; label: string }[] = [
    { key: 'client', label: 'Client' },
    { key: 'cities', label: 'Cities' },
    { key: 'pitches', label: 'Pitches' },
    { key: 'recruiters', label: 'Recruiters' },
    { key: 'lastSeen', label: 'Last seen' },
  ];
  // Newest first: the set that just arrived is the one to ask about.
  readonly sort = signal<{ column: FingerprintColumn; descending: boolean }>({ column: 'lastSeen', descending: true });
  readonly sorted = computed(() => sortFingerprints(fingerprintRows(this.rows(), this.clients()), this.sort().column, this.sort().descending));
  sortBy(column: FingerprintColumn) {
    this.sort.update((current) => ({ column, descending: current.column === column ? !current.descending : column !== 'client' && column !== 'cities' }));
  }
  ariaSort(column: FingerprintColumn) {
    const current = this.sort();
    return current.column !== column ? 'none' : current.descending ? 'descending' : 'ascending';
  }
  draft(row: FingerprintRow) {
    return drafts().get(row.key) ?? '';
  }
  setDraft(row: FingerprintRow, value: string) {
    drafts.update((current) => new Map(current).set(row.key, value));
  }
  name(row: FingerprintRow) {
    const name = this.draft(row).trim();
    if (!name || this.busy()) return;
    this.save.emit({ name, cities: row.cities });
  }
}
