import { ClipboardCheck, PackageCheck, SearchCheck, Wrench } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth, useCurrentUser } from '../auth/auth.js';
import { CONDITION_OPTIONS, Select, SkTable } from '../components/controls.js';
import { ActionDialog, ShelfDialog, ShelfSelect } from '../components/dialogs.js';
import {
  Button,
  CategoryThumb,
  Empty,
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
          {!ready ? (
            <SkTable
              template="1.3fr 1.5fr 1fr 1fr 1.1fr"
              cells={['thumb', 150, 'chip', 100, 120]}
              rows={6}
            />
          ) : units.length === 0 ? (
            <Empty title="This queue is empty" icon={ClipboardCheck}>
              {tab === 'awaiting'
                ? 'Returned units appear here as soon as they are received.'
                : 'Nothing is waiting at this step.'}
            </Empty>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Unit</th>
                  <th>Brand / Model</th>
                  <th>{tab === 'repair' ? 'Fault' : 'Returned by'}</th>
                  <th>{tab === 'repair' ? 'Status' : 'Returned'}</th>
                  <th>Accessories</th>
                  <th className="right">Action</th>
                </tr>
              </thead>
              <tbody>
                {units.map((unit) => {
                  const loan = openReturn.get(unit.code);
                  const missing = loan ? missingAccessories(loan) : [];
                  return (
                    <tr key={unit.code}>
                      <td data-label="Unit">
                        <span className="unit-cell">
                          <CategoryThumb unit={unit} />
                          <Link to={`/units/${unit.code}`} className="row-link mono">
                            {unit.code}
                          </Link>
                        </span>
                      </td>
                      <td data-label="Brand / Model">
                        {unit.brand} {unit.model}
                      </td>
                      <td data-label={tab === 'repair' ? 'Fault' : 'Returned by'}>
                        {tab === 'repair'
                          ? (lastNote.get(unit.code) ?? '—')
                          : (loan?.borrower.company ?? '—')}
                      </td>
                      <td data-label={tab === 'repair' ? 'Status' : 'Returned'} className="num">
                        {tab === 'repair' ? (
                          <StatusChip status={unit.status} />
                        ) : (
                          formatDate(loan?.returnedAt ?? null)
                        )}
                      </td>
                      <td data-label="Accessories">
                        {missing.length > 0 ? (
                          <span className="late">Missing {missing.join(', ').toLowerCase()}</span>
                        ) : (
                          'Complete'
                        )}
                      </td>
                      <td data-label="" className="right">
                        {mayInspect && tab === 'awaiting' && (
                          <StartButton
                            onStart={() => {
                              store.startInspection(user.username, unit.code);
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
                        {can('unit.repair') && tab === 'repair' && (
                          <Button
                            size="sm"
                            variant="primary"
                            icon={Wrench}
                            onClick={() => setRepaired(unit)}
                          >
                            Repair complete
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
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
        <ShelfDialog
          title="Repair complete"
          description={`Choose the shelf ${repaired.code} goes back to.`}
          confirmLabel="Restock unit"
          currentId=""
          onClose={() => setRepaired(null)}
          onConfirm={(locationId) => {
            store.completeRepair(user.username, repaired.code, locationId, '');
            toast(`${repaired.code} repaired and restocked`);
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
        store.recordInspection(user.username, unit.code, {
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
