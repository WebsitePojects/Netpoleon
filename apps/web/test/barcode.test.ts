import { describe, expect, it } from 'vitest';
import { code128 } from '../src/lib/barcode.js';

/** Reads the bars back into element widths, the way a scanner measures them. */
function widths(text: string): number[] {
  const { bars, width } = code128(text);
  const out: number[] = [];
  bars.forEach((bar, index) => {
    out.push(bar.width);
    const next = bars[index + 1];
    if (next) out.push(next.x - (bar.x + bar.width));
    else expect(width - (bar.x + bar.width)).toBe(10); // trailing quiet zone
  });
  return out;
}

describe('Code 128 set B', () => {
  it('encodes "Hello" as start B, the five symbols, check 76 and stop', () => {
    // Independent reference: H=40 e=69 l=76 l=76 o=79; (104 + 40·1 + 69·2 + 76·3 + 76·4 + 79·5) mod 103 = 76.
    const expected = [
      '211214', // start B (104)
      '231113', // H = 40
      '112214', // e = 69
      '221114', // l = 76
      '221114', // l = 76
      '134111', // o = 79
      '221114', // check 76
      '2331112', // stop
    ].join('');
    expect(widths('Hello').join('')).toBe(expected);
  });

  it('starts after a ten-module quiet zone and spans 11 modules per symbol plus a 13-module stop', () => {
    const code = 'NTP-SRV-00124';
    const { bars, width } = code128(code);
    expect(bars[0]?.x).toBe(10);
    // start + characters + check = 11 modules each; stop = 13; two quiet zones of 10.
    expect(width).toBe(11 * (code.length + 2) + 13 + 20);
  });

  it('refuses a character set B cannot carry', () => {
    expect(() => code128('NTP-SW-0012é')).toThrow(/cannot encode/);
  });
});
