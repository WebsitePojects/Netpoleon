import type { Movement } from '@wms/contracts';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { apiGet } from '../api/client.js';
import { STALE, useTransaction, useTransactions, useUnit } from '../api/queries.js';
import { useReference } from '../auth/auth.js';
import { Barcode } from '../components/AssetLabel.js';
import { DocFacts, DocSection, DocSignatures, PrintDocument } from '../components/PrintDocument.js';
import { QrCode } from '../components/QrCode.js';
import { LoanChip, StatusChip } from '../components/ui.js';
import { daysBetween, formatDate, formatDateTime } from '../lib/dates.js';
import { CONDITION_LABELS, MOVEMENT_LABELS } from '../lib/labels.js';

/** The full history for a printed record, 50 at a time, capped so a print stays bounded. */
const MAX_PRINTED_MOVEMENTS = 500;

function useAllMovements(code: string) {
  return useQuery({
    queryKey: ['unit', code, 'movements', 'all'],
    staleTime: STALE.list,
    queryFn: async ({ signal }) => {
      const all: Movement[] = [];
      let cursor: string | undefined;
      do {
        const page = await apiGet<{ items: Movement[]; nextCursor: string | null }>(
          `/units/${code}/movements`,
          { cursor, limit: 50 },
          signal,
        );
        all.push(...page.items);
        cursor = page.nextCursor ?? undefined;
      } while (cursor && all.length < MAX_PRINTED_MOVEMENTS);
      return { items: all, truncated: Boolean(cursor) };
    },
  });
}

/** Demo unit record: everything about one unit, for the file or an audit. */
export function UnitRecordPrint() {
  const { code = '' } = useParams();
  const { categories, settings } = useReference();
  const unit = useUnit(code).data;
  const movements = useAllMovements(code).data;
  const loans = useTransactions({ unit: code, page: 1, pageSize: 50 }).data;
  const category = categories.find((item) => item.code === unit?.categoryCode);
  const ready = Boolean(unit && movements && loans);

  return (
    <PrintDocument
      title="Demo Unit Record"
      number={code}
      status={unit && <StatusChip status={unit.status} reserved={unit.reservedFor !== null} />}
      ready={ready}
    >
      {unit && movements && loans && (
        <>
          <div className="doc-split">
            <DocSection title="Unit details">
              <DocFacts
                rows={[
                  ['Asset code', <span className="mono">{unit.code}</span>],
                  ['Serial number', <span className="mono">{unit.serial}</span>],
                  ['Brand / model', `${unit.brand} ${unit.model}`],
                  ['Category', category?.name ?? unit.categoryCode],
                  [
                    'Location',
                    unit.location
                      ? `${unit.location.name}${unit.location.roomName ? ` · ${unit.location.roomName}` : ''}`
                      : '—',
                  ],
                  ['Condition', CONDITION_LABELS[unit.condition]],
                  [
                    'Ownership',
                    unit.ownership === 'owned'
                      ? settings.companyName
                      : `Consigned${unit.ownerName ? ` · ${unit.ownerName}` : ''}`,
                  ],
                  ['Registered', formatDate(unit.registeredAt)],
                  ['Reserved for', unit.reservedFor ?? 'Nobody'],
                  [
                    'Accessories',
                    unit.accessories.length ? unit.accessories.join(', ') : 'None on record',
                  ],
                ]}
              />
              {unit.notes && <p className="doc-note">{unit.notes}</p>}
            </DocSection>
            <div className="doc-label">
              <QrCode value={unit.code} />
              <strong className="mono">{unit.code}</strong>
              <Barcode value={unit.code} />
            </div>
          </div>

          {unit.reservations.length > 0 && (
            <DocSection title="Upcoming bookings">
              <table className="doc-table">
                <thead>
                  <tr>
                    <th>Transaction</th>
                    <th>Company</th>
                    <th>From</th>
                    <th>Until</th>
                  </tr>
                </thead>
                <tbody>
                  {unit.reservations.map((r) => (
                    <tr key={r.transactionNumber}>
                      <td className="mono">{r.transactionNumber}</td>
                      <td>{r.company}</td>
                      <td>{formatDate(r.from)}</td>
                      <td>{formatDate(r.until)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DocSection>
          )}

          <DocSection title={`Borrower history (${loans.total})`}>
            {loans.items.length === 0 ? (
              <p className="doc-empty">This unit has not been lent out.</p>
            ) : (
              <table className="doc-table">
                <thead>
                  <tr>
                    <th>Transaction</th>
                    <th>Company · borrower</th>
                    <th>Purpose</th>
                    <th>Period</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {loans.items.map((loan) => (
                    <tr key={loan.number}>
                      <td className="mono">{loan.number}</td>
                      <td>
                        {loan.company.name}
                        <span className="doc-sub">{loan.contact.name}</span>
                      </td>
                      <td>{loan.purpose}</td>
                      <td>
                        {formatDate(loan.neededFrom)} – {formatDate(loan.dueDate)}
                      </td>
                      <td>
                        <LoanChip status={loan.stage} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </DocSection>

          <DocSection
            title={`Movement history (${movements.items.length}${movements.truncated ? '+' : ''})`}
          >
            <table className="doc-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Movement</th>
                  <th>Status after</th>
                  <th>To</th>
                  <th>By</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {movements.items.map((m) => (
                  <tr key={m.id}>
                    <td>{formatDateTime(m.at)}</td>
                    <td>{MOVEMENT_LABELS[m.type]}</td>
                    <td>
                      <StatusChip status={m.toStatus} />
                    </td>
                    <td>{m.toLocation ?? '—'}</td>
                    <td>{m.by?.name ?? 'System'}</td>
                    <td>
                      {m.note ?? ''}
                      {m.transactionNumber && (
                        <span className="doc-sub mono">{m.transactionNumber}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {movements.truncated && (
              <p className="doc-empty">
                Only the newest {MAX_PRINTED_MOVEMENTS} movements are printed; the rest are in the
                system.
              </p>
            )}
          </DocSection>

          <DocSignatures parties={[{ role: 'Checked by (warehouse)' }, { role: 'Verified by' }]} />
        </>
      )}
    </PrintDocument>
  );
}

/**
 * Borrowing slip: what goes out, to whom, until when, on what terms — signed at release and
 * again at return. One per transaction.
 */
export function BorrowingSlipPrint() {
  const { number = '' } = useParams();
  const { settings } = useReference();
  const loan = useTransaction(number).data;
  const length = loan ? daysBetween(loan.neededFrom, loan.dueDate) + 1 : 0;

  return (
    <PrintDocument
      title="Demo Unit Borrowing Slip"
      number={number}
      status={loan && <LoanChip status={loan.stage} />}
      ready={Boolean(loan)}
      notice="Confidential: for Netpoleon and the named borrower only"
    >
      {loan && (
        <>
          <div className="doc-split even">
            <DocSection title="Borrower">
              <DocFacts
                rows={[
                  ['Name', loan.contact.name],
                  ['Company', loan.company.name],
                  ['Email', loan.contact.email],
                  ['Contact number', loan.contact.phone],
                  ['End customer', loan.endCustomer ?? '—'],
                ]}
              />
            </DocSection>
            <DocSection title="Loan">
              <DocFacts
                rows={[
                  ['Purpose', loan.purpose],
                  ['Release date', formatDate(loan.releasedAt ?? loan.neededFrom)],
                  [
                    'Expected return',
                    `${formatDate(loan.dueDate)} (${length} day${length === 1 ? '' : 's'})`,
                  ],
                  ['Approved by', loan.decidedBy?.name ?? '—'],
                  ['Released by', loan.releasedBy?.name ?? '—'],
                ]}
              />
            </DocSection>
          </div>

          <DocSection title={`Units (${loan.units.length || loan.quantityRequested})`}>
            {loan.units.length === 0 ? (
              <p className="doc-empty">
                {loan.quantityRequested} × {loan.model.brand} {loan.model.name}: units are assigned
                when the request is approved.
              </p>
            ) : (
              <table className="doc-table">
                <thead>
                  <tr>
                    <th>Asset code</th>
                    <th>Model · serial</th>
                    <th>Accessories out</th>
                    <th>Released</th>
                    <th>Returned</th>
                  </tr>
                </thead>
                <tbody>
                  {loan.units.map((u) => (
                    <tr key={u.assetCode}>
                      <td className="mono">{u.assetCode}</td>
                      <td>
                        {loan.model.brand} {loan.model.name}
                        <span className="doc-sub mono">S/N {u.serial}</span>
                      </td>
                      <td>{u.accessoriesOut.length ? u.accessoriesOut.join(', ') : '—'}</td>
                      <td>{u.releasedAt ? formatDateTime(u.releasedAt) : '—'}</td>
                      <td>
                        {u.returnedAt ? formatDateTime(u.returnedAt) : '—'}
                        {u.missingAccessories.length > 0 && (
                          <span className="doc-sub doc-warn">
                            Missing: {u.missingAccessories.join(', ')}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </DocSection>

          {loan.extensions.length > 0 && (
            <DocSection title="Extensions">
              <table className="doc-table">
                <thead>
                  <tr>
                    <th>New return date</th>
                    <th>Reason</th>
                    <th>By</th>
                  </tr>
                </thead>
                <tbody>
                  {loan.extensions.map((e) => (
                    <tr key={e.at}>
                      <td>{formatDate(e.requestedDueDate)}</td>
                      <td>{e.reason}</td>
                      <td>{e.by?.name ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DocSection>
          )}

          <DocSection title="Terms">
            <ol className="doc-terms">
              <li>
                The units remain the property of {settings.companyName} and are lent for the purpose
                stated above only. They may not be sold, sub-lent or moved to another site without
                written approval.
              </li>
              <li>
                The borrower is responsible for the units and every accessory listed from release
                until they are received back by the warehouse.
              </li>
              <li>
                Return the units, complete, on or before the expected return date. Extensions must
                be requested before that date; a unit may already be booked for someone else.
              </li>
              <li>Report any damage, fault or loss to the warehouse immediately.</li>
              <li>
                Returned units are inspected; missing accessories and damage are recorded against
                this transaction.
              </li>
            </ol>
          </DocSection>

          <DocSignatures
            parties={[
              { role: 'Released by (warehouse)', name: loan.releasedBy?.name ?? null },
              { role: 'Received by (borrower)', name: loan.contact.name },
              { role: 'Returned and inspected by' },
            ]}
          />
        </>
      )}
    </PrintDocument>
  );
}
