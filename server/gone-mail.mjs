import { threadMailIds } from './store.mjs';

// How often Gmail is asked whether the listed pitches' emails still exist.
export const GONE_CHECK_MS = 10 * 60 * 1000;
// Gmail finding not one of this many emails is a broken search, not the owner clearing out mail.
const IMPLAUSIBLE = 10;

/** The pitches on the list whose emails Gmail can be asked about: New or Maybe, from this account. */
export const listedInGmail = (rows, account = '') =>
  rows.filter(
    (row) =>
      ['New', 'Maybe'].includes(row.status) &&
      !row.goneFromGmail &&
      (!row.account || !account || row.account.toLowerCase() === account.toLowerCase()) &&
      threadMailIds(row).length,
  );

/**
 * Every check asks Gmail for each listed pitch's emails and passes the pitches whose emails are
 * all gone. One check at a time; a second call while one runs joins it.
 */
export function createGoneCheck({ store, presence, account = '' }) {
  let running = null;
  async function run() {
    const rows = listedInGmail(store.snapshot().opportunities, account);
    const ids = [...new Set(rows.flatMap(threadMailIds))];
    if (!ids.length) return [];
    const missing = new Set(await presence.missing(ids));
    if (ids.length >= IMPLAUSIBLE && missing.size === ids.length)
      throw new Error(`Gmail found none of the ${ids.length} emails on the list, so none were taken off it`);
    // Re-read inside the store: mail that arrived during the check was never asked about, so it keeps its pitch.
    return store.passGone(missing, new Set(rows.map((row) => row.id)));
  }
  return {
    check() {
      running ??= run().finally(() => (running = null));
      return running;
    },
  };
}
