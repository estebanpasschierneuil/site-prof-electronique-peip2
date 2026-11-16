import { formatInt } from '@/core/format';
import type { Sport, SportTotals } from '@/core/types';
import { SPORT_VAR } from '../sport';

const ORDER: Sport[] = ['swim', 'bike', 'run', 'strength', 'other'];

/**
 * Charge réalisée, découpée par sport, rapportée à la charge prévue.
 * La piste représente le prévu ; un repère le marque quand le réalisé le dépasse.
 */
export function LoadBar({ bySport, done, planned }: { bySport: Record<Sport, SportTotals>; done: number; planned: number }) {
  const scale = Math.max(done, planned, 1);
  const parts = ORDER.map((s) => ({ sport: s, load: bySport[s].load })).filter((p) => p.load > 0);
  return (
    <div className="relative h-1.5 w-full rounded-full bg-sunken" role="img" aria-label={`${formatInt(done)} points de charge réalisés${planned ? ` sur ${formatInt(planned)} prévus` : ''}`}>
      <div className="flex h-full gap-0.5 overflow-hidden rounded-full" style={{ width: `${(done / scale) * 100}%` }}>
        {parts.map((p) => (
          <span key={p.sport} className="h-full" style={{ flexGrow: p.load, flexBasis: 0, background: SPORT_VAR[p.sport] }} />
        ))}
      </div>
      {planned > 0 && done > planned ? <span className="absolute -top-0.5 h-2.5 w-0.5 bg-ink" style={{ left: `${(planned / scale) * 100}%` }} /> : null}
    </div>
  );
}

/** Tendance de charge sur les dernières semaines ; la semaine analysée est mise en avant. */
export function Sparkbars({ values, label }: { values: number[]; label: string }) {
  const max = Math.max(...values, 1);
  const width = 6;
  const gap = 2;
  const height = 26;
  return (
    <svg width={values.length * (width + gap) - gap} height={height} role="img" aria-label={label} className="block">
      {values.map((v, i) => {
        const h = Math.max(1.5, (v / max) * height);
        return <rect key={i} x={i * (width + gap)} y={height - h} width={width} height={h} rx={1.5} fill={i === values.length - 1 ? 'var(--ink)' : 'var(--line-strong)'} />;
      })}
    </svg>
  );
}

/** Jauge 0–100 : la couleur porte la sévérité, la piste reste neutre. */
export function Meter({ value, label }: { value: number; label: string }) {
  const tone = value < 45 ? 'var(--critical)' : value < 65 ? 'var(--warning)' : 'var(--good)';
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-sunken" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} aria-label={label}>
      <div className="h-full rounded-full" style={{ width: `${Math.max(3, value)}%`, background: tone }} />
    </div>
  );
}

/** Série brute en trait fin, sans axe : pour accompagner un chiffre. */
export function Sparkline({ values, label, width = 96, height = 28, band }: { values: (number | null)[]; label: string; width?: number; height?: number; band?: [number, number] }) {
  const present = values.filter((v): v is number => v !== null);
  if (present.length < 2) return null;
  const lo = Math.min(...present, band?.[0] ?? Infinity);
  const hi = Math.max(...present, band?.[1] ?? -Infinity);
  const span = hi - lo || 1;
  const x = (i: number) => (i / (values.length - 1)) * (width - 4) + 2;
  const y = (v: number) => height - 3 - ((v - lo) / span) * (height - 6);
  let path = '';
  let pen = false;
  values.forEach((v, i) => {
    if (v === null) {
      pen = false;
      return;
    }
    path += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`;
    pen = true;
  });
  const lastIndex = values.findLastIndex((v) => v !== null);
  return (
    <svg width={width} height={height} role="img" aria-label={label} className="block">
      {band ? <rect x={0} y={y(band[1])} width={width} height={Math.max(1, y(band[0]) - y(band[1]))} fill="var(--band)" rx={2} /> : null}
      <path d={path} fill="none" stroke="var(--ink-2)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(lastIndex)} cy={y(values[lastIndex]!)} r={3} fill="var(--ink)" stroke="var(--surface)" strokeWidth={1.5} />
    </svg>
  );
}
