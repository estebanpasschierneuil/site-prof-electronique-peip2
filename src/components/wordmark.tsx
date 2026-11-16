/** Le circonflexe d'« Affût » sert de marque : un chevron, comme une forme qui s'affûte. */
export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 font-semibold tracking-tight text-ink">
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
        <rect width="22" height="22" rx="5" fill="var(--accent)" />
        <path d="M5.5 14.5 11 7l5.5 7.5" fill="none" stroke="var(--on-accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {compact ? null : <span className="text-lg">Affût</span>}
    </span>
  );
}
