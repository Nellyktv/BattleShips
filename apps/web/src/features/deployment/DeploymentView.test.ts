// @vitest-environment jsdom

import { createElement } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

vi.mock('../board/Board.js', () => ({ Board: () => null }));

import { DeploymentView } from './DeploymentView.js';

afterEach(cleanup);

describe('DeploymentView', () => {
  it('injects the confirmed fleet into the ready action', () => {
    const onReady = vi.fn();
    render(
      createElement(DeploymentView, {
        preset: 'classic-10x10',
        phase: 'deployment',
        pending: false,
        initialFleet: [
          { length: 5, cells: ['A1', 'B1', 'C1', 'D1', 'E1'] },
          { length: 4, cells: ['A3', 'B3', 'C3', 'D3'] },
          { length: 3, cells: ['A5', 'B5', 'C5'] },
          { length: 3, cells: ['A7', 'B7', 'C7'] },
          { length: 2, cells: ['A9', 'B9'] },
        ],
        onReady,
        opponentStatus: 'placing',
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: /ready/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    expect(onReady).toHaveBeenCalledWith([
      { length: 5, cells: ['A1', 'B1', 'C1', 'D1', 'E1'] },
      { length: 4, cells: ['A3', 'B3', 'C3', 'D3'] },
      { length: 3, cells: ['A5', 'B5', 'C5'] },
      { length: 3, cells: ['A7', 'B7', 'C7'] },
      { length: 2, cells: ['A9', 'B9'] },
    ]);
  });

  it('preserves a locally randomized fleet across opponent snapshot updates', () => {
    const onReady = vi.fn();
    const view = createElement(DeploymentView, {
      preset: 'classic-10x10',
      phase: 'deployment',
      onReady,
      opponentStatus: 'placing',
    });
    const { rerender } = render(view);

    fireEvent.click(screen.getByRole('button', { name: 'Randomize' }));
    expect(
      screen.getByRole('button', { name: 'Ready', hidden: true }),
    ).toHaveProperty('disabled', false);

    rerender(
      createElement(DeploymentView, {
        preset: 'classic-10x10',
        phase: 'deployment',
        onReady,
        opponentStatus: 'ready',
      }),
    );

    expect(
      screen.getByRole('button', { name: 'Ready', hidden: true }),
    ).toHaveProperty('disabled', false);
  });

  it('becomes editable again when a pending Ready command is rejected', () => {
    const onReady = vi.fn();
    const props = {
      preset: 'classic-10x10' as const,
      phase: 'deployment' as const,
      pending: false,
      initialFleet: [
        { length: 5, cells: ['A1', 'B1', 'C1', 'D1', 'E1'] },
        { length: 4, cells: ['A3', 'B3', 'C3', 'D3'] },
        { length: 3, cells: ['A5', 'B5', 'C5'] },
        { length: 3, cells: ['A7', 'B7', 'C7'] },
        { length: 2, cells: ['A9', 'B9'] },
      ],
      onReady,
      opponentStatus: 'placing' as const,
    };
    const { rerender } = render(createElement(DeploymentView, props));

    fireEvent.click(screen.getByRole('button', { name: 'Ready' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    rerender(createElement(DeploymentView, { ...props, pending: true }));
    expect(
      screen.getByRole('button', { name: 'Ready', hidden: true }),
    ).toHaveProperty('disabled', true);

    rerender(createElement(DeploymentView, { ...props, pending: false }));
    expect(
      screen.getByRole('button', { name: 'Ready', hidden: true }),
    ).toHaveProperty('disabled', false);
    expect(onReady).toHaveBeenCalledOnce();
  });
});
