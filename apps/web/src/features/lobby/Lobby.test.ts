// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { Lobby, type LobbyActions, type LobbyViewModel } from './Lobby.js';

afterEach(cleanup);

const model: LobbyViewModel = {
  kind: 'lobby',
  player: {
    playerId: 'player-1',
    name: 'Admiral',
    stats: { games: 8, wins: 5, losses: 3 },
  },
  waitingGames: [{ gameId: 'old', hostName: 'Old Host', preset: 'quick-8x8' }],
  activeGames: [
    {
      gameId: 'active',
      players: ['Admiral', 'Rival'],
      preset: 'classic-10x10',
      phase: 'battle',
    },
  ],
  connected: true,
};

describe('Lobby', () => {
  it('renders public game data and routes clicks to injected actions', () => {
    const actions: LobbyActions = {
      create: vi.fn(),
      join: vi.fn(),
      quickPlay: vi.fn(),
      cancel: vi.fn(),
      rename: vi.fn(),
      leave: vi.fn(),
    };
    render(createElement(Lobby, { model, actions }));

    expect(screen.getByText('Old Host')).toBeTruthy();
    expect(screen.getByText('In battle')).toBeTruthy();
    expect(screen.getByText('8 games')).toBeTruthy();
    expect(screen.getByText('5 wins')).toBeTruthy();
    expect(screen.getByText('3 losses')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Join Old Host' }));
    fireEvent.click(screen.getByRole('button', { name: 'Quick Play' }));
    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));

    expect(actions.join).toHaveBeenCalledWith('old');
    expect(actions.quickPlay).toHaveBeenCalledOnce();
    expect(actions.leave).toHaveBeenCalledOnce();
  });
});
