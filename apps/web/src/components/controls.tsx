import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { addDays, formatDate, fromDateKey, toDateKey } from '../lib/dates.js';

/**
 * The system's own form controls. Nothing here falls back to a browser-drawn picker: the
 * dropdown, the suggestion list and the calendar are all rendered and animated by us, and
 * they share one floating layer (`Popover`) so they behave the same everywhere.
 */

interface Placement {
  style: CSSProperties;
}

const POPOVER_GAP = 6;
const VIEWPORT_MARGIN = 8;

/** The interface scale set in CSS (`--ui-scale`); 1 on phones and large desktops. */
function uiScale(): number {
  return Number(getComputedStyle(document.documentElement).getPropertyValue('--ui-scale')) || 1;
}

/**
 * A floating layer anchored to an element. It is portalled to <body> and positioned with
 * fixed coordinates, so a scrolling side panel can never clip it. It opens downwards and
 * flips up when there is more room above.
 */
export function Popover({
  anchor,
  onClose,
  children,
  matchWidth = true,
  estimatedHeight = 300,
  className = '',
}: {
  anchor: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
  matchWidth?: boolean;
  /** Used to decide whether to open above the anchor before the content has been measured. */
  estimatedHeight?: number;
  className?: string;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState<Placement | null>(null);

  const place = useCallback(() => {
    const raw = anchor.current?.getBoundingClientRect();
    if (!raw) return;
    // <body> is zoomed by --ui-scale: measurements come back in screen pixels, while the
    // offsets written below are in the zoomed space. Convert everything to the latter.
    const scale = uiScale();
    const rect = {
      left: raw.left / scale,
      top: raw.top / scale,
      bottom: raw.bottom / scale,
      width: raw.width / scale,
    };
    const viewWidth = window.innerWidth / scale;
    const viewHeight = window.innerHeight / scale;
    const below = viewHeight - rect.bottom;
    // The layer is already in the DOM (hidden) on the first pass, so its real height is known.
    const height = layer.current?.offsetHeight || estimatedHeight;
    const needed = height + POPOVER_GAP + VIEWPORT_MARGIN;
    const openUp = below < needed && rect.top > below;
    // When it fits on neither side, pin it inside the viewport instead of letting it run off.
    const top = Math.max(
      VIEWPORT_MARGIN,
      Math.min(rect.bottom + POPOVER_GAP, viewHeight - height - VIEWPORT_MARGIN),
    );
    const bottom = Math.max(
      VIEWPORT_MARGIN,
      Math.min(viewHeight - rect.top + POPOVER_GAP, viewHeight - height - VIEWPORT_MARGIN),
    );
    const width = matchWidth ? Math.max(rect.width, 200) : undefined;
    const layerWidth = width ?? layer.current?.offsetWidth ?? 300;
    const left = Math.max(
      VIEWPORT_MARGIN,
      Math.min(rect.left, viewWidth - layerWidth - VIEWPORT_MARGIN),
    );
    setPlacement({
      style: {
        left,
        ...(width ? { width } : {}),
        ...(openUp
          ? {
              bottom,
              '--origin': 'bottom',
              '--from': '8px',
            }
          : { top }),
      } as CSSProperties,
    });
  }, [anchor, matchWidth, estimatedHeight]);

  useLayoutEffect(() => {
    place();
    // Capture phase: a scroll inside any ancestor (the panel body) must also re-place it.
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [place]);

  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (layer.current?.contains(target) || anchor.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener('pointerdown', onPointer, true);
    return () => document.removeEventListener('pointerdown', onPointer, true);
  }, [anchor, onClose]);

  return createPortal(
    <div
      ref={layer}
      className={`popover ${className}`}
      style={placement?.style ?? { visibility: 'hidden' }}
      // A press inside the layer must not blur the field that owns it.
      onMouseDown={(event) => event.preventDefault()}
    >
      {children}
    </div>,
    document.body,
  );
}

export interface SelectOption {
  value: string;
  label: string;
  hint?: string | undefined;
}

/** Condition grades, the same wording wherever a unit is graded. */
export const CONDITION_OPTIONS: SelectOption[] = [
  { value: 'A', label: 'A · Like new' },
  { value: 'B', label: 'B · Light wear' },
  { value: 'C', label: 'C · Heavy wear' },
];

export function Select({
  value,
  onChange,
  options,
  placeholder = 'Choose…',
  disabled = false,
  ariaLabel,
  style,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  style?: CSSProperties;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = options[selectedIndex];

  const openList = () => {
    if (disabled) return;
    setActive(Math.max(0, selectedIndex));
    setOpen(true);
  };
  const close = useCallback(() => setOpen(false), []);
  const choose = (option: SelectOption | undefined) => {
    if (!option) return;
    onChange(option.value);
    setOpen(false);
  };

  // Keep the highlighted option in view while arrowing through a long list.
  useEffect(() => {
    if (!open) return;
    list.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!open) {
      if (
        event.key === 'ArrowDown' ||
        event.key === 'ArrowUp' ||
        event.key === 'Enter' ||
        event.key === ' '
      ) {
        event.preventDefault();
        openList();
      }
      return;
    }
    if (event.key === 'Escape') {
      // Stop here so the side panel behind does not also close.
      event.stopPropagation();
      setOpen(false);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((current) => Math.min(current + 1, options.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActive(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActive(options.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(options[active]);
    } else if (event.key === 'Tab') {
      setOpen(false);
    } else if (event.key.length === 1) {
      // Type a letter to jump to the next option starting with it.
      const letter = event.key.toLowerCase();
      const from = active + 1;
      const order = [...options.slice(from), ...options.slice(0, from)];
      const match = order.find((option) => option.label.toLowerCase().startsWith(letter));
      if (match) setActive(options.indexOf(match));
    }
  };

  return (
    <span className="select-wrap" style={{ display: 'block', ...style }}>
      <button
        ref={button}
        type="button"
        className="select-btn"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        disabled={disabled}
        data-value={value}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
      >
        <span data-placeholder={!selected}>{selected?.label ?? placeholder}</span>
        <ChevronDown aria-hidden="true" />
      </button>
      {open && (
        <Popover anchor={button} onClose={close}>
          <div className="listbox" role="listbox" id={listId} ref={list}>
            {options.length === 0 && <p className="option-empty">Nothing to choose from.</p>}
            {options.map((option, index) => (
              <div
                key={option.value}
                id={`${listId}-${index}`}
                role="option"
                className="option"
                aria-selected={option.value === value}
                data-active={index === active}
                data-value={option.value}
                style={{ '--i': index } as CSSProperties}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(option)}
              >
                <span>
                  {option.label}
                  {option.hint && <small>{option.hint}</small>}
                </span>
                {option.value === value && <Check aria-hidden="true" />}
              </div>
            ))}
          </div>
        </Popover>
      )}
    </span>
  );
}

const MAX_SUGGESTIONS = 7;

/** A text field with the system's own suggestion list; any other value can still be typed. */
export function SuggestInput({
  value,
  onChange,
  suggestions,
  placeholder,
  className = 'input',
}: {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const close = useCallback(() => setOpen(false), []);

  const matches = useMemo(() => {
    const needle = value.trim().toLowerCase();
    const found = suggestions.filter((item) => item.toLowerCase().includes(needle));
    // Nothing left to suggest once the field holds exactly one of the suggestions.
    if (found.length === 1 && found[0]?.toLowerCase() === needle) return [];
    return found.slice(0, MAX_SUGGESTIONS);
  }, [suggestions, value]);

  const pick = (item: string | undefined) => {
    if (item === undefined) return;
    onChange(item);
    setOpen(false);
  };

  return (
    <>
      <input
        ref={input}
        className={className}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open && matches.length > 0}
        aria-autocomplete="list"
        onChange={(event) => {
          onChange(event.target.value);
          setActive(-1);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={close}
        onKeyDown={(event) => {
          if (!open || matches.length === 0) return;
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActive((current) => Math.min(current + 1, matches.length - 1));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((current) => Math.max(current - 1, 0));
          } else if (event.key === 'Enter' && active >= 0) {
            event.preventDefault();
            pick(matches[active]);
          } else if (event.key === 'Escape') {
            event.stopPropagation();
            setOpen(false);
          }
        }}
      />
      {open && matches.length > 0 && (
        <Popover anchor={input} onClose={close}>
          <div className="listbox" role="listbox">
            {matches.map((item, index) => (
              <div
                key={item}
                role="option"
                className="option"
                aria-selected={index === active}
                data-active={index === active}
                style={{ '--i': index } as CSSProperties}
                onMouseEnter={() => setActive(index)}
                onClick={() => pick(item)}
              >
                <span>{item}</span>
              </div>
            ))}
          </div>
        </Popover>
      )}
    </>
  );
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const monthTitle = new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric' });

/** A date field with the system's own calendar. Dates are `YYYY-MM-DD` strings. */
export function DateField({
  value,
  onChange,
  min,
  max,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  min?: string | undefined;
  max?: string | undefined;
  ariaLabel?: string;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const today = toDateKey(new Date());
  /** First day of the month being shown. */
  const [month, setMonth] = useState(() => `${(value || today).slice(0, 7)}-01`);
  /** Direction of the last month change, so the grid slides the way the user moved. */
  const [direction, setDirection] = useState(1);
  const close = useCallback(() => setOpen(false), []);

  const days = useMemo(() => {
    const first = fromDateKey(month);
    const start = addDays(month, -first.getDay());
    // Six weeks always: the calendar keeps one height while paging through months.
    return Array.from({ length: 42 }, (_, index) => addDays(start, index));
  }, [month]);

  const step = (months: number) => {
    const date = fromDateKey(month);
    date.setMonth(date.getMonth() + months);
    setDirection(months);
    setMonth(toDateKey(date));
  };
  const allowed = (day: string) => (!min || day >= min) && (!max || day <= max);
  const pick = (day: string) => {
    onChange(day);
    setOpen(false);
    button.current?.focus();
  };

  return (
    <span className="select-wrap" style={{ display: 'block' }}>
      <button
        ref={button}
        type="button"
        className="select-btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        data-value={value}
        onClick={() => {
          setMonth(`${(value || today).slice(0, 7)}-01`);
          setOpen((current) => !current);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && open) {
            event.stopPropagation();
            setOpen(false);
          }
        }}
      >
        <span className="num" data-placeholder={!value}>
          {value ? formatDate(value) : 'Choose a date'}
        </span>
        <CalendarDays aria-hidden="true" style={{ transform: 'none' }} />
      </button>
      {open && (
        <Popover anchor={button} onClose={close} matchWidth={false} estimatedHeight={360}>
          <div className="cal" role="dialog" aria-label="Choose a date">
            <div className="cal-head">
              <button
                type="button"
                className="icon-btn"
                onClick={() => step(-1)}
                aria-label="Previous month"
              >
                <ChevronLeft aria-hidden="true" />
              </button>
              <strong aria-live="polite">{monthTitle.format(fromDateKey(month))}</strong>
              <button
                type="button"
                className="icon-btn"
                onClick={() => step(1)}
                aria-label="Next month"
              >
                <ChevronRight aria-hidden="true" />
              </button>
            </div>
            <div className="cal-grid" aria-hidden="true">
              {WEEKDAYS.map((day) => (
                <span key={day} className="cal-dow">
                  {day}
                </span>
              ))}
            </div>
            <div
              className="cal-grid"
              key={month}
              style={{ '--dir': `${direction * 14}px` } as CSSProperties}
            >
              {days.map((day) =>
                day.slice(0, 7) === month.slice(0, 7) ? (
                  <button
                    key={day}
                    type="button"
                    className="cal-day"
                    disabled={!allowed(day)}
                    aria-pressed={day === value}
                    aria-label={formatDate(day)}
                    data-today={day === today}
                    data-day={day}
                    onClick={() => pick(day)}
                  >
                    {Number(day.slice(8))}
                  </button>
                ) : (
                  <span key={day} />
                ),
              )}
            </div>
            <div className="cal-foot">
              <button
                type="button"
                className="link"
                disabled={!allowed(today)}
                onClick={() => pick(today)}
              >
                Today
              </button>
              <button type="button" className="link" onClick={close}>
                Close
              </button>
            </div>
          </div>
        </Popover>
      )}
    </span>
  );
}

/** One shimmering placeholder block. Width and height in pixels or any CSS length. */
export function Sk({
  w = '100%',
  h = 14,
  r,
  style,
}: {
  w?: number | string;
  h?: number | string;
  r?: number | string;
  style?: CSSProperties;
}) {
  return (
    <span
      className="sk"
      style={{ width: w, height: h, ...(r !== undefined ? { borderRadius: r } : {}), ...style }}
    />
  );
}

/**
 * A table placeholder with the same column template as the real table, so the rows do not
 * jump when the data arrives. `cells` gives each column's block: a width, or 'thumb', or 'chip'.
 */
export function SkTable({
  template,
  cells,
  rows = 8,
  toolbar = false,
}: {
  /** CSS grid-template-columns matching the real table's proportions. */
  template: string;
  cells: (number | string | 'thumb' | 'chip' | 'box')[];
  rows?: number;
  toolbar?: boolean;
}) {
  const grid: CSSProperties = { gridTemplateColumns: template };
  return (
    <div role="status" aria-label="Loading" className="sk-fade">
      {toolbar && (
        <div className="toolbar">
          <Sk h={40} r={10} />
        </div>
      )}
      <div className="sk-row sk-head" style={grid}>
        {cells.map((cell, index) =>
          cell === 'box' ? <Sk key={index} w={20} h={20} r={6} /> : <Sk key={index} w={64} h={9} />,
        )}
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="sk-row" style={grid}>
          {cells.map((cell, index) =>
            cell === 'thumb' ? (
              <span key={index} className="row" style={{ gap: 12, flexWrap: 'nowrap' }}>
                <Sk w={44} h={32} />
                <Sk w={104} />
              </span>
            ) : cell === 'box' ? (
              <Sk key={index} w={20} h={20} r={6} />
            ) : cell === 'chip' ? (
              <Sk key={index} w={88} h={24} r={7} />
            ) : (
              // Vary the widths a little so the placeholder reads as text, not as bars.
              <Sk
                key={index}
                w={typeof cell === 'number' ? cell - ((row * 13 + index * 7) % 28) : cell}
              />
            ),
          )}
        </div>
      ))}
    </div>
  );
}

/** Placeholder for a card of label/value facts. */
export function SkFacts({ rows = 4, columns = 2 }: { rows?: number; columns?: 1 | 2 }) {
  return (
    <div className={columns === 2 ? 'facts cols-2' : 'facts'}>
      {Array.from({ length: rows * columns }, (_, index) => (
        <div key={index}>
          <Sk w={84} h={11} />
          <Sk w={110 + ((index * 37) % 50)} />
        </div>
      ))}
    </div>
  );
}

const SK_TABS = [92, 84, 96, 64];

function SkTabs() {
  return (
    <div className="row" style={{ gap: 8 }}>
      {SK_TABS.map((width) => (
        <Sk key={width} w={width} h={38} r={10} />
      ))}
    </div>
  );
}

function SkCardHead({ w = 180 }: { w?: number }) {
  return (
    <div className="card-head">
      <Sk w={w} h={16} />
      <Sk w={64} h={11} />
    </div>
  );
}

function SkBars() {
  return (
    <div className="sk-bars">
      {[62, 88, 46, 74, 96, 58, 80].map((height, index) => (
        <Sk key={index} w="100%" h={`${height}%`} r={6} />
      ))}
    </div>
  );
}

export type SkPageKind = 'detail' | 'table' | 'alerts' | 'reports' | 'settings' | 'profile';

/** A whole-page placeholder laid out like the screen it stands in for. */
export function SkPage({ kind }: { kind: SkPageKind }) {
  if (kind === 'table') {
    return (
      <div className="stack sk-fade" role="status" aria-label="Loading">
        <SkTabs />
        <div className="card table-card">
          <SkTable
            template="1.4fr 1.4fr 1fr 1fr 0.8fr"
            cells={['thumb', 170, 110, 'chip', 70]}
            rows={7}
          />
        </div>
      </div>
    );
  }
  if (kind === 'alerts') {
    return (
      <div className="stack sk-fade" role="status" aria-label="Loading">
        <SkTabs />
        <div className="alert-grid">
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index} className="alert-card sk-card">
              <Sk w={120} h={12} />
              <Sk w={96} h={13} style={{ marginTop: 8 }} />
              <Sk w={`${70 - (index % 3) * 10}%`} h={10} />
              <Sk w={70} h={10} />
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (kind === 'reports') {
    return (
      <div className="stack sk-fade" role="status" aria-label="Loading">
        <SkTabs />
        <div className="card figures">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="figure">
              <Sk w={100} h={11} />
              <Sk w={72} h={30} r={8} style={{ marginTop: 10 }} />
            </div>
          ))}
        </div>
        <div className="grid-2">
          <div className="card">
            <SkCardHead w={210} />
            <SkBars />
          </div>
          <div className="card">
            <SkCardHead />
            <div className="sk-donut">
              <Sk w={170} h={170} r="50%" />
              <div className="stack" style={{ gap: 14, flex: 1 }}>
                {Array.from({ length: 5 }, (_, index) => (
                  <Sk key={index} w={`${82 - index * 7}%`} h={12} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (kind === 'settings') {
    return (
      <div className="settings sk-fade" role="status" aria-label="Loading">
        <div className="settings-nav">
          {Array.from({ length: 8 }, (_, index) => (
            <Sk key={index} w="100%" h={38} r={10} />
          ))}
        </div>
        <div className="card">
          <div className="card-pad stack">
            <Sk w={150} h={18} />
            <Sk w="60%" h={11} />
          </div>
          <div className="card-pad form-grid cols-2">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="stack" style={{ gap: 8 }}>
                <Sk w={110} h={11} />
                <Sk w="100%" h={42} r={10} />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (kind === 'profile') {
    return (
      <div className="grid-2 even sk-fade" role="status" aria-label="Loading">
        <div className="stack">
          <div className="card card-pad stack">
            <div className="row" style={{ gap: 14, flexWrap: 'nowrap' }}>
              <Sk w={64} h={64} r="50%" />
              <div className="stack" style={{ gap: 8 }}>
                <Sk w={160} h={18} />
                <Sk w={110} h={11} />
              </div>
            </div>
            <SkFacts rows={3} />
          </div>
          <div className="card card-pad stack">
            <Sk w={120} h={16} />
            <Sk w="100%" h={44} r={10} />
          </div>
        </div>
        <div className="card">
          <SkCardHead w={150} />
          <SkTable template="1fr auto" cells={[200, 70]} rows={6} />
        </div>
      </div>
    );
  }
  return (
    <div className="grid-2 sk-fade" role="status" aria-label="Loading">
      <div className="stack">
        <div className="card card-pad stack">
          <div className="row" style={{ gap: 16, flexWrap: 'nowrap' }}>
            <Sk w={120} h={88} r={12} />
            <div className="stack" style={{ gap: 9, flex: 1 }}>
              <Sk w={170} h={20} />
              <Sk w={220} h={12} />
              <Sk w={88} h={24} r={7} />
            </div>
          </div>
          <SkFacts rows={3} />
        </div>
        <div className="card table-card">
          <SkCardHead w={160} />
          <SkTable template="1fr 1.4fr 1fr 0.9fr" cells={[110, 170, 100, 80]} rows={5} />
        </div>
      </div>
      <div className="stack" style={{ alignContent: 'start' }}>
        <div className="card card-pad stack" style={{ justifyItems: 'center' }}>
          <Sk w={150} h={150} r={12} />
          <Sk w={130} h={12} />
          <Sk w="100%" h={40} r={10} />
        </div>
        <div className="card card-pad stack">
          <Sk w={130} h={16} />
          <SkFacts rows={3} columns={1} />
        </div>
      </div>
    </div>
  );
}
