const UINT32_SIZE = 0x1_0000_0000;
const UINT32_MAX = UINT32_SIZE - 1;
const FNV_OFFSET_BASIS = 0x811c_9dc5;
const FNV_PRIME = 0x0100_0193;
const STREAM_SEPARATOR = "\u001f";

export interface Rng {
  nextUint32(): number;
  fork(label: string): Rng;
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  weightedPick<T>(items: readonly T[], weights: readonly number[]): T;
  shuffle<T>(items: readonly T[]): T[];
  percent(p: number): boolean;
}

export function createRng(seed: string): Rng {
  return new SeededRng(streamKeyForSeed(seed));
}

class SeededRng implements Rng {
  #state: number;

  constructor(private readonly streamKey: string) {
    this.#state = hashStringToUint32(streamKey);
  }

  nextUint32(): number {
    this.#state = (this.#state + 0x6d2b_79f5) >>> 0;

    let value = this.#state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);

    return (value ^ (value >>> 14)) >>> 0;
  }

  fork(label: string): Rng {
    return new SeededRng(streamKeyForFork(this.streamKey, label));
  }

  int(min: number, max: number): number {
    assertSafeInteger(min, "min");
    assertSafeInteger(max, "max");

    if (min > max) {
      throw new RangeError("min must be less than or equal to max");
    }

    const range = max - min + 1;
    if (range < 1 || range > UINT32_SIZE) {
      throw new RangeError("range must contain between 1 and 4294967296 values");
    }

    const limit = UINT32_SIZE - (UINT32_SIZE % range);
    let value = this.nextUint32();

    while (value >= limit) {
      value = this.nextUint32();
    }

    return min + (value % range);
  }

  pick<T>(items: readonly T[]): T {
    assertNonEmpty(items, "items");
    return getAt(items, this.int(0, items.length - 1));
  }

  weightedPick<T>(items: readonly T[], weights: readonly number[]): T {
    assertNonEmpty(items, "items");

    if (items.length !== weights.length) {
      throw new RangeError("items and weights must have the same length");
    }

    let total = 0;
    for (const weight of weights) {
      assertSafeInteger(weight, "weight");

      if (weight < 0) {
        throw new RangeError("weights must be greater than or equal to 0");
      }

      total += weight;
      if (total > UINT32_MAX) {
        throw new RangeError("total weight must be less than or equal to 4294967295");
      }
    }

    if (total === 0) {
      throw new RangeError("at least one weight must be greater than 0");
    }

    const roll = this.int(1, total);
    let runningTotal = 0;

    for (let index = 0; index < weights.length; index += 1) {
      runningTotal += getAt(weights, index);
      if (roll <= runningTotal) {
        return getAt(items, index);
      }
    }

    throw new Error("weighted pick failed to select an item");
  }

  shuffle<T>(items: readonly T[]): T[] {
    const shuffled = [...items];

    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swapIndex = this.int(0, index);
      const value = getAt(shuffled, index);
      shuffled[index] = getAt(shuffled, swapIndex);
      shuffled[swapIndex] = value;
    }

    return shuffled;
  }

  percent(p: number): boolean {
    assertSafeInteger(p, "p");

    if (p < 0 || p > 100) {
      throw new RangeError("p must be between 0 and 100");
    }

    return this.int(1, 100) <= p;
  }
}

function hashStringToUint32(value: string): number {
  let hash = FNV_OFFSET_BASIS;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }

  return hash >>> 0;
}

function streamKeyForSeed(seed: string): string {
  return `seed${STREAM_SEPARATOR}${seed.length}${STREAM_SEPARATOR}${seed}`;
}

function streamKeyForFork(parentKey: string, label: string): string {
  return [
    "fork",
    parentKey.length.toString(),
    parentKey,
    label.length.toString(),
    label,
  ].join(STREAM_SEPARATOR);
}

function assertSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${name} must be a safe integer`);
  }
}

function assertNonEmpty<T>(items: readonly T[], name: string): void {
  if (items.length === 0) {
    throw new RangeError(`${name} must not be empty`);
  }
}

function getAt<T>(items: readonly T[], index: number): T {
  if (index < 0 || index >= items.length) {
    throw new RangeError("index out of bounds");
  }

  return items[index] as T;
}
