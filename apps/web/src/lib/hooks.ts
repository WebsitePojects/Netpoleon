import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react';
import { WmsError } from '../data/store.js';

/**
 * Stand-in for the network round trip the real API will add. It makes pending states and
 * loaders visible in the demo, so they are designed now rather than discovered later.
 */
const SIMULATED_LATENCY_MS = 420;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface SubmitGuard {
  pending: boolean;
  error: string | null;
  clearError: () => void;
  /** Runs `action` unless one is already running. Resolves true when it succeeded. */
  run: (action: () => void) => Promise<boolean>;
}

/**
 * The one submit guard every mutating control uses: one press, one effect. The ref blocks a
 * second call even when it arrives before React has re-rendered the disabled button.
 */
export function useSubmit(): SubmitGuard {
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (action: () => void): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      await delay(SIMULATED_LATENCY_MS);
      action();
      return true;
    } catch (caught) {
      if (caught instanceof WmsError) {
        setError(caught.message);
      } else {
        // A bug, not a broken rule: show something honest and keep the detail for the console.
        console.error('Unexpected error while saving', caught);
        setError('That did not work because of an unexpected error. Try again.');
      }
      return false;
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);
  return { pending, error, clearError, run };
}

/** False for a short moment after mount, so a screen can show its skeleton first. */
export function usePageReady(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), SIMULATED_LATENCY_MS);
    return () => clearTimeout(timer);
  }, []);
  return ready;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Animates a number from its previous value to `target`. */
export function useCountUp(target: number, durationMs = 900): number {
  const [value, setValue] = useState(target);
  const shown = useRef(0);

  useEffect(() => {
    if (prefersReducedMotion()) {
      shown.current = target;
      setValue(target);
      return;
    }
    const from = shown.current;
    const startedAt = performance.now();
    let frame = 0;
    const tick = (time: number) => {
      const progress = Math.min(1, (time - startedAt) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 4);
      shown.current = Math.round(from + (target - from) * eased);
      setValue(shown.current);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, durationMs]);

  return value;
}

/** Calls `onAway` on a click or Escape outside `ref` while `active`. */
export function useDismiss(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  onAway: () => void,
): void {
  useEffect(() => {
    if (!active) return;
    const onPointer = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onAway();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onAway();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [ref, active, onAway]);
}

export type ThemeChoice = 'light' | 'dark' | 'system';

const THEME_KEY = 'wms-theme';
const THEME_EVENT = 'wms-theme-change';

function readTheme(): ThemeChoice {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  } catch {
    return 'system'; // storage blocked: follow the operating system
  }
}

function resolvesDark(choice: ThemeChoice): boolean {
  return (
    choice === 'dark' ||
    (choice === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  );
}

function applyTheme(choice: ThemeChoice): void {
  document.documentElement.dataset.theme = resolvesDark(choice) ? 'dark' : 'light';
}

const WIPE_MS = 950;
const BLOB_POINTS = 26;

/**
 * A closed blob around (cx, cy). `jitter` holds one factor per vertex, so two blobs built from
 * different jitter lists have the same number of points and the browser can morph between them.
 */
function blob(cx: number, cy: number, radius: number, jitter: number[]): string {
  const points = jitter.map((factor, index) => {
    const angle = (index / jitter.length) * Math.PI * 2;
    const reach = radius * factor;
    return `${(cx + Math.cos(angle) * reach).toFixed(1)}px ${(cy + Math.sin(angle) * reach).toFixed(1)}px`;
  });
  return `polygon(${points.join(', ')})`;
}

const randomJitter = (low: number): number[] =>
  Array.from({ length: BLOB_POINTS }, () => low + Math.random() * (1 - low));

/**
 * Swaps the theme under an irregular blob that grows from `origin` until it covers the window.
 * The edge is re-randomised on every run and wobbles as it travels. Falls back to an instant
 * swap where view transitions are missing or the visitor asked for reduced motion.
 */
function wipeTheme(swap: () => void, origin: { x: number; y: number } | undefined): void {
  if (!('startViewTransition' in document) || prefersReducedMotion()) {
    swap();
    return;
  }
  const x = origin?.x ?? window.innerWidth / 2;
  const y = origin?.y ?? window.innerHeight / 2;
  const cover = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
  const transition = document.startViewTransition(swap);
  void transition.ready.then(() => {
    document.documentElement.animate(
      {
        clipPath: [
          blob(x, y, 4, randomJitter(0.6)),
          blob(x, y, cover * 0.38, randomJitter(0.45)),
          blob(x, y, cover * 0.85, randomJitter(0.5)),
          // The loosest vertex sits at 0.7 of the radius, so 1.5x still clears every corner.
          blob(x, y, cover * 1.5, randomJitter(0.7)),
        ],
      },
      {
        duration: WIPE_MS,
        easing: 'cubic-bezier(0.65, 0, 0.35, 1)',
        pseudoElement: '::view-transition-new(root)',
      },
    );
  });
}

function subscribeTheme(listener: () => void): () => void {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => {
    applyTheme(readTheme());
    listener();
  };
  window.addEventListener(THEME_EVENT, onChange);
  window.addEventListener('storage', onChange);
  media.addEventListener('change', onChange);
  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
    window.removeEventListener('storage', onChange);
    media.removeEventListener('change', onChange);
  };
}

/** The saved theme choice. The first paint is handled by the script in index.html. */
export function useTheme(): [
  ThemeChoice,
  (choice: ThemeChoice, origin?: { x: number; y: number }) => void,
] {
  const choice = useSyncExternalStore(subscribeTheme, readTheme);
  const setChoice = useCallback((next: ThemeChoice, origin?: { x: number; y: number }) => {
    const swap = () => {
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {
        // Storage blocked: the theme still applies for this visit.
      }
      applyTheme(next);
      window.dispatchEvent(new Event(THEME_EVENT));
    };
    const changesLook = resolvesDark(next) !== (document.documentElement.dataset.theme === 'dark');
    if (changesLook) wipeTheme(swap, origin);
    else swap();
  }, []);
  return [choice, setChoice];
}

/** Whether the page is showing the dark theme right now, whatever the saved choice is. */
export function useIsDark(): boolean {
  return useSyncExternalStore(
    subscribeTheme,
    () => document.documentElement.dataset.theme === 'dark',
  );
}

/** One edge of the tab highlight: a position pulled to its target by a damped spring. */
interface InkEdge {
  at: number;
  speed: number;
}

interface Spring {
  stiffness: number;
  damping: number;
}

/** The edge facing the clicked tab snaps over; the edge behind it follows late and overshoots. */
const INK_LEAD: Spring = { stiffness: 560, damping: 36 };
const INK_TRAIL: Spring = { stiffness: 170, damping: 17 };
const INK_STEP_S = 1 / 240;
const INK_REST_PX = 0.25;
const INK_REST_SPEED = 3;
/** How much the highlight thins while it is stretched between two tabs. */
const INK_SQUASH = 0.34;

function pull(edge: InkEdge, target: number, spring: Spring): void {
  const force = -spring.stiffness * (edge.at - target) - spring.damping * edge.speed;
  edge.speed += force * INK_STEP_S;
  edge.at += edge.speed * INK_STEP_S;
}

function atRest(edge: InkEdge, target: number): boolean {
  return Math.abs(edge.at - target) < INK_REST_PX && Math.abs(edge.speed) < INK_REST_SPEED;
}

/**
 * Moves the highlight of a tab strip to the selected tab like a drop of liquid: the leading
 * edge reaches the new tab first, the body stretches thin behind it, then the trailing edge
 * catches up and the shape settles with a small wobble. `signature` changes whenever the
 * tabs themselves do (labels, counts), so the highlight is measured again.
 */
export function useLiquidInk(
  list: RefObject<HTMLElement | null>,
  ink: RefObject<HTMLElement | null>,
  signature: string,
): void {
  const edges = useRef<{ left: InkEdge; right: InkEdge; top: InkEdge } | null>(null);
  const running = useRef(false);

  useEffect(() => {
    const host = list.current;
    const node = ink.current;
    if (!host || !node) return;

    const measure = () => {
      const tab = host.querySelector<HTMLElement>('[aria-selected="true"]');
      if (!tab) return null;
      return {
        left: tab.offsetLeft,
        right: tab.offsetLeft + tab.offsetWidth,
        top: tab.offsetTop,
        height: tab.offsetHeight,
      };
    };
    type Box = NonNullable<ReturnType<typeof measure>>;

    const paint = (target: Box) => {
      const now = edges.current;
      if (!now) return;
      const width = Math.max(4, now.right.at - now.left.at);
      const rest = Math.max(1, target.right - target.left);
      const stretch = (width - rest) / rest;
      const squash = Math.min(1.1, Math.max(0.62, 1 - stretch * INK_SQUASH));
      node.style.width = `${width}px`;
      node.style.height = `${target.height}px`;
      node.style.transform = `translate3d(${now.left.at}px, ${now.top.at}px, 0) scaleY(${squash})`;
      node.style.opacity = '1';
    };

    const snap = (target: Box) => {
      edges.current = {
        left: { at: target.left, speed: 0 },
        right: { at: target.right, speed: 0 },
        top: { at: target.top, speed: 0 },
      };
      paint(target);
    };

    const target = measure();
    if (!target) return;
    let frame = 0;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!edges.current || reduced) {
      snap(target);
    } else {
      const now = edges.current;
      const goingRight = target.left + target.right > now.left.at + now.right.at;
      let last = performance.now();
      running.current = true;
      const tick = (time: number) => {
        // Fixed small steps keep the spring stable whatever the display's frame rate.
        let budget = Math.min(0.05, (time - last) / 1000);
        last = time;
        while (budget > 0) {
          pull(now.left, target.left, goingRight ? INK_TRAIL : INK_LEAD);
          pull(now.right, target.right, goingRight ? INK_LEAD : INK_TRAIL);
          pull(now.top, target.top, INK_LEAD);
          budget -= INK_STEP_S;
        }
        if (
          atRest(now.left, target.left) &&
          atRest(now.right, target.right) &&
          atRest(now.top, target.top)
        ) {
          running.current = false;
          snap(target);
          return;
        }
        paint(target);
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }

    // A resize (or a wrap onto two rows) moves the tabs; follow without replaying the motion.
    const observer = new ResizeObserver(() => {
      const next = measure();
      if (next && !running.current) snap(next);
    });
    observer.observe(host);
    return () => {
      cancelAnimationFrame(frame);
      running.current = false;
      observer.disconnect();
    };
  }, [list, ink, signature]);
}
