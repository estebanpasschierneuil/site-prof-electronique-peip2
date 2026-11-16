'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';

/** Brouillon de retour à l'athlète : modifiable, puis copié vers la messagerie du coach. */
export function MessageDraft({ initial }: { initial: string }) {
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
      <label htmlFor="message" className="sr-only">
        Message à l’athlète
      </label>
      <textarea id="message" className="field min-h-72 resize-y leading-relaxed" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="mt-2 flex items-center gap-3">
        <button type="button" className="btn" onClick={copy}>
          {copied === 'done' ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
          Copier le message
        </button>
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
