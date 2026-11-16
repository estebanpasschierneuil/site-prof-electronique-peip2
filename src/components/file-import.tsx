'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CircleCheck, TriangleAlert, Upload } from 'lucide-react';

interface Result {
  name: string;
  ok: boolean;
  message: string;
}

/** Dépôt de fichiers d'activité (FIT, TCX, GPX) : glisser-déposer ou sélection classique. */
export function FileImport({ athleteId }: { athleteId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Result[]>([]);

  const send = async (files: File[]) => {
    if (files.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    const form = new FormData();
    for (const file of files) form.append('files', file);
    try {
      const response = await fetch(`/api/athletes/${athleteId}/import`, { method: 'POST', body: form });
      const body = (await response.json()) as { files?: Result[]; error?: string };
      if (!response.ok) setError(body.error ?? 'L’import a échoué.');
      else {
        setResults(body.files ?? []);
        // Les analyses de l'athlète viennent d'être invalidées : on rafraîchit la page.
        router.refresh();
      }
    } catch {
      setError('Connexion interrompue pendant l’envoi. Réessayez.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const imported = results.filter((r) => r.ok).length;

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void send(Array.from(e.dataTransfer.files));
        }}
        className={`rounded-control border border-dashed p-5 text-center transition-colors duration-[var(--dur-micro)] ${over ? 'border-ink bg-sunken' : 'border-line-strong'}`}
        aria-busy={busy}
      >
        <p className="text-ink-2">{busy ? 'Lecture des fichiers…' : 'Glissez ici des fichiers FIT, TCX ou GPX'}</p>
        <label className={`btn mt-3 ${busy ? 'pointer-events-none opacity-50' : ''}`}>
          <Upload size={15} aria-hidden="true" />
          Choisir des fichiers
          <input ref={input} type="file" multiple accept=".fit,.tcx,.gpx" className="sr-only" disabled={busy} onChange={(e) => void send(Array.from(e.target.files ?? []))} />
        </label>
        <p className="mt-2 text-sm text-ink-3">Jusqu’à 40 fichiers par envoi. Un fichier déjà importé n’est jamais compté deux fois.</p>
      </div>
      <div role="status" aria-live="polite">
        {error ? <p className="mt-2 text-sm text-critical-ink">{error}</p> : null}
        {results.length > 0 ? (
          <>
            <p className="mt-3 text-sm font-medium">
              {imported} fichier{imported > 1 ? 's' : ''} importé{imported > 1 ? 's' : ''} sur {results.length}
            </p>
            <ul className="mt-1 max-h-56 divide-y divide-line overflow-auto border-y border-line text-sm">
              {results.map((r, i) => (
                <li key={`${r.name}-${i}`} className="flex items-start gap-2 py-1.5">
                  {r.ok ? <CircleCheck size={15} className="mt-0.5 shrink-0 text-good" aria-hidden="true" /> : <TriangleAlert size={15} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />}
                  <span className="min-w-0 break-words">
                    <span className="font-medium">{r.name}</span> <span className={r.ok ? 'text-ink-2' : 'text-warning-ink'}>{r.message}</span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </div>
  );
}
