import { describe, expect, it } from 'vitest';
import { validPlayerName } from './validation.js';

describe('validPlayerName', () => {
  it('counts a combined emoji as one grapheme', () => {
    expect(validPlayerName('A👨‍👩‍👧B')).toBe(true);
  });

  it('rejects names that are only whitespace', () => {
    expect(validPlayerName('   ')).toBe(false);
  });
});
