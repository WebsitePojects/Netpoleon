import { ASSET_CODE_PATTERN, LABEL_SIZES, MAX_LABEL_CODES, type Settings } from '@wms/contracts';
import { Printer, Search, Tags, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useUnits } from '../api/queries.js';
import { useReference } from '../auth/auth.js';
import { AssetLabel } from '../components/AssetLabel.js';
import { Select } from '../components/controls.js';
import { Button, Empty, Field, PageHead } from '../components/ui.js';
import { UnitPickerDialog } from '../components/UnitPicker.js';

const SIZE_LABELS: Record<Settings['labelSize'], string> = {
  '50x25': '50 × 25 mm',
  '70x35': '70 × 35 mm',
  '100x50': '100 × 50 mm',
};
const MAX_COPIES = 3;

/**
 * The label sheet. Units arrive in `?codes=` (the Units list sends its selection here) and can
 * be added or removed on the page; only the sheet itself prints.
 */
export function Labels() {
  const { settings } = useReference();
  const [params, setParams] = useSearchParams();
  const [picking, setPicking] = useState(false);
  const [size, setSize] = useState<Settings['labelSize']>(settings.labelSize);
  const [copies, setCopies] = useState('1');
  const [showSerial, setShowSerial] = useState(settings.labelShowsSerial);

  const asked = useMemo(
    () =>
      [...new Set((params.get('codes') ?? '').split(',').map((code) => code.trim().toUpperCase()))]
        .filter((code) => ASSET_CODE_PATTERN.test(code))
        .slice(0, MAX_LABEL_CODES),
    [params],
  );
  // One request for the whole sheet, not one per label.
  const units = useUnits(
    { codes: asked.join(','), page: 1, pageSize: MAX_LABEL_CODES, sort: 'code', order: 'asc' },
    asked.length > 0,
  );
  const byCode = useMemo(
    () => new Map((units.data?.items ?? []).map((unit) => [unit.code, unit])),
    [units.data],
  );
  const codes = asked.filter((code) => byCode.has(code));
  const missing = units.data ? asked.filter((code) => !byCode.has(code)) : [];

  const setCodes = (next: string[]) => {
    const updated = new URLSearchParams(params);
    if (next.length) updated.set('codes', next.join(','));
    else updated.delete('codes');
    setParams(updated, { replace: true });
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
            {sheet.length > 0
              ? `Print ${sheet.length} label${sheet.length === 1 ? '' : 's'}`
              : 'Print'}
          </Button>
        }
      />
      <div className="labels-layout">
        <section className="card card-pad stack" style={{ gap: 14 }} aria-label="Label options">
          <button
            type="button"
            className="picker-trigger"
            onClick={() => setPicking(true)}
            disabled={asked.length >= MAX_LABEL_CODES}
          >
            <Search aria-hidden="true" />
            <span>Search and choose units…</span>
            <span className="picker-hint">by code, serial or model</span>
          </button>
          <div className="form-grid cols-2">
            <Field label="Label size">
              <Select
                value={size}
                onChange={(value) => setSize(value as Settings['labelSize'])}
                options={LABEL_SIZES.map((value) => ({ value, label: SIZE_LABELS[value] }))}
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
          {asked.length > 0 && (
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
                {asked.map((code) => (
                  <li
                    key={code}
                    className="mono"
                    data-missing={missing.includes(code) || undefined}
                  >
                    {code}
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
              {missing.length > 0 && (
                <p className="cell-sub" style={{ marginTop: 8 }}>
                  No current unit has {missing.length === 1 ? 'the code' : 'the codes'}{' '}
                  {missing.join(', ')}; {missing.length === 1 ? 'it is' : 'they are'} left off the
                  sheet.
                </p>
              )}
            </div>
          )}
        </section>

        <section className="card label-preview" aria-label="Label sheet">
          {sheet.length === 0 ? (
            <Empty title="No labels yet" icon={Tags}>
              Press <b>Search and choose units</b> on the left, or tick units on the{' '}
              <Link to="/units">Demo Units</Link> list and choose Print labels.
            </Empty>
          ) : (
            <div className="label-sheet" data-size={size}>
              {sheet.map(({ code, copy }) => {
                const unit = byCode.get(code);
                return unit ? (
                  <AssetLabel key={`${code}-${copy}`} unit={unit} showSerial={showSerial} />
                ) : null;
              })}
            </div>
          )}
        </section>
      </div>
      {picking && (
        <UnitPickerDialog
          title="Choose units to label"
          already={asked}
          limit={MAX_LABEL_CODES - asked.length}
          onAdd={(chosen) => setCodes([...asked, ...chosen])}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}
