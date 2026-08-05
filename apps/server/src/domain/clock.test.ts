import { describe, expect, it } from 'vitest';
import { FakeClock } from './clock.js';

describe('FakeClock', () => {
  it('advances injected time without waiting in real time', () => {
    const clock = new FakeClock(1_000);

    clock.advance(250);

    expect(clock.now()).toBe(1_250);
  });
});
