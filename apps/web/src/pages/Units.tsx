import { ArrowRightLeft, Plus } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth, useCurrentUser } from '../auth/auth.js';
import { CONDITION_OPTIONS, Select, SuggestInput } from '../components/controls.js';
import {
  DataTable,
  runBatch,
  type Column,
  type TableFilter,
} from '../components/DataTable.js';
import { ShelfDialog } from '../components/dialogs.js';
import {
  Button,
  CategoryThumb,
  Dialog,
  Field,
  FormError,
  PageHead,
  StatusChip,
  useToast,
} from '../components/ui.js';
import { useStore, useWmsState } from '../data/context.js';
import { ACTIVE_STATUSES, STATUS_LABELS } from '../data/selectors.js';
import { WmsError } from '../data/store.js';
import type { ConditionGrade, Unit, UnitStatus } from '../data/types.js';
import { usePageReady, useSubmit } from '../lib/hooks.js';

const STATUS_OPTIONS: UnitStatus[] = [...ACTIVE_STATUSES, 'retired'];

export function Units() {
  const state = useWmsState();
  const store = useStore();
  const user = useCurrentUser();
  const { can } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const ready = usePageReady();
  const [params] = useSearchParams();
  const [adding, setAdding] = useState(false);
  const [moving, setMoving] = useState<{ units: Unit[]; clear: () => void } | null>(null);

  const categoryName = useMemo(
    () => new Map(state.categories.map((item) => [item.code, item.name])),
    [state.categories],
  );
  const locationName = useMemo(
    () => new Map(state.locations.map((item) => [item.id, item.name])),
    [state.locations],
  );

  // Retired units stay out of the list until the status filter asks for them.
  const showRetired = params.get('status') === 'retired';
  const rows = useMemo(
    () => state.units.filter((unit) => showRetired || unit.status !== 'retired'),
    [state.units, showRetired],
  );

  const columns: Column<Unit>[] = [
    {
      id: 'code',
      header: 'Asset Code',
      width: '1.3fr',
      skeleton: 'thumb',
      sort: (unit) => unit.code,
      cell: (unit) => (
        <span className="unit-cell">
          <CategoryThumb unit={unit} />
          <Link
            to={`/units/${unit.code}`}
            className="row-link mono"
            onClick={(event) => event.stopPropagation()}
          >
            {unit.code}
          </Link>
        </span>
      ),
    },
    {
      id: 'category',
      header: 'Category',
      skeleton: 110,
      sort: (unit) => categoryName.get(unit.categoryCode) ?? unit.categoryCode,
      cell: (unit) => categoryName.get(unit.categoryCode) ?? unit.categoryCode,
    },
    {
      id: 'model',
      header: 'Brand / Model',
      width: '1.5fr',
      skeleton: 150,
      sort: (unit) => `${unit.brand} ${unit.model}`,
      cell: (unit) => `${unit.brand} ${unit.model}`,
    },
    {
      id: 'serial',
      header: 'Serial Number',
      width: '1.2fr',
      skeleton: 130,
      className: 'mono',
      sort: (unit) => unit.serial,
      cell: (unit) => unit.serial,
    },
    {
      id: 'state',
      header: 'Current Status',
      label: 'Status',
      skeleton: 'chip',
      sort: (unit) => STATUS_LABELS[unit.status],
      cell: (unit) => <StatusChip status={unit.status} reserved={unit.reservedFor !== null} />,
    },
    {
      id: 'shelf',
      header: 'Location',
      width: '0.9fr',
      skeleton: 90,
      sort: (unit) => locationName.get(unit.locationId) ?? '',
      cell: (unit) => locationName.get(unit.locationId) ?? '—',
    },
  ];

  const filters: TableFilter<Unit>[] = [
    {
      id: 'status',
      label: 'Status',
      allLabel: 'All statuses',
      options: STATUS_OPTIONS.map((item) => ({ value: item, label: STATUS_LABELS[item] })),
      test: (unit, value) => unit.status === value,
    },
    {
      id: 'category',
      label: 'Category',
      allLabel: 'All categories',
      options: state.categories.map((item) => ({ value: item.code, label: item.name })),
      test: (unit, value) => unit.categoryCode === value,
    },
    {
      id: 'location',
      label: 'Location',
      allLabel: 'All locations',
      options: state.locations.map((item) => ({ value: item.id, label: item.name })),
      test: (unit, value) => unit.locationId === value,
    },
  ];

  return (
    <div className="page">
      <PageHead
        title="Demo Units"
        lead="Complete list of demo assets with real-time status"
        actions={
          can('unit.register') && (
            <Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>
              Add Asset
            </Button>
          )
        }
      />

      <div className="card table-card">
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(unit) => unit.code}
          noun="demo units"
          loading={!ready}
          syncUrl
          search={{
            placeholder: 'Search by asset code, model, or serial number…',
            text: (unit) => `${unit.code} ${unit.serial} ${unit.brand} ${unit.model}`,
          }}
          filters={filters}
          onRowClick={(unit) => void navigate(`/units/${unit.code}`)}
          batchActions={
            can('unit.move')
              ? [
                  {
                    label: 'Move to shelf',
                    icon: ArrowRightLeft,
                    run: (units, clear) => setMoving({ units, clear }),
                  },
                ]
              : []
          }
          exportCsv={{
            name: 'demo-units',
            header: [
              'Asset code',
              'Category',
              'Brand',
              'Model',
              'Serial number',
              'Status',
              'Location',
              'Condition',
            ],
            row: (unit) => [
              unit.code,
              categoryName.get(unit.categoryCode) ?? unit.categoryCode,
              unit.brand,
              unit.model,
              unit.serial,
              STATUS_LABELS[unit.status],
              locationName.get(unit.locationId) ?? '',
              unit.condition,
            ],
          }}
        />
      </div>

      {adding && <RegisterDialog onClose={() => setAdding(false)} />}
      {moving && (
        <ShelfDialog
          title={`Move ${moving.units.length} unit${moving.units.length === 1 ? '' : 's'}`}
          description="Units that cannot change shelf right now are skipped."
          confirmLabel="Move units"
          currentId=""
          onClose={() => setMoving(null)}
          onConfirm={(locationId) => {
            const result = runBatch(moving.units, (unit) =>
              store.moveUnit(user.username, unit.code, locationId),
            );
            if (result.done === 0) throw new WmsError(result.refused);
            const shelf = locationName.get(locationId) ?? 'the shelf';
            const skipped = moving.units.length - result.done;
            toast(
              skipped === 0
                ? `${result.done} moved to ${shelf}`
                : `${result.done} moved to ${shelf}, ${skipped} skipped`,
            );
            moving.clear();
          }}
        />
      )}
    </div>
  );
}

function RegisterDialog({ onClose }: { onClose: () => void }) {
  const store = useStore();
  const state = useWmsState();
  const user = useCurrentUser();
  const navigate = useNavigate();
  const toast = useToast();
  const submit = useSubmit();

  const [categoryCode, setCategoryCode] = useState(state.categories[0]?.code ?? '');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [serial, setSerial] = useState('');
  const [condition, setCondition] = useState<ConditionGrade>('A');
  const [accessories, setAccessories] = useState('');
  const [notes, setNotes] = useState('');
  const shelves = state.locations.filter((item) => item.kind !== 'site');
  const [locationId, setLocationId] = useState(shelves[0]?.id ?? '');

  /** Known models in the chosen category, offered as suggestions; a new model can be typed. */
  const knownModels = useMemo(() => {
    const seen = new Map<string, { brand: string; model: string; accessories: string[] }>();
    for (const unit of state.units) {
      if (unit.categoryCode === categoryCode) seen.set(`${unit.brand} ${unit.model}`, unit);
    }
    return [...seen.values()];
  }, [state.units, categoryCode]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submit
      .run(() => {
        const unit = store.registerUnit(user.username, {
          categoryCode,
          brand,
          model,
          serial,
          locationId,
          condition,
          accessories: accessories.split(','),
          notes,
        });
        toast(`${unit.code} registered`);
        void navigate(`/units/${unit.code}`);
      })
      .then((saved) => {
        if (saved) onClose();
      });
  };

  return (
    <Dialog
      title="Register a demo unit"
      description="The system assigns the asset code and prints it as a QR label."
      onClose={onClose}
      busy={submit.pending}
      width={600}
      footer={
        <>
          <Button onClick={onClose} disabled={submit.pending}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="register-unit" pending={submit.pending}>
            Register unit
          </Button>
        </>
      }
    >
      <form id="register-unit" className="form-grid cols-2" onSubmit={onSubmit} noValidate>
        <Field label="Category">
          <Select
            value={categoryCode}
            onChange={setCategoryCode}
            options={state.categories.map((item) => ({
              value: item.code,
              label: item.name,
              hint: item.code,
            }))}
          />
        </Field>
        <Field label="Brand">
          <SuggestInput
            value={brand}
            onChange={setBrand}
            placeholder="Fortinet"
            suggestions={[...new Set(knownModels.map((item) => item.brand))]}
          />
        </Field>
        <Field label="Model">
          <SuggestInput
            value={model}
            placeholder="FG-60F"
            suggestions={knownModels
              .filter((item) => !brand || item.brand === brand)
              .map((item) => item.model)}
            onChange={(value) => {
              setModel(value);
              // Picking a known model fills in the accessories it normally ships with.
              const known = knownModels.find(
                (item) => item.model === value && (!brand || item.brand === brand),
              );
              if (known) {
                setBrand(known.brand);
                if (!accessories) setAccessories(known.accessories.join(', '));
              }
            }}
          />
        </Field>
        <Field label="Serial number">
          <input
            className="input mono"
            value={serial}
            onChange={(event) => setSerial(event.target.value)}
            placeholder="Manufacturer serial"
            autoCapitalize="characters"
            spellCheck={false}
          />
        </Field>
        <Field label="Shelf location" hint="Choosing a shelf also records the stocking step.">
          <Select
            value={locationId}
            onChange={setLocationId}
            options={shelves.map((item) => ({ value: item.id, label: item.name, hint: item.zone }))}
          />
        </Field>
        <Field label="Condition">
          <Select
            value={condition}
            onChange={(value) => setCondition(value as ConditionGrade)}
            options={CONDITION_OPTIONS}
          />
        </Field>
        <Field
          label="Accessories"
          hint="Separate with commas. These become the release and return checklist."
          className="span-2"
        >
          <input
            className="input"
            value={accessories}
            onChange={(event) => setAccessories(event.target.value)}
            placeholder="Power adapter, Console cable"
          />
        </Field>
        <Field label="Notes" className="span-2">
          <textarea
            className="textarea"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </Field>
        <div className="span-2">
          <FormError message={submit.error} />
        </div>
      </form>
    </Dialog>
  );
}
