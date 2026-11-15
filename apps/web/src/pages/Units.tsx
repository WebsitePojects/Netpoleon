import type { AssetStatus, Catalog, ConditionGrade } from '@wms/contracts';
import { ArrowRightLeft, Plus, Tags } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/auth.js';
import {
  invalidate,
  useBackend,
  useCursorPaging,
  useIntent,
  useResource,
} from '../backend/context.js';
import type { UnitQuery, UnitView } from '../backend/types.js';
import { Select, SuggestInput } from '../components/controls.js';
import { DataTable, type Column, type TableFilter } from '../components/DataTable.js';
import { ActionDialog } from '../components/dialogs.js';
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
import { WmsError } from '../data/store.js';
import { useSubmit } from '../lib/hooks.js';
import { ASSET_STATUS_LABELS, FILTER_STATUSES, GRADE_OPTIONS } from '../lib/labels.js';

const PAGE_SIZE = 10;
const EXPORT_PAGE = 100;
const NEW_MODEL = '__new__';

/** Search, filters, sort and page from the address: the list can be bookmarked and survives Back. */
function useUnitQuery(): { query: UnitQuery; page: number; filterKey: string } {
  const [params] = useSearchParams();
  const sort = params.get('sort');
  const query: UnitQuery = {
    q: params.get('q') ?? undefined,
    status: (params.get('status') as AssetStatus | null) ?? undefined,
    categoryId: params.get('category') ?? undefined,
    locationId: params.get('location') ?? undefined,
    sort: sort === '-code' ? '-code' : sort === 'newest' ? 'newest' : 'code',
    limit: PAGE_SIZE,
  };
  const page = Math.max(1, Number(params.get('page')) || 1);
  return { query, page, filterKey: JSON.stringify(query) };
}

export function Units() {
  const backend = useBackend();
  const { can } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [adding, setAdding] = useState(false);
  const [moving, setMoving] = useState<{ units: UnitView[]; clear: () => void } | null>(null);
  const { query, page, filterKey } = useUnitQuery();

  const paging = useCursorPaging(filterKey, page, (next) => {
    const updated = new URLSearchParams(params);
    if (next <= 1) updated.delete('page');
    else updated.set('page', String(next));
    setParams(updated, { replace: true });
  });
  const { cursor } = paging;

  const catalog = useResource('catalog', () => backend.catalog());
  const units = useResource(`units:${filterKey}:${cursor ?? ''}`, () =>
    backend.units({ ...query, cursor }),
  );
  const pageData = units.data;

  const exportAll = async (): Promise<UnitView[]> => {
    const rows: UnitView[] = [];
    let next: string | undefined;
    do {
      const result = await backend.units({ ...query, limit: EXPORT_PAGE, cursor: next });
      rows.push(...result.items);
      next = result.nextCursor ?? undefined;
    } while (next);
    return rows;
  };

  const columns: Column<UnitView>[] = [
    {
      id: 'code',
      header: 'Asset Code',
      width: '1.3fr',
      skeleton: 'thumb',
      // Sorted by the server; the code is the order its keyset pages follow.
      sort: (unit) => unit.assetCode,
      cell: (unit) => (
        <span className="unit-cell">
          <CategoryThumb unit={{ categoryCode: unit.model.categoryCode }} />
          <Link
            to={`/units/${unit.assetCode}`}
            className="row-link mono"
            onClick={(event) => event.stopPropagation()}
          >
            {unit.assetCode}
          </Link>
        </span>
      ),
    },
    { id: 'category', header: 'Category', skeleton: 110, cell: (unit) => unit.model.categoryName },
    {
      id: 'model',
      header: 'Brand / Model',
      width: '1.5fr',
      skeleton: 150,
      cell: (unit) => `${unit.model.brand} ${unit.model.modelName}`,
    },
    {
      id: 'serial',
      header: 'Serial Number',
      width: '1.2fr',
      skeleton: 130,
      className: 'mono',
      cell: (unit) => unit.serialNumber,
    },
    {
      id: 'state',
      header: 'Current Status',
      label: 'Status',
      skeleton: 'chip',
      cell: (unit) => <StatusChip status={unit.status} reserved={Boolean(unit.reservedFor)} />,
    },
    {
      id: 'shelf',
      header: 'Location',
      width: '0.9fr',
      skeleton: 90,
      cell: (unit) => unit.location?.name ?? '—',
    },
  ];

  const filters: TableFilter<UnitView>[] = [
    {
      id: 'status',
      label: 'Status',
      allLabel: 'All statuses',
      options: FILTER_STATUSES.map((item) => ({ value: item, label: ASSET_STATUS_LABELS[item] })),
      test: () => true,
    },
    {
      id: 'category',
      label: 'Category',
      allLabel: 'All categories',
      options: (catalog.data?.categories ?? []).map((item) => ({
        value: item.id,
        label: item.name,
      })),
      test: () => true,
    },
    {
      id: 'location',
      label: 'Location',
      allLabel: 'All locations',
      options: (catalog.data?.locations ?? [])
        .filter((item) => item.kind !== 'site')
        .map((item) => ({ value: item.id, label: item.name })),
      test: () => true,
    },
  ];

  return (
    <div className="page">
      <PageHead
        title="Demo Units"
        lead="Complete list of demo assets with real-time status"
        actions={
          <>
            <Button icon={Tags} onClick={() => void navigate('/units/labels')}>
              Print labels
            </Button>
            {can('unit.register') && (
              <Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>
                Add Asset
              </Button>
            )}
          </>
        }
      />

      <div className="card table-card">
        {units.error && !pageData ? (
          <FormError message={units.error} />
        ) : (
          <DataTable
            rows={pageData?.items ?? []}
            columns={columns}
            rowKey={(unit) => unit.assetCode}
            noun="demo units"
            loading={units.loading}
            pageSize={PAGE_SIZE}
            syncUrl
            remote={{
              total: pageData?.total ?? 0,
              page: paging.page,
              hasNext: Boolean(pageData?.nextCursor),
              onPage: (next) => paging.goTo(next, pageData?.nextCursor),
              refreshing: units.refreshing,
            }}
            search={{
              placeholder: 'Search by asset code, model, or serial number…',
              text: (unit) => unit.assetCode,
            }}
            filters={filters}
            onRowClick={(unit) => void navigate(`/units/${unit.assetCode}`)}
            batchActions={[
              {
                label: 'Print labels',
                icon: Tags,
                run: (picked) =>
                  void navigate(
                    `/units/labels?codes=${picked.map((unit) => unit.assetCode).join(',')}`,
                  ),
              },
              ...(can('unit.move')
                ? [
                    {
                      label: 'Move to shelf',
                      icon: ArrowRightLeft,
                      run: (picked: UnitView[], clear: () => void) =>
                        setMoving({ units: picked, clear }),
                    },
                  ]
                : []),
            ]}
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
                unit.assetCode,
                unit.model.categoryName,
                unit.model.brand,
                unit.model.modelName,
                unit.serialNumber,
                ASSET_STATUS_LABELS[unit.status],
                unit.location?.name ?? '',
                unit.condition.toUpperCase(),
              ],
              all: exportAll,
            }}
          />
        )}
      </div>

      {adding && catalog.data && (
        <RegisterDialog catalog={catalog.data} onClose={() => setAdding(false)} />
      )}
      {moving && catalog.data && (
        <MoveDialog
          units={moving.units}
          catalog={catalog.data}
          onClose={() => setMoving(null)}
          onMoved={(skipped) => {
            moving.clear();
            if (skipped) toast(skipped, 'error');
          }}
        />
      )}
    </div>
  );
}

function shelvesOf(catalog: Catalog) {
  return catalog.locations
    .filter((item) => item.kind === 'shelf')
    .map((item) => ({ value: item.id, label: item.name, hint: item.parentName ?? undefined }));
}

/** Moves the selected units in one request; the server says which ones it skipped and why. */
function MoveDialog({
  units,
  catalog,
  onClose,
  onMoved,
}: {
  units: UnitView[];
  catalog: Catalog;
  onClose: () => void;
  onMoved: (skipped: string | null) => void;
}) {
  const backend = useBackend();
  const toast = useToast();
  const intent = useIntent();
  const shelves = shelvesOf(catalog);
  const [locationId, setLocationId] = useState(shelves[0]?.value ?? '');
  const count = units.length;
  return (
    <ActionDialog
      title={`Move ${count} unit${count === 1 ? '' : 's'}`}
      description="Units that cannot change shelf right now are skipped, and the reason is shown."
      confirmLabel="Move units"
      onClose={onClose}
      onConfirmAsync={async () => {
        const result = await backend.moveUnits(
          intent.key,
          units.map((unit) => unit.assetCode),
          locationId,
        );
        if (result.done.length === 0) {
          throw new WmsError(result.skipped[0]?.reason ?? 'None of the units could move.');
        }
        const shelf = shelves.find((item) => item.value === locationId)?.label ?? 'the shelf';
        toast(`${result.done.length} moved to ${shelf}`);
        invalidate('units');
        const first = result.skipped[0];
        onMoved(first ? `${result.skipped.length} skipped. ${first.code}: ${first.reason}` : null);
      }}
    >
      <Field label="Shelf">
        <Select value={locationId} onChange={setLocationId} options={shelves} />
      </Field>
    </ActionDialog>
  );
}

function RegisterDialog({ catalog, onClose }: { catalog: Catalog; onClose: () => void }) {
  const backend = useBackend();
  const navigate = useNavigate();
  const toast = useToast();
  const submit = useSubmit();
  // Two possible requests, so two intents: creating a new model, then registering the unit.
  const modelIntent = useIntent();
  const unitIntent = useIntent();

  const [categoryId, setCategoryId] = useState(catalog.categories[0]?.id ?? '');
  const models = useMemo(
    () => catalog.models.filter((model) => model.categoryId === categoryId),
    [catalog.models, categoryId],
  );
  const [modelId, setModelId] = useState('');
  const chosen = models.find((model) => model.id === modelId);
  const creating = modelId === NEW_MODEL || models.length === 0;
  const [brand, setBrand] = useState('');
  const [modelName, setModelName] = useState('');
  const [accessories, setAccessories] = useState('');
  const [serial, setSerial] = useState('');
  const [condition, setCondition] = useState<ConditionGrade>('a');
  const [notes, setNotes] = useState('');
  const shelves = shelvesOf(catalog);
  const [locationId, setLocationId] = useState(shelves[0]?.value ?? '');

  useEffect(() => {
    setModelId(models[0]?.id ?? NEW_MODEL);
  }, [models]);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submit
      .runAsync(async () => {
        const productModelId = creating
          ? (
              await backend.addModel(modelIntent.key, {
                categoryId,
                brand,
                modelName,
                accessories: accessories
                  .split(',')
                  .map((item) => item.trim())
                  .filter(Boolean),
              })
            ).id
          : modelId;
        const detail = await backend.registerUnit(unitIntent.key, {
          productModelId,
          serialNumber: serial,
          locationId,
          condition,
          ownership: 'owned',
          ownerName: null,
          notes: notes.trim() || null,
        });
        invalidate('units', 'catalog');
        toast(`${detail.asset.assetCode} registered`);
        void navigate(`/units/${detail.asset.assetCode}`);
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
            value={categoryId}
            onChange={setCategoryId}
            options={catalog.categories.map((item) => ({
              value: item.id,
              label: item.name,
              hint: item.code,
            }))}
          />
        </Field>
        <Field
          label="Model"
          hint={
            chosen ? `Ships with: ${chosen.accessories.join(', ') || 'no accessories'}` : undefined
          }
        >
          <Select
            value={creating ? NEW_MODEL : modelId}
            onChange={setModelId}
            options={[
              ...models.map((model) => ({
                value: model.id,
                label: `${model.brand} ${model.modelName}`,
              })),
              { value: NEW_MODEL, label: 'A model not listed yet…' },
            ]}
          />
        </Field>
        {creating && (
          <>
            <Field label="Brand">
              <SuggestInput
                value={brand}
                onChange={setBrand}
                placeholder="Fortinet"
                suggestions={[...new Set(catalog.models.map((model) => model.brand))]}
              />
            </Field>
            <Field label="Model name">
              <input
                className="input"
                value={modelName}
                placeholder="FG-60F"
                onChange={(event) => setModelName(event.target.value)}
              />
            </Field>
            <Field
              label="Accessories it ships with"
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
          <Select value={locationId} onChange={setLocationId} options={shelves} />
        </Field>
        <Field label="Condition">
          <Select
            value={condition}
            onChange={(value) => setCondition(value as ConditionGrade)}
            options={GRADE_OPTIONS}
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
