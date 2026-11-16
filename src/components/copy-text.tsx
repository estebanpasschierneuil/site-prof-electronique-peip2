'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

/** Copie un texte préparé côté serveur (synthèse, lien). */
export function CopyText({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle');
  return (
    <button
      type="button"
      className="btn"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setState('done');
        } catch {
          setState('failed');
        }
        setTimeout(() => setState('idle'), 2500);
      }}
    >
      {state === 'done' ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
      {label}
      <span className="sr-only" role="status">
        {state === 'done' ? 'Copié dans le presse-papiers.' : state === 'failed' ? 'Copie impossible.' : ''}
      </span>
    </button>
  );
}
