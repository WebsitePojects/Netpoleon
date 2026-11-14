import type { CSSProperties } from 'react';
import { useCountUp } from '../lib/hooks.js';
import { order } from './ui.js';

export interface Slice {
  label: string;
  value: number;
  /** A CSS colour, normally a status token such as `var(--st-in_stock)`. */
  color: string;
}

function percent(value: number, total: number): string {
  return total === 0 ? '0%' : `${Math.round((value / total) * 100)}%`;
}

const RADIUS = 70;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** Gap between arcs, in the same units as the circumference. */
const ARC_GAP = 3;

/** Share-of-total donut with the total in the middle and a legend that states every number. */
export function Donut({ slices, centerLabel }: { slices: Slice[]; centerLabel: string }) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const shownTotal = useCountUp(total);
  let offset = 0;
  const summary = slices.map((slice) => `${slice.label} ${slice.value}`).join(', ');

  return (
    <div className="donut-wrap">
      <div className="donut" role="img" aria-label={`${centerLabel}: ${total}. ${summary}.`}>
        <svg viewBox="0 0 180 180">
          <circle cx="90" cy="90" r={RADIUS} stroke="var(--surface-2)" />
          {slices.map((slice, index) => {
            const length = total === 0 ? 0 : (slice.value / total) * CIRCUMFERENCE;
            const arc = (
              <circle
                key={slice.label}
                className="seg-arc"
                cx="90"
                cy="90"
                r={RADIUS}
                stroke={slice.color}
                strokeDasharray={`${Math.max(0, length - ARC_GAP)} ${CIRCUMFERENCE}`}
                strokeDashoffset={-offset}
                style={order(index)}
              >
                <title>{`${slice.label}: ${slice.value} (${percent(slice.value, total)})`}</title>
              </circle>
            );
            offset += length;
            return arc;
          })}
        </svg>
        <div className="donut-center">
          <strong className="num">{shownTotal}</strong>
          <span>{centerLabel}</span>
        </div>
      </div>
      <ul className="legend">
        {slices.map((slice) => (
          <li key={slice.label}>
            <i style={{ '--c': slice.color } as CSSProperties} />
            <span>{slice.label}</span>
            <b className="num">
              {slice.value} <span className="muted">({percent(slice.value, total)})</span>
            </b>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface BarSeries {
  key: string;
  label: string;
  color: string;
}

export interface BarGroup {
  label: string;
  values: Record<string, number>;
}

/** Rounds the axis top up to a tidy number so gridlines land on readable values. */
function niceCeiling(value: number): number {
  if (value <= 10) return 10;
  const magnitude = Math.pow(10, Math.floor(Math.log10(value)));
  const step = magnitude / 2;
  return Math.ceil(value / step) * step;
}

const GRIDLINES = 4;

export function GroupedBars({
  series,
  groups,
  label,
}: {
  series: BarSeries[];
  groups: BarGroup[];
  label: string;
}) {
  const peak = Math.max(
    1,
    ...groups.flatMap((group) => series.map((item) => group.values[item.key] ?? 0)),
  );
  const top = niceCeiling(peak);
  let barIndex = 0;

  return (
    <div className="bars">
      <div className="bars-legend">
        {series.map((item) => (
          <span key={item.key}>
            <i className="swatch" style={{ '--c': item.color } as CSSProperties} />
            {item.label}
          </span>
        ))}
      </div>
      <div className="bars-plot" role="img" aria-label={label}>
        <div className="bars-grid" aria-hidden="true">
          {Array.from({ length: GRIDLINES }, (_, index) => (
            <span key={index}>
              <b className="num">{Math.round(top - (top / GRIDLINES) * index)}</b>
            </span>
          ))}
        </div>
        {groups.map((group) => (
          <div key={group.label} className="bars-group">
            {series.map((item) => {
              const value = group.values[item.key] ?? 0;
              const style = {
                '--h': `${(value / top) * 100}%`,
                '--c': item.color,
                '--i': barIndex++,
              } as CSSProperties;
              return (
                <div
                  key={item.key}
                  className="bar"
                  style={style}
                  title={`${group.label} · ${item.label}: ${value}`}
                >
                  <span className="num">{value}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <div className="bars-x" aria-hidden="true">
        {groups.map((group) => (
          <span key={group.label}>{group.label}</span>
        ))}
      </div>
    </div>
  );
}

export function HBars({ rows }: { rows: { label: string; value: number; color?: string }[] }) {
  const peak = Math.max(1, ...rows.map((row) => row.value));
  return (
    <div className="hbars">
      {rows.map((row, index) => {
        const style = {
          '--w': `${(row.value / peak) * 100}%`,
          '--i': index,
          ...(row.color ? { '--c': row.color } : {}),
        } as CSSProperties;
        return (
          <div key={row.label} className="hbar">
            <span>{row.label}</span>
            <div className="hbar-track">
              <div className="hbar-fill" style={style} />
            </div>
            <b className="num">{row.value}</b>
          </div>
        );
      })}
    </div>
  );
}
