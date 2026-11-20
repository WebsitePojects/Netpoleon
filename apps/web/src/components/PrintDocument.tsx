import { ArrowLeft, Printer } from 'lucide-react';
import type { ReactNode } from 'react';
import { useCurrentUser, useReference } from '../auth/auth.js';
import { formatDateTime } from '../lib/dates.js';
import { Button } from './ui.js';

/**
 * The Netpoleon document template every printout uses: letterhead with the logo, company and
 * warehouse names (from Settings → General), the document title and number, and a footer with
 * who printed it and when. It is a table on purpose: browsers repeat a table's header and
 * footer on every printed page, so a long record keeps its letterhead on page 3.
 *
 * On screen it shows as a sheet of paper with a toolbar; only the sheet prints.
 */
export function PrintDocument({
  title,
  number,
  status,
  ready,
  notice = 'Confidential: for internal use only',
  children,
}: {
  title: string;
  number: string;
  status?: ReactNode;
  /** False while data loads: the sheet shows a placeholder and Print is disabled. */
  ready: boolean;
  /** The confidentiality line in the footer. */
  notice?: string;
  children: ReactNode;
}) {
  const { settings } = useReference();
  const me = useCurrentUser();
  const printedAt = formatDateTime(new Date().toISOString());

  return (
    <div className="doc-screen">
      <div className="doc-toolbar">
        <Button
          icon={ArrowLeft}
          onClick={() => (window.history.length > 1 ? window.history.back() : window.close())}
        >
          Back
        </Button>
        <span className="doc-toolbar-title">{title}</span>
        <Button variant="primary" icon={Printer} disabled={!ready} onClick={() => window.print()}>
          Print
        </Button>
      </div>

      <article className="doc-sheet" aria-label={title}>
        <table className="doc-frame">
          <thead>
            <tr>
              <td>
                <header className="doc-head">
                  <div className="doc-brand">
                    <img
                      src="/img/logo-ink.png"
                      alt="Netpoleon"
                      width={143}
                      height={22}
                      decoding="sync"
                      loading="eager"
                    />
                    <div>
                      <strong>{settings.companyName}</strong>
                      <span>{settings.warehouseName} · Netpoleon WMS</span>
                    </div>
                  </div>
                  <div className="doc-title">
                    <h1>{title}</h1>
                    <span className="mono">{number}</span>
                    {status}
                  </div>
                </header>
              </td>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <div className="doc-body">
                  {ready ? children : <p className="doc-loading">Preparing the document…</p>}
                </div>
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td>
                <footer className="doc-foot">
                  <span>
                    {settings.companyName} · {notice}
                  </span>
                  <span>
                    Printed {printedAt} by {me.name}
                  </span>
                </footer>
              </td>
            </tr>
          </tfoot>
        </table>
      </article>
    </div>
  );
}

/** A titled block inside a document. */
export function DocSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="doc-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

/** Label/value pairs in two columns. */
export function DocFacts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="doc-facts">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Signature blocks: name, signature and date lines for each party. */
export function DocSignatures({ parties }: { parties: { role: string; name?: string | null }[] }) {
  return (
    <div className="doc-signs">
      {parties.map((party) => (
        <div key={party.role} className="doc-sign">
          <span className="doc-sign-line">{party.name ?? ''}</span>
          <span className="doc-sign-label">Name and signature</span>
          <span className="doc-sign-line" />
          <span className="doc-sign-label">Date</span>
          <b>{party.role}</b>
        </div>
      ))}
    </div>
  );
}
