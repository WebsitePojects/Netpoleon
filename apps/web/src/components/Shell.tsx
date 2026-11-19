import {
  ArrowLeftRight,
  Bell,
  Boxes,
  ChartColumn,
  ChevronDown,
  ClipboardCheck,
  LayoutDashboard,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Search,
  Settings,
  Sun,
  User as UserIcon,
  Users,
  type LucideIcon,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, useCurrentUser } from '../auth/auth.js';
import { ROLE_LABELS } from '@wms/contracts';
import {
  useAlerts,
  useDebounced,
  useInspectionQueue,
  useStageCounts,
  useTransactions,
  useUnits,
} from '../api/queries.js';
import { useDismiss, useIsDark, useTheme, type ThemeChoice } from '../lib/hooks.js';
import { Avatar, Brand, LoanChip, StatusChip } from './ui.js';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** True when the item should only match its exact path (the dashboard at `/`). */
  end?: boolean;
}

/** One navigation model feeds the sidebar, the phone drawer and the phone tab bar. */
const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/units', label: 'Demo Units', icon: Boxes },
  { to: '/borrow', label: 'Borrow / Return', icon: ArrowLeftRight },
  { to: '/inspection', label: 'Inspection', icon: ClipboardCheck },
  { to: '/reports', label: 'Reports', icon: ChartColumn },
  { to: '/users', label: 'Users', icon: Users },
  { to: '/settings', label: 'Settings', icon: Settings },
];

/** The four screens used every day; the fifth tab-bar slot opens the full menu. */
const TAB_BAR = NAV.slice(0, 4);
const TAB_LABELS: Record<string, string> = { '/units': 'Units', '/borrow': 'Borrow' };

const THEMES: { id: ThemeChoice; label: string; icon: LucideIcon }[] = [
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
  { id: 'system', label: 'Auto', icon: Monitor },
];

function isActive(pathname: string, item: NavItem): boolean {
  return item.end
    ? pathname === item.to
    : pathname === item.to || pathname.startsWith(`${item.to}/`);
}

export function Shell() {
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Small, shared queries: the same keys feed the pages, so a badge and its page agree.
  const unreadAlerts = useAlerts().data?.unread ?? 0;
  const pendingRequests = useStageCounts().data?.pending ?? 0;
  const awaitingInspection =
    useInspectionQueue({ status: 'returned', page: 1, pageSize: 25 }).data?.counts.returned ?? 0;
  const badges: Record<string, number> = {
    '/borrow': pendingRequests,
    '/inspection': awaitingInspection,
  };

  useEffect(() => {
    setDrawerOpen(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const activeTab = TAB_BAR.findIndex((item) => isActive(location.pathname, item));
  const indicatorStyle: CSSProperties = {
    transform: `translateX(${(activeTab === -1 ? TAB_BAR.length : activeTab) * 100}%)`,
  };

  return (
    <div className="shell">
      {/* Re-keyed on every navigation so the progress line replays. */}
      <div className="route-bar" key={location.key} aria-hidden="true" />

      <aside className="sidebar" data-open={drawerOpen} aria-label="Main menu">
        <Link to="/" className="side-brand">
          <Brand />
        </Link>
        <nav className="side-nav">
          <p className="side-label">Menu</p>
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end ?? false} className="side-link">
              <item.icon aria-hidden="true" />
              {item.label}
              {(badges[item.to] ?? 0) > 0 && (
                <span className="side-badge num">{badges[item.to]}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <p className="side-foot">
          <strong>Netpoleon WMS</strong>
          Powered by Prince IT Solutions OPC
        </p>
      </aside>
      {drawerOpen && (
        <div
          className="scrim only-mobile"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      <div className="main">
        <header className="header">
          <button
            type="button"
            className="icon-btn only-mobile"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            aria-expanded={drawerOpen}
          >
            <Menu aria-hidden="true" />
          </button>
          <GlobalSearch />
          <div className="header-spacer" />
          <ThemeToggle />
          <Link
            to="/alerts"
            className="icon-btn bell"
            aria-label={`Alerts, ${unreadAlerts} unread`}
          >
            <Bell aria-hidden="true" />
            {unreadAlerts > 0 && (
              <span className="bell-dot num" key={unreadAlerts}>
                {unreadAlerts > 99 ? '99+' : unreadAlerts}
              </span>
            )}
          </Link>
          <PersonMenu />
        </header>

        <main>
          <Outlet />
        </main>

        <nav className="tabbar" aria-label="Quick navigation">
          <div className="tabbar-indicator" style={indicatorStyle} aria-hidden="true" />
          {TAB_BAR.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end ?? false} className="tabbar-item">
              <item.icon aria-hidden="true" />
              {TAB_LABELS[item.to] ?? item.label}
            </NavLink>
          ))}
          <button
            type="button"
            className="tabbar-item"
            onClick={() => setDrawerOpen(true)}
            aria-current={activeTab === -1 ? 'page' : undefined}
          >
            <Menu aria-hidden="true" />
            Menu
          </button>
        </nav>
      </div>
    </div>
  );
}

const SUN_RAYS = Array.from({ length: 8 }, (_, index) => (index * Math.PI) / 4);

/** Sun that turns anticlockwise into a crescent moon, and back. The click point seeds the wipe. */
function ThemeToggle() {
  const [, setTheme] = useTheme();
  const dark = useIsDark();
  return (
    <button
      type="button"
      className="icon-btn theme-toggle"
      data-dark={dark}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      onClick={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        setTheme(dark ? 'light' : 'dark', {
          x: box.left + box.width / 2,
          y: box.top + box.height / 2,
        });
      }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <mask id="theme-moon-mask">
          <rect x="-12" y="-12" width="48" height="48" fill="white" stroke="none" />
          <circle className="moon-cut" cx="12" cy="12" r="4.2" fill="black" stroke="none" />
        </mask>
        <circle
          className="sun-core"
          cx="12"
          cy="12"
          r="4.4"
          fill="currentColor"
          stroke="none"
          mask="url(#theme-moon-mask)"
        />
        <g className="sun-rays">
          {SUN_RAYS.map((angle) => (
            <line
              key={angle}
              x1={12 + Math.cos(angle) * 7.6}
              y1={12 + Math.sin(angle) * 7.6}
              x2={12 + Math.cos(angle) * 9.8}
              y2={12 + Math.sin(angle) * 9.8}
            />
          ))}
        </g>
      </svg>
    </button>
  );
}

interface SearchHit {
  key: string;
  to: string;
  title: string;
  detail: string;
  chip: ReactNode;
}

const MAX_HITS = 5;

/** Two small server searches, units and transactions, run once typing settles. */
function useSearchHits(query: string): SearchHit[] {
  const needle = useDebounced(query.trim());
  const enabled = needle.length >= 2;
  const params = { q: needle, pageSize: MAX_HITS, page: 1 };
  const units = useUnits(params, enabled);
  const transactions = useTransactions(params, enabled);
  if (!enabled) return [];
  const hits: SearchHit[] = [];
  for (const unit of units.data?.items ?? []) {
    hits.push({
      key: unit.code,
      to: `/units/${unit.code}`,
      title: unit.code,
      detail: `${unit.brand} ${unit.model} · ${unit.serial}`,
      chip: <StatusChip status={unit.status} reserved={unit.reservedFor !== null} />,
    });
  }
  for (const transaction of transactions.data?.items ?? []) {
    hits.push({
      key: transaction.number,
      to: `/borrow/${transaction.number}`,
      title: transaction.number,
      detail: `${transaction.contact.name} · ${transaction.company.name}`,
      chip: <LoanChip status={transaction.stage} />,
    });
  }
  return hits;
}

function GlobalSearch() {
  const navigate = useNavigate();
  const box = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const hits = useSearchHits(query);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(box, open, close);

  const go = (hit: SearchHit) => {
    setOpen(false);
    setQuery('');
    void navigate(hit.to);
  };

  return (
    <div className="header-search" ref={box}>
      <label className="input-wrap">
        <span className="sr-only">Search assets, serial number or borrower</span>
        <Search aria-hidden="true" />
        <input
          className="input"
          type="search"
          placeholder="Search assets, serial number, or borrower…"
          value={query}
          role="combobox"
          aria-expanded={open && hits.length > 0}
          aria-controls="search-results"
          aria-autocomplete="list"
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActive((current) => Math.min(current + 1, hits.length - 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActive((current) => Math.max(current - 1, 0));
            } else if (event.key === 'Enter') {
              const hit = hits[active];
              if (hit) go(hit);
            }
          }}
        />
      </label>
      {open && query.trim().length >= 2 && (
        <div className="menu search-results" id="search-results" role="listbox">
          {hits.length === 0 ? (
            <p className="menu-label">No unit or transaction matches “{query.trim()}”</p>
          ) : (
            hits.map((hit, index) => (
              <button
                key={hit.key}
                type="button"
                role="option"
                aria-selected={index === active}
                data-active={index === active}
                className="search-hit"
                onMouseEnter={() => setActive(index)}
                onClick={() => go(hit)}
              >
                <strong className="mono">{hit.title}</strong>
                {hit.chip}
                <span className="cell-sub" style={{ gridColumn: 'span 2' }}>
                  {hit.detail}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function PersonMenu() {
  const user = useCurrentUser();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useTheme();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(box, open, close);

  return (
    <div className="person" ref={box}>
      <button
        type="button"
        className="person-btn"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${user.name}`}
      >
        <Avatar name={user.name} />
        <span className="person-text">
          <strong>{user.name}</strong>
          <span>{ROLE_LABELS[user.role]}</span>
        </span>
        <ChevronDown aria-hidden="true" className="only-desktop" />
      </button>
      {open && (
        <div className="menu" role="menu">
          <p className="menu-label">{user.email}</p>
          <button
            type="button"
            role="menuitem"
            className="menu-item"
            onClick={() => {
              setOpen(false);
              void navigate('/profile');
            }}
          >
            <UserIcon aria-hidden="true" />
            My profile
          </button>
          <div className="menu-sep" />
          <p className="menu-label">Theme</p>
          <div className="seg" role="group" aria-label="Theme">
            {THEMES.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={theme === item.id}
                onClick={() => setTheme(item.id)}
              >
                <item.icon aria-hidden="true" />
                {item.label}
              </button>
            ))}
          </div>
          <div className="menu-sep" />
          <div className="menu-sep" />
          <button
            type="button"
            role="menuitem"
            className="menu-item danger"
            onClick={() => {
              void signOut().finally(() => void navigate('/login', { replace: true }));
            }}
          >
            <LogOut aria-hidden="true" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
