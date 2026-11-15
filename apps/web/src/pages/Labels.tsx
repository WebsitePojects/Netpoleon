import { Plus, Printer, Tags, X } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AssetLabel } from '../components/AssetLabel.js';
import { Select, SuggestInput } from '../components/controls.js';
import { Button, Empty, Field, PageHead, useToast } from '../components/ui.js';
import { useBackend, useResource } from '../backend/context.js';
import { useWmsState } from '../data/context.js';
import type { Settings } from '../data/types.js';

const SIZE_OPTIONS: { value: Settings['labelSize']; label: string }[] = [
  { value: '50x25', label: '50 × 25 mm' },
  { value: '70x35', label: '70 × 35 mm' },
  { value: '100x50', label: '100 × 50 mm' },
];

const MAX_COPIES = 3;

/**
 * Label sheet for printing. The units come from `?codes=` (the Units list sends its
 * selection here) and can be added or removed on the page; the sheet itself is what prints.
 */
const MAX_CODES = 100;
const SUGGESTIONS = 7;
const ASSET_CODE = /^NTP-[A-Z]{2,4}-\d{5}$/;

export function Labels() {
  const backend = useBackend();
  const { settings } = useWmsState();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [entry, setEntry] = useState('');
  const [size, setSize] = useState<Settings['labelSize']>(settings.labelSize);
  const [copies, setCopies] = useState('1');
  const [showSerial, setShowSerial] = useState(settings.labelShowsSerial);

  const asked = useMemo(
    () =>
      [...new Set((params.get('codes') ?? '').split(',').map((code) => code.trim().toUpperCase()))]
        .filter((code) => ASSET_CODE.test(code))
        .slice(0, MAX_CODES),
    [params],
  );
  // One request for every unit on the sheet, not one per label.
  const units = useResource(`units:labels:${asked.join(',')}`, () =>
    asked.length
      ? backend.units({ codes: asked, sort: 'code', limit: MAX_CODES })
      : Promise.resolve({ items: [], total: 0, nextCursor: null }),
  );
  const byCode = useMemo(
    () => new Map((units.data?.items ?? []).map((unit) => [unit.assetCode, unit])),
    [units.data],
  );
  const codes = asked.filter((code) => byCode.has(code));
  // Suggestions come from a server search, so a warehouse of any size offers the right few.
  const term = entry.trim();
  const found = useResource(`units:suggest:${term}`, () =>
    term.length >= 2
      ? backend.units({ q: term, sort: 'code', limit: SUGGESTIONS })
      : Promise.resolve({ items: [], total: 0, nextCursor: null }),
  );
  const printable = (found.data?.items ?? [])
    .filter((unit) => unit.status !== 'retired')
    .map((unit) => unit.assetCode);

  const setCodes = (next: string[]) => {
    const updated = new URLSearchParams(params);
    if (next.length) updated.set('codes', next.join(','));
    else updated.delete('codes');
    setParams(updated, { replace: true });
  };

  const add = (event?: FormEvent) => {
    event?.preventDefault();
    const code = entry.trim().toUpperCase();
    if (!code) return;
    if (!ASSET_CODE.test(code)) {
      toast(`${code} is not an asset code, such as NTP-FW-00001`, 'error');
      return;
    }
    // The sheet looks the code up; a code no unit has simply does not appear on it.
    if (!asked.includes(code)) setCodes([...asked, code]);
    setEntry('');
  };

  const sheet = codes.flatMap((code) =>
    Array.from({ length: Number(copies) }, (_, copy) => ({ code, copy })),
  );

  return (
    <div className="page">
      <PageHead
        crumbs={[{ label: 'Demo Units', to: '/units' }, { label: 'Print labels' }]}
        title="Print labels"
        lead="QR code and barcode of the asset code, the key a scanner reads at release and return"
        actions={
          <Button
            variant="primary"
            icon={Printer}
            disabled={sheet.length === 0}
            onClick={() => window.print()}
          >
            Print {sheet.length > 0 ? `${sheet.length} label${sheet.length === 1 ? '' : 's'}` : ''}
          </Button>
        }
      />
      <div className="labels-layout">
        <section className="card card-pad stack" style={{ gap: 14 }} aria-label="Label options">
          <form className="row" style={{ gap: 8, flexWrap: 'nowrap' }} onSubmit={add}>
            <div style={{ flex: 1 }}>
              <SuggestInput
                value={entry}
                onChange={setEntry}
                suggestions={printable.filter((code) => !codes.includes(code))}
                placeholder="Add by asset code, e.g. NTP-FW-00001"
                className="input mono"
              />
            </div>
            <Button type="submit" icon={Plus} aria-label="Add unit">
              Add
            </Button>
          </form>
          <div className="form-grid cols-2">
            <Field label="Label size">
              <Select
                value={size}
                onChange={(value) => setSize(value as Settings['labelSize'])}
                options={SIZE_OPTIONS}
              />
            </Field>
            <Field label="Copies of each">
              <Select
                value={copies}
                onChange={setCopies}
                options={Array.from({ length: MAX_COPIES }, (_, index) => ({
                  value: String(index + 1),
                  label: String(index + 1),
                }))}
              />
            </Field>
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={showSerial}
              onChange={(event) => setShowSerial(event.target.checked)}
            />
            Print the serial number
          </label>
          {codes.length > 0 && (
            <div>
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                <span className="label">
                  {codes.length} unit{codes.length === 1 ? '' : 's'}
                </span>
                <button type="button" className="link" onClick={() => setCodes([])}>
                  Clear all
                </button>
              </div>
              <ul className="code-chips">
                {codes.map((code) => (
                  <li key={code}>
                    <span className="mono">{code}</span>
                    <button
                      type="button"
                      aria-label={`Remove ${code}`}
                      onClick={() => setCodes(asked.filter((item) => item !== code))}
                    >
                      <X aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="card label-preview" aria-label="Label sheet">
          {sheet.length === 0 ? (
            <Empty title="No labels on the sheet" icon={Tags}>
              Add asset codes here, or tick units on the{' '}
              <Link to="/units" className="link">
                Demo Units
              </Link>{' '}
              list and choose Print labels.
            </Empty>
          ) : (
            <div className="label-sheet" data-size={size}>
              {sheet.map(({ code, copy }) => {
                const unit = byCode.get(code);
                return unit ? (
                  <AssetLabel
                    key={`${code}-${copy}`}
                    unit={{
                      code: unit.assetCode,
                      brand: unit.model.brand,
                      model: unit.model.modelName,
                      serial: unit.serialNumber,
                    }}
                    size={size}
                    showSerial={showSerial}
                  />
                ) : null;
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
