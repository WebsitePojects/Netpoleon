import type {
  ConditionGrade,
  InspectionChecklist,
  InspectionQueue,
  InspectionQueueItem,
  Unit,
} from '@wms/contracts';
import { ClipboardCheck, PackageCheck, ScanLine, SearchCheck, Wrench } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiSend, newIntentKey } from '../api/client.js';
import { useDebounced, useInspectionQueue, useInvalidate } from '../api/queries.js';
import { useAuth } from '../auth/auth.js';
import { Select, SkTable } from '../components/controls.js';
import { ActionDialog, ReasonDialog, ShelfSelect } from '../components/dialogs.js';
import {
  Button,
  CategoryThumb,
  Empty,
  Field,
  PageHead,
  StatusChip,
  TableFoot,
  Tabs,
  useToast,
  type TabItem,
} from '../components/ui.js';
import { formatDate } from '../lib/dates.js';
import { useSubmit } from '../lib/hooks.js';
import { CONDITION_OPTIONS } from './Units.js';

type TabId = 'awaiting' | 'inspecting' | 'repair';
type Outcome = 'restock' | 'reassign' | 'repair' | 'retire';

const TAB_STATUS: Record<TabId, InspectionQueue> = {
  awaiting: 'returned',
  inspecting: 'under_inspection',
  repair: 'for_repair',
};

const PAGE_SIZE = 15;

const CHECKS: { key: keyof InspectionChecklist; label: string }[] = [
  { key: 'powersOn', label: 'Powers on and boots' },
  { key: 'portsWork', label: 'Ports and interfaces work' },
  { key: 'noPhysicalDamage', label: 'No physical damage' },
  { key: 'factoryReset', label: 'Reset to factory settings' },
  { key: 'accessoriesComplete', label: 'Accessories complete' },
];

const OUTCOMES: { id: Outcome; label: string; detail: string }[] = [
  { id: 'restock', label: 'Restock', detail: 'Good unit, back to its shelf' },
  { id: 'reassign', label: 'Reassign', detail: 'Good unit, to another shelf or team' },
  { id: 'repair', label: 'Send to repair', detail: 'Has a fault to fix first' },
  { id: 'retire', label: 'Retire', detail: 'Not worth repairing' },
];

function isTabId(value: string | null): value is TabId {
  return value !== null && value in TAB_STATUS;
}

export function Inspection() {
  const { can } = useAuth();
  const toast = useToast();
  const invalidate = useInvalidate();
  const [params, setParams] = useSearchParams();
  const [inspecting, setInspecting] = useState<InspectionQueueItem | null>(null);
  const [repaired, setRepaired] = useState<Unit | null>(null);

  const tabParam = params.get('tab');
  const tab: TabId = isTabId(tabParam) ? tabParam : 'awaiting';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim());
  const queue = useInspectionQueue({
    status: TAB_STATUS[tab],
    page,
    pageSize: PAGE_SIZE,
    q: q || undefined,
  });
  const mayInspect = can('inspection.perform');
  const counts = queue.data?.counts;

  const tabs: TabItem<TabId>[] = [
    { id: 'awaiting', label: 'Awaiting inspection', count: counts?.returned ?? 0 },
    { id: 'inspecting', label: 'Under inspection', count: counts?.under_inspection ?? 0 },
    { id: 'repair', label: 'For repair', count: counts?.for_repair ?? 0 },
  ];
  const items = queue.data?.items ?? [];

  const refresh = () =>
    invalidate(
      'inspections',
      'units',
      'unit',
      'transactions',
      'transaction',
      'dashboard',
      'alerts',
    );

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

        <label className="input-wrap" style={{ maxWidth: 420 }}>
          <span className="sr-only">Scan or search a unit in this queue</span>
          <ScanLine aria-hidden="true" />
          <input
            className="input mono"
            type="search"
            placeholder="Scan or type an asset code or serial…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              if (page !== 1) setParams({ tab }, { replace: true });
            }}
          />
        </label>

        <div className="card table-card">
          {queue.isPending ? (
            <SkTable
              template="1.3fr 1.5fr 1fr 1fr 1.1fr"
              cells={['thumb', 150, 'chip', 100, 120]}
              rows={6}
            />
          ) : items.length === 0 ? (
            <Empty title="This queue is empty" icon={ClipboardCheck}>
              {tab === 'awaiting'
                ? 'Returned units appear here as soon as they are received.'
                : 'Nothing is waiting at this step.'}
            </Empty>
          ) : (
            <>
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
                  {items.map((item) => (
                    <tr key={item.unit.code}>
                      <td data-label="Unit">
                        <span className="unit-cell">
                          <CategoryThumb unit={item.unit} />
                          <Link to={`/units/${item.unit.code}`} className="row-link mono">
                            {item.unit.code}
                          </Link>
                        </span>
                      </td>
                      <td data-label="Brand / Model">
                        {item.unit.brand} {item.unit.model}
                      </td>
                      <td data-label={tab === 'repair' ? 'Fault' : 'Returned by'}>
                        {tab === 'repair' ? (item.note ?? '—') : (item.company ?? '—')}
                      </td>
                      <td data-label={tab === 'repair' ? 'Status' : 'Returned'} className="num">
                        {tab === 'repair' ? (
                          <StatusChip status={item.unit.status} />
                        ) : (
                          formatDate(item.returnedAt)
                        )}
                      </td>
                      <td data-label="Accessories">
                        {item.missingAccessories.length > 0 ? (
                          <span className="late">
                            Missing {item.missingAccessories.join(', ').toLowerCase()}
                          </span>
                        ) : (
                          'Complete'
                        )}
                      </td>
                      <td data-label="" className="right">
                        {mayInspect && tab === 'awaiting' && (
                          <StartButton
                            onStart={async (key) => {
                              await apiSend(
                                'POST',
                                `/units/${item.unit.code}/inspection/start`,
                                {},
                                key,
                              );
                              await refresh();
                              toast(`${item.unit.code} moved to inspection`);
                            }}
                          />
                        )}
                        {mayInspect && tab === 'inspecting' && (
                          <Button
                            size="sm"
                            variant="primary"
                            icon={ClipboardCheck}
                            onClick={() => setInspecting(item)}
                          >
                            Record result
                          </Button>
                        )}
                        {can('unit.repair') && tab === 'repair' && (
                          <Button
                            size="sm"
                            variant="primary"
                            icon={Wrench}
                            onClick={() => setRepaired(item.unit)}
                          >
                            Repair complete
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <TableFoot
                page={page}
                pageSize={PAGE_SIZE}
                total={queue.data?.total ?? 0}
                noun="units"
                onPage={(next) =>
                  setParams({ tab, ...(next > 1 ? { page: String(next) } : {}) }, { replace: true })
                }
              />
            </>
          )}
        </div>
      </div>

      {inspecting && (
        <InspectDialog
          item={inspecting}
          onClose={() => setInspecting(null)}
          onDone={async (message) => {
            await refresh();
            toast(message);
          }}
        />
      )}
      {repaired && (
        <ReasonDialog
          title="Repair complete"
          description={`${repaired.code} goes back through inspection before it returns to a shelf.`}
          label="What was done?"
          placeholder="Replaced fan, re-flashed firmware…"
          confirmLabel="Send to inspection"
          onClose={() => setRepaired(null)}
          onConfirm={async (note, key) => {
            await apiSend('POST', `/units/${repaired.code}/repair-complete`, { note }, key);
            await refresh();
            toast(`${repaired.code} is waiting for inspection`);
          }}
        />
      )}
    </div>
  );
}

/** Row action with its own guard and intent key, so a double click starts one inspection. */
function StartButton({ onStart }: { onStart: (key: string) => Promise<void> }) {
  const submit = useSubmit();
  const toast = useToast();
  const key = useRef(newIntentKey());
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
        void submit.run(() => onStart(key.current));
      }}
    >
      Start inspection
    </Button>
  );
}

function InspectDialog({
  item,
  onClose,
  onDone,
}: {
  item: InspectionQueueItem;
  onClose: () => void;
  onDone: (message: string) => Promise<void>;
}) {
  const { unit } = item;
  const [grade, setGrade] = useState<ConditionGrade>(unit.condition);
  const [checklist, setChecklist] = useState<InspectionChecklist>({
    powersOn: true,
    portsWork: true,
    noPhysicalDamage: true,
    factoryReset: true,
    accessoriesComplete: item.missingAccessories.length === 0,
  });
  const [outcome, setOutcome] = useState<Outcome>('restock');
  const [notes, setNotes] = useState('');
  // The shelf the unit last stood on is the natural place to put it back.
  const [locationId, setLocationId] = useState(item.lastShelfId ?? '');
  const needsShelf = outcome === 'restock' || outcome === 'reassign';
  const failed = Object.values(checklist).filter((passed) => !passed).length;

  return (
    <ActionDialog
      title={`Inspect ${unit.code}`}
      description={`${unit.brand} ${unit.model} · serial ${unit.serial}`}
      confirmLabel="Record inspection"
      width={600}
      canConfirm={needsShelf ? locationId !== '' : notes.trim() !== ''}
      onClose={onClose}
      onConfirm={async (key) => {
        const base = { grade, checklist, notes: notes.trim() || null };
        await apiSend(
          'POST',
          `/units/${unit.code}/inspection`,
          needsShelf
            ? { ...base, outcome, locationId }
            : { ...base, outcome, reason: notes.trim() },
          key,
        );
        await onDone(
          outcome === 'repair'
            ? `${unit.code} tagged for repair`
            : outcome === 'retire'
              ? `${unit.code} retired`
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
      {failed > 0 && needsShelf && (
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
          {OUTCOMES.map((choice) => (
            <button
              key={choice.id}
              type="button"
              className="choice"
              aria-pressed={outcome === choice.id}
              onClick={() => setOutcome(choice.id)}
            >
              <strong>{choice.label}</strong>
              <span>{choice.detail}</span>
            </button>
          ))}
        </div>
      </div>
      {needsShelf && (
        <ShelfSelect
          value={locationId}
          onChange={setLocationId}
          label={outcome === 'reassign' ? 'Reassign to' : 'Restock on'}
        />
      )}
      <Field
        label={
          needsShelf
            ? 'Notes (optional)'
            : outcome === 'repair'
              ? 'Fault description'
              : 'Reason for retiring'
        }
      >
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
