import { ASSET_CODE_PATTERN, type OrgType, type TransactionDetail } from '@wms/contracts';
import { Plus, ScanLine, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiSend } from '../api/client.js';
import { useInvalidate, usePartner, usePartners, useUnits } from '../api/queries.js';
import { useReference } from '../auth/auth.js';
import { DateField, Select, SuggestInput } from '../components/controls.js';
import { AccessoryChecklist, ActionDialog } from '../components/dialogs.js';
import { Button, Field, FormError, useToast } from '../components/ui.js';
import { addDays } from '../lib/dates.js';
import { ORG_TYPE_OPTIONS } from '../lib/labels.js';
import { PURPOSES } from './Borrow.js';

/**
 * Go-live: a loan that was already out before the system started. The units are scanned off
 * the shelf records and released on their real date in one step, marked as back-dated.
 */
export function RecordExistingLoanDialog({ onClose }: { onClose: () => void }) {
  const { serverDate, settings } = useReference();
  const toast = useToast();
  const invalidate = useInvalidate();
  const navigate = useNavigate();
  const today = serverDate;

  const [company, setCompany] = useState('');
  const [companyType, setCompanyType] = useState<OrgType>('partner');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [purpose, setPurpose] = useState(PURPOSES[0] ?? '');
  const [releasedOn, setReleasedOn] = useState(addDays(today, -7));
  const [dueDate, setDueDate] = useState(addDays(today, settings.defaultLoanDays - 8));
  const [entry, setEntry] = useState('');
  const [codes, setCodes] = useState<string[]>([]);
  const [accessories, setAccessories] = useState<string[] | null>(null);

  const partners = usePartners(company).data ?? [];
  const known = partners.find((item) => item.name.toLowerCase() === company.trim().toLowerCase());
  const contacts = usePartner(known?.id ?? null).data?.contacts ?? [];
  const units = useUnits({ codes: codes.join(','), page: 1, pageSize: 100 }, codes.length > 0);
  const found = useMemo(
    () => new Map((units.data?.items ?? []).map((unit) => [unit.code, unit])),
    [units.data],
  );
  const first = codes.map((code) => found.get(code)).find((unit) => unit !== undefined);
  const modelAccessories = first?.accessories ?? [];
  // Everything on the model's list went out unless the person unticks it.
  const out = accessories ?? modelAccessories;

  const problems = codes.flatMap((code) => {
    const unit = found.get(code);
    if (!units.data) return [];
    if (!unit) return [`${code}: no unit has this code`];
    if (unit.status !== 'in_stock') return [`${code}: not on the shelf in the system`];
    if (first && unit.modelId !== first.modelId)
      return [`${code}: a different model; record it separately`];
    return [];
  });

  const pickName = (value: string) => {
    setName(value);
    const match = contacts.find((item) => item.name.toLowerCase() === value.trim().toLowerCase());
    if (match) {
      setEmail(match.email);
      setPhone(match.phone);
    }
  };

  /** From the Add button or Enter in the scan box; Enter must not submit the whole dialog. */
  const addCode = (event?: { preventDefault: () => void }) => {
    event?.preventDefault();
    const code = entry.trim().toUpperCase();
    if (!ASSET_CODE_PATTERN.test(code)) {
      toast(`${code || 'That'} is not an asset code, such as NTP-FW-00001`, 'error');
      return;
    }
    if (!codes.includes(code)) setCodes([...codes, code]);
    setEntry('');
  };

  const valid =
    company.trim() !== '' &&
    name.trim() !== '' &&
    email.includes('@') &&
    phone.trim().length >= 7 &&
    releasedOn !== '' &&
    releasedOn <= today &&
    dueDate >= releasedOn &&
    codes.length > 0 &&
    units.data !== undefined &&
    problems.length === 0;

  return (
    <ActionDialog
      title="Record an existing loan"
      description="For units that were already out with a borrower before the system went live. They are released on the date they really left and the loan is marked as recorded at go-live."
      confirmLabel={codes.length > 1 ? `Record ${codes.length} units out` : 'Record loan'}
      width={680}
      canConfirm={valid}
      onClose={onClose}
      onConfirm={async (key) => {
        const created = await apiSend<TransactionDetail>(
          'POST',
          '/transactions/existing',
          {
            company: known ? { id: known.id } : { name: company.trim(), type: companyType },
            contact: { name: name.trim(), email: email.trim(), phone: phone.trim() },
            purpose,
            releasedOn,
            dueDate,
            items: codes.map((code) => ({ scannedCode: code, accessoriesOut: out })),
          },
          key,
        );
        await invalidate('transactions', 'units', 'dashboard', 'alerts', 'partners');
        toast(
          `${created.number} recorded: ${codes.length} unit${codes.length === 1 ? '' : 's'} out`,
        );
        void navigate(`/borrow/${created.number}`);
      }}
    >
      <div className="form-grid cols-2">
        <Field
          label="Company"
          hint={known ? 'On file' : company.trim() ? 'New company: choose its type' : undefined}
        >
          <SuggestInput
            value={company}
            placeholder="ABC Technologies Inc."
            suggestions={partners.map((item) => item.name)}
            onChange={setCompany}
          />
        </Field>
        <Field label="Company type" hint={known ? 'Set in Partners' : undefined}>
          <Select
            value={known ? known.type : companyType}
            disabled={known !== undefined}
            onChange={(value) => setCompanyType(value as OrgType)}
            options={ORG_TYPE_OPTIONS}
          />
        </Field>
        <Field label="Borrower name">
          <SuggestInput
            value={name}
            suggestions={contacts.map((item) => item.name)}
            onChange={pickName}
          />
        </Field>
        <Field label="Email">
          <input
            className="input"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="off"
          />
        </Field>
        <Field label="Contact number">
          <input
            className="input"
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            autoComplete="off"
          />
        </Field>
        <Field label="Purpose">
          <Select
            value={purpose}
            onChange={setPurpose}
            options={PURPOSES.map((item) => ({ value: item, label: item }))}
          />
        </Field>
        <Field label="Released on" hint="The day the units really left">
          <DateField
            ariaLabel="Released on"
            max={today}
            value={releasedOn}
            onChange={setReleasedOn}
          />
        </Field>
        <Field
          label="Expected return"
          hint={dueDate < today ? 'Already past: it shows as overdue' : undefined}
        >
          <DateField
            ariaLabel="Expected return"
            min={releasedOn}
            value={dueDate}
            onChange={setDueDate}
          />
        </Field>

        <div className="span-2 stack" style={{ gap: 8 }}>
          <span className="label">Units out</span>
          <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
            <label className="input-wrap" style={{ flex: 1 }}>
              <span className="sr-only">Asset code</span>
              <ScanLine aria-hidden="true" />
              <input
                className="input mono"
                value={entry}
                placeholder="Scan or type an asset code, then Add"
                autoCapitalize="characters"
                spellCheck={false}
                onChange={(event) => setEntry(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') addCode(event);
                }}
              />
            </label>
            <Button icon={Plus} onClick={() => addCode()}>
              Add
            </Button>
          </div>
          {codes.length > 0 && (
            <ul className="code-chips">
              {codes.map((code) => (
                <li key={code} className="mono">
                  {code}
                  {found.get(code) && <span className="muted"> · {found.get(code)?.model}</span>}
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
          )}
          <FormError message={problems.length > 0 ? problems.join(' · ') : null} />
          {first && (
            <AccessoryChecklist
              legend="Accessories that went out with each unit"
              items={modelAccessories}
              checked={out}
              onChange={setAccessories}
            />
          )}
        </div>
      </div>
    </ActionDialog>
  );
}
