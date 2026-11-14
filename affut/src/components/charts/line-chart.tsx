'use client';

import { useState } from 'react';
import { formatDayLabel, formatValue, niceTicks, type ValueFormat } from './scale';
import { useWidth } from './use-width';

export interface LineSeries {
  key: string;
  label: string;
  /** Jeton CSS de la série, par exemple `var(--fitness)`. */
  color: string;
  values: (number | null)[];
  area?: boolean;
}

interface Props {
  title: string;
  dates: string[];
  series: LineSeries[];
  format?: ValueFormat;
  height?: number;
  /** Bande de référence horizontale (plage habituelle, zone cible). */
  band?: { lo: number; hi: number; label: string };
  zeroLine?: boolean;
  /** Indice à partir duquel commence la semaine analysée. */
  focusFrom?: number;
  /** Une ligne du tableau de données tous les N points. */
  tableStep?: number;
}

const M = { top: 12, right: 56, bottom: 24, left: 36 };

/** Courbes temporelles : une seule échelle, réticule qui trouve la date, valeurs au survol et au clavier. */
export function LineChart({ title, dates, series, format = 'int', height = 200, band, zeroLine, focusFrom, tableStep = 7 }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const all = series.flatMap((s) => s.values).filter((v): v is number => v !== null);
  if (all.length < 2) return <p className="py-8 text-center text-sm text-ink-3">Pas assez de données pour tracer cette courbe.</p>;

  let lo = Math.min(...all, band?.lo ?? Infinity, zeroLine ? 0 : Infinity);
  let hi = Math.max(...all, band?.hi ?? -Infinity, zeroLine ? 0 : -Infinity);
  const pad = (hi - lo) * 0.08 || 1;
  lo -= pad;
  hi += pad;
  const ticks = niceTicks(lo, hi, 4).filter((t) => t >= lo && t <= hi);

  const plotW = width - M.left - M.right;
  const plotH = height - M.top - M.bottom;
  const n = dates.length;
  const x = (i: number) => M.left + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => M.top + plotH - ((v - lo) / (hi - lo)) * plotH;

  const pathFor = (values: (number | null)[]) => {
    let d = '';
    let pen = false;
    values.forEach((v, i) => {
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };

  const xTickEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(plotW / 90))));
  const xTicks = dates.map((_, i) => i).filter((i) => (n - 1 - i) % xTickEvery === 0);

  // Étiquettes de fin de courbe, écartées si elles se chevauchent.
  const ends = series
    .map((s) => {
      const index = s.values.findLastIndex((v) => v !== null);
      return index < 0 ? null : { s, index, value: s.values[index]!, labelY: y(s.values[index]!) };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null)
    .sort((a, b) => a.labelY - b.labelY);
  for (let i = 1; i < ends.length; i++) if (ends[i].labelY - ends[i - 1].labelY < 14) ends[i].labelY = ends[i - 1].labelY + 14;

  const onMove = (event: React.PointerEvent<SVGRectElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - box.left) / box.width;
    setActive(Math.min(n - 1, Math.max(0, Math.round(ratio * (n - 1)))));
  };
  const onKey = (event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    setActive((current) => Math.min(n - 1, Math.max(0, (current ?? n - 1) + (event.key === 'ArrowLeft' ? -1 : 1))));
  };

  const tipLeft = active === null ? 0 : x(active);
  const flip = tipLeft > width * 0.6;

  return (
    <figure className="m-0">
      {series.length > 1 ? (
        <ul className="mb-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-2">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 rounded-full" style={{ background: s.color }} aria-hidden="true" />
              {s.label}
            </li>
          ))}
        </ul>
      ) : null}
      <div ref={ref} className="relative" tabIndex={0} role="group" aria-label={`${title}. Flèches gauche et droite pour parcourir les valeurs.`} onKeyDown={onKey} onBlur={() => setActive(null)}>
        <svg width={width} height={height} className="block" aria-hidden="true">
          {band ? <rect x={M.left} y={y(band.hi)} width={plotW} height={Math.max(0, y(band.lo) - y(band.hi))} fill="var(--band)" /> : null}
          {focusFrom !== undefined && focusFrom < n ? <rect x={x(focusFrom)} y={M.top} width={Math.max(0, x(n - 1) - x(focusFrom))} height={plotH} fill="var(--sunken)" /> : null}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={M.left + plotW} y1={y(t)} y2={y(t)} stroke={zeroLine && t === 0 ? 'var(--line-strong)' : 'var(--line)'} strokeWidth={1} />
              <text x={M.left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--axis)" className="tnum">
                {formatValue(t, format)}
              </text>
            </g>
          ))}
          {xTicks.map((i) => (
            <text key={i} x={x(i)} y={height - 6} textAnchor={i === n - 1 ? 'end' : 'middle'} fontSize={11} fill="var(--axis)">
              {formatDayLabel(dates[i])}
            </text>
          ))}
          {band ? (
            <text x={M.left + 4} y={y(band.hi) + 11} fontSize={11} fill="var(--ink-3)">
              {band.label}
            </text>
          ) : null}
          {series.map((s) =>
            s.area ? <path key={`${s.key}-area`} d={`${pathFor(s.values)}L${x(s.values.findLastIndex((v) => v !== null)).toFixed(1)} ${y(zeroLine ? 0 : lo)}L${x(s.values.findIndex((v) => v !== null)).toFixed(1)} ${y(zeroLine ? 0 : lo)}Z`} fill={s.color} opacity={0.1} /> : null,
          )}
          {series.map((s) => (
            <path key={s.key} d={pathFor(s.values)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {ends.map((e) => (
            <g key={e.s.key}>
              <circle cx={x(e.index)} cy={y(e.value)} r={4} fill={e.s.color} stroke="var(--surface)" strokeWidth={2} />
              <text x={x(e.index) + 9} y={e.labelY} dy="0.32em" fontSize={12} fontWeight={600} fill="var(--ink)" className="tnum">
                {formatValue(e.value, format)}
              </text>
            </g>
          ))}
          {active !== null ? (
            <g>
              <line x1={x(active)} x2={x(active)} y1={M.top} y2={M.top + plotH} stroke="var(--ink-3)" strokeWidth={1} />
              {series.map((s) => (s.values[active] === null ? null : <circle key={s.key} cx={x(active)} cy={y(s.values[active]!)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />))}
            </g>
          ) : null}
          <rect x={M.left} y={M.top} width={plotW} height={plotH} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setActive(null)} />
        </svg>
        {active !== null ? (
          <div className="pointer-events-none absolute top-1 z-10 min-w-36 rounded-control border border-line bg-surface px-2.5 py-1.5 text-sm shadow-sm" style={flip ? { right: width - tipLeft + 10 } : { left: tipLeft + 10 }} role="status">
            <div className="mb-0.5 text-ink-3">{formatDayLabel(dates[active], true)}</div>
            {series.map((s) => (
              <div key={s.key} className="flex items-center gap-2">
                <span className="inline-block h-0.5 w-3 rounded-full" style={{ background: s.color }} aria-hidden="true" />
                <span className="font-semibold tnum">{s.values[active] === null ? '–' : formatValue(s.values[active]!, format)}</span>
                <span className="text-ink-2">{s.label}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <details className="mt-1 text-sm">
        <summary className="cursor-pointer text-ink-3 hover:text-ink">Voir les données</summary>
        <div className="mt-2 max-h-56 overflow-auto">
          <table className="w-full text-left tnum">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr className="border-b border-line text-ink-3">
                <th scope="col" className="py-1 pr-3 font-medium">Date</th>
                {series.map((s) => (
                  <th key={s.key} scope="col" className="py-1 pr-3 text-right font-medium">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dates
                .map((d, i) => ({ d, i }))
                .filter(({ i }) => (n - 1 - i) % tableStep === 0)
                .map(({ d, i }) => (
                  <tr key={d} className="border-b border-line last:border-0">
                    <th scope="row" className="py-1 pr-3 font-normal">{formatDayLabel(d)}</th>
                    {series.map((s) => (
                      <td key={s.key} className="py-1 pr-3 text-right">
                        {s.values[i] === null ? '–' : formatValue(s.values[i]!, format)}
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
