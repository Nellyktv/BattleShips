// @vitest-environment jsdom

import { createElement, type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

interface MockKonvaProps {
  readonly children?: ReactNode;
  readonly fill?: string;
  readonly onMouseUp?: (event: {
    readonly target: {
      getStage: () => {
        getPointerPosition: () => { x: number; y: number };
      };
    };
  }) => void;
}

vi.mock('react-konva', () => ({
  Circle: (props: MockKonvaProps) => createElement('div', props),
  Group: ({ children, onMouseUp }: MockKonvaProps) =>
    createElement(
      'div',
      {
        onMouseUp: (event: { clientX: number; clientY: number }) =>
          onMouseUp?.({
            target: {
              getStage: () => ({
                getPointerPosition: () => ({
                  x: event.clientX,
                  y: event.clientY,
                }),
              }),
            },
          }),
      },
      children,
    ),
  Layer: ({ children }: MockKonvaProps) => createElement('div', null, children),
  Line: (props: MockKonvaProps) => createElement('div', props),
  Rect: ({ fill }: MockKonvaProps) =>
    createElement('div', {
      'data-testid': fill === '#081a2c' ? 'empty-playable-cell' : undefined,
    }),
  Stage: ({ children }: MockKonvaProps) => createElement('div', null, children),
  Text: (props: MockKonvaProps) => createElement('div', props),
}));

import { Board } from './Board.js';

afterEach(cleanup);

describe('Board interaction contract', () => {
  it('invokes onCellPointerUp once when releasing in an empty playable cell', () => {
    const onCellPointerUp = vi.fn();
    render(
      createElement(Board, {
        boardSize: 2,
        cellSize: 40,
        fleet: [],
        onCellPointerUp,
      }),
    );

    fireEvent.mouseUp(screen.getByTestId('empty-playable-cell'), {
      clientX: 80,
      clientY: 80,
    });

    expect(onCellPointerUp).toHaveBeenCalledExactlyOnceWith(1, 1);
  });
});
