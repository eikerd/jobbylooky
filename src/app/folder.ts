import type { JobGroup, Opportunity } from './models';

const PURSUING = new Set(['Pursue', 'Applied', 'Interviewing', 'Offer']);

export function inFolder(row: Pick<Opportunity, 'status'>, folder: string) {
  return (
    folder === 'All opportunities' ||
    (folder === 'Inbox' && row.status === 'New') ||
    (folder === 'Pursuing' && PURSUING.has(row.status)) ||
    row.status === folder
  );
}

/**
 * The jobs a folder lists, each shown by its newest pitch in that folder, newest first.
 * Nothing jumps the queue: an unseen voicemail is flagged by its badge, not moved to the top.
 */
export function folderRows(groups: readonly JobGroup[], folder: string) {
  return groups
    .filter((group) => group.pitches.some((row) => inFolder(row, folder)))
    .map((group) => ({ ...group, representative: group.pitches.find((row) => inFolder(row, folder))! }))
    .sort((a, b) => Date.parse(b.representative.receivedAt) - Date.parse(a.representative.receivedAt));
}
