import {
  type IMPORT_FIELDS,
  MAX_IMPORT_ROWS,
  type ImportUnitRow,
  type ImportUnitsResponse,
} from '@wms/contracts';
import { Download, FileUp } from 'lucide-react';
import { useRef, useState } from 'react';
import { apiSend, newIntentKey } from '../api/client.js';
import { useInvalidate } from '../api/queries.js';
import { useReference } from '../auth/auth.js';
import { Button, Dialog, FormError, useToast } from '../components/ui.js';
import { downloadCsv, parseCsv } from '../lib/csv.js';
import { useSubmit } from '../lib/hooks.js';

type Field = (typeof IMPORT_FIELDS)[number];

const HEADER_WORDS: Record<string, Field> = {
  model: 'model',
  'brand / model': 'model',
  serial: 'serial',
  'serial number': 'serial',
  shelf: 'shelf',
  'shelf code': 'shelf',
  location: 'shelf',
  condition: 'condition',
  grade: 'condition',
  notes: 'notes',
  note: 'notes',
};

/** Turns a spreadsheet into rows, by header name so the columns may come in any order. */
function readFile(text: string): { rows: ImportUnitRow[]; problem: string | null } {
  const [header, ...body] = parseCsv(text);
  if (!header) return { rows: [], problem: 'The file is empty.' };
  const columns = header.map((name) => HEADER_WORDS[name.trim().toLowerCase()] ?? null);
  const missing = (['model', 'serial', 'shelf'] as const).filter((f) => !columns.includes(f));
  if (missing.length > 0) {
    return {
      rows: [],
      problem: `The first row must name the columns; missing: ${missing.join(', ')}.`,
    };
  }
  if (body.length > MAX_IMPORT_ROWS) {
    return {
      rows: [],
      problem: `One file holds at most ${MAX_IMPORT_ROWS} units; split it in two.`,
    };
  }
  const rows = body.map((values) => {
    const row: ImportUnitRow = { model: '', serial: '', shelf: '', condition: '', notes: '' };
    columns.forEach((field, index) => {
      if (field) row[field] = (values[index] ?? '').slice(0, field === 'notes' ? 2000 : 200);
    });
    return row;
  });
  return { rows, problem: rows.length === 0 ? 'The file has a header but no units.' : null };
}

/**
 * Go-live import of the existing stock. The file is checked first (nothing is written), every
 * problem is listed by row, and only a clean file can be imported, all at once.
 */
export function ImportDialog({ onClose }: { onClose: () => void }) {
  const { models, locations } = useReference();
  const toast = useToast();
  const invalidate = useInvalidate();
  const submit = useSubmit();
  const input = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<ImportUnitRow[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [check, setCheck] = useState<ImportUnitsResponse | null>(null);
  // One key per checked file: a retry after a timeout replays instead of importing twice.
  const intentKey = useRef(newIntentKey());

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    setCheck(null);
    intentKey.current = newIntentKey();
    const read = readFile(await file.text());
    setRows(read.rows);
    setProblem(read.problem);
    if (read.problem) return;
    void submit.run(async () => {
      setCheck(
        await apiSend<ImportUnitsResponse>(
          'POST',
          '/units/import',
          { dryRun: true, rows: read.rows },
          newIntentKey(),
        ),
      );
    });
  };

  const importAll = () =>
    void submit
      .run(async () => {
        const done = await apiSend<ImportUnitsResponse>(
          'POST',
          '/units/import',
          { dryRun: false, rows },
          intentKey.current,
        );
        await invalidate('units', 'dashboard', 'categories', 'locations');
        toast(`${done.created.length} units registered and stocked`);
      })
      .then((ok) => {
        if (ok) onClose();
      });

  const template = () => {
    const shelf = locations.find((location) => location.kind === 'shelf');
    const model = models[0];
    downloadCsv(
      'demo-units-import.csv',
      ['model', 'serial', 'shelf', 'condition', 'notes'],
      [
        [
          model ? `${model.brand} ${model.name}` : 'Brand Model',
          'SN0001',
          shelf?.code ?? 'A1',
          'A',
          '',
        ],
      ],
    );
  };

  const ready = check?.valid === true && rows.length > 0;

  return (
    <Dialog
      title="Import demo units"
      description="Register the existing stock from a spreadsheet saved as CSV: one row per unit with its model, serial number, shelf code, condition (A to D) and notes."
      width={680}
      onClose={onClose}
      busy={submit.pending}
      footer={
        <>
          <Button onClick={onClose} disabled={submit.pending}>
            Cancel
          </Button>
          <Button variant="primary" pending={submit.pending} disabled={!ready} onClick={importAll}>
            {ready ? `Import ${rows.length} units` : 'Import'}
          </Button>
        </>
      }
    >
      <div className="stack" style={{ gap: 14 }}>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Button icon={FileUp} onClick={() => input.current?.click()} disabled={submit.pending}>
            {fileName ? 'Choose another file' : 'Choose a CSV file'}
          </Button>
          <Button variant="ghost" icon={Download} onClick={template}>
            Download a template
          </Button>
          <input
            ref={input}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(event) => {
              void choose(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
        </div>
        {fileName && (
          <p className="muted">
            <span className="mono">{fileName}</span> · {rows.length} unit
            {rows.length === 1 ? '' : 's'}
            {submit.pending && !check ? ' · checking…' : ''}
          </p>
        )}
        <FormError message={problem ?? submit.error} />
        {check?.valid === true && (
          <p className="scan-ok" role="status">
            Every row is ready. Nothing has been registered yet.
          </p>
        )}
        {check && !check.valid && (
          <div className="card table-card" role="region" aria-label="Problems in the file">
            <p className="card-pad" style={{ paddingBottom: 0 }}>
              <strong>
                {new Set(check.errors.map((error) => error.row)).size} of {rows.length} rows need
                fixing
              </strong>{' '}
              <span className="muted">Fix them in the spreadsheet and choose the file again.</span>
            </p>
            <table className="table">
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Column</th>
                  <th>Problem</th>
                </tr>
              </thead>
              <tbody>
                {check.errors.slice(0, 50).map((error) => (
                  <tr key={`${error.row}-${error.field}`}>
                    {/* +1: the spreadsheet's own row number, counting the header. */}
                    <td data-label="Row" className="num">
                      {error.row + 1}
                    </td>
                    <td data-label="Column">{error.field}</td>
                    <td data-label="Problem">{error.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {check.errors.length > 50 && (
              <p className="card-pad muted">…and {check.errors.length - 50} more.</p>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}
