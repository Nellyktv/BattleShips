export interface Rng {
  next(): number;
}

export class MathRng implements Rng {
  next(): number {
    return Math.random();
  }
}

export class SequenceRng implements Rng {
  private index = 0;

  public constructor(private readonly values: readonly number[]) {}

  next(): number {
    const value = this.values[this.index % this.values.length];
    this.index += 1;
    if (value === undefined) {
      throw new Error('SequenceRng requires at least one value');
    }
    return value;
  }
}
