'use client';

import { useState } from 'react';
import { Check, Copy, Mail } from 'lucide-react';

/** Brouillon de retour à l'athlète : modifiable, puis copié ou ouvert dans la messagerie du coach. */
export function MessageDraft({ initial, id = 'message', email, subject, compact = false }: { initial: string; id?: string; email?: string | null; subject?: string; compact?: boolean }) {
  const [text, setText] = useState(initial);
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied('done');
    } catch {
      setCopied('failed');
    }
    setTimeout(() => setCopied('idle'), 2500);
  };

  return (
    <div>
      <label htmlFor={id} className="sr-only">
        Message à l’athlète
      </label>
      <textarea id={id} className={`field resize-y leading-relaxed ${compact ? 'min-h-44' : 'min-h-72'}`} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" className="btn" onClick={copy}>
          {copied === 'done' ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
          Copier le message
        </button>
        {email ? (
          <a className="btn" href={`mailto:${email}?subject=${encodeURIComponent(subject ?? '')}&body=${encodeURIComponent(text)}`}>
            <Mail size={15} aria-hidden="true" />
            Ouvrir dans la messagerie
          </a>
        ) : null}
        {text !== initial ? (
          <button type="button" className="btn btn-quiet" onClick={() => setText(initial)}>
            Rétablir le brouillon
          </button>
        ) : null}
        <span className="text-sm text-ink-3" role="status">
          {copied === 'done' ? 'Copié dans le presse-papiers.' : copied === 'failed' ? 'Copie impossible : sélectionnez le texte à la main.' : ''}
        </span>
      </div>
    </div>
  );
}
