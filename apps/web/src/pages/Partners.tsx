import { Archive, ArchiveRestore, Building2, Pencil, Plus, Trash2, UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth, useCurrentUser } from '../auth/auth.js';
import { Select, SkPage } from '../components/controls.js';
import { DataTable, runBatch, type Column } from '../components/DataTable.js';
import { ActionDialog } from '../components/dialogs.js';
import { Button, Field, LoanChip, PageHead, useToast } from '../components/ui.js';
import { useStore, useWmsState } from '../data/context.js';
import { daysOverdue, LOAN_STATUS_LABELS } from '../data/selectors.js';
import { WmsError } from '../data/store.js';
import type { Loan, Partner, PartnerType } from '../data/types.js';
import { formatDate, toDateKey } from '../lib/dates.js';
import { usePageReady } from '../lib/hooks.js';
import { NotFound } from './NotFound.js';

export const PARTNER_TYPE_LABELS: Record<PartnerType, string> = {
  partner: 'Partner',
  reseller: 'Reseller',
  internal_team: 'Internal team',
  branch: 'Branch',
};

const TYPE_OPTIONS = (Object.keys(PARTNER_TYPE_LABELS) as PartnerType[]).map((type) => ({
  value: type,
  label: PARTNER_TYPE_LABELS[type],
}));

const OPEN_STATUSES: Loan['status'][] = ['pending', 'approved', 'released'];

interface PartnerRow {
  partner: Partner;
  loans: number;
  out: number;
  overdue: number;
  last: string | null;
}

/** Loan counts per partner, worked out in one pass over the loans rather than per row. */
function usePartnerRows(): PartnerRow[] {
  const { partners, loans } = useWmsState();
  const store = useStore();
  return useMemo(() => {
    const today = toDateKey(new Date());
    return partners.map((partner) => {
      const own = loans.filter((loan) => store.partnerOwnsLoan(partner, loan.borrower.company));
      return {
        partner,
        loans: own.length,
        out: own.filter((loan) => loan.status === 'released').length,
        overdue: own.filter((loan) => daysOverdue(loan, today) > 0).length,
        last: own.reduce<string | null>(
          (latest, loan) =>
            latest === null || loan.requestedAt > latest ? loan.requestedAt : latest,
          null,
        ),
      };
    });
  }, [partners, loans, store]);
}

export function Partners() {
  const ready = usePageReady();
  const store = useStore();
  const user = useCurrentUser();
  const { can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const rows = usePartnerRows();
  const [adding, setAdding] = useState(false);
  const manage = can('partners.manage');

  const archive = (picked: PartnerRow[], archived: boolean, clear: () => void) => {
    const result = runBatch(
      picked.filter((row) => row.partner.archived !== archived),
      (row) => store.setPartnerArchived(user.username, row.partner.id, archived),
    );
    clear();
    if (result.refused) toast(result.refused, 'error');
    if (result.done > 0) toast(`${result.done} ${archived ? 'archived' : 'restored'}`);
  };

  const columns: Column<PartnerRow>[] = [
    {
      id: 'name',
      header: 'Company',
      width: '1.7fr',
      skeleton: 'thumb',
      sort: (row) => row.partner.name,
      cell: (row) => (
        <span className="unit-cell">
          <span className="org-mark" aria-hidden="true">
            <Building2 />
          </span>
          <span>
            <Link
              to={`/partners/${row.partner.id}`}
              className="row-link"
              onClick={(event) => event.stopPropagation()}
            >
              {row.partner.name}
            </Link>
            <span className="cell-sub" style={{ display: 'block' }}>
              {row.partner.contacts.length} contact{row.partner.contacts.length === 1 ? '' : 's'}
            </span>
          </span>
        </span>
      ),
    },
    {
      id: 'type',
      header: 'Type',
      skeleton: 'chip',
      sort: (row) => PARTNER_TYPE_LABELS[row.partner.type],
      cell: (row) => <span className="chip plain">{PARTNER_TYPE_LABELS[row.partner.type]}</span>,
    },
    {
      id: 'loans',
      header: 'Loans',
      align: 'right',
      className: 'num',
      width: '0.7fr',
      skeleton: 40,
      sort: (row) => row.loans,
      cell: (row) => row.loans,
    },
    {
      id: 'out',
      header: 'Units out',
      align: 'right',
      width: '0.7fr',
      skeleton: 40,
      className: (row) => (row.overdue > 0 ? 'num late' : 'num'),
      sort: (row) => row.out,
      cell: (row) => (row.overdue > 0 ? `${row.out} · ${row.overdue} late` : row.out),
    },
    {
      id: 'last',
      header: 'Last request',
      className: 'num',
      skeleton: 90,
      sort: (row) => row.last ?? '',
      cell: (row) => (row.last ? formatDate(row.last) : 'Never'),
    },
    {
      id: 'status',
      header: 'Status',
      width: '0.8fr',
      skeleton: 'chip',
      sort: (row) => (row.partner.archived ? 1 : 0),
      cell: (row) =>
        row.partner.archived ? (
          <span className="chip" data-tone="retired">
            Archived
          </span>
        ) : (
          <span className="chip" data-tone="in_stock">
            Active
          </span>
        ),
    },
  ];

  return (
    <div className="page">
      <PageHead
        title="Partner companies"
        lead="Partners, resellers, internal teams and branches that borrow demo units"
        actions={
          manage && (
            <Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>
              Add company
            </Button>
          )
        }
      />
      <div className="card table-card">
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(row) => row.partner.id}
          rowLabel={(row) => row.partner.name}
          noun="companies"
          loading={!ready}
          syncUrl
          onRowClick={(row) => void navigate(`/partners/${row.partner.id}`)}
          rowClass={(row) => (row.overdue > 0 ? 'is-late' : undefined)}
          search={{
            placeholder: 'Search by company or contact…',
            text: (row) =>
              `${row.partner.name} ${row.partner.aliases.join(' ')} ${row.partner.contacts
                .map((contact) => `${contact.name} ${contact.email}`)
                .join(' ')}`,
          }}
          filters={[
            {
              id: 'type',
              label: 'Type',
              allLabel: 'All types',
              options: TYPE_OPTIONS,
              test: (row, value) => row.partner.type === value,
            },
            {
              id: 'status',
              label: 'Status',
              allLabel: 'Active and archived',
              options: [
                { value: 'active', label: 'Active only' },
                { value: 'archived', label: 'Archived only' },
              ],
              test: (row, value) => row.partner.archived === (value === 'archived'),
            },
          ]}
          batchActions={
            manage
              ? [
                  {
                    label: 'Archive',
                    icon: Archive,
                    danger: true,
                    run: (picked, clear) => archive(picked, true, clear),
                  },
                  {
                    label: 'Restore',
                    icon: ArchiveRestore,
                    run: (picked, clear) => archive(picked, false, clear),
                  },
                ]
              : []
          }
          exportCsv={{
            name: 'partner-companies',
            header: ['Company', 'Type', 'Status', 'Contacts', 'Loans', 'Units out', 'Overdue'],
            row: (row) => [
              row.partner.name,
              PARTNER_TYPE_LABELS[row.partner.type],
              row.partner.archived ? 'Archived' : 'Active',
              row.partner.contacts.length,
              row.loans,
              row.out,
              row.overdue,
            ],
          }}
        />
      </div>
      {adding && (
        <PartnerDialog
          partner={null}
          onClose={() => setAdding(false)}
          onSaved={(id) => void navigate(`/partners/${id}`)}
        />
      )}
    </div>
  );
}

export function PartnerDetail() {
  const ready = usePageReady();
  const { id = '' } = useParams();
  const store = useStore();
  const user = useCurrentUser();
  const { can } = useAuth();
  const toast = useToast();
  const { partners, loans } = useWmsState();
  const [open, setOpen] = useState<'edit' | 'contact' | null>(null);
  const partner = partners.find((item) => item.id === id);
  const history = useMemo(
    () =>
      partner
        ? loans
            .filter((loan) => store.partnerOwnsLoan(partner, loan.borrower.company))
            .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))
        : [],
    [partner, loans, store],
  );

  if (!partner) return <NotFound what="That partner company does not exist." />;
  const manage = can('partners.manage');
  const today = toDateKey(new Date());
  const openCount = history.filter((loan) => OPEN_STATUSES.includes(loan.status)).length;

  const setArchived = (archived: boolean) => {
    try {
      store.setPartnerArchived(user.username, partner.id, archived);
      toast(`${partner.name} ${archived ? 'archived' : 'restored'}`);
    } catch (error) {
      if (!(error instanceof WmsError)) throw error;
      toast(error.message, 'error');
    }
  };

  return (
    <div className="page">
      <PageHead
        crumbs={[{ label: 'Partner companies', to: '/partners' }, { label: partner.name }]}
        title={partner.name}
        lead={`${PARTNER_TYPE_LABELS[partner.type]} · ${history.length} loan${history.length === 1 ? '' : 's'} on record`}
        actions={
          manage && (
            <>
              <Button icon={Pencil} onClick={() => setOpen('edit')}>
                Edit
              </Button>
              {partner.archived ? (
                <Button icon={ArchiveRestore} onClick={() => setArchived(false)}>
                  Restore
                </Button>
              ) : (
                <Button variant="danger" icon={Archive} onClick={() => setArchived(true)}>
                  Archive
                </Button>
              )}
            </>
          )
        }
      />
      {!ready ? (
        <SkPage kind="detail" />
      ) : (
        <div className="grid-2">
          <div className="stack">
            <section className="card table-card" aria-labelledby="loans-title">
              <div className="card-head" style={{ paddingBottom: 14 }}>
                <h2 id="loans-title">Borrowing history</h2>
                <span className="muted num">{openCount} open</span>
              </div>
              <DataTable
                rows={history}
                columns={[
                  {
                    id: 'number',
                    header: 'Transaction',
                    sort: (loan) => loan.number,
                    cell: (loan) => (
                      <Link to={`/borrow/${loan.number}`} className="row-link mono">
                        {loan.number}
                      </Link>
                    ),
                  },
                  {
                    id: 'unit',
                    header: 'Demo unit',
                    width: '1.4fr',
                    sort: (loan) => `${loan.brand} ${loan.model}`,
                    cell: (loan) => (
                      <>
                        {loan.brand} {loan.model}
                        <span className="cell-sub mono" style={{ display: 'block' }}>
                          {loan.unitCode ?? 'Not assigned yet'}
                        </span>
                      </>
                    ),
                  },
                  {
                    id: 'contact',
                    header: 'Contact',
                    sort: (loan) => loan.borrower.name,
                    cell: (loan) => loan.borrower.name,
                  },
                  {
                    id: 'due',
                    header: 'Due',
                    className: 'num',
                    sort: (loan) => loan.dueDate,
                    cell: (loan) => {
                      const late = daysOverdue(loan, today);
                      return (
                        <>
                          {formatDate(loan.dueDate)}
                          {late > 0 && <span className="late"> · {late}d late</span>}
                        </>
                      );
                    },
                  },
                  {
                    id: 'status',
                    header: 'Status',
                    sort: (loan) => LOAN_STATUS_LABELS[loan.status],
                    cell: (loan) => <LoanChip status={loan.status} />,
                  },
                ]}
                rowKey={(loan) => loan.number}
                noun="loans"
                pageSize={8}
                rowClass={(loan) => (daysOverdue(loan, today) > 0 ? 'is-late' : undefined)}
                empty={{
                  title: 'No loans yet',
                  body: 'Requests filed for this company appear here.',
                }}
                filters={[
                  {
                    id: 'status',
                    label: 'Status',
                    allLabel: 'All statuses',
                    options: (Object.keys(LOAN_STATUS_LABELS) as Loan['status'][]).map(
                      (status) => ({ value: status, label: LOAN_STATUS_LABELS[status] }),
                    ),
                    test: (loan, value) => loan.status === value,
                  },
                ]}
                exportCsv={{
                  name: `loans-${partner.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
                  header: [
                    'Transaction',
                    'Brand',
                    'Model',
                    'Asset code',
                    'Contact',
                    'Due',
                    'Status',
                  ],
                  row: (loan) => [
                    loan.number,
                    loan.brand,
                    loan.model,
                    loan.unitCode ?? '',
                    loan.borrower.name,
                    loan.dueDate,
                    LOAN_STATUS_LABELS[loan.status],
                  ],
                }}
              />
            </section>
          </div>

          <div className="stack" style={{ alignContent: 'start' }}>
            <section className="card card-pad" aria-labelledby="org-facts">
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                <h2 id="org-facts" className="section-title">
                  Company
                </h2>
                <span className="chip" data-tone={partner.archived ? 'retired' : 'in_stock'}>
                  {partner.archived ? 'Archived' : 'Active'}
                </span>
              </div>
              <dl className="facts">
                <div>
                  <dt>Type</dt>
                  <dd>{PARTNER_TYPE_LABELS[partner.type]}</dd>
                </div>
                <div>
                  <dt>On record since</dt>
                  <dd>{formatDate(partner.createdAt)}</dd>
                </div>
                {partner.aliases.length > 0 && (
                  <div>
                    <dt>Formerly</dt>
                    <dd>{partner.aliases.join(', ')}</dd>
                  </div>
                )}
              </dl>
            </section>

            <section className="card card-pad" aria-labelledby="contacts-title">
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                <h2 id="contacts-title" className="section-title">
                  Contacts
                </h2>
                {manage && (
                  <Button size="sm" icon={UserPlus} onClick={() => setOpen('contact')}>
                    Add contact
                  </Button>
                )}
              </div>
              {partner.contacts.length === 0 ? (
                <p className="muted">No contacts yet.</p>
              ) : (
                <ul className="contact-list">
                  {partner.contacts.map((contact) => (
                    <li key={contact.id}>
                      <span>
                        <strong>{contact.name}</strong>
                        <span className="cell-sub">
                          {contact.email}
                          {contact.phone && ` · ${contact.phone}`}
                        </span>
                      </span>
                      {manage && (
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label={`Remove ${contact.name}`}
                          onClick={() => {
                            store.removePartnerContact(user.username, partner.id, contact.id);
                            toast(`${contact.name} removed`);
                          }}
                        >
                          <Trash2 aria-hidden="true" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
      {open === 'edit' && <PartnerDialog partner={partner} onClose={() => setOpen(null)} />}
      {open === 'contact' && <ContactDialog partner={partner} onClose={() => setOpen(null)} />}
    </div>
  );
}

function PartnerDialog({
  partner,
  onClose,
  onSaved,
}: {
  partner: Partner | null;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const store = useStore();
  const user = useCurrentUser();
  const toast = useToast();
  const [name, setName] = useState(partner?.name ?? '');
  const [type, setType] = useState<PartnerType>(partner?.type ?? 'partner');
  return (
    <ActionDialog
      title={partner ? `Edit ${partner.name}` : 'Add a partner company'}
      description={
        partner
          ? 'Past loans keep the name they were filed under; renaming does not rewrite them.'
          : 'Requests can be filed for the company as soon as it is added.'
      }
      confirmLabel={partner ? 'Save changes' : 'Add company'}
      onClose={onClose}
      onConfirm={() => {
        if (partner) {
          store.updatePartner(user.username, partner.id, { name, type });
          toast(`${name.trim()} updated`);
        } else {
          const added = store.addPartner(user.username, { name, type });
          toast(`${added.name} added`);
          onSaved?.(added.id);
        }
      }}
    >
      <Field label="Company name">
        <input
          className="input"
          value={name}
          data-autofocus
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
      <Field label="Type" hint="Internal teams and branches borrow through the same flow.">
        <Select
          value={type}
          onChange={(value) => setType(value as PartnerType)}
          options={TYPE_OPTIONS}
        />
      </Field>
    </ActionDialog>
  );
}

function ContactDialog({ partner, onClose }: { partner: Partner; onClose: () => void }) {
  const store = useStore();
  const user = useCurrentUser();
  const toast = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  return (
    <ActionDialog
      title={`Add a contact at ${partner.name}`}
      description="Contact details are personal data: they are used only to account for borrowed units."
      confirmLabel="Add contact"
      onClose={onClose}
      onConfirm={() => {
        store.addPartnerContact(user.username, partner.id, { name, email, phone });
        toast(`${name.trim()} added`);
      }}
    >
      <Field label="Full name">
        <input
          className="input"
          value={name}
          data-autofocus
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
      <Field label="Email">
        <input
          className="input"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </Field>
      <Field label="Phone (optional)">
        <input
          className="input"
          type="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
        />
      </Field>
    </ActionDialog>
  );
}
