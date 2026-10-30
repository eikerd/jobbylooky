import { gmailIds } from './gmail-trash.mjs';

// How long a finished delete's outcome waits for the page to collect it.
const KEEP_OUTCOME_MS = 10 * 60 * 1000;

/**
 * Passed pitches whose Gmail delete has not finished, however they were passed: a delete that
 * failed or was cut off by a restart, or later mail in a thread already passed. Every mail check
 * retries them, so no email waits on the owner clicking Pass a second time.
 */
export const awaitingTrash = (rows) =>
  rows.filter((row) => row.status === 'Passed' && row.trashPending && gmailIds(row.messageIds).length);

/** The connection banner's line for deletes that keep failing; '' when none do. */
export function trashFailureText(failed) {
  if (!failed.length) return '';
  const [first] = failed;
  const more = failed.length > 1 ? ` and ${failed.length - 1} more` : '';
  const by = first.rule ? 'A reject rule' : first.phrase ? `The delete phrase "${first.phrase}"` : first.repeat || first.closed ? 'Jobbylooky' : 'You';
  const why = first.repeat ? ' as a repeat of a job you passed' : first.closed ? ' after its postings closed' : '';
  return `${by} passed "${first.title}"${more}${why}, but Gmail did not delete it. It retries on every mail check.`;
}

/**
 * Deletes passed pitches' emails from Gmail one pitch at a time, after the Pass is saved.
 * Saving never waits for IMAP, so a run of Passes returns at once; Gmail caps concurrent
 * IMAP sessions per account, so the deletes queue behind each other instead of racing.
 * Each pitch's latest outcome is kept until the page collects it (or ten minutes pass).
 */
export function createPassTrash({ store, trasher, keepMs = KEEP_OUTCOME_MS }) {
  let tail = Promise.resolve();
  const jobs = new Map();
  const unfinished = new Set();

  const current = (id) => store.snapshot().opportunities.find((item) => item.id === id);
  async function run(id) {
    const row = current(id);
    // Un-passed (or already deleted by an earlier job) while it waited: nothing to do.
    if (!row || row.status !== 'Passed' || !row.trashPending) return { ...row, trashed: 0, skipped: true };
    const retry = 'It retries on every mail check.';
    if (!trasher) return { ...row, trashError: `Gmail is not set up: SMTP_USER and SMTP_PASS are missing. ${retry}` };
    const batch = [...row.messageIds];
    let trashed, preview;
    try {
      ({ trashed, preview } = await trasher.trash(batch));
    } catch (error) {
      // IMAP can take a while; the row may have changed meanwhile, so report the current one.
      return { ...current(id), trashError: `Gmail did not delete the email: ${error.message}. ${retry}` };
    }
    return { ...store.settleTrash(id, batch), trashed, preview };
  }

  return {
    /** Queues the delete; the pitch must already be saved as Passed with trashPending set. */
    enqueue(id) {
      // A second Pass while the first delete is still queued or running joins it, so the
      // outcome the page is waiting for is not replaced by an empty "nothing left to do".
      if (unfinished.has(id)) return jobs.get(id);
      const job = tail
        .then(() => run(id))
        .catch((error) => ({ id, trashError: `Gmail delete failed: ${error.message}. It retries on every mail check.` }));
      tail = job;
      jobs.set(id, job);
      unfinished.add(id);
      void job.then(() => {
        unfinished.delete(id);
        setTimeout(() => jobs.get(id) === job && jobs.delete(id), keepMs).unref?.();
      });
      return job;
    },
    /** Waits for the pitch's queued delete; null when none is queued or its outcome was collected. */
    async outcome(id) {
      const job = jobs.get(id);
      if (!job) return null;
      const result = await job;
      if (jobs.get(id) === job) jobs.delete(id);
      return result;
    },
  };
}
