import { describe, expect, it } from 'vitest';
import { FakeClock } from './clock.js';
import { IdentityService } from './identity-service.js';
import { NameService } from './name-service.js';
import { StatsService } from './stats-service.js';

describe('IdentityService', () => {
  it('replaces the older socket when a duplicated tab identity connects', () => {
    const service = new IdentityService(
      new NameService(new FakeClock()),
      new StatsService(),
    );

    expect(
      service.connect('tab-1', 'socket-old').replacedSocketId,
    ).toBeUndefined();
    expect(service.connect('tab-1', 'socket-new').replacedSocketId).toBe(
      'socket-old',
    );
    expect(service.getBySocket('socket-old')).toBeUndefined();
    expect(service.getBySocket('socket-new')?.identityId).toBe('tab-1');
  });

  it('allows rename only while idle and preserves identity-owned stats', () => {
    const clock = new FakeClock();
    const stats = new StatsService();
    const service = new IdentityService(new NameService(clock), stats);
    service.connect('tab-1', 'socket-1', 'Captain');
    stats.complete('game-1', 'tab-1', 'other');

    expect(() => service.rename('tab-1', 'New Name')).toThrow(/idle/);
    service.setIdle('tab-1');
    expect(service.rename('tab-1', ' New Name ')?.displayName).toBe('New Name');
    expect(service.get('tab-1')?.stats).toEqual({
      games: 1,
      wins: 1,
      losses: 0,
    });
  });

  it('reserves an idle disconnected display name without changing stats', () => {
    const clock = new FakeClock();
    const names = new NameService(clock);
    const stats = new StatsService();
    const service = new IdentityService(names, stats);
    service.connect('tab-1', 'socket-1', 'Captain');
    service.setIdle('tab-1');
    service.disconnect('socket-1');

    expect(names.allocate('tab-2', 'Captain').displayName).toBe('Captain 2');
    expect(service.get('tab-1')?.stats).toEqual({
      games: 0,
      wins: 0,
      losses: 0,
    });
  });
});
