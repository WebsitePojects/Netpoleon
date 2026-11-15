import { ClipboardCheck, PackageCheck, SearchCheck, Wrench } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth, useCurrentUser } from '../auth/auth.js';
import { CONDITION_OPTIONS, Select } from '../components/controls.js';
import { DataTable, runBatch, type Column } from '../components/DataTable.js';
import { ActionDialog, ShelfSelect } from '../components/dialogs.js';
import {
  Button,
  CategoryThumb,
  Field,
  PageHead,
  StatusChip,
  Tabs,
  useToast,
  type TabItem,
} from '../components/ui.js';
import { useStore, useWmsState } from '../data/context.js';
import { missingAccessories } from '../data/selectors.js';
import type {
  ConditionGrade,
  InspectionChecklist,
  InspectionOutcome,
  Loan,
  Unit,
  UnitStatus,
} from '../data/types.js';
import { formatDate } from '../lib/dates.js';
import { usePageReady, useSubmit } from '../lib/hooks.js';

type TabId = 'awaiting' | 'inspecting' | 'repair';

const TAB_STATUS: Record<TabId, UnitStatus> = {
  awaiting: 'returned',
  inspecting: 'under_inspection',
  repair: 'for_repair',
};

const CHECKS: { key: keyof InspectionChecklist; label: string }[] = [
  { key: 'powersOn', label: 'Powers on and boots' },
  { key: 'portsWork', label: 'Ports and interfaces work' },
  { key: 'noPhysicalDamage', label: 'No physical damage' },
  { key: 'factoryReset', label: 'Reset to factory settings' },
  { key: 'accessoriesComplete', label: 'Accessories complete' },
];

const OUTCOMES: { id: InspectionOutcome; label: string; detail: string }[] = [
  { id: 'restock', label: 'Restock', detail: 'Good unit, back to its shelf' },
  { id: 'reassign', label: 'Reassign', detail: 'Good unit, to another shelf or team' },
  { id: 'repair', label: 'Send to repair', detail: 'Has a fault to fix first' },
];

function isTabId(value: string | null): value is TabId {
  return value !== null && value in TAB_STATUS;
}

export function Inspection() {
  const state = useWmsState();
  const store = useStore();
  const user = useCurrentUser();
  const { can } = useAuth();
  const toast = useToast();
  const ready = usePageReady();
  const [params, setParams] = useSearchParams();
  const [inspecting, setInspecting] = useState<Unit | null>(null);
  const [repaired, setRepaired] = useState<Unit | null>(null);

  const tabParam = params.get('tab');
  const tab: TabId = isTabId(tabParam) ? tabParam : 'awaiting';
  const mayInspect = can('inspection.perform');

  const count = (id: TabId) => state.units.filter((unit) => unit.status === TAB_STATUS[id]).length;
  const tabs: TabItem<TabId>[] = [
    { id: 'awaiting', label: 'Awaiting inspection', count: count('awaiting') },
    { id: 'inspecting', label: 'Under inspection', count: count('inspecting') },
    { id: 'repair', label: 'For repair', count: count('repair') },
  ];

  const units = useMemo(
    () => state.units.filter((unit) => unit.status === TAB_STATUS[tab]),
    [state.units, tab],
  );
  /** The return still waiting on an inspection result, per unit. */
  const openReturn = useMemo(() => {
    const byUnit = new Map<string, Loan>();
    for (const loan of state.loans) {
      if (loan.status === 'returned' && loan.unitCode) byUnit.set(loan.unitCode, loan);
    }
    return byUnit;
  }, [state.loans]);
  const lastNote = useMemo(() => {
    const byUnit = new Map<string, string>();
    for (const movement of state.movements) byUnit.set(movement.unitCode, movement.note);
    return byUnit;
  }, [state.movements]);

  const missingLabel = (unit: Unit) => {
    const loan = openReturn.get(unit.code);
    const missing = loan ? missingAccessories(loan) : [];
    return missing.length > 0 ? `Missing ${missing.join(', ').toLowerCase()}` : 'Complete';
  };
  const repairTab = tab === 'repair';

  const columns: Column<Unit>[] = [
    {
      id: 'code',
      header: 'Unit',
      width: '1.3fr',
      skeleton: 'thumb',
      sort: (unit) => unit.code,
      cell: (unit) => (
        <span className="unit-cell">
          <CategoryThumb unit={unit} />
          <Link to={`/units/${unit.code}`} className="row-link mono">
            {unit.code}
          </Link>
        </span>
      ),
    },
    {
      id: 'model',
      header: 'Brand / Model',
      width: '1.5fr',
      skeleton: 150,
      sort: (unit) => `${unit.brand} ${unit.model}`,
      cell: (unit) => `${unit.brand} ${unit.model}`,
    },
    repairTab
      ? {
          id: 'fault',
          header: 'Fault',
          skeleton: 140,
          sort: (unit) => lastNote.get(unit.code) ?? '',
          cell: (unit) => lastNote.get(unit.code) ?? '—',
        }
      : {
          id: 'company',
          header: 'Returned by',
          skeleton: 130,
          sort: (unit) => openReturn.get(unit.code)?.borrower.company ?? '',
          cell: (unit) => openReturn.get(unit.code)?.borrower.company ?? '—',
        },
    repairTab
      ? {
          id: 'state',
          header: 'Status',
          skeleton: 'chip',
          cell: (unit) => <StatusChip status={unit.status} />,
        }
      : {
          id: 'returned',
          header: 'Returned',
          skeleton: 100,
          className: 'num',
          sort: (unit) => openReturn.get(unit.code)?.returnedAt ?? '',
          cell: (unit) => formatDate(openReturn.get(unit.code)?.returnedAt ?? null),
        },
    {
      id: 'accessories',
      header: 'Accessories',
      width: '1.1fr',
      skeleton: 120,
      sort: missingLabel,
      cell: (unit) => {
        const label = missingLabel(unit);
        return label === 'Complete' ? label : <span className="late">{label}</span>;
      },
    },
    {
      id: 'action',
      header: 'Action',
      label: '',
      align: 'right',
      skeleton: 120,
      cell: (unit) => (
        <>
          {mayInspect && tab === 'awaiting' && (
            <StartButton
              onStart={() => {
                store.startInspection(user.id, unit.code);
                toast(`${unit.code} moved to the QA Area`);
              }}
            />
          )}
          {mayInspect && tab === 'inspecting' && (
            <Button
              size="sm"
              variant="primary"
              icon={ClipboardCheck}
              onClick={() => setInspecting(unit)}
            >
              Record result
            </Button>
          )}
          {can('unit.repair') && repairTab && (
            <Button size="sm" variant="primary" icon={Wrench} onClick={() => setRepaired(unit)}>
              Repair complete
            </Button>
          )}
        </>
      ),
    },
  ];

  return (
    <div className="page">
      <PageHead
        title="Inspection"
        lead="Check returned units, record their condition, and restock or repair"
      />

      <div className="stack">
        <Tabs
          tabs={tabs}
          value={tab}
          onChange={(next) => setParams({ tab: next }, { replace: true })}
          label="Inspection queues"
        />

        <div className="card table-card">
          {/* Keyed by queue: a selection made in one queue does not carry into another. */}
          <DataTable
            key={tab}
            rows={units}
            columns={columns}
            rowKey={(unit) => unit.code}
            noun="units"
            loading={!ready}
            syncUrl
            search={{
              placeholder: 'Search by asset code, model, or company…',
              text: (unit) =>
                `${unit.code} ${unit.brand} ${unit.model} ${openReturn.get(unit.code)?.borrower.company ?? ''}`,
            }}
            filters={[
              {
                id: 'category',
                label: 'Category',
                allLabel: 'All categories',
                options: state.categories.map((item) => ({ value: item.code, label: item.name })),
                test: (unit, value) => unit.categoryCode === value,
              },
            ]}
            empty={{
              title: 'This queue is empty',
              icon: ClipboardCheck,
              body:
                tab === 'awaiting'
                  ? 'Returned units appear here as soon as they are received.'
                  : 'Nothing is waiting at this step.',
            }}
            batchActions={
              mayInspect && tab === 'awaiting'
                ? [
                    {
                      label: 'Inspect selected',
                      icon: SearchCheck,
                      run: (picked, clear) => {
                        const result = runBatch(picked, (unit) =>
                          store.startInspection(user.id, unit.code),
                        );
                        clear();
                        if (result.done === 0) {
                          toast(result.refused, 'error');
                          return;
                        }
                        const skipped = picked.length - result.done;
                        toast(
                          skipped === 0
                            ? `${result.done} moved to the QA Area`
                            : `${result.done} moved to the QA Area, ${skipped} skipped`,
                        );
                      },
                    },
                  ]
                : []
            }
            exportCsv={{
              name: `inspection-${tab}`,
              header: ['Asset code', 'Brand', 'Model', 'Returned by', 'Returned', 'Accessories'],
              row: (unit) => {
                const loan = openReturn.get(unit.code);
                return [
                  unit.code,
                  unit.brand,
                  unit.model,
                  loan?.borrower.company ?? '',
                  loan?.returnedAt ?? '',
                  missingLabel(unit),
                ];
              },
            }}
          />
        </div>
      </div>

      {inspecting && (
        <InspectDialog
          unit={inspecting}
          accessoriesComplete={(() => {
            const loan = openReturn.get(inspecting.code);
            return loan ? missingAccessories(loan).length === 0 : true;
          })()}
          onClose={() => setInspecting(null)}
        />
      )}
      {repaired && (
        <ActionDialog
          title="Repair complete"
          description={`${repaired.code} goes to the QA area for inspection before it can be lent again.`}
          confirmLabel="Send to inspection"
          onClose={() => setRepaired(null)}
          onConfirm={() => {
            store.completeRepair(user.id, repaired.code, '');
            toast(`${repaired.code} repaired and back in inspection`);
          }}
        />
      )}
    </div>
  );
}

/** Row action with its own guard, so a double click starts one inspection, not two. */
function StartButton({ onStart }: { onStart: () => void }) {
  const submit = useSubmit();
  const toast = useToast();
  // A row has no room for an inline error, so a refused start is reported as a toast.
  useEffect(() => {
    if (submit.error) toast(submit.error, 'error');
  }, [submit.error, toast]);
  return (
    <Button
      size="sm"
      variant="primary"
      icon={SearchCheck}
      pending={submit.pending}
      onClick={() => {
        void submit.run(onStart);
      }}
    >
      Start inspection
    </Button>
  );
}

function InspectDialog({
  unit,
  accessoriesComplete,
  onClose,
}: {
  unit: Unit;
  accessoriesComplete: boolean;
  onClose: () => void;
}) {
  const store = useStore();
  const state = useWmsState();
  const user = useCurrentUser();
  const toast = useToast();

  const [grade, setGrade] = useState<ConditionGrade>(unit.condition);
  const [checklist, setChecklist] = useState<InspectionChecklist>({
    powersOn: true,
    portsWork: true,
    noPhysicalDamage: true,
    factoryReset: true,
    accessoriesComplete,
  });
  const [outcome, setOutcome] = useState<InspectionOutcome>('restock');
  const [notes, setNotes] = useState('');
  // Default to a shelf in the unit's own aisle: the zone letter is shared by category.
  const homeShelf = useMemo(() => {
    const previous = [...state.movements]
      .reverse()
      .find((movement) => movement.unitCode === unit.code && /Shelf [A-Z]-\d+/.test(movement.note));
    const name = previous?.note.match(/Shelf [A-Z]-\d+/)?.[0];
    const shelves = state.locations.filter((item) => item.kind === 'shelf');
    const sameCategory = state.units.find(
      (other) => other.categoryCode === unit.categoryCode && other.status === 'in_stock',
    );
    return (
      shelves.find((item) => item.name === name)?.id ??
      shelves.find((item) => item.id === sameCategory?.locationId)?.id ??
      shelves[0]?.id ??
      ''
    );
  }, [state.movements, state.locations, state.units, unit]);
  const [locationId, setLocationId] = useState(homeShelf);

  const failed = Object.values(checklist).filter((passed) => !passed).length;

  return (
    <ActionDialog
      title={`Inspect ${unit.code}`}
      description={`${unit.brand} ${unit.model} · serial ${unit.serial}`}
      confirmLabel="Record inspection"
      width={600}
      onClose={onClose}
      onConfirm={() => {
        store.recordInspection(user.id, unit.code, {
          grade,
          checklist,
          notes,
          outcome,
          locationId: outcome === 'repair' ? null : locationId,
        });
        toast(
          outcome === 'repair'
            ? `${unit.code} tagged for repair`
            : `${unit.code} is available for redeployment`,
        );
      }}
    >
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label" style={{ marginBottom: 4 }}>
          Checklist
        </legend>
        {CHECKS.map((check) => (
          <label key={check.key} className="check">
            <input
              type="checkbox"
              checked={checklist[check.key]}
              onChange={(event) =>
                setChecklist({ ...checklist, [check.key]: event.target.checked })
              }
            />
            {check.label}
          </label>
        ))}
      </fieldset>
      {failed > 0 && outcome !== 'repair' && (
        <p className="banner" role="status">
          <PackageCheck aria-hidden="true" />
          {failed} check{failed === 1 ? '' : 's'} failed. Restocking is still allowed; say why in
          the notes.
        </p>
      )}
      <Field label="Condition grade">
        <Select
          value={grade}
          onChange={(value) => setGrade(value as ConditionGrade)}
          options={CONDITION_OPTIONS}
        />
      </Field>
      <div>
        <span className="label">Outcome</span>
        <div className="choice-grid" role="group" aria-label="Outcome" style={{ marginTop: 6 }}>
          {OUTCOMES.map((item) => (
            <button
              key={item.id}
              type="button"
              className="choice"
              aria-pressed={outcome === item.id}
              onClick={() => setOutcome(item.id)}
            >
              <strong>{item.label}</strong>
              <span>{item.detail}</span>
            </button>
          ))}
        </div>
      </div>
      {outcome !== 'repair' && (
        <ShelfSelect
          value={locationId}
          onChange={setLocationId}
          label={outcome === 'reassign' ? 'Reassign to' : 'Restock on'}
        />
      )}
      <Field label={outcome === 'repair' ? 'Fault description' : 'Notes (optional)'}>
        <textarea
          className="textarea"
          value={notes}
          placeholder={outcome === 'repair' ? 'What needs fixing?' : ''}
          onChange={(event) => setNotes(event.target.value)}
        />
      </Field>
    </ActionDialog>
  );
}
