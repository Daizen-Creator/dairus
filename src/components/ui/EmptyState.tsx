interface EmptyStateProps {
  titulo: string;
  descricao: string;
  acao?: React.ReactNode;
}

export function EmptyState({ titulo, descricao, acao }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-borda bg-superficie px-6 py-12 text-center">
      <p className="text-sm font-semibold text-texto-primario">{titulo}</p>
      <p className="mt-1 max-w-sm text-sm text-texto-secundario">{descricao}</p>
      {acao && <div className="mt-4">{acao}</div>}
    </div>
  );
}
