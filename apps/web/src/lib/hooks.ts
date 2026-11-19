import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react';
import { ApiError } from '../api/client.js';

export interface SubmitGuard {
  pending: boolean;
  error: string | null;
  clearError: () => void;
  /** Runs `action` unless one is already running. Resolves true when it succeeded. */
  run: (action: () => Promise<unknown> | void) => Promise<boolean>;
}

/**
 * The one submit guard every mutating control uses: one press, one effect. The ref blocks a
 * second call even when it arrives before React has re-rendered the disabled button.
 */
export function useSubmit(): SubmitGuard {
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (action: () => Promise<unknown> | void): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (caught) {
      if (caught instanceof ApiError) {
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

const WIPE_MS = 700;
const WIPE_FRAMES = 48; // one keyframe per ~15 ms: the browser only interpolates between close shapes
const EDGE_POINTS = 48;

// Slow first, then fast: the blob leaves the button with a small push and then accelerates
// at a constant rate, like liquid gathering and then surging. Its speed peaks as it clears the
// last corner, so the end is crisp rather than a slow creep. LAUNCH is the share of the final
// size the initial push alone would cover; the rest comes from acceleration.
const LAUNCH = 0.1;
const reachAt = (progress: number): number =>
  LAUNCH * progress + (1 - LAUNCH) * progress * progress;

// How far the rim strays from a circle, as a share of the radius. Held for the whole wipe, so
// the shape stays an abstract blob instead of relaxing into a disc.
const WOBBLE = 0.42;

/** Low harmonics only: one to four bulges around the rim read as liquid; high ones read as spikes. */
interface EdgeWave {
  lobes: number;
  amplitude: number; // share of WOBBLE; the four add up to 1
  phase: number;
  drift: number; // radians per second the wave travels around the rim
}

/**
 * The one-lobe wave makes the blob lopsided, leaning towards `lean` (radians), so it pours into
 * the page rather than swelling evenly; the others give it an irregular, slowly turning rim.
 */
function randomWaves(lean: number): EdgeWave[] {
  const spin = () => (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 0.9);
  return [
    // sin(angle + phase) peaks where angle + phase = π/2.
    { lobes: 1, amplitude: 0.4, phase: Math.PI / 2 - lean, drift: spin() * 0.3 },
    { lobes: 2, amplitude: 0.3, phase: Math.random() * Math.PI * 2, drift: spin() },
    { lobes: 3, amplitude: 0.18, phase: Math.random() * Math.PI * 2, drift: spin() },
    { lobes: 4, amplitude: 0.12, phase: Math.random() * Math.PI * 2, drift: spin() },
  ];
}

/** How far the rim sits from the base radius at `angle`, as a share of WOBBLE (-1 to 1). */
function rimOffset(waves: EdgeWave[], angle: number, seconds: number): number {
  return waves.reduce(
    (sum, w) => sum + w.amplitude * Math.sin(w.lobes * angle + w.phase + w.drift * seconds),
    0,
  );
}

/**
 * The smallest base radius whose final shape reaches every point of the window's edge, measured
 * for this run's waves rather than the worst case, so the blob finishes covering exactly as the
 * animation ends instead of finishing early and spending the rest of its time off screen.
 */
function radiusToCover(x: number, y: number, waves: EdgeWave[], seconds: number): number {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const step = 24; // px between edge samples; the rim cannot change much over that span
  const edge: [number, number][] = [];
  for (let px = 0; px <= width; px += step) edge.push([px, 0], [px, height]);
  for (let py = 0; py <= height; py += step) edge.push([0, py], [width, py]);
  edge.push([width, height]);
  let needed = 0;
  for (const [px, py] of edge) {
    const angle = Math.atan2(py - y, px - x);
    // WOBBLE < 1, so the divisor stays positive in every direction.
    const scale = 1 + WOBBLE * rimOffset(waves, angle, seconds);
    needed = Math.max(needed, Math.hypot(px - x, py - y) / scale);
  }
  // 4% spare absorbs the smooth curve sagging slightly inside the straight line between points.
  return needed * 1.04;
}

/**
 * A closed curve through the rim points. Catmull-Rom tangents turned into cubic Béziers keep the
 * edge smooth at every point, so no corner can form however the waves combine.
 */
function smoothPath(points: [number, number][]): string {
  const n = points.length;
  const at = (i: number) => points[((i % n) + n) % n] as [number, number];
  const f = (v: number) => v.toFixed(1);
  let d = `M${f(at(0)[0])},${f(at(0)[1])}`;
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${f(c1x)},${f(c1y)} ${f(c2x)},${f(c2y)} ${f(p2[0])},${f(p2[1])}`;
  }
  return `path('${d}Z')`;
}

/**
 * Every frame of the wipe, precomputed. The rim keeps its irregular shape all the way out, and
 * the last frame is sized to this run's shape so the new theme covers the whole window exactly
 * as the animation ends.
 */
function wipeFrames(x: number, y: number): string[] {
  const lean = Math.atan2(window.innerHeight / 2 - y, window.innerWidth / 2 - x);
  const waves = randomWaves(lean + (Math.random() - 0.5) * 0.8);
  const finalRadius = radiusToCover(x, y, waves, WIPE_MS / 1000);
  return Array.from({ length: WIPE_FRAMES + 1 }, (_, frame) => {
    const progress = frame / WIPE_FRAMES;
    const seconds = (progress * WIPE_MS) / 1000;
    const radius = Math.max(2, finalRadius * reachAt(progress));
    const rim = Array.from({ length: EDGE_POINTS }, (_, i): [number, number] => {
      const angle = (i / EDGE_POINTS) * Math.PI * 2;
      const r = radius * (1 + WOBBLE * rimOffset(waves, angle, seconds));
      return [x + Math.cos(angle) * r, y + Math.sin(angle) * r];
    });
    return smoothPath(rim);
  });
}

/**
 * Swaps the theme under a liquid blob that spreads from `origin` until it covers the window.
 * The rim's waves are re-randomised on every run. Falls back to an instant swap where view
 * transitions are missing or the visitor asked for reduced motion.
 */
function wipeTheme(swap: () => void, origin: { x: number; y: number } | undefined): void {
  if (!('startViewTransition' in document) || prefersReducedMotion()) {
    swap();
    return;
  }
  const x = origin?.x ?? window.innerWidth / 2;
  const y = origin?.y ?? window.innerHeight / 2;
  const transition = document.startViewTransition(swap);
  void transition.ready.then(() => {
    document.documentElement.animate(
      { clipPath: wipeFrames(x, y) },
      {
        duration: WIPE_MS,
        // Timing already comes from the acceleration baked into the frames.
        easing: 'linear',
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
