import { Component, computed, input, output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Age } from './age.component';
import type { Opportunity } from './models';
import { postingRows, sortPostings, type PostingColumn } from './link-state';

/** Every job posting the link sweep has read, to see how long jobs stay up. */
@Component({
  selector: 'app-postings',
  imports: [DatePipe, Age],
  templateUrl: './postings.html',
  styleUrl: './postings.css',
})
export class Postings {
  readonly rows = input.required<Opportunity[]>();
  readonly openPitch = output<string>();
  readonly columns: { key: PostingColumn; label: string }[] = [
    { key: 'title', label: 'Job' },
    { key: 'company', label: 'Company' },
    { key: 'site', label: 'Site' },
    { key: 'postedAt', label: 'Posted' },
    { key: 'daysOpen', label: 'Days open' },
    { key: 'status', label: 'Status' },
    { key: 'checkedAt', label: 'Checked' },
  ];
  // Longest open first: the question this view answers is how old jobs get.
  readonly sort = signal<{ column: PostingColumn; descending: boolean }>({ column: 'daysOpen', descending: true });
  readonly sorted = computed(() => sortPostings(postingRows(this.rows()), this.sort().column, this.sort().descending));
  sortBy(column: PostingColumn) {
    this.sort.update((current) => ({ column, descending: current.column === column ? !current.descending : column === 'daysOpen' }));
  }
  ariaSort(column: PostingColumn) {
    const current = this.sort();
    return current.column !== column ? 'none' : current.descending ? 'descending' : 'ascending';
  }
}
