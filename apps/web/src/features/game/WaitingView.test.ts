// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { WaitingView } from './WaitingView.js';

afterEach(cleanup);

describe('WaitingView', () => {
  it('dispatches cancel when the waiting host chooses Cancel', () => {
    const onCancel = vi.fn();
    render(createElement(WaitingView, { onCancel }));

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledOnce();
  });
});
