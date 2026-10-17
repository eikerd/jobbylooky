import { Component, computed, input, output, signal } from '@angular/core';
import { Age } from './age.component';
import type { Opportunity } from './models';
import { fingerprintRows, sortFingerprints, type Client, type FingerprintColumn, type FingerprintRow } from './clients';

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
  /** The name typed into an unnamed row, by the row's key, until it is saved. */
  readonly drafts = signal<ReadonlyMap<string, string>>(new Map());
  sortBy(column: FingerprintColumn) {
    this.sort.update((current) => ({ column, descending: current.column === column ? !current.descending : column !== 'client' && column !== 'cities' }));
  }
  ariaSort(column: FingerprintColumn) {
    const current = this.sort();
    return current.column !== column ? 'none' : current.descending ? 'descending' : 'ascending';
  }
  draft(row: FingerprintRow) {
    return this.drafts().get(row.key) ?? '';
  }
  setDraft(row: FingerprintRow, value: string) {
    this.drafts.update((drafts) => new Map(drafts).set(row.key, value));
  }
  name(row: FingerprintRow) {
    const name = this.draft(row).trim();
    if (!name || this.busy()) return;
    this.save.emit({ name, cities: row.cities });
  }
}
