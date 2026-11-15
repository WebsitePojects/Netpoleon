import {
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleX,
  Inbox,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import type { AssetStatus } from '@wms/contracts';
import { LOAN_STATUS_LABELS } from '../data/selectors.js';
import { ASSET_STATUS_LABELS } from '../lib/labels.js';
import type { Loan, Unit, UnitStatus } from '../data/types.js';
import { useLiquidInk } from '../lib/hooks.js';

/** The Netpoleon logo. The default cut has a white wordmark for charcoal surfaces. */
export function Brand({ onLight = false }: { onLight?: boolean }) {
  return (
    <span className="brand">
      <img
        src={onLight ? '/img/logo-ink.png' : '/img/logo-white.png'}
        alt="Netpoleon"
        width={143}
        height={22}
      />
    </span>
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'danger' | 'ghost';
  size?: 'md' | 'sm';
  block?: boolean;
  /** Shows a spinner and disables the button while a submit is in flight. */
  pending?: boolean;
  icon?: LucideIcon;
}

export function Button({
  variant = 'default',
  size = 'md',
  block = false,
  pending = false,
  icon: Icon,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = ['btn'];
  if (variant !== 'default') classes.push(`btn-${variant}`);
  if (size === 'sm') classes.push('btn-sm');
  if (block) classes.push('btn-block');
  return (
    <button
      {...rest}
      type={type}
      className={classes.join(' ')}
      disabled={disabled === true || pending}
      aria-busy={pending}
    >
      {pending ? (
        <span className="spinner" aria-hidden="true" />
      ) : Icon ? (
        <Icon aria-hidden="true" />
      ) : null}
      {children}
    </button>
  );
}

// The two database statuses the demo never had borrow the nearest colour.
const STATUS_TONES: Partial<Record<AssetStatus, UnitStatus>> = {
  registered: 'returned',
  lost: 'for_repair',
};

export function StatusChip({
  status,
  reserved = false,
}: {
  status: AssetStatus;
  reserved?: boolean;
}) {
  if (status === 'in_stock' && reserved) {
    return (
      <span className="chip" data-tone="on_demo">
        Reserved
      </span>
    );
  }
  return (
    <span className="chip" data-tone={STATUS_TONES[status] ?? status}>
      {ASSET_STATUS_LABELS[status]}
    </span>
  );
}

const LOAN_TONES: Record<Loan['status'], string> = {
  pending: 'for_repair',
  approved: 'in_stock',
  released: 'on_demo',
  returned: 'returned',
  closed: 'retired',
  rejected: 'under_inspection',
  cancelled: 'under_inspection',
};

export function LoanChip({ status }: { status: Loan['status'] }) {
  return (
    <span className="chip" data-tone={LOAN_TONES[status]}>
      {LOAN_STATUS_LABELS[status]}
    </span>
  );
}

const CATEGORY_IMAGES: Record<string, string> = {
  SW: '/img/cat-switches.jpg',
  AP: '/img/cat-access-points.jpg',
  FW: '/img/cat-firewalls.jpg',
  RT: '/img/cat-routers.jpg',
  SRV: '/img/cat-servers.jpg',
  LT: '/img/cat-laptops.jpg',
};

export function CategoryThumb({
  unit,
  large = false,
}: {
  unit: Pick<Unit, 'categoryCode'>;
  large?: boolean;
}) {
  const source = CATEGORY_IMAGES[unit.categoryCode];
  if (!source) return null;
  return <img className={large ? 'thumb lg' : 'thumb'} src={source} alt="" loading="lazy" />;
}

export function Avatar({ name, large = false }: { name: string; large?: boolean }) {
  const initials = name
    .split(/\s+/)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <span className={large ? 'avatar lg' : 'avatar'} aria-hidden="true">
      {initials}
    </span>
  );
}

export interface Crumb {
  label: string;
  to?: string;
}

export function PageHead({
  title,
  lead,
  crumbs,
  actions,
}: {
  title: string;
  lead?: string;
  crumbs?: Crumb[];
  actions?: ReactNode;
}) {
  return (
    <>
      {crumbs && (
        <nav className="crumbs" aria-label="Breadcrumb">
          {crumbs.map((crumb, index) => (
            <span key={crumb.label} className="row" style={{ gap: 6 }}>
              {index > 0 && <ChevronRight aria-hidden="true" />}
              {crumb.to ? (
                <Link to={crumb.to}>{crumb.label}</Link>
              ) : (
                <span aria-current="page">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <header className="page-head">
        <div>
          <h1>{title}</h1>
          {lead && <p>{lead}</p>}
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </header>
    </>
  );
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string | undefined;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={className ? `field ${className}` : 'field'}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="form-error" role="alert">
      <CircleAlert aria-hidden="true" />
      {message}
    </p>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      className="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    />
  );
}

export interface TabItem<T extends string> {
  id: T;
  label: string;
  count?: number;
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
}: {
  tabs: TabItem<T>[];
  value: T;
  onChange: (next: T) => void;
  label: string;
}) {
  const list = useRef<HTMLDivElement>(null);
  const ink = useRef<HTMLSpanElement>(null);
  useLiquidInk(
    list,
    ink,
    `${value}|${tabs.map((tab) => `${tab.label}${tab.count ?? ''}`).join('|')}`,
  );
  return (
    <div className="tabs" role="tablist" aria-label={label} ref={list}>
      <span className="tab-ink" ref={ink} aria-hidden="true" />
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          className="tab"
          aria-selected={tab.id === value}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {tab.count !== undefined && <span className="tab-count num">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Page numbers to show: first, last, and a window around the current page. */
function pageWindow(page: number, pageCount: number): (number | 'gap')[] {
  const wanted = new Set([1, pageCount, page - 1, page, page + 1]);
  const pages = [...wanted].filter((item) => item >= 1 && item <= pageCount).sort((a, b) => a - b);
  const result: (number | 'gap')[] = [];
  pages.forEach((item, index) => {
    const previous = pages[index - 1];
    if (previous !== undefined && item - previous > 1) result.push('gap');
    result.push(item);
  });
  return result;
}

export function TableFoot({
  page,
  pageSize,
  total,
  noun,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  noun: string;
  onPage: (page: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  return (
    <div className="table-foot">
      <span className="num">
        Showing {first} to {last} of {total} {noun}
      </span>
      {pageCount > 1 && (
        <nav className="pager" aria-label="Pages">
          <button
            type="button"
            disabled={page === 1}
            onClick={() => onPage(page - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          {pageWindow(page, pageCount).map((item, index) =>
            item === 'gap' ? (
              <button key={`gap-${index}`} type="button" disabled aria-hidden="true">
                …
              </button>
            ) : (
              <button
                key={item}
                type="button"
                className="num"
                aria-current={item === page ? 'page' : undefined}
                onClick={() => onPage(item)}
              >
                {item}
              </button>
            ),
          )}
          <button
            type="button"
            disabled={page === pageCount}
            onClick={() => onPage(page + 1)}
            aria-label="Next page"
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </nav>
      )}
    </div>
  );
}

export function Empty({
  title,
  children,
  icon: Icon = Inbox,
}: {
  title: string;
  children?: ReactNode;
  icon?: LucideIcon;
}) {
  return (
    <div className="empty">
      <Icon aria-hidden="true" />
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}

const DIALOG_MIN_OPEN_MS = 120;
const DIALOG_EXIT_MS = 300;

export function Dialog({
  title,
  description,
  onClose,
  children,
  footer,
  width,
  busy = false,
}: {
  title: string;
  description?: string | undefined;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
  width?: number | undefined;
  /** While a submit is in flight the dialog cannot be dismissed, so it cannot be re-fired. */
  busy?: boolean;
}) {
  const titleId = useId();
  const overlay = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = panel.current?.querySelector<HTMLElement>(
      '[data-autofocus], input, textarea, [role="combobox"]',
    );
    (first ?? panel.current)?.focus();
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
      previous?.focus();
    };
  }, []);

  // Every way of closing (Cancel, Escape, a finished submit) just unmounts the dialog. To still
  // play the exit, a lifeless copy of the panel is left behind for the length of the animation.
  useLayoutEffect(() => {
    const node = overlay.current;
    const openedAt = performance.now();
    return () => {
      // StrictMode unmounts once straight after mounting; that is not a real close.
      if (!node || performance.now() - openedAt < DIALOG_MIN_OPEN_MS) return;
      const ghost = node.cloneNode(true) as HTMLElement;
      ghost.dataset.closing = 'true';
      ghost.inert = true;
      ghost.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'));
      document.body.appendChild(ghost);
      setTimeout(() => ghost.remove(), DIALOG_EXIT_MS);
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy && !document.querySelector('.popover')) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const style = width ? ({ '--dialog-w': `${width}px` } as CSSProperties) : undefined;
  // Portalled to <body> so the veil blurs the whole window: sidebar and header included.
  return createPortal(
    <div
      className="overlay"
      ref={overlay}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={panel}
        tabIndex={-1}
        style={style}
      >
        <div className="dialog-head">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
          >
            <X aria-hidden="true" />
          </button>
        </div>
        <div className="dialog-body">{children}</div>
        <div className="dialog-foot">{footer}</div>
      </div>
    </div>,
    document.body,
  );
}

interface Toast {
  id: number;
  message: string;
  tone: 'success' | 'error';
}

const ToastContext = createContext<((message: string, tone?: Toast['tone']) => void) | null>(null);

const TOAST_VISIBLE_MS = 3800;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const show = useCallback((message: string, tone: Toast['tone'] = 'success') => {
    const id = nextId.current++;
    setToasts((current) => [...current, { id, message, tone }]);
    setTimeout(
      () => setToasts((current) => current.filter((toast) => toast.id !== id)),
      TOAST_VISIBLE_MS,
    );
  }, []);

  const value = useMemo(() => show, [show]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className="toast" data-tone={toast.tone}>
            {toast.tone === 'success' ? (
              <CircleCheck aria-hidden="true" />
            ) : (
              <CircleX aria-hidden="true" />
            )}
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): (message: string, tone?: Toast['tone']) => void {
  const show = useContext(ToastContext);
  if (!show) throw new Error('useToast must be used inside <ToastProvider>.');
  return show;
}

/** Sets `--i` so children of `.stagger` and chart marks animate one after another. */
export function order(index: number): CSSProperties {
  return { '--i': index } as CSSProperties;
}
