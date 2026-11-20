import type { PartnerContact, PartnerDetail as PartnerDetailData } from '@wms/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, Pencil, Trash2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, apiSend } from '../api/client.js';
import { keys, useInvalidate, usePartner, useTransactions } from '../api/queries.js';
import { useAuth } from '../auth/auth.js';
import { SkPage } from '../components/controls.js';
import { ActionDialog } from '../components/dialogs.js';
import {
  Avatar,
  Button,
  Empty,
  Field,
  LoanChip,
  PageHead,
  TableFoot,
  useToast,
} from '../components/ui.js';
import { formatDate, formatRelative } from '../lib/dates.js';
import { ORG_TYPE_LABELS } from '../lib/labels.js';
import { NotFound } from './NotFound.js';
import { PartnerDialog, PartnerStatus } from './Partners.js';

const LOANS_PAGE_SIZE = 8;

type Open = 'edit' | 'archive' | 'restore' | 'contact' | { remove: PartnerContact } | null;

/** One company: its numbers, the people there, and every request it has made. */
export function PartnerDetail() {
  const { id = '' } = useParams();
  const { can } = useAuth();
  const toast = useToast();
  const client = useQueryClient();
  const invalidate = useInvalidate();
  const [open, setOpen] = useState<Open>(null);
  const [page, setPage] = useState(1);
  const detail = usePartner(id);
  const loans = useTransactions({ company: id, page, pageSize: LOANS_PAGE_SIZE });
  const manage = can('partners.manage');
  const now = new Date();

  if (
    detail.error instanceof ApiError &&
    (detail.error.status === 404 || detail.error.status === 400)
  ) {
    return <NotFound what="No partner company has that id." />;
  }
  const partner = detail.data;
  const close = () => setOpen(null);
  const removing = open !== null && typeof open === 'object' ? open.remove : null;

  /** Every change answers with the company as it now is; the directory and suggestions refresh. */
  const act = async (path: string, body: unknown, key: string, done: string) => {
    const updated = await apiSend<PartnerDetailData>('POST', `/partners/${id}${path}`, body, key);
    client.setQueryData(keys.partner(id), updated);
    await invalidate('partners');
    toast(done);
  };

  return (
    <div className="page">
      <PageHead
        crumbs={[{ label: 'Partners', to: '/partners' }, { label: partner?.name ?? '…' }]}
        title={partner?.name ?? 'Partner'}
        lead={
          partner
            ? `${ORG_TYPE_LABELS[partner.type]} · on file since ${formatDate(partner.createdAt)}`
            : 'Loading…'
        }
        actions={
          partner &&
          manage && (
            <>
              <Button icon={Pencil} onClick={() => setOpen('edit')}>
                Edit
              </Button>
              {partner.status === 'active' ? (
                <Button variant="danger" icon={Archive} onClick={() => setOpen('archive')}>
                  Archive
                </Button>
              ) : (
                <Button icon={ArchiveRestore} onClick={() => setOpen('restore')}>
                  Restore
                </Button>
              )}
            </>
          )
        }
      />

      {!partner ? (
        <SkPage kind="detail" />
      ) : (
        <div className="grid-2">
          <div className="stack">
            <section className="card card-pad" aria-labelledby="partner-facts">
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                <h2 id="partner-facts" className="section-title">
                  At a glance
                </h2>
                <PartnerStatus status={partner.status} />
              </div>
              <dl className="facts cols-2">
                <div>
                  <dt>Units out now</dt>
                  <dd className="num">{partner.unitsOut}</dd>
                </div>
                <div>
                  <dt>Open requests</dt>
                  <dd className="num">{partner.openRequests}</dd>
                </div>
                <div>
                  <dt>Requests in total</dt>
                  <dd className="num">{partner.requestCount}</dd>
                </div>
                <div>
                  <dt>Last request</dt>
                  <dd>
                    {partner.lastActivityAt ? formatRelative(partner.lastActivityAt, now) : 'Never'}
                  </dd>
                </div>
              </dl>
              {partner.status === 'archived' && (
                <p className="muted" style={{ marginTop: 12 }}>
                  Archived: hidden from the request form. Restore it to file new requests.
                </p>
              )}
            </section>

            <section className="card" aria-labelledby="partner-contacts">
              <div className="card-head">
                <h2 id="partner-contacts">Contacts</h2>
                {manage && partner.status === 'active' && (
                  <Button size="sm" icon={UserPlus} onClick={() => setOpen('contact')}>
                    Add contact
                  </Button>
                )}
              </div>
              {partner.contacts.length === 0 ? (
                <Empty title="No contacts yet">
                  The person named on a request is saved here automatically.
                </Empty>
              ) : (
                <div className="feed">
                  {partner.contacts.map((contact) => (
                    <div
                      key={contact.id}
                      className="feed-item"
                      style={{ gridTemplateColumns: 'auto 1fr auto' }}
                    >
                      <Avatar name={contact.name} />
                      <span>
                        <strong>{contact.name}</strong>
                        <span className="cell-sub" style={{ display: 'block' }}>
                          <a href={`mailto:${contact.email}`}>{contact.email}</a> · {contact.phone}
                        </span>
                        <span className="cell-sub" style={{ display: 'block' }}>
                          {contact.lastUsedAt
                            ? `Last on a request ${formatRelative(contact.lastUsedAt, now)}`
                            : 'Not on a request yet'}
                        </span>
                      </span>
                      {manage && (
                        <Button
                          size="sm"
                          variant="ghost"
                          icon={Trash2}
                          aria-label={`Remove ${contact.name}`}
                          onClick={() => setOpen({ remove: contact })}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <section className="card" aria-labelledby="partner-loans">
            <div className="card-head">
              <h2 id="partner-loans">Borrowing history</h2>
              <span className="muted num">{loans.data?.total ?? ''}</span>
            </div>
            {loans.data && loans.data.items.length === 0 ? (
              <Empty title="Nothing borrowed yet">
                Requests filed for this company appear here.
              </Empty>
            ) : (
              <>
                <div className="feed">
                  {(loans.data?.items ?? []).map((loan) => (
                    <Link
                      key={loan.number}
                      to={`/borrow/${loan.number}`}
                      className="feed-item"
                      style={{ gridTemplateColumns: '1fr auto' }}
                    >
                      <span>
                        <strong className="mono">{loan.number}</strong>
                        <span className="cell-sub" style={{ display: 'block' }}>
                          {loan.contact.name} · {loan.purpose} · {formatDate(loan.neededFrom)} to{' '}
                          {formatDate(loan.neededUntil)}
                        </span>
                      </span>
                      <LoanChip status={loan.stage} />
                    </Link>
                  ))}
                </div>
                {loans.data && loans.data.total > LOANS_PAGE_SIZE && (
                  <TableFoot
                    page={page}
                    pageSize={LOANS_PAGE_SIZE}
                    total={loans.data.total}
                    noun="transactions"
                    onPage={setPage}
                  />
                )}
              </>
            )}
          </section>
        </div>
      )}

      {partner && open === 'edit' && <PartnerDialog partner={partner} onClose={close} />}
      {partner && open === 'archive' && (
        <ActionDialog
          title={`Archive ${partner.name}`}
          description="It disappears from the request form and its history stays as it is. A company with open requests or units out cannot be archived."
          confirmLabel="Archive"
          danger
          onClose={close}
          onConfirm={(key) => act('/archive', {}, key, `${partner.name} archived`)}
        />
      )}
      {partner && open === 'restore' && (
        <ActionDialog
          title={`Restore ${partner.name}`}
          description="It can be chosen on the request form again."
          confirmLabel="Restore"
          onClose={close}
          onConfirm={(key) => act('/restore', {}, key, `${partner.name} restored`)}
        />
      )}
      {partner && open === 'contact' && (
        <ContactDialog
          onClose={close}
          onSave={(body, key) => act('/contacts', body, key, `${body.name} added`)}
        />
      )}
      {partner && removing && (
        <ActionDialog
          title={`Remove ${removing.name}`}
          description="Their details are erased from the directory. Requests already filed keep the name and number they were filed with."
          confirmLabel="Remove contact"
          danger
          onClose={close}
          onConfirm={(key) =>
            act(`/contacts/${removing.id}/remove`, {}, key, `${removing.name} removed`)
          }
        />
      )}
    </div>
  );
}

function ContactDialog({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (body: { name: string; email: string; phone: string }, key: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  return (
    <ActionDialog
      title="Add a contact"
      confirmLabel="Add contact"
      width={520}
      canConfirm={name.trim() !== '' && email.includes('@') && phone.trim().length >= 7}
      onClose={onClose}
      onConfirm={(key) =>
        onSave({ name: name.trim(), email: email.trim(), phone: phone.trim() }, key)
      }
    >
      <div className="form-grid cols-2">
        <Field label="Full name" className="span-2">
          <input
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="off"
          />
        </Field>
        <Field label="Email">
          <input
            className="input"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="off"
          />
        </Field>
        <Field label="Contact number">
          <input
            className="input"
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            autoComplete="off"
          />
        </Field>
      </div>
    </ActionDialog>
  );
}
