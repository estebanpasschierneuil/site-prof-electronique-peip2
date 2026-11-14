'use client';

import { useState } from 'react';
import { formatDayLabel, formatValue, niceTicks } from './scale';
import { useWidth } from './use-width';

export interface WeekBar {
  weekStart: string;
  weekNumber: number;
  planned: number;
  swim: number;
  bike: number;
  run: number;
  other: number;
}

const PARTS = [
  { key: 'swim', label: 'Natation', color: 'var(--swim)' },
  { key: 'bike', label: 'Vélo', color: 'var(--bike)' },
  { key: 'run', label: 'Course', color: 'var(--run)' },
  { key: 'other', label: 'Autre', color: 'var(--other)' },
] as const;

const M = { top: 10, right: 8, bottom: 24, left: 36 };
const GAP = 2;

/** Charge hebdomadaire empilée par sport, avec le prévu en repère. */
export function WeeklyLoadChart({ weeks, height = 220 }: { weeks: WeekBar[]; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const totals = weeks.map((w) => w.swim + w.bike + w.run + w.other);
  const max = Math.max(...totals, ...weeks.map((w) => w.planned), 1);
  const ticks = niceTicks(0, max, 4);
  const top = ticks[ticks.length - 1];
  const plotW = width - M.left - M.right;
  const plotH = height - M.top - M.bottom;
  const slot = plotW / weeks.length;
  const barW = Math.min(24, slot * 0.6);
  const y = (v: number) => M.top + plotH - (v / top) * plotH;
  const usedParts = PARTS.filter((p) => weeks.some((w) => w[p.key] > 0));

  const onKey = (event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    setActive((current) => Math.min(weeks.length - 1, Math.max(0, (current ?? weeks.length - 1) + (event.key === 'ArrowLeft' ? -1 : 1))));
  };

  const tipX = active === null ? 0 : M.left + slot * active + slot / 2;
  const flip = tipX > width * 0.6;

  return (
    <figure className="m-0">
      <ul className="mb-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-2">
        {usedParts.map((p) => (
          <li key={p.key} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: p.color }} aria-hidden="true" />
            {p.label}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 bg-ink" aria-hidden="true" />
          Prévu
        </li>
      </ul>
      <div ref={ref} className="relative" tabIndex={0} role="group" aria-label="Charge hebdomadaire par sport sur 12 semaines. Flèches gauche et droite pour parcourir les semaines." onKeyDown={onKey} onBlur={() => setActive(null)}>
        <svg width={width} height={height} className="block" aria-hidden="true">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={M.left + plotW} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--line-strong)' : 'var(--line)'} strokeWidth={1} />
              <text x={M.left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--axis)" className="tnum">
                {formatValue(t, 'int')}
              </text>
            </g>
          ))}
          {weeks.map((w, i) => {
            const cx = M.left + slot * i + slot / 2;
            const isLast = i === weeks.length - 1;
            let acc = 0;
            const segments = PARTS.filter((p) => w[p.key] > 0);
            return (
              <g key={w.weekStart} opacity={active === null || active === i ? 1 : 0.55}>
                {isLast ? <rect x={cx - slot / 2 + 2} y={M.top} width={slot - 4} height={plotH} fill="var(--sunken)" rx={4} /> : null}
                {segments.map((p, index) => {
                  const y1 = y(acc + w[p.key]);
                  const y0 = y(acc);
                  acc += w[p.key];
                  const h = Math.max(0, y0 - y1 - (index === segments.length - 1 ? 0 : GAP));
                  const isTop = index === segments.length - 1;
                  // Extrémité arrondie côté valeur, base droite sur l'axe.
                  const r = isTop ? Math.min(4, h) : 0;
                  const x0 = cx - barW / 2;
                  const yTop = y0 - h;
                  return <path key={p.key} d={`M${x0} ${y0}V${yTop + r}Q${x0} ${yTop} ${x0 + r} ${yTop}H${x0 + barW - r}Q${x0 + barW} ${yTop} ${x0 + barW} ${yTop + r}V${y0}Z`} fill={p.color} />;
                })}
                {w.planned > 0 ? <line x1={cx - barW / 2 - 4} x2={cx + barW / 2 + 4} y1={y(w.planned)} y2={y(w.planned)} stroke="var(--ink)" strokeWidth={2} strokeLinecap="round" /> : null}
                <text x={cx} y={height - 6} textAnchor="middle" fontSize={11} fontWeight={isLast ? 600 : 400} fill={isLast ? 'var(--ink)' : 'var(--axis)'} className="tnum">
                  S{w.weekNumber}
                </text>
                <rect x={cx - slot / 2} y={M.top} width={slot} height={plotH} fill="transparent" onPointerEnter={() => setActive(i)} onPointerLeave={() => setActive(null)} />
              </g>
            );
          })}
        </svg>
        {active !== null ? (
          <div className="pointer-events-none absolute top-1 z-10 min-w-40 rounded-control border border-line bg-surface px-2.5 py-1.5 text-sm shadow-sm" style={flip ? { right: width - tipX + barW } : { left: tipX + barW }} role="status">
            <div className="mb-0.5 text-ink-3">
              Semaine {weeks[active].weekNumber}, à partir du {formatDayLabel(weeks[active].weekStart)}
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-semibold tnum">{formatValue(totals[active], 'int')}</span>
              <span className="text-ink-2">réalisés{weeks[active].planned > 0 ? `, ${formatValue(weeks[active].planned, 'int')} prévus` : ''}</span>
            </div>
            {usedParts.map((p) => (
              <div key={p.key} className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-[2px]" style={{ background: p.color }} aria-hidden="true" />
                <span className="font-semibold tnum">{formatValue(weeks[active][p.key], 'int')}</span>
                <span className="text-ink-2">{p.label}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <details className="mt-1 text-sm">
        <summary className="cursor-pointer text-ink-3 hover:text-ink">Voir les données</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left tnum">
            <caption className="sr-only">Charge hebdomadaire par sport</caption>
            <thead>
              <tr className="border-b border-line text-ink-3">
                <th scope="col" className="py-1 pr-3 font-medium">Semaine</th>
                {usedParts.map((p) => (
                  <th key={p.key} scope="col" className="py-1 pr-3 text-right font-medium">{p.label}</th>
                ))}
                <th scope="col" className="py-1 pr-3 text-right font-medium">Total</th>
                <th scope="col" className="py-1 text-right font-medium">Prévu</th>
              </tr>
            </thead>
            <tbody>
              {weeks.map((w, i) => (
                <tr key={w.weekStart} className="border-b border-line last:border-0">
                  <th scope="row" className="py-1 pr-3 font-normal">S{w.weekNumber}, {formatDayLabel(w.weekStart)}</th>
                  {usedParts.map((p) => (
                    <td key={p.key} className="py-1 pr-3 text-right">{formatValue(w[p.key], 'int')}</td>
                  ))}
                  <td className="py-1 pr-3 text-right font-medium">{formatValue(totals[i], 'int')}</td>
                  <td className="py-1 text-right">{w.planned ? formatValue(w.planned, 'int') : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
