/** Squelette à la forme de ce qui arrive : un titre, une barre de filtres, des lignes. */
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Chargement">
      <div className="skeleton h-9 w-80 max-w-full" />
      <div className="skeleton h-9 w-full" />
      <div className="panel divide-y divide-line">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex gap-4 p-4">
            <div className="skeleton h-10 w-40" />
            <div className="skeleton h-10 flex-1" />
            <div className="skeleton h-10 w-32" />
          </div>
        ))}
      </div>
    </div>
  );
}
