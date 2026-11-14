'use client';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="panel mx-auto mt-10 max-w-xl p-8 text-center" role="alert">
      <h1 className="text-xl">Cette page n’a pas pu être chargée</h1>
      <p className="mx-auto mt-2 max-w-sm text-ink-2">Les données n’ont pas été modifiées. Réessayez ; si le problème persiste, transmettez la référence ci-dessous au support.</p>
      {error.digest ? <p className="mt-2 text-sm text-ink-3">Référence : {error.digest}</p> : null}
      <button type="button" className="btn btn-primary mt-5" onClick={reset}>
        Réessayer
      </button>
    </div>
  );
}
