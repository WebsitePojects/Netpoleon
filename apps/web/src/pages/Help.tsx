import {
  ArrowLeftRight,
  BadgeCheck,
  ChartColumn,
  ChevronDown,
  ClipboardCheck,
  PackagePlus,
  Search,
  ShieldCheck,
  Truck,
  Undo2,
  Warehouse,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Empty, PageHead } from '../components/ui.js';
import { ROLE_LABELS, ROLE_SUMMARIES } from '../data/permissions.js';
import type { Role } from '../data/types.js';

interface Guide {
  id: string;
  step?: number;
  icon: LucideIcon;
  title: string;
  summary: string;
  steps: string[];
  /** Where in the console the work is done. */
  link?: { to: string; label: string };
}

/** One guide per step of the lifecycle the proposal promises, in the order the work happens. */
const GUIDES: Guide[] = [
  {
    id: 'register',
    step: 1,
    icon: PackagePlus,
    title: 'Register a demo unit',
    summary: 'Encode a new unit so the system can track it and print its label.',
    steps: [
      'Open Demo Units and press Add Asset.',
      'Choose the category, then type or pick the brand and model. Picking a known model fills in its usual accessories.',
      'Enter the manufacturer serial number exactly as printed. A serial already used for the same model is refused.',
      'Choose the shelf and the condition grade, then press Register unit.',
      'The system assigns the asset code (for example NTP-FW-00124). Print its label from the unit page or from Print labels.',
    ],
    link: { to: '/units', label: 'Go to Demo Units' },
  },
  {
    id: 'stock',
    step: 2,
    icon: Warehouse,
    title: 'Stock a unit on a shelf',
    summary: 'Every unit has a shelf; moving it is recorded so it can always be found.',
    steps: [
      'Registering a unit already records the shelf you chose.',
      'To move one unit, open it and press Move shelf. To move several, tick them on Demo Units and choose Move to shelf.',
      'Only units in stock can change shelf. A unit out on demo or being inspected keeps its place until it comes back.',
    ],
    link: { to: '/units', label: 'Go to Demo Units' },
  },
  {
    id: 'request',
    step: 3,
    icon: ArrowLeftRight,
    title: 'File a borrowing request',
    summary: 'Ask for a model for a date range, on behalf of a partner, reseller, team or branch.',
    steps: [
      'Open Borrow / Return and press New request.',
      'Choose the model. The form shows how many units are free for the dates you pick.',
      'Enter the borrowing company and a named contact person with email and phone.',
      'Set the release date and the expected return date, then file the request.',
      'A pending request does not hold stock. The unit is reserved only when the request is approved.',
    ],
    link: { to: '/borrow', label: 'Go to Borrow / Return' },
  },
  {
    id: 'approve',
    icon: BadgeCheck,
    title: 'Approve or reject a request',
    summary: 'A manager decides, and chooses the physical unit at approval.',
    steps: [
      'Open the request from the Requests tab.',
      'Press Approve and choose the unit to reserve. Units that are out, overdue or in repair are not offered.',
      'To refuse, press Reject and give the reason; the requester sees it.',
      'The person who filed a request can never approve it. Someone else must decide.',
    ],
    link: { to: '/borrow?tab=requests', label: 'Open requests' },
  },
  {
    id: 'release',
    step: 4,
    icon: Truck,
    title: 'Release a unit',
    summary: 'Scan the unit out and tick every accessory that leaves with it.',
    steps: [
      'Open the approved request and press Release.',
      'Scan the label on the unit. The system checks it is the unit that was reserved and refuses any other.',
      'Tick the accessories that go out. These become the checklist for the return.',
      'Confirm the release. The loan starts and the due date counts from today.',
    ],
    link: { to: '/borrow?tab=requests', label: 'Open requests' },
  },
  {
    id: 'return',
    step: 5,
    icon: Undo2,
    title: 'Receive a return',
    summary: 'Scan the unit in and tick what came back; anything missing raises an alert.',
    steps: [
      'Open the loan from the On Demo tab and press Receive return.',
      'Scan the label, then tick each accessory that came back.',
      'A missing accessory is recorded on the loan and appears under Alerts.',
      'The unit moves to the Inspection queue. It is not lent again until it passes inspection.',
    ],
    link: { to: '/borrow?tab=on_demo', label: 'Open loans on demo' },
  },
  {
    id: 'inspect',
    step: 6,
    icon: ClipboardCheck,
    title: 'Inspect, then restock or repair',
    summary: 'Check every returned unit before it is lent again.',
    steps: [
      'Open Inspection. Start inspection moves the unit to the QA area; tick several to start them together.',
      'Record result: tick the checklist, set the condition grade and choose the outcome.',
      'Restock puts the unit back on a shelf. Reassign sends it to another shelf or team. Send to repair records the fault.',
      'When a repair is done, press Repair complete and choose the shelf it returns to.',
    ],
    link: { to: '/inspection', label: 'Go to Inspection' },
  },
  {
    id: 'reports',
    step: 7,
    icon: ChartColumn,
    title: 'Reports and the audit trail',
    summary: 'Every movement and every change is recorded and can be exported.',
    steps: [
      'Reports shows the movement summary, the tracking record, borrower history, aging and utilization.',
      'Every table can be searched, filtered and sorted, and exported to CSV, either whole or only the rows you tick.',
      'The Activity log under Users lists who did what and when. Nothing in it can be edited or deleted.',
    ],
    link: { to: '/reports', label: 'Go to Reports' },
  },
];

const QUESTIONS: { q: string; a: string }[] = [
  {
    q: 'Why can I not approve a request I filed?',
    a: 'One person filing and approving the same request would remove the check the approval exists for. Another manager or an administrator has to decide.',
  },
  {
    q: 'Why is a unit on the shelf not offered when I approve?',
    a: 'It is reserved for another request whose dates overlap, or it is due for repair. The system never promises one unit to two borrowers.',
  },
  {
    q: 'Can a unit or a user be deleted?',
    a: 'No. A unit with history is retired and a person is deactivated, so the audit trail always says what happened. Retired units and deactivated people stay searchable.',
  },
  {
    q: 'How do I give a colleague access?',
    a: 'An administrator adds them under Users. They receive a link to set their own password; the link works once and expires after 72 hours.',
  },
  {
    q: 'I forgot my password.',
    a: 'Use Forgot password on the sign-in screen. The reset link works once and expires after one hour. The message is the same whether or not the address has an account.',
  },
  {
    q: 'What does the scanner read?',
    a: 'The asset code printed as a QR code and a barcode on the label. Manufacturer serial numbers are searchable but are not the scan key, because two models can share a serial.',
  },
];

const ROLES: Role[] = ['admin', 'manager', 'warehouse', 'auditor'];

function matches(text: string, needle: string): boolean {
  return needle.split(/\s+/).every((word) => text.toLowerCase().includes(word));
}

export function Help() {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>('register');
  const needle = query.trim().toLowerCase();

  const guides = useMemo(
    () =>
      needle
        ? GUIDES.filter((guide) =>
            matches(`${guide.title} ${guide.summary} ${guide.steps.join(' ')}`, needle),
          )
        : GUIDES,
    [needle],
  );
  const questions = useMemo(
    () => (needle ? QUESTIONS.filter((item) => matches(`${item.q} ${item.a}`, needle)) : QUESTIONS),
    [needle],
  );

  return (
    <div className="page">
      <PageHead
        title="Help centre"
        lead="How each step of the demo unit lifecycle is done in Netpoleon WMS"
      />
      <label className="input-wrap help-search">
        <span className="sr-only">Search help</span>
        <Search aria-hidden="true" />
        <input
          className="input"
          type="search"
          placeholder="Search the guides, for example “missing accessory”"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {query && (
          <button
            type="button"
            className="icon-btn input-clear"
            aria-label="Clear search"
            onClick={() => setQuery('')}
          >
            <X aria-hidden="true" />
          </button>
        )}
      </label>

      <div className="help-layout">
        <section className="stack" aria-labelledby="guides-title" style={{ gap: 10 }}>
          <h2 id="guides-title" className="section-title">
            Step-by-step guides
          </h2>
          {guides.length === 0 && questions.length === 0 && (
            <div className="card">
              <Empty title="Nothing matches">Try fewer words.</Empty>
            </div>
          )}
          {guides.map((guide) => {
            const expanded = needle !== '' || open === guide.id;
            const Icon = guide.icon;
            return (
              <article key={guide.id} className="card help-guide" data-open={expanded}>
                <h3>
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={`guide-${guide.id}`}
                    onClick={() => setOpen(open === guide.id ? null : guide.id)}
                  >
                    <span className="help-icon" aria-hidden="true">
                      <Icon />
                    </span>
                    <span className="help-head">
                      <span className="help-title">
                        {guide.step !== undefined && (
                          <span className="help-step num">Step {guide.step}</span>
                        )}
                        {guide.title}
                      </span>
                      <span className="help-summary">{guide.summary}</span>
                    </span>
                    <ChevronDown className="help-chevron" aria-hidden="true" />
                  </button>
                </h3>
                <div className="help-body" id={`guide-${guide.id}`} role="region">
                  <div>
                    <ol>
                      {guide.steps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                    {guide.link && (
                      <Link to={guide.link.to} className="link">
                        {guide.link.label} →
                      </Link>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        <aside className="stack" style={{ alignContent: 'start' }}>
          <section className="card card-pad" aria-labelledby="roles-title">
            <h2 id="roles-title" className="section-title" style={{ marginBottom: 10 }}>
              <ShieldCheck aria-hidden="true" width={17} height={17} /> Who can do what
            </h2>
            <dl className="facts">
              {ROLES.map((role) => (
                <div key={role}>
                  <dt>{ROLE_LABELS[role]}</dt>
                  <dd>{ROLE_SUMMARIES[role]}</dd>
                </div>
              ))}
            </dl>
            <Link
              to="/users?tab=roles"
              className="link"
              style={{ display: 'inline-block', marginTop: 10 }}
            >
              See the full permission table →
            </Link>
          </section>
          {questions.length > 0 && (
            <section className="card card-pad" aria-labelledby="faq-title">
              <h2 id="faq-title" className="section-title" style={{ marginBottom: 10 }}>
                Common questions
              </h2>
              <dl className="faq">
                {questions.map((item) => (
                  <div key={item.q}>
                    <dt>{item.q}</dt>
                    <dd>{item.a}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
