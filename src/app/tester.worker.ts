/// <reference lib="webworker" />
import { runTester, type TesterPitch } from './reject-rules';

// The regex runs here, off the page's thread: one that backtracks without end is killed by the
// Rules view after a deadline instead of freezing the tab. The stored mail is sent once per change.
let rows: TesterPitch[] = [];
addEventListener('message', ({ data }: MessageEvent) => {
  if (data.type === 'rows') rows = data.rows;
  else postMessage({ seq: data.seq, result: runTester(rows, data.pattern, data.field, data.pasted) });
});
