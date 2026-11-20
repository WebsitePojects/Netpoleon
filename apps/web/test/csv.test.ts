import { describe, expect, it } from 'vitest';
import { parseCsv, toCsv } from '../src/lib/csv.js';

describe('parseCsv', () => {
  it('reads plain rows and skips blank lines', () => {
    expect(parseCsv('a,b\n\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('keeps commas, quotes and line breaks inside quoted fields', () => {
    expect(parseCsv('model,notes\r\n"Cisco, C9200","Dent on lid\nsays ""fragile"""\r\n')).toEqual([
      ['model', 'notes'],
      ['Cisco, C9200', 'Dent on lid\nsays "fragile"'],
    ]);
  });

  it('drops the byte-order mark Excel writes and keeps empty fields', () => {
    expect(parseCsv('﻿model,serial,notes\nX,1,')).toEqual([
      ['model', 'serial', 'notes'],
      ['X', '1', ''],
    ]);
  });

  it('reads back what toCsv writes', () => {
    const values = ['plain', 'with, comma', 'with "quote"', 'two\nlines'];
    expect(parseCsv(toCsv(values, [values]))).toEqual([values, values]);
  });
});
