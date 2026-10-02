interface SkeletonProps {
  className?: string;
}

/** Placeholder de carregamento. Substitui "Carregando…" como texto solto —
 * o formato final já aparece (cartões, linhas), só sem conteúdo ainda. */
export function Skeleton({ className }: SkeletonProps) {
  return <div className={`animate-pulse rounded-md bg-borda/60 ${className ?? ""}`} />;
}

export function SkeletonStatCards({ quantidade = 4 }: { quantidade?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: quantidade }).map((_, i) => (
        <div key={i} className="rounded-xl border border-borda bg-cartao p-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-3 h-7 w-32" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonLinhas({ quantidade = 4 }: { quantidade?: number }) {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: quantidade }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-3">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
