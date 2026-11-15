/**
 * Code 128 (set B) for the asset label. Set B covers every character an asset code can hold
 * (`NTP-SW-00124`), and Code 128 is read by every handheld scanner, so no symbology setting
 * on the scanner has to change.
 */

// Bar/space widths for each symbol value 0–106, as module counts. 106 is the stop pattern
// (it carries a seventh element, the final 2-module bar).
// prettier-ignore
const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212',
  '221213', '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221',
  '223211', '221132', '221231', '213212', '223112', '312131', '311222', '321122', '321221',
  '312212', '322112', '322211', '212123', '212321', '232121', '111323', '131123', '131321',
  '112313', '132113', '132311', '211313', '231113', '231311', '112133', '112331', '132131',
  '113123', '113321', '133121', '313121', '211331', '231131', '213113', '213311', '213131',
  '311123', '311321', '331121', '312113', '312311', '332111', '314111', '221411', '431111',
  '111224', '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114',
  '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', '111242',
  '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311',
  '113141', '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];

const START_B = 104;
const STOP = 106;

export interface Barcode {
  /** One rect per bar, in module units. */
  bars: { x: number; width: number }[];
  /** Total width in modules, quiet zones included. */
  width: number;
}

const QUIET_ZONE = 10;

export function code128(text: string): Barcode {
  const values: number[] = [START_B];
  for (const char of text) {
    const code = char.charCodeAt(0);
    if (code < 32 || code > 126) {
      throw new Error(`Code 128 set B cannot encode character code ${code}.`);
    }
    values.push(code - 32);
  }
  // The check symbol: start value plus each symbol value times its position, modulo 103.
  const checksum = values.reduce((sum, value, index) => sum + value * Math.max(index, 1), 0) % 103;
  values.push(checksum, STOP);

  const bars: { x: number; width: number }[] = [];
  let x = QUIET_ZONE;
  for (const value of values) {
    const pattern = PATTERNS[value] ?? '';
    [...pattern].forEach((digit, index) => {
      const width = Number(digit);
      // Elements alternate bar, space, bar…, always starting with a bar.
      if (index % 2 === 0) bars.push({ x, width });
      x += width;
    });
  }
  return { bars, width: x + QUIET_ZONE };
}
