import { Plus, Printer, Tags, X } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AssetLabel } from '../components/AssetLabel.js';
import { Select, SuggestInput } from '../components/controls.js';
import { Button, Empty, Field, PageHead, useToast } from '../components/ui.js';
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
export function Labels() {
  const { units, settings } = useWmsState();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [entry, setEntry] = useState('');
  const [size, setSize] = useState<Settings['labelSize']>(settings.labelSize);
  const [copies, setCopies] = useState('1');
  const [showSerial, setShowSerial] = useState(settings.labelShowsSerial);

  const byCode = useMemo(() => new Map(units.map((unit) => [unit.code, unit])), [units]);
  const codes = useMemo(
    () =>
      [
        ...new Set((params.get('codes') ?? '').split(',').map((code) => code.trim().toUpperCase())),
      ].filter((code) => byCode.has(code)),
    [params, byCode],
  );
  const printable = useMemo(
    () => units.filter((unit) => unit.status !== 'retired').map((unit) => unit.code),
    [units],
  );

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
    if (!byCode.has(code)) {
      toast(`No unit has the asset code ${code}`, 'error');
      return;
    }
    if (!codes.includes(code)) setCodes([...codes, code]);
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
                      onClick={() => setCodes(codes.filter((item) => item !== code))}
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
                    unit={unit}
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
