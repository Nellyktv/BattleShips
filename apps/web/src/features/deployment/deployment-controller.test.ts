import { describe, expect, it } from 'vitest';
import type { PlacementShip } from '@battleships/contracts';
import { createDeploymentController } from './deployment-controller.js';

const classicFleet: PlacementShip[] = [
  { length: 5, cells: ['A1', 'B1', 'C1', 'D1', 'E1'] },
  { length: 4, cells: ['A3', 'B3', 'C3', 'D3'] },
  { length: 3, cells: ['A5', 'B5', 'C5'] },
  { length: 3, cells: ['A7', 'B7', 'C7'] },
  { length: 2, cells: ['A9', 'B9'] },
];

describe('deployment controller', () => {
  it('rotates a ship around its first cell', () => {
    const controller = createDeploymentController('classic-10x10', [
      classicFleet[0]!,
    ]);

    expect(controller.rotate(0)).toEqual({
      valid: true,
      fleet: [{ length: 5, cells: ['A1', 'A2', 'A3', 'A4', 'A5'] }],
    });
  });

  it('snaps back an illegal move without changing the fleet', () => {
    const controller = createDeploymentController('classic-10x10', [
      classicFleet[0]!,
    ]);

    expect(controller.move(0, { column: 8, row: 0 })).toEqual({
      valid: false,
      fleet: [classicFleet[0]],
      reason: 'out-of-bounds',
    });
  });

  it('randomizes a complete legal fleet through the engine', () => {
    const controller = createDeploymentController(
      'classic-10x10',
      [],
      () => 0.25,
    );

    const result = controller.randomize();

    expect(result.valid).toBe(true);
    expect(result.fleet).toHaveLength(5);
    expect(controller.isComplete()).toBe(true);
  });

  it('returns a complete fleet without locking before authoritative readiness', () => {
    const controller = createDeploymentController(
      'classic-10x10',
      classicFleet,
    );
    expect(controller.canReady()).toBe(true);
    expect(controller.confirmReady()).toEqual({
      ok: true,
      locked: false,
      fleet: classicFleet,
    });
    expect(controller.canReady()).toBe(true);
    expect(controller.move(0, { column: 0, row: 1 }).valid).toBe(true);
    controller.syncReadyState(true);
    expect(controller.confirmReady()).toEqual({ ok: false, locked: true });
  });

  it('does not ready an incomplete fleet', () => {
    const controller = createDeploymentController('classic-10x10', [
      classicFleet[0]!,
    ]);
    expect(controller.canReady()).toBe(false);
    expect(controller.confirmReady()).toEqual({ ok: false, locked: false });
  });

  it('starts locked and stays locked when authoritative ready state is synced', () => {
    const controller = createDeploymentController(
      'classic-10x10',
      classicFleet,
      Math.random,
      { locked: true },
    );

    expect(controller.canReady()).toBe(false);
    expect(controller.move(0, { column: 0, row: 1 })).toEqual({
      valid: false,
      fleet: classicFleet,
      reason: 'locked',
    });
    controller.syncReadyState(false);
    expect(controller.canReady()).toBe(false);
    controller.syncReadyState(true);
    expect(controller.canReady()).toBe(false);
  });
});
