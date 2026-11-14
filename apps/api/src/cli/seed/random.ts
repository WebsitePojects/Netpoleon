/**
 * A small seeded generator (mulberry32, the same one the web demo used), so the seed produces
 * the same dataset on every machine and a test can assert exact counts.
 * Not for anything security-related.
 */
export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed;
  }

  /** A float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  }

  /** An integer in [min, max], both ends included. */
  between(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    const item = items[Math.floor(this.next() * items.length)];
    if (item === undefined) {
      throw new Error('Cannot pick from an empty list.');
    }
    return item;
  }

  /** A shuffled copy (Fisher-Yates); the input is left as it was. */
  shuffle<T>(items: readonly T[]): T[] {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const other = Math.floor(this.next() * (index + 1));
      [copy[index], copy[other]] = [copy[other] as T, copy[index] as T];
    }
    return copy;
  }

  /**
   * A UUIDv7 for an event at `at`: time-ordered like the database's own uuidv7() defaults, but
   * reproducible because its random part comes from this generator.
   */
  uuidV7(at: Date): string {
    const bytes = new Uint8Array(16);
    let millis = at.getTime();
    for (let index = 5; index >= 0; index -= 1) {
      bytes[index] = millis % 256;
      millis = Math.floor(millis / 256);
    }
    for (let index = 6; index < 16; index += 1) {
      bytes[index] = Math.floor(this.next() * 256);
    }
    bytes[6] = 0x70 | ((bytes[6] ?? 0) & 0x0f); // version 7
    bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f); // RFC 4122 variant
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
}
