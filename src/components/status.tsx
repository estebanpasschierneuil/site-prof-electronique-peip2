import { CircleCheck, Info, OctagonAlert, TrendingUp, TriangleAlert } from 'lucide-react';
import type { Severity, WeekStatus } from '@/core/types';

export const STATUS_LABEL: Record<WeekStatus, string> = { action: 'Action requise', watch: 'À surveiller', ok: 'Sur les rails' };

const STATUS_STYLE: Record<WeekStatus, string> = {
  action: 'bg-critical-soft text-critical-ink',
  watch: 'bg-warning-soft text-warning-ink',
  ok: 'bg-good-soft text-good-ink',
};

export function StatusIcon({ status, size = 16 }: { status: WeekStatus; size?: number }) {
  const Icon = status === 'action' ? OctagonAlert : status === 'watch' ? TriangleAlert : CircleCheck;
  const tone = status === 'action' ? 'text-critical' : status === 'watch' ? 'text-warning' : 'text-good';
  return <Icon size={size} className={`shrink-0 ${tone}`} aria-hidden="true" />;
}

/** Un état n'est jamais porté par la couleur seule : icône et libellé l'accompagnent. */
export function StatusBadge({ status }: { status: WeekStatus }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-control px-2 py-0.5 text-sm font-medium ${STATUS_STYLE[status]}`}>
      <StatusIcon status={status} size={14} />
      {STATUS_LABEL[status]}
    </span>
  );
}

const SEVERITY_LABEL: Record<Severity, string> = { critical: 'Critique', warning: 'À surveiller', positive: 'Positif', info: 'Information' };

export function SeverityIcon({ severity, size = 16 }: { severity: Severity; size?: number }) {
  const Icon = severity === 'critical' ? OctagonAlert : severity === 'warning' ? TriangleAlert : severity === 'positive' ? TrendingUp : Info;
  const tone = severity === 'critical' ? 'text-critical' : severity === 'warning' ? 'text-warning' : severity === 'positive' ? 'text-good' : 'text-ink-3';
  return <Icon size={size} className={`mt-0.5 shrink-0 ${tone}`} role="img" aria-label={SEVERITY_LABEL[severity]} />;
}
