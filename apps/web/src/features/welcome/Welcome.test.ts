// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { Welcome } from './Welcome.js';

afterEach(cleanup);

describe('Welcome', () => {
  it('does not submit names outside the 3–24 grapheme range', () => {
    const onSubmit = vi.fn();
    render(createElement(Welcome, { onSubmit }));

    const input = screen.getByLabelText('Name');
    fireEvent.change(input, { target: { value: 'ab' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enter lobby' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Use 3–24 characters.')).toBeTruthy();
  });

  it('submits a valid trimmed name through the injected action', () => {
    const onSubmit = vi.fn();
    render(createElement(Welcome, { onSubmit }));

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: '  Admiral  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enter lobby' }));

    expect(onSubmit).toHaveBeenCalledWith('Admiral');
  });
});
