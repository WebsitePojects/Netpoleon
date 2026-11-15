import { Boxes, Building2, Construction, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useBackend } from '../backend/context.js';
import { PageHead } from './ui.js';

/**
 * Screens that still run on the demo store (borrowing, inspection, reports, alerts). With the
 * API connected they would show made-up loans next to real units, so they say so plainly
 * instead. Slice 3 connects them and removes this.
 */
export function NeedsLending({ title, children }: { title: string; children: ReactNode }) {
  const backend = useBackend();
  if (backend.mode === 'demo') return <>{children}</>;
  return (
    <div className="page">
      <PageHead title={title} />
      <section className="card card-pad slice-notice">
        <Construction aria-hidden="true" />
        <h2 className="section-title">This screen connects to the server in the next release</h2>
        <p className="muted">
          Borrowing, inspection, reports and alerts are being moved onto the server now. Until then
          they are available in the demo build. Units, people and partner companies below already
          use live data.
        </p>
        <div className="row" style={{ gap: 8 }}>
          <Link to="/units" className="btn">
            <Boxes aria-hidden="true" /> Demo Units
          </Link>
          <Link to="/users" className="btn">
            <Users aria-hidden="true" /> Users
          </Link>
          <Link to="/partners" className="btn">
            <Building2 aria-hidden="true" /> Partners
          </Link>
        </div>
      </section>
    </div>
  );
}

/** A partner account signed in to the staff console: the portal is where it belongs. */
export function PortalNotice() {
  return (
    <div className="page">
      <PageHead title="Partner portal" />
      <section className="card card-pad slice-notice">
        <Building2 aria-hidden="true" />
        <h2 className="section-title">The partner portal opens in the next release</h2>
        <p className="muted">
          This account belongs to a partner company. The staff console is for Netpoleon staff; the
          portal, where partners book demo units, is being built now.
        </p>
      </section>
    </div>
  );
}
