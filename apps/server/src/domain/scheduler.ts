export interface Scheduler {
  schedule(delay: number, callback: () => void): () => void;
}

export class TimeoutScheduler implements Scheduler {
  schedule(delay: number, callback: () => void): () => void {
    const handle = setTimeout(callback, delay);
    return () => clearTimeout(handle);
  }
}

export class ManualScheduler implements Scheduler {
  private readonly jobs = new Map<
    number,
    { at: number; callback: () => void }
  >();
  private nextId = 0;

  constructor(private readonly clock: { now(): number }) {}

  schedule(delay: number, callback: () => void): () => void {
    const id = this.nextId++;
    this.jobs.set(id, { at: this.clock.now() + delay, callback });
    return () => this.jobs.delete(id);
  }

  runDue(): void {
    for (const [id, job] of [...this.jobs]) {
      if (job.at <= this.clock.now()) {
        this.jobs.delete(id);
        job.callback();
      }
    }
  }
}
