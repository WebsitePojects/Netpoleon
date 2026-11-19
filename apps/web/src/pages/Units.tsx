import type { BulkResult, ConditionGrade, Model, Unit } from '@wms/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, Plus } from 'lucide-react';
import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { apiSend, exportUrl, newIntentKey } from '../api/client.js';
import { keys, useDebounced, useInvalidate, useUnits } from '../api/queries.js';
import { useAuth, useReference } from '../auth/auth.js';
import { Select, SuggestInput } from '../components/controls.js';
import {
  DataTable,
  readTableState,
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
import { ACTIVE_STATUSES, CONDITION_LABELS, STATUS_LABELS } from '../lib/labels.js';
import { useSubmit } from '../lib/hooks.js';

const PAGE_SIZE = 10;
const FILTERS = ['status', 'category', 'location'] as const;
const STATUS_OPTIONS = [...ACTIVE_STATUSES, 'retired'] as const;
export const CONDITION_OPTIONS = (Object.keys(CONDITION_LABELS) as ConditionGrade[]).map(
  (value) => ({
    value,
    label: CONDITION_LABELS[value],
  }),
);

export function Units() {
  const { categories, locations } = useReference();
  const { can } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const invalidate = useInvalidate();
  const [params] = useSearchParams();
  const [adding, setAdding] = useState(false);
  const [moving, setMoving] = useState<{ units: Unit[]; clear: () => void } | null>(null);

  const table = readTableState(params, FILTERS);
  const q = useDebounced(table.q.trim());
  const query = {
    page: table.page,
    pageSize: PAGE_SIZE,
    q: q || undefined,
    ...table.sort,
    status: table.filters.status || undefined,
    category: table.filters.category || undefined,
    location: table.filters.location || undefined,
  };
  const units = useUnits(query);

  const categoryName = useMemo(
    () => new Map(categories.map((item) => [item.code, item.name])),
    [categories],
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
      cell: (unit) => unit.serial,
    },
    {
      id: 'status',
      header: 'Current Status',
      label: 'Status',
      skeleton: 'chip',
      sort: (unit) => unit.status,
      cell: (unit) => <StatusChip status={unit.status} reserved={unit.reservedFor !== null} />,
    },
    {
      id: 'location',
      header: 'Location',
      width: '0.9fr',
      skeleton: 90,
      sort: (unit) => unit.location?.name ?? '',
      cell: (unit) => unit.location?.name ?? '—',
    },
  ];

  const filters: TableFilter<Unit>[] = [
    {
      id: 'status',
      label: 'Status',
      allLabel: 'All statuses',
      options: STATUS_OPTIONS.map((item) => ({ value: item, label: STATUS_LABELS[item] })),
      test: () => true,
    },
    {
      id: 'category',
      label: 'Category',
      allLabel: 'All categories',
      options: categories.map((item) => ({ value: item.code, label: item.name })),
      test: () => true,
    },
    {
      id: 'location',
      label: 'Location',
      allLabel: 'All locations',
      options: locations
        .filter((item) => item.kind === 'shelf')
        .map((item) => ({ value: item.id, label: item.name })),
      test: () => true,
    },
  ];

  const { page: _page, pageSize: _size, ...exportFilters } = query;

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
          rows={units.data?.items ?? []}
          columns={columns}
          rowKey={(unit) => unit.code}
          noun="demo units"
          pageSize={PAGE_SIZE}
          loading={units.isPending}
          syncUrl
          server={{
            total: units.data?.total ?? 0,
            exportHref: exportUrl('/units/export.csv', exportFilters),
          }}
          search={{ placeholder: 'Search by asset code, model, or serial number…', text: () => '' }}
          filters={filters}
          onRowClick={(unit) => void navigate(`/units/${unit.code}`)}
          batchActions={
            can('unit.move')
              ? [
                  {
                    label: 'Move to shelf',
                    icon: ArrowRightLeft,
                    run: (rows, clear) => setMoving({ units: rows, clear }),
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
              unit.location?.name ?? '',
              unit.condition.toUpperCase(),
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
          onConfirm={async (locationId, key) => {
            const { results } = await apiSend<BulkResult>(
              'POST',
              '/units/bulk-relocate',
              { codes: moving.units.map((unit) => unit.code), locationId },
              key,
            );
            const done = results.filter((row) => row.ok).length;
            const shelf = locations.find((item) => item.id === locationId)?.name ?? 'the shelf';
            await invalidate('units', 'dashboard');
            if (done === 0) {
              const first = results.find((row) => !row.ok);
              toast(first && !first.ok ? first.message : 'No unit could be moved', 'error');
              return;
            }
            const skipped = results.length - done;
            toast(
              skipped === 0
                ? `${done} moved to ${shelf}`
                : `${done} moved to ${shelf}, ${skipped} skipped`,
            );
            moving.clear();
          }}
        />
      )}
    </div>
  );
}

const NEW_MODEL = '__new__';

function RegisterDialog({ onClose }: { onClose: () => void }) {
  const { categories, locations, models } = useReference();
  const { can } = useAuth();
  const client = useQueryClient();
  const invalidate = useInvalidate();
  const navigate = useNavigate();
  const toast = useToast();
  const submit = useSubmit();
  const intentKey = useRef(newIntentKey());

  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '');
  const inCategory = models.filter((model) => model.category.id === categoryId);
  const [modelId, setModelId] = useState(inCategory[0]?.id ?? NEW_MODEL);
  const [brand, setBrand] = useState('');
  const [modelName, setModelName] = useState('');
  const [accessories, setAccessories] = useState('');
  const [serial, setSerial] = useState('');
  const [condition, setCondition] = useState<ConditionGrade>('a');
  const [notes, setNotes] = useState('');
  const shelves = locations.filter((item) => item.kind === 'shelf');
  const [locationId, setLocationId] = useState(shelves[0]?.id ?? '');
  const creatingModel = modelId === NEW_MODEL;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submit
      .run(async () => {
        let chosen = modelId;
        if (creatingModel) {
          // Derived keys: a retry after a timeout replays both steps instead of repeating them.
          const created = await apiSend<{ id: string }>(
            'POST',
            '/models',
            {
              categoryId,
              brand: brand.trim(),
              name: modelName.trim(),
              accessories: accessories
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean),
            },
            `${intentKey.current}:model`,
          );
          chosen = created.id;
          await client.invalidateQueries({ queryKey: keys.bootstrap });
        }
        const unit = await apiSend<Unit>(
          'POST',
          '/units',
          {
            modelId: chosen,
            serial: serial.trim(),
            condition,
            locationId,
            notes: notes.trim() || null,
          },
          `${intentKey.current}:unit`,
        );
        await invalidate('units', 'dashboard', 'reports');
        toast(`${unit.code} registered`);
        void navigate(`/units/${unit.code}`);
      })
      .then((saved) => {
        if (saved) onClose();
      });
  };

  const brands = [...new Set(models.map((model: Model) => model.brand))];
  const valid =
    serial.trim() !== '' &&
    locationId !== '' &&
    (!creatingModel || (brand.trim() !== '' && modelName.trim() !== ''));

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
          <Button
            variant="primary"
            type="submit"
            form="register-unit"
            pending={submit.pending}
            disabled={!valid}
          >
            Register unit
          </Button>
        </>
      }
    >
      <form id="register-unit" className="form-grid cols-2" onSubmit={onSubmit} noValidate>
        <Field label="Category">
          <Select
            value={categoryId}
            onChange={(value) => {
              setCategoryId(value);
              setModelId(models.find((model) => model.category.id === value)?.id ?? NEW_MODEL);
            }}
            options={categories.map((item) => ({
              value: item.id,
              label: item.name,
              hint: item.code,
            }))}
          />
        </Field>
        <Field label="Model">
          <Select
            value={modelId}
            onChange={setModelId}
            options={[
              ...inCategory.map((model) => ({
                value: model.id,
                label: `${model.brand} ${model.name}`,
              })),
              ...(can('catalog.manage') ? [{ value: NEW_MODEL, label: 'New model…' }] : []),
            ]}
          />
        </Field>
        {creatingModel && (
          <>
            <Field label="Brand">
              <SuggestInput
                value={brand}
                onChange={setBrand}
                placeholder="Fortinet"
                suggestions={brands}
              />
            </Field>
            <Field label="Model name">
              <input
                className="input"
                value={modelName}
                onChange={(event) => setModelName(event.target.value)}
                placeholder="FG-60F"
              />
            </Field>
            <Field
              label="Accessories"
              hint="Separate with commas. They become the release and return checklist."
              className="span-2"
            >
              <input
                className="input"
                value={accessories}
                onChange={(event) => setAccessories(event.target.value)}
                placeholder="Power adapter, Console cable"
              />
            </Field>
          </>
        )}
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
            options={shelves.map((item) => ({
              value: item.id,
              label: item.name,
              hint: item.roomName ?? '',
            }))}
          />
        </Field>
        <Field label="Condition">
          <Select
            value={condition}
            onChange={(value) => setCondition(value as ConditionGrade)}
            options={CONDITION_OPTIONS}
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
