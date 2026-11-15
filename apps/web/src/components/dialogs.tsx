import { CircleCheck, ScanLine } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useWmsState } from '../data/context.js';
import { useSubmit } from '../lib/hooks.js';
import { Select } from './controls.js';
import { Button, Dialog, Field, FormError } from './ui.js';

interface BaseProps {
  title: string;
  description?: string | undefined;
  confirmLabel: string;
  danger?: boolean;
  onClose: () => void;
}

/**
 * A dialog that runs one store action. It owns the submit guard, so every confirm in the
 * console gets the same one-press-one-effect behaviour, and closes itself on success.
 */
export function ActionDialog({
  title,
  description,
  confirmLabel,
  danger = false,
  onClose,
  onConfirm,
  onConfirmAsync,
  canConfirm = true,
  width,
  children,
}: BaseProps & {
  /** Throws `WmsError` to keep the dialog open and show the message. */
  onConfirm?: () => void;
  /** The same for a backend call; a rejected promise keeps the dialog open. */
  onConfirmAsync?: () => Promise<unknown>;
  canConfirm?: boolean;
  width?: number;
  children?: ReactNode;
}) {
  const submit = useSubmit();
  const formId = `action-${title.replace(/\W+/g, '-').toLowerCase()}`;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const confirmed = onConfirmAsync
      ? submit.runAsync(onConfirmAsync)
      : submit.run(onConfirm ?? (() => undefined));
    void confirmed.then((done) => {
      if (done) onClose();
    });
  };

  return (
    <Dialog
      title={title}
      description={description}
      width={width}
      onClose={onClose}
      busy={submit.pending}
      footer={
        <>
          <Button onClick={onClose} disabled={submit.pending}>
            Cancel
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            type="submit"
            form={formId}
            pending={submit.pending}
            disabled={!canConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <form id={formId} className="form-grid" onSubmit={onSubmit} noValidate>
        {children}
        <FormError message={submit.error} />
      </form>
    </Dialog>
  );
}

export function ReasonDialog({
  label,
  placeholder,
  onConfirm,
  onConfirmAsync,
  ...base
}: BaseProps & {
  label: string;
  placeholder?: string;
  onConfirm?: (reason: string) => void;
  onConfirmAsync?: (reason: string) => Promise<unknown>;
}) {
  const [reason, setReason] = useState('');
  return (
    <ActionDialog
      {...base}
      {...(onConfirmAsync
        ? { onConfirmAsync: () => onConfirmAsync(reason) }
        : { onConfirm: () => onConfirm?.(reason) })}
      canConfirm={reason.trim().length > 0}
    >
      <Field label={label}>
        <textarea
          className="textarea"
          value={reason}
          placeholder={placeholder}
          onChange={(event) => setReason(event.target.value)}
        />
      </Field>
    </ActionDialog>
  );
}

export function ShelfSelect({
  value,
  onChange,
  label = 'Shelf',
}: {
  value: string;
  onChange: (id: string) => void;
  label?: string;
}) {
  const { locations } = useWmsState();
  return (
    <Field label={label}>
      <Select
        value={value}
        onChange={onChange}
        options={locations
          .filter((item) => item.kind === 'shelf')
          .map((item) => ({ value: item.id, label: item.name, hint: item.zone }))}
      />
    </Field>
  );
}

export function ShelfDialog({
  currentId,
  shelves,
  onConfirm,
  onConfirmAsync,
  ...base
}: BaseProps & {
  currentId: string;
  /** Shelves to offer; the demo store's shelves when left out. */
  shelves?: { value: string; label: string; hint?: string | undefined }[];
  onConfirm?: (locationId: string) => void;
  onConfirmAsync?: (locationId: string) => Promise<unknown>;
}) {
  const { locations } = useWmsState();
  const options =
    shelves ??
    locations
      .filter((item) => item.kind === 'shelf')
      .map((item) => ({ value: item.id, label: item.name, hint: item.zone }));
  // Start on a different shelf than the current one: moving to where it is would be refused.
  const initial = options.find((item) => item.value !== currentId) ?? options[0];
  const [locationId, setLocationId] = useState(initial?.value ?? '');
  return (
    <ActionDialog
      {...base}
      {...(onConfirmAsync
        ? { onConfirmAsync: () => onConfirmAsync(locationId) }
        : { onConfirm: () => onConfirm?.(locationId) })}
    >
      <Field label="Shelf">
        <Select value={locationId} onChange={setLocationId} options={options} />
      </Field>
    </ActionDialog>
  );
}

/**
 * Asset-code entry for release and return. A handheld scanner types the code and presses
 * Enter, so a plain text field covers both a scanner and typing.
 */
export function ScanField({
  expected,
  value,
  onChange,
}: {
  expected: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const matches = value.trim().toUpperCase() === expected;
  return (
    <div className="scan">
      <span className="label">Scan the unit label</span>
      <div className="scan-row">
        <label className="input-wrap" style={{ flex: 1 }}>
          <span className="sr-only">Asset code</span>
          <ScanLine aria-hidden="true" />
          <input
            className="input mono"
            data-autofocus
            value={value}
            placeholder="Scan or type the asset code"
            autoCapitalize="characters"
            spellCheck={false}
            onChange={(event) => onChange(event.target.value)}
          />
        </label>
        <Button
          onClick={() => onChange(expected)}
          title="Stands in for a handheld scanner in the demo"
        >
          Simulate scan
        </Button>
      </div>
      {matches ? (
        <span className="scan-ok" role="status">
          <CircleCheck aria-hidden="true" />
          Label matches {expected}
        </span>
      ) : (
        <small className="muted">
          Expected unit: <span className="mono">{expected}</span>
        </small>
      )}
    </div>
  );
}

export function AccessoryChecklist({
  items,
  checked,
  onChange,
  legend,
}: {
  items: string[];
  checked: string[];
  onChange: (next: string[]) => void;
  legend: string;
}) {
  if (items.length === 0) return <p className="muted">This unit has no accessories on record.</p>;
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
      <legend className="label" style={{ marginBottom: 4 }}>
        {legend}
      </legend>
      {items.map((item) => (
        <label key={item} className="check">
          <input
            type="checkbox"
            checked={checked.includes(item)}
            onChange={(event) =>
              onChange(
                event.target.checked
                  ? [...checked, item]
                  : checked.filter((other) => other !== item),
              )
            }
          />
          {item}
        </label>
      ))}
    </fieldset>
  );
}
