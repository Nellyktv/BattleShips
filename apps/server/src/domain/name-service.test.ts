import { describe, expect, it } from 'vitest';
import { FakeClock } from './clock.js';
import { NameService } from './name-service.js';

describe('NameService', () => {
  it('validates trimmed graphemes while preserving inner text and case', () => {
    const names = new NameService(new FakeClock());

    expect(names.allocate('one', '  A😀B  ').displayName).toBe('A😀B');
    expect(() => names.allocate('two', 'ab')).toThrow(/3.*24/);
    expect(() => names.allocate('three', 'a'.repeat(25))).toThrow(/3.*24/);
  });

  it('allocates case-sensitive names using the lowest free suffix', () => {
    const names = new NameService(new FakeClock());

    expect(names.allocate('a', 'John').displayName).toBe('John');
    expect(names.allocate('b', 'John').displayName).toBe('John 2');
    expect(names.allocate('c', 'John').displayName).toBe('John 3');
    names.release('b');
    expect(names.allocate('d', 'John').displayName).toBe('John 2');
    expect(names.allocate('e', 'john').displayName).toBe('john');
    expect(names.allocate('f', 'John 2').displayName).toBe('John 2 2');
  });

  it('keeps an idle disconnect reservation for five minutes and then frees it', () => {
    const clock = new FakeClock();
    const names = new NameService(clock);

    names.allocate('a', 'Sailor');
    names.reserve('a');
    expect(names.allocate('b', 'Sailor').displayName).toBe('Sailor 2');

    clock.advance(5 * 60 * 1_000 + 1);
    names.releaseExpiredReservations();
    expect(names.allocate('c', 'Sailor').displayName).toBe('Sailor');
  });
});
