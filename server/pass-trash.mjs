// How long a finished delete's outcome waits for the page to collect it.
const KEEP_OUTCOME_MS = 10 * 60 * 1000;

/**
 * Deletes passed pitches' emails from Gmail one pitch at a time, after the Pass is saved.
 * Saving never waits for IMAP, so a run of Passes returns at once; Gmail caps concurrent
 * IMAP sessions per account, so the deletes queue behind each other instead of racing.
 * Each pitch's latest outcome is kept until the page collects it (or ten minutes pass).
 */
export function createPassTrash({ store, trasher, keepMs = KEEP_OUTCOME_MS }) {
  let tail = Promise.resolve();
  const jobs = new Map();

  async function run(id) {
    const row = store.snapshot().opportunities.find((item) => item.id === id);
    // Un-passed (or already deleted by an earlier job) while it waited: nothing to do.
    if (!row || row.status !== 'Passed' || !row.trashPending) return { ...row, trashed: 0, skipped: true };
    const retry = 'Click Pass again to retry.';
    if (!trasher) return { ...row, trashError: `Gmail is not set up: SMTP_USER and SMTP_PASS are missing. ${retry}` };
    const batch = [...row.messageIds];
    let trashed;
    try {
      ({ trashed } = await trasher.trash(batch));
    } catch (error) {
      return { ...row, trashError: `Gmail did not delete the email: ${error.message}. ${retry}` };
    }
    return { ...store.settleTrash(id, batch), trashed };
  }

  return {
    /** Queues the delete; the pitch must already be saved as Passed with trashPending set. */
    enqueue(id) {
      const job = tail
        .then(() => run(id))
        .catch((error) => ({ id, trashError: `Gmail delete failed: ${error.message}. Click Pass again to retry.` }));
      tail = job;
      jobs.set(id, job);
      void job.then(() => setTimeout(() => jobs.get(id) === job && jobs.delete(id), keepMs).unref?.());
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
