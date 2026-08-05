import { describe, expect, it } from 'vitest';
import { coordinateToPosition, positionToCoordinate } from './coordinates.js';

describe('coordinate conversion', () => {
  it('converts the complete board coordinate range in both directions', () => {
    expect(coordinateToPosition('A1')).toEqual({ column: 0, row: 0 });
    expect(coordinateToPosition('L12')).toEqual({ column: 11, row: 11 });
    expect(positionToCoordinate({ column: 0, row: 0 })).toBe('A1');
    expect(positionToCoordinate({ column: 11, row: 11 })).toBe('L12');
  });

  it('rejects coordinates outside the shared board notation', () => {
    expect(() => coordinateToPosition('M1')).toThrow();
    expect(() => positionToCoordinate({ column: 12, row: 0 })).toThrow();
  });
});
