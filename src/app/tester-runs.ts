/**
 * Which tester run is current and which one the worker is executing. Any input makes the current run
 * stale at once; a stale run still ends when its reply or its deadline comes, but only the current run
 * may show a result or the too-slow alert. Without this split a stale reply was dropped with its
 * deadline still armed, and a fast regex was reported as a runaway while the owner kept typing.
 */
export class TesterRuns {
  private latest = 0;
  private executing: number | null = null;
  private deadline: ReturnType<typeof setTimeout> | undefined;
  private readonly deadlineMs: number;

  constructor(deadlineMs: number) {
    this.deadlineMs = deadlineMs;
  }

  /** The worker is executing a run that has neither replied nor hit its deadline. */
  get running() {
    return this.executing !== null;
  }
  /** New input: whatever is executing is stale from now on. */
  invalidate() {
    this.latest++;
  }
  /**
   * Starts a run and returns its id. `onRunaway(current)` fires only if that run is still executing at
   * the deadline; `current` says whether it is also the latest input's run.
   */
  start(onRunaway: (current: boolean) => void): number {
    clearTimeout(this.deadline);
    const id = ++this.latest;
    this.executing = id;
    this.deadline = setTimeout(() => {
      if (this.executing !== id) return;
      this.executing = null;
      onRunaway(id === this.latest);
    }, this.deadlineMs);
    return id;
  }
  /** A reply came back: it ends its run if that run is executing. True only when the run is also current. */
  finish(id: number): boolean {
    if (this.executing !== id) return false;
    this.end();
    return id === this.latest;
  }
  /** The worker was stopped or replaced: nothing is executing and no deadline is armed. */
  end() {
    clearTimeout(this.deadline);
    this.executing = null;
  }
}
