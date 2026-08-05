import { describe, expect, it } from 'vitest';
import { isCompleteFleet, randomizeFleet } from './index.js';

describe('fleet randomizer', () => {
  it('uses injected randomness deterministically and always returns a legal fleet', () => {
    const sequence = [0.13, 0.87, 0.31, 0.69, 0.42, 0.58];
    const first = randomizeFleet('quick-8x8', () => sequence.shift() ?? 0);
    const repeatSequence = [0.13, 0.87, 0.31, 0.69, 0.42, 0.58];
    const repeated = randomizeFleet(
      'quick-8x8',
      () => repeatSequence.shift() ?? 0,
    );
    const second = randomizeFleet('quick-8x8', () => 0.25);

    expect(first).toEqual(repeated);
    expect(isCompleteFleet('quick-8x8', first)).toBe(true);
    expect(isCompleteFleet('quick-8x8', second)).toBe(true);
  });
});
