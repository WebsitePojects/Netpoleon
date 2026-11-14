import type { SeededRandom } from './random.js';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
// Asia/Manila has no daylight saving time, so a fixed offset is exact.
const MANILA_OFFSET_MS = 8 * HOUR_MS;

/**
 * Every date in the seed is relative to one instant, taken once, and "today" is the calendar
 * date in Asia/Manila (as everywhere in this system), whatever zone the machine runs in.
 */
export class SeedClock {
  readonly now: Date;
  /** Manila midnight of today, expressed as a UTC instant. */
  private readonly manilaMidnight: number;

  constructor(now: Date) {
    this.now = now;
    const manilaWallClock = now.getTime() + MANILA_OFFSET_MS;
    this.manilaMidnight = manilaWallClock - (manilaWallClock % DAY_MS) - MANILA_OFFSET_MS;
  }

  /** The Manila calendar date `days` before today (negative: after), as `YYYY-MM-DD`. */
  date(daysAgo: number): string {
    const wallClock = new Date(this.manilaMidnight - daysAgo * DAY_MS + MANILA_OFFSET_MS);
    return wallClock.toISOString().slice(0, 10);
  }

  /** Adds days to a `YYYY-MM-DD` date. */
  static addDays(date: string, days: number): string {
    return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
  }

  /**
   * An instant during working hours (08:00 to 17:59 Manila) `daysAgo` days before today,
   * never later than a minute before now, so nothing "today" sorts after the present.
   */
  workingHour(daysAgo: number, random: SeededRandom): Date {
    const offset = random.between(8, 17) * HOUR_MS + random.between(0, 59) * 60_000;
    const instant = this.manilaMidnight - daysAgo * DAY_MS + offset;
    return new Date(Math.min(instant, this.now.getTime() - 60_000));
  }
}
