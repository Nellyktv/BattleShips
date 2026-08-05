import { describe, expect, it } from 'vitest';
import { SequenceRng } from './rng.js';

describe('SequenceRng', () => {
  it('returns injected values in order for deterministic allocation', () => {
    const rng = new SequenceRng([0.1, 0.8]);

    expect(rng.next()).toBe(0.1);
    expect(rng.next()).toBe(0.8);
  });
});
