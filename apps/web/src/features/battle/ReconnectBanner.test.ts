// @vitest-environment jsdom
import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReconnectBanner, remainingSeconds } from './ReconnectBanner.js';

describe('remainingSeconds', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('rounds an authoritative deadline up to the next visible second', () => {
    vi.setSystemTime(new Date(10_000));
    expect(remainingSeconds(12_001, Date.now())).toBe(3);
    vi.advanceTimersByTime(1_001);
    expect(remainingSeconds(12_001, Date.now())).toBe(1);
  });

  it('does not display negative reconnect time', () => {
    expect(remainingSeconds(1_000, 2_000)).toBe(0);
  });

  it('does not offer a connected opponent a meaningless local retry', () => {
    render(
      createElement(ReconnectBanner, {
        deadline: 12_000,
        localDisconnected: false,
        onRetry: vi.fn(),
      }),
    );

    expect(screen.getByText(/Opponent disconnected/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retry now' })).toBeNull();
  });

  it('shows retry only when this client is disconnected', () => {
    render(
      createElement(ReconnectBanner, {
        deadline: null,
        localDisconnected: true,
        onRetry: vi.fn(),
      }),
    );

    expect(screen.getByRole('button', { name: 'Retry now' })).toBeTruthy();
  });
});

afterEach(cleanup);
