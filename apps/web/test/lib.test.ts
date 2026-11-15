import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { code128 } from '../src/lib/barcode.js';
import { passwordProblem } from '@wms/contracts';
import { randomToken, sha256Hex } from '../src/lib/sha256.js';

describe('sha256Hex', () => {
  it('matches the published test vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    // Two blocks: the padding spills into a second 64-byte block.
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it('agrees with Node for multi-byte text and every padding boundary', () => {
    for (const length of [0, 1, 55, 56, 57, 63, 64, 65, 119, 120, 200]) {
      const text = 'é漢'.repeat(length).slice(0, length) + 'x'.repeat(length % 7);
      expect(sha256Hex(text)).toBe(createHash('sha256').update(text, 'utf8').digest('hex'));
    }
  });

  it('makes URL-safe tokens that do not repeat', () => {
    const tokens = new Set(Array.from({ length: 50 }, randomToken));
    expect(tokens.size).toBe(50);
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe('passwordProblem', () => {
  it('enforces length and refuses common passwords with decorations', () => {
    expect(passwordProblem('short', 12)).toMatch(/at least 12/);
    expect(passwordProblem('Password2024!', 12)).toMatch(/too common/);
    expect(passwordProblem('aaaaaaaaaaaaaa', 12)).toMatch(/repeat/);
    expect(passwordProblem('blue-shelf-forty-two', 12)).toBeNull();
  });
});

describe('code128', () => {
  it('encodes an asset code with start, check and stop symbols', () => {
    const barcode = code128('NTP-SW-00124');
    // 12 characters + start + check = 14 symbols of 11 modules, stop is 13, quiet zones 2 x 10.
    expect(barcode.width).toBe(14 * 11 + 13 + 20);
    expect(barcode.bars[0]?.x).toBe(10);
  });

  it('refuses characters set B cannot carry', () => {
    expect(() => code128('NTP\u0001')).toThrow(/cannot encode/);
  });
});
