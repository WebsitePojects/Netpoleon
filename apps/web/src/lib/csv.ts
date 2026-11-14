type Cell = string | number | null;

function escapeCell(value: Cell): string {
  const text = value === null ? '' : String(value);
  // A leading = + - @ makes spreadsheet apps run the cell as a formula; the quote disarms it.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function toCsv(header: string[], rows: Cell[][]): string {
  return [header, ...rows].map((row) => row.map(escapeCell).join(',')).join('\r\n');
}

/** Builds the file in the browser and hands it to the download manager. */
export function downloadCsv(filename: string, header: string[], rows: Cell[][]): void {
  // The byte-order mark makes Excel read the file as UTF-8.
  const blob = new Blob(['﻿', toCsv(header, rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
