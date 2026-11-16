/** Graduations rondes couvrant [min, max]. */
export function niceTicks(min: number, max: number, target = 4): number[] {
  if (min === max) max = min + 1;
  const rough = (max - min) / target;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? 10 * magnitude;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.999; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return ticks;
}

export type ValueFormat = 'int' | 'signed' | 'one' | 'hours';

const nf0 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function formatValue(value: number, format: ValueFormat): string {
  if (format === 'one') return nf1.format(value);
  if (format === 'hours') return `${nf1.format(value)} h`;
  if (format === 'signed') {
    const rounded = Math.round(value);
    return rounded > 0 ? `+${nf0.format(rounded)}` : rounded < 0 ? `−${nf0.format(-rounded)}` : '0';
  }
  return nf0.format(value);
}

export function formatDayLabel(date: string, withWeekday = false): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'short', ...(withWeekday ? { weekday: 'short' } : {}) }).format(new Date(Date.UTC(y, m - 1, d)));
}
