import type { OrgType, PartnerDetail, PartnerSummary } from '@wms/contracts';
import { Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { apiSend } from '../api/client.js';
import { useDebounced, useInvalidate, usePartnerDirectory } from '../api/queries.js';
import { useAuth } from '../auth/auth.js';
import { Select } from '../components/controls.js';
import {
  DataTable,
  readTableState,
  type Column,
  type TableFilter,
} from '../components/DataTable.js';
import { ActionDialog } from '../components/dialogs.js';
import { Button, Field, PageHead, useToast } from '../components/ui.js';
import { formatRelative } from '../lib/dates.js';
import { ORG_TYPE_LABELS, ORG_TYPE_OPTIONS } from '../lib/labels.js';

const PAGE_SIZE = 15;
const FILTERS = ['type', 'status'] as const;

/** The status chip shared by the directory and a company's page. */
export function PartnerStatus({ status }: { status: PartnerSummary['status'] }) {
  return (
    <span className="chip" data-tone={status === 'active' ? 'in_stock' : 'retired'}>
      {status === 'active' ? 'Active' : 'Archived'}
    </span>
  );
}

/** Every borrowing company with what it has out and when it last asked for something. */
export function Partners() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const table = readTableState(params, FILTERS);
  const q = useDebounced(table.q.trim());
  const creating = params.get('new') === '1';
  const moved = useRef(false);
  const directory = usePartnerDirectory({
    page: table.page,
    pageSize: PAGE_SIZE,
    q: q || undefined,
    type: table.filters.type || undefined,
    // Archived companies stay findable, but the everyday list shows the active ones.
    status: table.filters.status || 'active',
    ...table.sort,
  });
  const now = new Date();

  const setCreating = (open: boolean) => {
    const next = new URLSearchParams(params);
    if (open) next.set('new', '1');
    else next.delete('new');
    setParams(next, { replace: true });
  };

  const columns: Column<PartnerSummary>[] = [
    {
      id: 'name',
      header: 'Company',
      width: '1.6fr',
      skeleton: 160,
      sort: (row) => row.name,
      cell: (row) => (
        <Link
          to={`/partners/${row.id}`}
          className="row-link"
          onClick={(event) => event.stopPropagation()}
        >
          {row.name}
        </Link>
      ),
    },
    {
      id: 'type',
      header: 'Type',
      width: '0.9fr',
      skeleton: 80,
      sort: (row) => row.type,
      cell: (row) => <span className="chip plain">{ORG_TYPE_LABELS[row.type]}</span>,
    },
    {
      id: 'contactCount',
      header: 'Contacts',
      width: '0.6fr',
      align: 'right',
      className: 'num',
      skeleton: 30,
      cell: (row) => row.contactCount,
    },
    {
      id: 'requestCount',
      header: 'Requests',
      width: '0.6fr',
      align: 'right',
      className: 'num',
      skeleton: 30,
      cell: (row) =>
        row.openRequests > 0 ? `${row.requestCount} (${row.openRequests} open)` : row.requestCount,
    },
    {
      id: 'unitsOut',
      header: 'Units out',
      width: '0.6fr',
      align: 'right',
      className: 'num',
      skeleton: 30,
      sort: (row) => row.unitsOut,
      cell: (row) => row.unitsOut,
    },
    {
      id: 'lastActivityAt',
      header: 'Last request',
      width: '0.9fr',
      skeleton: 80,
      sort: (row) => row.lastActivityAt ?? '',
      cell: (row) => (row.lastActivityAt ? formatRelative(row.lastActivityAt, now) : 'Never'),
    },
    {
      id: 'status',
      header: 'Status',
      width: '0.7fr',
      skeleton: 'chip',
      cell: (row) => <PartnerStatus status={row.status} />,
    },
  ];

  const filters: TableFilter<PartnerSummary>[] = [
    {
      id: 'type',
      label: 'Type',
      allLabel: 'All types',
      options: ORG_TYPE_OPTIONS,
      test: () => true,
    },
    {
      id: 'status',
      label: 'Status',
      allLabel: 'Active',
      options: [{ value: 'archived', label: 'Archived' }],
      test: () => true,
    },
  ];

  return (
    <div className="page">
      <PageHead
        title="Partners"
        lead="The companies that borrow demo units, the people there, and what each has out"
        actions={
          can('partners.manage') && (
            <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
              Add company
            </Button>
          )
        }
      />
      <div className="card table-card">
        <DataTable
          rows={directory.data?.items ?? []}
          columns={columns}
          rowKey={(row) => row.id}
          noun="companies"
          pageSize={PAGE_SIZE}
          loading={directory.isPending}
          syncUrl
          server={{ total: directory.data?.total ?? 0 }}
          search={{ placeholder: 'Search companies…', text: () => '' }}
          filters={filters}
          onRowClick={(row) => void navigate(`/partners/${row.id}`)}
          empty={{
            title: 'No companies here',
            body: 'A company is added the first time a request is filed for it, or with Add company.',
          }}
        />
      </div>
      {creating && (
        <PartnerDialog
          partner={null}
          onClose={() => {
            // Once saved, the page has moved to the new company: touching this page's search
            // params now would navigate back to the list.
            if (!moved.current) setCreating(false);
          }}
          onSaved={(saved) => {
            moved.current = true;
            void navigate(`/partners/${saved.id}`);
          }}
        />
      )}
    </div>
  );
}

/** Add a company, or rename / retype one. */
export function PartnerDialog({
  partner,
  onClose,
  onSaved,
}: {
  partner: PartnerDetail | null;
  onClose: () => void;
  onSaved?: (saved: PartnerDetail) => void;
}) {
  const toast = useToast();
  const invalidate = useInvalidate();
  const [name, setName] = useState(partner?.name ?? '');
  const [type, setType] = useState<OrgType>(partner?.type ?? 'partner');

  return (
    <ActionDialog
      title={partner ? `Edit ${partner.name}` : 'Add a company'}
      description={
        partner ? 'Past requests keep pointing at this company under its new name.' : undefined
      }
      confirmLabel={partner ? 'Save changes' : 'Add company'}
      width={520}
      canConfirm={name.trim() !== ''}
      onClose={onClose}
      onConfirm={async (key) => {
        const body = partner
          ? {
              ...(name.trim() !== partner.name ? { name: name.trim() } : {}),
              ...(type !== partner.type ? { type } : {}),
            }
          : { name: name.trim(), type };
        if (partner && Object.keys(body).length === 0) return;
        const saved = partner
          ? await apiSend<PartnerDetail>('PATCH', `/partners/${partner.id}`, body, key)
          : await apiSend<PartnerDetail>('POST', '/partners', body, key);
        await invalidate('partners', 'partner');
        toast(partner ? `${saved.name} updated` : `${saved.name} added`);
        onSaved?.(saved);
      }}
    >
      <div className="form-grid cols-2">
        <Field label="Company name" className="span-2">
          <input
            className="input"
            value={name}
            placeholder="ABC Technologies Inc."
            onChange={(event) => setName(event.target.value)}
            autoComplete="off"
          />
        </Field>
        <Field label="Type">
          <Select
            value={type}
            onChange={(value) => setType(value as OrgType)}
            options={ORG_TYPE_OPTIONS}
          />
        </Field>
      </div>
    </ActionDialog>
  );
}
