import { MathRng, type Rng } from './rng.js';
import { NameService, type NameLease } from './name-service.js';
import { StatsService, type RuntimeStats } from './stats-service.js';

export type IdentityStatus = 'active' | 'idle' | 'busy';

export interface IdentityRecord {
  readonly identityId: string;
  readonly displayName: string;
  readonly stats: RuntimeStats;
  readonly status: IdentityStatus;
  readonly socketId?: string;
}

export interface ConnectResult {
  readonly identity: IdentityRecord;
  readonly replacedSocketId?: string;
}

export class IdentityService {
  private readonly identities = new Map<string, IdentityRecord>();
  private readonly identityBySocket = new Map<string, string>();

  public constructor(
    private readonly names: NameService,
    private readonly stats: StatsService,
    private readonly rng: Rng = new MathRng(),
  ) {}

  createIdentity(): string {
    return `tab-${this.rng.next().toString(36).slice(2)}-${this.rng.next().toString(36).slice(2)}`;
  }

  connect(
    identityId: string,
    socketId: string,
    inputName = 'Player',
  ): ConnectResult {
    const current = this.identities.get(identityId);
    const replacedSocketId = current?.socketId;
    if (replacedSocketId !== undefined)
      this.identityBySocket.delete(replacedSocketId);
    const lease = this.names.allocate(identityId, inputName);
    const identity = this.record(identityId, lease, 'active', socketId);
    this.identities.set(identityId, identity);
    this.identityBySocket.set(socketId, identityId);
    return {
      identity,
      ...(replacedSocketId === undefined ? {} : { replacedSocketId }),
    };
  }

  disconnect(socketId: string): void {
    const identityId = this.identityBySocket.get(socketId);
    if (identityId === undefined) return;
    this.identityBySocket.delete(socketId);
    const current = this.identities.get(identityId);
    if (current?.socketId !== socketId) return;
    this.names.reserve(identityId);
    this.identities.set(identityId, {
      ...current,
      status: current.status === 'busy' ? 'busy' : 'idle',
      socketId: undefined,
    });
  }

  setIdle(identityId: string): void {
    this.updateStatus(identityId, 'idle');
  }

  setBusy(identityId: string): void {
    this.updateStatus(identityId, 'busy');
  }

  rename(identityId: string, inputName: string): IdentityRecord {
    const current = this.require(identityId);
    if (current.status !== 'idle')
      throw new Error('Rename is allowed only while idle');
    this.names.release(identityId);
    const lease = this.names.allocate(identityId, inputName);
    const updated = this.record(identityId, lease, 'idle', current.socketId);
    this.identities.set(identityId, updated);
    return updated;
  }

  get(identityId: string): IdentityRecord | undefined {
    return this.identities.get(identityId);
  }

  getBySocket(socketId: string): IdentityRecord | undefined {
    const identityId = this.identityBySocket.get(socketId);
    return identityId === undefined ? undefined : this.get(identityId);
  }

  private updateStatus(identityId: string, status: IdentityStatus): void {
    const current = this.require(identityId);
    this.identities.set(identityId, { ...current, status });
  }

  private require(identityId: string): IdentityRecord {
    const identity = this.identities.get(identityId);
    if (identity === undefined)
      throw new Error(`Unknown identity: ${identityId}`);
    return identity;
  }

  private record(
    identityId: string,
    lease: NameLease,
    status: IdentityStatus,
    socketId?: string,
  ): IdentityRecord {
    return {
      identityId,
      displayName: lease.displayName,
      stats: this.stats.get(identityId),
      status,
      socketId,
    };
  }
}
