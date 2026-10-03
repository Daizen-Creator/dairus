import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Circle, GraduationCap, X } from "lucide-react";
import { contabilidade } from "../../services/contabilidade";
import { extras } from "../../services/extras";
import { lerPreferencia } from "../../services/armazenamento";
import { primeirosPassos, type Passo } from "../../services/ajuda";
import { usePreferencia } from "../../state/usePreferencia";
import { useAoAlterarDados } from "../../state/useAoAlterarDados";

export async function carregarPassos(): Promise<Passo[]> {
  const [contas, lancamentos, agendamentos, orcamentos, metas, backupAuto, chave] = await Promise.all([
    contabilidade.listarContas(),
    contabilidade.listarLancamentos(1),
    contabilidade.listarAgendamentos(),
    extras.listarOrcamentos(),
    extras.listarMetas(),
    lerPreferencia<boolean>("backup_auto"),
    lerPreferencia<string>("gemini_chave"),
  ]);
  return primeirosPassos({ contas, lancamentos: lancamentos.length, agendamentos: agendamentos.length, orcamentos: orcamentos.length, metas: metas.length, backupAuto: !!backupAuto, chaveIA: !!chave });
}

/** Lista dos primeiros passos. `compacto` = cartão do Início (some quando tudo estiver feito ou for dispensado). */
export function PrimeirosPassos({ compacto = false }: { compacto?: boolean }) {
  const [passos, setPassos] = useState<Passo[] | null>(null);
  const [oculto, setOculto] = usePreferencia<boolean>("primeiros_passos_ocultos", false);
  const carregar = () => carregarPassos().then(setPassos).catch(() => setPassos([]));
  useEffect(() => {
    carregar();
  }, []);
  useAoAlterarDados(carregar);

  if (!passos) return null;
  const feitos = passos.filter((p) => p.feito).length;
  if (compacto && (oculto || feitos === passos.length)) return null;
  return (
    <section className="rounded-2xl border border-borda bg-cartao p-4">
      <div className="flex items-start justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-texto-primario"><GraduationCap size={16} className="text-primaria" /> Primeiros passos · {feitos} de {passos.length}</h2>
        {compacto && <button onClick={() => setOculto(true)} aria-label="Dispensar primeiros passos" className="text-texto-secundario hover:text-texto-primario"><X size={14} /></button>}
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-borda"><div className="h-full bg-primaria" style={{ width: `${(feitos / passos.length) * 100}%` }} /></div>
      <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
        {passos.map((p) => (
          <li key={p.id}>
            <Link to={p.rota} className={`flex items-center gap-2 rounded-lg px-2 py-1 text-sm hover:bg-primaria/10 ${p.feito ? "text-texto-secundario line-through" : "text-texto-primario"}`}>
              {p.feito ? <CheckCircle2 size={15} className="shrink-0 text-sucesso" /> : <Circle size={15} className="shrink-0 text-texto-secundario" />}
              {p.titulo}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
