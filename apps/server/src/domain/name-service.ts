import type { Clock } from './clock.js';

const RESERVATION_DURATION_MS = 5 * 60 * 1_000;

export interface NameLease {
  readonly identityId: string;
  readonly input: string;
  readonly displayName: string;
  reservedUntil?: number;
}

export class NameService {
  private readonly leasesByIdentity = new Map<string, NameLease>();
  private readonly identitiesByDisplayName = new Map<string, string>();

  public constructor(private readonly clock: Clock) {}

  allocate(identityId: string, input: string): NameLease {
    this.releaseExpiredReservations();
    const existing = this.leasesByIdentity.get(identityId);
    if (existing !== undefined) {
      delete existing.reservedUntil;
      return existing;
    }

    const trimmed = input.trim();
    const graphemes = [
      ...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(
        trimmed,
      ),
    ];
    if (graphemes.length < 3 || graphemes.length > 24) {
      throw new Error('Name must contain 3-24 Unicode grapheme clusters');
    }

    let displayName = trimmed;
    let suffix = 2;
    while (this.identitiesByDisplayName.has(displayName)) {
      displayName = `${trimmed} ${suffix}`;
      suffix += 1;
    }

    const lease: NameLease = { identityId, input: trimmed, displayName };
    this.leasesByIdentity.set(identityId, lease);
    this.identitiesByDisplayName.set(displayName, identityId);
    return lease;
  }

  reserve(identityId: string): void {
    const lease = this.leasesByIdentity.get(identityId);
    if (lease !== undefined) {
      lease.reservedUntil = this.clock.now() + RESERVATION_DURATION_MS;
    }
  }

  release(identityId: string): void {
    const lease = this.leasesByIdentity.get(identityId);
    if (lease !== undefined) {
      this.leasesByIdentity.delete(identityId);
      this.identitiesByDisplayName.delete(lease.displayName);
    }
  }

  releaseExpiredReservations(): void {
    const now = this.clock.now();
    for (const lease of this.leasesByIdentity.values()) {
      if (lease.reservedUntil !== undefined && lease.reservedUntil <= now) {
        this.release(lease.identityId);
      }
    }
  }
}
