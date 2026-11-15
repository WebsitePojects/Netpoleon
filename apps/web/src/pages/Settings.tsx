import {
  Bell,
  Building2,
  CalendarClock,
  Database,
  Info,
  MapPin,
  Plus,
  RotateCcw,
  ShieldCheck,
  Tag,
  Printer,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Location, LocationKind } from '@wms/contracts';
import { useAuth, useCurrentUser } from '../auth/auth.js';
import { invalidate, useBackend, useIntent, useResource } from '../backend/context.js';
import { Select, SkPage } from '../components/controls.js';
import { DataTable } from '../components/DataTable.js';
import { ActionDialog } from '../components/dialogs.js';
import { QrCode } from '../components/QrCode.js';
import { Button, Field, FormError, PageHead, Switch, useToast } from '../components/ui.js';
import { useStore, useWmsState } from '../data/context.js';
import type { Settings as SettingsData } from '../data/types.js';
import { usePageReady, useSubmit } from '../lib/hooks.js';

type SectionId =
  | 'general'
  | 'categories'
  | 'locations'
  | 'loans'
  | 'notifications'
  | 'labels'
  | 'security'
  | 'data';

const SECTIONS: { id: SectionId; label: string; icon: LucideIcon; lead: string }[] = [
  {
    id: 'general',
    label: 'General',
    icon: Building2,
    lead: 'Company and warehouse details shown on labels and reports.',
  },
  {
    id: 'categories',
    label: 'Categories',
    icon: Tag,
    lead: 'Equipment categories and the code each one uses in asset codes.',
  },
  {
    id: 'locations',
    label: 'Locations',
    icon: MapPin,
    lead: 'Shelves and work areas a unit can be in.',
  },
  {
    id: 'loans',
    label: 'Loan rules',
    icon: CalendarClock,
    lead: 'How long a unit may be out and how reservations behave.',
  },
  {
    id: 'notifications',
    label: 'Notifications',
    icon: Bell,
    lead: 'Which alerts the system raises.',
  },
  { id: 'labels', label: 'Labels', icon: Printer, lead: 'The QR label printed for every unit.' },
  { id: 'security', label: 'Security', icon: ShieldCheck, lead: 'Sign-in and session rules.' },
  {
    id: 'data',
    label: 'Backup and data',
    icon: Database,
    lead: 'Backups and the demo data in this browser.',
  },
];

function isSectionId(value: string | null): value is SectionId {
  return SECTIONS.some((section) => section.id === value);
}

export function Settings() {
  const ready = usePageReady();
  const [params, setParams] = useSearchParams();
  const sectionParam = params.get('section');
  const active: SectionId = isSectionId(sectionParam) ? sectionParam : 'general';
  const section = SECTIONS.find((item) => item.id === active) ?? SECTIONS[0];
  const { can } = useAuth();
  const editable = can('settings.manage');
  const select = (id: string) => setParams({ section: id }, { replace: true });

  return (
    <div className="page">
      <PageHead title="Settings" lead="How Netpoleon WMS is set up for this warehouse" />
      {!editable && (
        <p className="banner info" role="note" style={{ marginBottom: 16 }}>
          <Info aria-hidden="true" />
          Only an administrator can change settings. You are viewing them read-only.
        </p>
      )}
      {!ready ? (
        <SkPage kind="settings" />
      ) : (
        <div className="settings">
          <nav className="settings-nav" aria-label="Settings sections">
            {SECTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-current={item.id === active}
                onClick={() => select(item.id)}
              >
                <item.icon aria-hidden="true" />
                {item.label}
              </button>
            ))}
          </nav>
          {/* Phones: one dropdown instead of a strip of tabs that would scroll sideways. */}
          <label className="field settings-select">
            <span>Section</span>
            <Select
              value={active}
              onChange={select}
              options={SECTIONS.map((item) => ({ value: item.id, label: item.label }))}
            />
          </label>

          <section
            className="card"
            aria-labelledby="section-title"
            key={active}
            style={{ animation: 'rise 320ms var(--ease-reveal) both' }}
          >
            <div className="card-pad" style={{ paddingBottom: 6 }}>
              <h2 id="section-title" className="section-title">
                {section?.label}
              </h2>
              <p className="muted">{section?.lead}</p>
            </div>
            {active === 'general' && <GeneralSection editable={editable} />}
            {active === 'categories' && <CategoriesSection editable={editable} />}
            {active === 'locations' && <LocationsSection editable={editable} />}
            {active === 'loans' && <LoanSection editable={editable} />}
            {active === 'notifications' && <NotificationSection editable={editable} />}
            {active === 'labels' && <LabelSection editable={editable} />}
            {active === 'security' && <SecuritySection editable={editable} />}
            {active === 'data' && <DataSection editable={editable} />}
          </section>
        </div>
      )}
    </div>
  );
}

/**
 * Holds unsaved edits for one settings section and saves them through the shared guard.
 * `draft` starts from the stored settings and is re-synced after every successful save.
 */
function useSettingsDraft() {
  const store = useStore();
  const { settings } = useWmsState();
  const user = useCurrentUser();
  const toast = useToast();
  const submit = useSubmit();
  const [draft, setDraft] = useState<SettingsData>(settings);
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const set = <K extends keyof SettingsData>(key: K, value: SettingsData[K]) => {
    submit.clearError();
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const save = () => {
    void submit.run(() => {
      store.updateSettings(user.id, draft);
      toast('Settings saved');
    });
  };
  return { draft, set, save, dirty, submit, reset: () => setDraft(settings) };
}

type Draft = ReturnType<typeof useSettingsDraft>;

function SaveBar({ draft, editable }: { draft: Draft; editable: boolean }) {
  if (!editable) return null;
  return (
    <>
      {draft.submit.error && (
        <div style={{ padding: '0 18px 12px' }}>
          <FormError message={draft.submit.error} />
        </div>
      )}
      <div className="save-bar">
        <span role="status">{draft.dirty ? 'You have unsaved changes' : 'All changes saved'}</span>
        <div className="row">
          <Button size="sm" onClick={draft.reset} disabled={!draft.dirty || draft.submit.pending}>
            Discard
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={draft.save}
            disabled={!draft.dirty}
            pending={draft.submit.pending}
          >
            Save changes
          </Button>
        </div>
      </div>
    </>
  );
}

function Row({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="setting-row">
      <div>
        <strong>{title}</strong>
        {hint && <p>{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function NumberRow({
  draft,
  field,
  title,
  hint,
  editable,
}: {
  draft: Draft;
  field: keyof SettingsData;
  title: string;
  hint: string;
  editable: boolean;
}) {
  const value = draft.draft[field];
  return (
    <Row title={title} hint={hint}>
      <input
        className="input num"
        type="number"
        min={0}
        inputMode="numeric"
        aria-label={title}
        disabled={!editable}
        value={typeof value === 'number' ? value : 0}
        onChange={(event) => draft.set(field, Number(event.target.value) as never)}
      />
    </Row>
  );
}

function ToggleRow({
  draft,
  field,
  title,
  hint,
  editable,
}: {
  draft: Draft;
  field: keyof SettingsData;
  title: string;
  hint: string;
  editable: boolean;
}) {
  return (
    <Row title={title} hint={hint}>
      <Switch
        checked={draft.draft[field] === true}
        disabled={!editable}
        label={title}
        onChange={(next) => draft.set(field, next as never)}
      />
    </Row>
  );
}

function GeneralSection({ editable }: { editable: boolean }) {
  const draft = useSettingsDraft();
  return (
    <>
      <div className="card-pad form-grid cols-2">
        <Field label="Company name" className="span-2">
          <input
            className="input"
            disabled={!editable}
            value={draft.draft.companyName}
            onChange={(event) => draft.set('companyName', event.target.value)}
          />
        </Field>
        <Field label="Warehouse name">
          <input
            className="input"
            disabled={!editable}
            value={draft.draft.warehouseName}
            onChange={(event) => draft.set('warehouseName', event.target.value)}
          />
        </Field>
        <Field label="Time zone" hint="Due dates and “today” follow this zone.">
          <Select
            disabled={!editable}
            value={draft.draft.timezone}
            onChange={(value) => draft.set('timezone', value)}
            options={[
              { value: 'Asia/Manila', label: 'Asia/Manila', hint: 'UTC+8' },
              { value: 'Asia/Singapore', label: 'Asia/Singapore', hint: 'UTC+8' },
            ]}
          />
        </Field>
      </div>
      <SaveBar draft={draft} editable={editable} />
    </>
  );
}

function CategoriesSection({ editable }: { editable: boolean }) {
  const backend = useBackend();
  const catalog = useResource('catalog', () => backend.catalog());
  const [adding, setAdding] = useState(false);

  return (
    <>
      <DataTable
        rows={catalog.data?.categories ?? []}
        loading={catalog.loading}
        columns={[
          {
            id: 'name',
            header: 'Category',
            width: '1.4fr',
            sort: (category) => category.name,
            cell: (category) => <span className="cell-main">{category.name}</span>,
          },
          {
            id: 'code',
            header: 'Code',
            className: 'mono',
            sort: (category) => category.code,
            cell: (category) => category.code,
          },
          {
            id: 'format',
            header: 'Asset code format',
            className: 'mono',
            cell: (category) => `NTP-${category.code}-00001`,
          },
          {
            id: 'units',
            header: 'Units',
            align: 'right',
            className: 'num',
            sort: (category) => category.unitCount,
            cell: (category) => category.unitCount,
          },
        ]}
        rowKey={(category) => category.id}
        noun="categories"
        search={{
          placeholder: 'Search by name or code…',
          text: (category) => `${category.name} ${category.code}`,
        }}
      />
      {editable && (
        <div className="save-bar">
          <span>A category with units cannot be removed.</span>
          <Button size="sm" icon={Plus} onClick={() => setAdding(true)}>
            Add category
          </Button>
        </div>
      )}
      {adding && <CategoryDialog onClose={() => setAdding(false)} />}
    </>
  );
}

function CategoryDialog({ onClose }: { onClose: () => void }) {
  const backend = useBackend();
  const toast = useToast();
  const intent = useIntent();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  return (
    <ActionDialog
      title="Add a category"
      confirmLabel="Add category"
      onClose={onClose}
      onConfirmAsync={async () => {
        await backend.addCategory(intent.key, { name, code });
        invalidate('catalog');
        toast(`Category ${name.trim()} added`);
      }}
    >
      <Field label="Name">
        <input
          className="input"
          value={name}
          placeholder="UPS"
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
      <Field label="Code" hint="2 to 4 letters, used inside asset codes.">
        <input
          className="input mono"
          value={code}
          placeholder="UPS"
          maxLength={4}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
        />
      </Field>
    </ActionDialog>
  );
}

const KIND_LABELS: Record<LocationKind, string> = {
  site: 'Site',
  room: 'Room or work area',
  shelf: 'Shelf',
};

function LocationsSection({ editable }: { editable: boolean }) {
  const backend = useBackend();
  const catalog = useResource('catalog', () => backend.catalog());
  const [adding, setAdding] = useState(false);
  const rooms = (catalog.data?.locations ?? []).filter((item) => item.kind === 'room');

  return (
    <>
      <DataTable
        rows={catalog.data?.locations ?? []}
        loading={catalog.loading}
        columns={[
          {
            id: 'name',
            header: 'Location',
            width: '1.4fr',
            sort: (location) => location.name,
            cell: (location) => <span className="cell-main">{location.name}</span>,
          },
          {
            id: 'zone',
            header: 'Inside',
            sort: (location) => location.parentName ?? '',
            cell: (location) => location.parentName ?? '—',
          },
          {
            id: 'kind',
            header: 'Type',
            sort: (location) => KIND_LABELS[location.kind],
            cell: (location) => KIND_LABELS[location.kind],
          },
          {
            id: 'units',
            header: 'Units here',
            align: 'right',
            className: 'num',
            sort: (location) => location.unitCount,
            cell: (location) => location.unitCount,
          },
        ]}
        rowKey={(location) => location.id}
        noun="locations"
        search={{
          placeholder: 'Search by name or where it is…',
          text: (location) => `${location.name} ${location.parentName ?? ''} ${location.code}`,
        }}
        filters={[
          {
            id: 'kind',
            label: 'Type',
            allLabel: 'All types',
            options: (Object.keys(KIND_LABELS) as LocationKind[]).map((kind) => ({
              value: kind,
              label: KIND_LABELS[kind],
            })),
            test: (location, value) => location.kind === value,
          },
        ]}
      />
      {editable && (
        <div className="save-bar">
          <span>Shelves sit inside a room; units are stocked on shelves.</span>
          <Button size="sm" icon={Plus} onClick={() => setAdding(true)} disabled={!rooms.length}>
            Add shelf
          </Button>
        </div>
      )}
      {adding && <ShelfDialogNew rooms={rooms} onClose={() => setAdding(false)} />}
    </>
  );
}

function ShelfDialogNew({ rooms, onClose }: { rooms: Location[]; onClose: () => void }) {
  const backend = useBackend();
  const toast = useToast();
  const intent = useIntent();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [parentId, setParentId] = useState(rooms[0]?.id ?? '');
  return (
    <ActionDialog
      title="Add a shelf"
      confirmLabel="Add shelf"
      onClose={onClose}
      onConfirmAsync={async () => {
        await backend.addShelf(intent.key, { name, code: code || name, parentId });
        invalidate('catalog');
        toast(`${name.trim()} added`);
      }}
    >
      <Field label="Name">
        <input
          className="input"
          value={name}
          placeholder="Shelf H-01"
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
      <Field label="Code" hint="What the shelf label says, such as H-01.">
        <input
          className="input mono"
          value={code}
          placeholder="H-01"
          maxLength={24}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
        />
      </Field>
      <Field label="Room">
        <Select
          value={parentId}
          onChange={setParentId}
          options={rooms.map((room) => ({ value: room.id, label: room.name }))}
        />
      </Field>
    </ActionDialog>
  );
}

function LoanSection({ editable }: { editable: boolean }) {
  const draft = useSettingsDraft();
  const rows: { field: keyof SettingsData; title: string; hint: string }[] = [
    {
      field: 'defaultLoanDays',
      title: 'Default loan length (days)',
      hint: 'Pre-filled on a new request.',
    },
    {
      field: 'maxLoanDays',
      title: 'Maximum loan length (days)',
      hint: 'Requests and extensions cannot go past this.',
    },
    {
      field: 'turnaroundBufferDays',
      title: 'Turnaround buffer (days)',
      hint: 'Time kept free after a return for inspection.',
    },
    {
      field: 'pickupGraceDays',
      title: 'Pickup grace period (days)',
      hint: 'An approved unit nobody collects is freed after this.',
    },
  ];
  return (
    <>
      <div className="card-pad" style={{ paddingTop: 0, paddingBottom: 0 }}>
        {rows.map((row) => (
          <NumberRow key={row.field} draft={draft} editable={editable} {...row} />
        ))}
      </div>
      <SaveBar draft={draft} editable={editable} />
    </>
  );
}

function NotificationSection({ editable }: { editable: boolean }) {
  const draft = useSettingsDraft();
  const rows: { field: keyof SettingsData; title: string; hint: string }[] = [
    {
      field: 'notifyOverdue',
      title: 'Overdue return',
      hint: 'A unit is past its expected return date.',
    },
    {
      field: 'notifyMissingAccessory',
      title: 'Returned with missing accessory',
      hint: 'A return came back incomplete.',
    },
    {
      field: 'notifyForInspection',
      title: 'For inspection',
      hint: 'A returned unit is waiting for its check.',
    },
    {
      field: 'notifyReadyForRedeployment',
      title: 'Available for redeployment',
      hint: 'A unit passed inspection and is back in stock.',
    },
  ];
  return (
    <>
      <div className="card-pad" style={{ paddingTop: 0, paddingBottom: 0 }}>
        {rows.map((row) => (
          <ToggleRow key={row.field} draft={draft} editable={editable} {...row} />
        ))}
        <NumberRow
          draft={draft}
          editable={editable}
          field="overdueReminderDays"
          title="Remind borrower every (days)"
          hint="How often an overdue borrower is reminded by email."
        />
      </div>
      <SaveBar draft={draft} editable={editable} />
    </>
  );
}

function LabelSection({ editable }: { editable: boolean }) {
  const draft = useSettingsDraft();
  return (
    <>
      <div className="card-pad stack" style={{ paddingTop: 0 }}>
        <Row title="Label size" hint="Thermal label stock in millimetres.">
          <Select
            style={{ width: 160 }}
            ariaLabel="Label size"
            disabled={!editable}
            value={draft.draft.labelSize}
            onChange={(value) => draft.set('labelSize', value as SettingsData['labelSize'])}
            options={[
              { value: '50x25', label: '50 × 25 mm' },
              { value: '70x35', label: '70 × 35 mm' },
              { value: '100x50', label: '100 × 50 mm' },
            ]}
          />
        </Row>
        <ToggleRow
          draft={draft}
          editable={editable}
          field="labelShowsSerial"
          title="Print the serial number"
          hint="Shown under the asset code on each label."
        />
        <div>
          <span className="label">Preview</span>
          <div className="label-card" style={{ marginTop: 6, maxWidth: 340 }}>
            <QrCode value="NTP-FW-00045" />
            <div>
              <span>Netpoleon demo unit</span>
              <strong className="mono">NTP-FW-00045</strong>
              <span>Fortinet FG-60F</span>
              {draft.draft.labelShowsSerial && <span className="mono">S/N FGT60FTK23001234</span>}
            </div>
          </div>
        </div>
      </div>
      <SaveBar draft={draft} editable={editable} />
    </>
  );
}

function SecuritySection({ editable }: { editable: boolean }) {
  const draft = useSettingsDraft();
  const rows: { field: keyof SettingsData; title: string; hint: string }[] = [
    {
      field: 'sessionMinutes',
      title: 'Sign out after inactivity (minutes)',
      hint: 'An idle session ends by itself.',
    },
    {
      field: 'passwordMinLength',
      title: 'Minimum password length',
      hint: 'Applies when a password is set or changed.',
    },
    {
      field: 'lockAfterFailedAttempts',
      title: 'Lock after failed sign-ins',
      hint: 'Wrong passwords in a row before a lockout.',
    },
  ];
  return (
    <>
      <div className="card-pad" style={{ paddingTop: 0, paddingBottom: 0 }}>
        {rows.map((row) => (
          <NumberRow key={row.field} draft={draft} editable={editable} {...row} />
        ))}
      </div>
      <SaveBar draft={draft} editable={editable} />
    </>
  );
}

function DataSection({ editable }: { editable: boolean }) {
  const store = useStore();
  const toast = useToast();
  const state = useWmsState();
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="card-pad" style={{ paddingTop: 0 }}>
      <Row
        title="Automatic backups"
        hint="Daily database backups and security updates are part of the subscription."
      >
        <span className="chip" data-tone="in_stock">
          Included
        </span>
      </Row>
      <Row
        title="Records in this demo"
        hint="Kept in this browser only. Nothing is sent to a server."
      >
        <span className="num muted">
          {state.units.length} units · {state.loans.length} transactions · {state.movements.length}{' '}
          movements
        </span>
      </Row>
      <Row
        title="Reset demo data"
        hint="Discards every change made in this browser and starts from fresh sample data."
      >
        <Button
          variant="danger"
          icon={RotateCcw}
          disabled={!editable}
          onClick={() => setConfirming(true)}
        >
          Reset
        </Button>
      </Row>
      {confirming && (
        <ActionDialog
          title="Reset demo data?"
          description="Every unit, request and setting you changed in this browser goes back to the sample data. This cannot be undone."
          confirmLabel="Reset demo data"
          danger
          onClose={() => setConfirming(false)}
          onConfirm={() => {
            store.reset();
            toast('Demo data reset');
          }}
        />
      )}
    </div>
  );
}
