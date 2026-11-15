import type { Partner } from '@wms/contracts';
import { Archive, ArchiveRestore, Building2, Pencil, Plus, Trash2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../auth/auth.js';
import { invalidate, useBackend, useIntent, useResource } from '../backend/context.js';
import type { PartnerLoan } from '../backend/types.js';
import { Select, SkPage } from '../components/controls.js';
import { DataTable, type Column } from '../components/DataTable.js';
import { ActionDialog } from '../components/dialogs.js';
import { Button, Field, FormError, LoanChip, PageHead, useToast } from '../components/ui.js';
import { LOAN_STATUS_LABELS } from '../data/selectors.js';
import { WmsError } from '../data/store.js';
import type { Loan } from '../data/types.js';
import { formatDate } from '../lib/dates.js';
import { NotFound } from './NotFound.js';

type PartnerType = Partner['type'];

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

export function Partners() {
  const backend = useBackend();
  const { can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const intent = useIntent();
  const [adding, setAdding] = useState(false);
  const partners = useResource('partners', () => backend.partners());
  const manage = can('partners.manage');

  /** Archives or restores each selected company, one request each, and says which refused. */
  const archive = async (picked: Partner[], archived: boolean, clear: () => void) => {
    let done = 0;
    let refused = '';
    for (const partner of picked.filter((item) => (item.status === 'archived') !== archived)) {
      try {
        await backend.setPartnerArchived(`${intent.key}-${partner.id}`, partner.id, archived);
        done += 1;
      } catch (error) {
        if (!(error instanceof WmsError)) throw error;
        refused ||= error.message;
      }
    }
    intent.renew();
    clear();
    invalidate('partners');
    if (refused) toast(refused, 'error');
    if (done > 0) toast(`${done} ${archived ? 'archived' : 'restored'}`);
  };

  const columns: Column<Partner>[] = [
    {
      id: 'name',
      header: 'Company',
      width: '1.7fr',
      skeleton: 'thumb',
      sort: (partner) => partner.name,
      cell: (partner) => (
        <span className="unit-cell">
          <span className="org-mark" aria-hidden="true">
            <Building2 />
          </span>
          <span>
            <Link
              to={`/partners/${partner.id}`}
              className="row-link"
              onClick={(event) => event.stopPropagation()}
            >
              {partner.name}
            </Link>
            <span className="cell-sub" style={{ display: 'block' }}>
              {partner.contacts.length} contact{partner.contacts.length === 1 ? '' : 's'}
            </span>
          </span>
        </span>
      ),
    },
    {
      id: 'type',
      header: 'Type',
      skeleton: 'chip',
      sort: (partner) => PARTNER_TYPE_LABELS[partner.type],
      cell: (partner) => <span className="chip plain">{PARTNER_TYPE_LABELS[partner.type]}</span>,
    },
    {
      id: 'loans',
      header: 'Loans',
      align: 'right',
      className: 'num',
      width: '0.7fr',
      skeleton: 40,
      sort: (partner) => partner.loans,
      cell: (partner) => partner.loans,
    },
    {
      id: 'open',
      header: 'Open now',
      align: 'right',
      className: 'num',
      width: '0.7fr',
      skeleton: 40,
      sort: (partner) => partner.openLoans,
      cell: (partner) => partner.openLoans,
    },
    {
      id: 'since',
      header: 'On record since',
      className: 'num',
      skeleton: 90,
      sort: (partner) => partner.createdAt,
      cell: (partner) => formatDate(partner.createdAt),
    },
    {
      id: 'status',
      header: 'Status',
      width: '0.8fr',
      skeleton: 'chip',
      sort: (partner) => partner.status,
      cell: (partner) => (
        <span className="chip" data-tone={partner.status === 'archived' ? 'retired' : 'in_stock'}>
          {partner.status === 'archived' ? 'Archived' : 'Active'}
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
        {partners.error && !partners.data ? (
          <FormError message={partners.error} />
        ) : (
          <DataTable
            rows={partners.data ?? []}
            columns={columns}
            rowKey={(partner) => partner.id}
            rowLabel={(partner) => partner.name}
            noun="companies"
            loading={partners.loading}
            syncUrl
            onRowClick={(partner) => void navigate(`/partners/${partner.id}`)}
            search={{
              placeholder: 'Search by company or contact…',
              text: (partner) =>
                `${partner.name} ${partner.contacts
                  .map((contact) => `${contact.fullName} ${contact.email}`)
                  .join(' ')}`,
            }}
            filters={[
              {
                id: 'type',
                label: 'Type',
                allLabel: 'All types',
                options: TYPE_OPTIONS,
                test: (partner, value) => partner.type === value,
              },
              {
                id: 'status',
                label: 'Status',
                allLabel: 'Active and archived',
                options: [
                  { value: 'active', label: 'Active only' },
                  { value: 'archived', label: 'Archived only' },
                ],
                test: (partner, value) => partner.status === value,
              },
            ]}
            batchActions={
              manage
                ? [
                    {
                      label: 'Archive',
                      icon: Archive,
                      danger: true,
                      run: (picked, clear) => void archive(picked, true, clear),
                    },
                    {
                      label: 'Restore',
                      icon: ArchiveRestore,
                      run: (picked, clear) => void archive(picked, false, clear),
                    },
                  ]
                : []
            }
            exportCsv={{
              name: 'partner-companies',
              header: ['Company', 'Type', 'Status', 'Contacts', 'Loans', 'Open now'],
              row: (partner) => [
                partner.name,
                PARTNER_TYPE_LABELS[partner.type],
                partner.status === 'archived' ? 'Archived' : 'Active',
                partner.contacts.length,
                partner.loans,
                partner.openLoans,
              ],
            }}
          />
        )}
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
  const { id = '' } = useParams();
  const backend = useBackend();
  const { can } = useAuth();
  const toast = useToast();
  const intent = useIntent();
  const [open, setOpen] = useState<'edit' | 'contact' | null>(null);
  const partner = useResource(`partners:${id}`, () => backend.partner(id));
  const loans = useResource(`partners:${id}:loans`, () => backend.partnerLoans(id));
  const data = partner.data;

  if (partner.error && !data) {
    return /does not exist|not found/i.test(partner.error) ? (
      <NotFound what="That partner company does not exist." />
    ) : (
      <div className="page">
        <FormError message={partner.error} />
      </div>
    );
  }

  const manage = can('partners.manage');
  const run = async (action: () => Promise<Partner>, message: string) => {
    try {
      await action();
      intent.renew();
      invalidate('partners');
      toast(message);
    } catch (error) {
      if (!(error instanceof WmsError)) throw error;
      toast(error.message, 'error');
    }
  };

  return (
    <div className="page">
      <PageHead
        crumbs={[{ label: 'Partner companies', to: '/partners' }, { label: data?.name ?? '…' }]}
        title={data?.name ?? 'Loading company…'}
        {...(data
          ? {
              lead: `${PARTNER_TYPE_LABELS[data.type]} · ${data.loans} loan${data.loans === 1 ? '' : 's'} on record`,
            }
          : {})}
        actions={
          manage &&
          data && (
            <>
              <Button icon={Pencil} onClick={() => setOpen('edit')}>
                Edit
              </Button>
              {data.status === 'archived' ? (
                <Button
                  icon={ArchiveRestore}
                  onClick={() =>
                    void run(
                      () => backend.setPartnerArchived(intent.key, data.id, false),
                      `${data.name} restored`,
                    )
                  }
                >
                  Restore
                </Button>
              ) : (
                <Button
                  variant="danger"
                  icon={Archive}
                  onClick={() =>
                    void run(
                      () => backend.setPartnerArchived(intent.key, data.id, true),
                      `${data.name} archived`,
                    )
                  }
                >
                  Archive
                </Button>
              )}
            </>
          )
        }
      />
      {!data ? (
        <SkPage kind="detail" />
      ) : (
        <div className="grid-2">
          <div className="stack">
            <section className="card table-card" aria-labelledby="loans-title">
              <div className="card-head" style={{ paddingBottom: 14 }}>
                <h2 id="loans-title">Borrowing history</h2>
                <span className="muted num">{data.openLoans} open</span>
              </div>
              <LoanHistory name={data.name} loans={loans.data ?? []} loading={loans.loading} />
            </section>
          </div>

          <div className="stack" style={{ alignContent: 'start' }}>
            <section className="card card-pad" aria-labelledby="org-facts">
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                <h2 id="org-facts" className="section-title">
                  Company
                </h2>
                <span
                  className="chip"
                  data-tone={data.status === 'archived' ? 'retired' : 'in_stock'}
                >
                  {data.status === 'archived' ? 'Archived' : 'Active'}
                </span>
              </div>
              <dl className="facts">
                <div>
                  <dt>Type</dt>
                  <dd>{PARTNER_TYPE_LABELS[data.type]}</dd>
                </div>
                <div>
                  <dt>On record since</dt>
                  <dd>{formatDate(data.createdAt)}</dd>
                </div>
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
              {data.contacts.length === 0 ? (
                <p className="muted">No contacts yet.</p>
              ) : (
                <ul className="contact-list">
                  {data.contacts.map((contact) => (
                    <li key={contact.id}>
                      <span>
                        <strong>{contact.fullName}</strong>
                        <span className="cell-sub">
                          {contact.email}
                          {contact.phone && ` · ${contact.phone}`}
                        </span>
                      </span>
                      {manage && (
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label={`Remove ${contact.fullName}`}
                          onClick={() =>
                            void run(
                              () => backend.removeContact(intent.key, data.id, contact.id),
                              `${contact.fullName} removed`,
                            )
                          }
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
      {data && open === 'edit' && <PartnerDialog partner={data} onClose={() => setOpen(null)} />}
      {data && open === 'contact' && <ContactDialog partner={data} onClose={() => setOpen(null)} />}
    </div>
  );
}

function LoanHistory({
  name,
  loans,
  loading,
}: {
  name: string;
  loans: PartnerLoan[];
  loading: boolean;
}) {
  return (
    <DataTable
      rows={loans}
      loading={loading}
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
          sort: (loan) => loan.contactName,
          cell: (loan) => loan.contactName,
        },
        {
          id: 'due',
          header: 'Due',
          className: 'num',
          sort: (loan) => loan.dueDate,
          cell: (loan) => (
            <>
              {formatDate(loan.dueDate)}
              {loan.daysLate > 0 && <span className="late"> · {loan.daysLate}d late</span>}
            </>
          ),
        },
        {
          id: 'status',
          header: 'Status',
          sort: (loan) => loan.status,
          cell: (loan) => <LoanChip status={loan.status as Loan['status']} />,
        },
      ]}
      rowKey={(loan) => loan.number}
      noun="loans"
      pageSize={8}
      rowClass={(loan) => (loan.daysLate > 0 ? 'is-late' : undefined)}
      empty={{ title: 'No loans yet', body: 'Requests filed for this company appear here.' }}
      filters={[
        {
          id: 'status',
          label: 'Status',
          allLabel: 'All statuses',
          options: (Object.keys(LOAN_STATUS_LABELS) as Loan['status'][]).map((status) => ({
            value: status,
            label: LOAN_STATUS_LABELS[status],
          })),
          test: (loan, value) => loan.status === value,
        },
      ]}
      exportCsv={{
        name: `loans-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        header: ['Transaction', 'Brand', 'Model', 'Asset code', 'Contact', 'Due', 'Status'],
        row: (loan) => [
          loan.number,
          loan.brand,
          loan.model,
          loan.unitCode ?? '',
          loan.contactName,
          loan.dueDate,
          loan.status,
        ],
      }}
    />
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
  const backend = useBackend();
  const toast = useToast();
  const intent = useIntent();
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
      onConfirmAsync={async () => {
        if (partner) {
          await backend.editPartner(intent.key, partner.id, { name, type });
          toast(`${name.trim()} updated`);
        } else {
          const added = await backend.addPartner(intent.key, { name, type });
          toast(`${added.name} added`);
          onSaved?.(added.id);
        }
        invalidate('partners');
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
  const backend = useBackend();
  const toast = useToast();
  const intent = useIntent();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  return (
    <ActionDialog
      title={`Add a contact at ${partner.name}`}
      description="Contact details are personal data: they are used only to account for borrowed units."
      confirmLabel="Add contact"
      onClose={onClose}
      onConfirmAsync={async () => {
        await backend.addContact(intent.key, partner.id, { fullName: name, email, phone });
        invalidate('partners');
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
