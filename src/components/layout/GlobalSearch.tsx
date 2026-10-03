import { useEffect, useState } from "react";
import { Command } from "cmdk";
import { useNavigate } from "react-router-dom";
import { CalendarClock, CreditCard, FileText, Landmark, Palette, Radar, Receipt, Search, Target } from "lucide-react";
import { IconeCoisa } from "../ui/IconeCoisa";
import { NAVEGACAO } from "../../app/navegacao";
import { contabilidade } from "../../services/contabilidade";
import { extras } from "../../services/extras";
import { formatarCentavos, formatarDataISOParaBR } from "../../services/formato";
import type { Agendamento, Conta, Lancamento } from "../../types/accounting";
import type { ItemRadar, Meta } from "../../types/extras";
import { documentos as servicoDocumentos, type Documento } from "../../services/documentos";

interface GlobalSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Dados {
  contas: Conta[];
  lancamentos: Lancamento[];
  agendamentos: Agendamento[];
  metas: Meta[];
  radar: ItemRadar[];
  documentos: Documento[];
}

const VAZIO: Dados = { contas: [], lancamentos: [], agendamentos: [], metas: [], radar: [], documentos: [] };

const ESTILO_GRUPO = "px-2 py-1 text-xs text-texto-secundario [&_[cmdk-group-heading]]:px-1 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-semibold";
const ESTILO_ITEM =
  "flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm text-texto-primario data-[selected=true]:bg-primaria data-[selected=true]:text-primaria-texto";

/** Busca global (Ctrl+K): telas do app, contas e cartões, lançamentos, contas a pagar,
 * metas e produtos do radar. Recarrega os dados a cada abertura. */
export function GlobalSearch({ open, onOpenChange }: GlobalSearchProps) {
  const [dados, setDados] = useState<Dados>(VAZIO);
  const navegar = useNavigate();

  useEffect(() => {
    if (!open) return;
    Promise.all([
      contabilidade.listarContas(),
      contabilidade.listarLancamentos(500),
      contabilidade.listarAgendamentos(),
      extras.listarMetas(),
      extras.listarRadar(),
      servicoDocumentos.listar().catch(() => [] as Documento[]),
    ])
      .then(([contas, lancamentos, agendamentos, metas, radar, documentos]) => setDados({ contas, lancamentos, agendamentos, metas, radar, documentos }))
      .catch(() => setDados(VAZIO));
  }, [open]);

  function irPara(rota: string) {
    navegar(rota);
    onOpenChange(false);
  }

  if (!open) return null;

  const contasVisiveis = dados.contas.filter((c) => c.subtipo !== "CATEGORIA" && c.ativa && (c.tipo === "ATIVO" || c.tipo === "PASSIVO"));
  const abertos = dados.agendamentos.filter((a) => !a.pago_em && a.tipo !== "RECEBER");

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-24" onClick={() => onOpenChange(false)}>
      <Command
        shouldFilter
        loop
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && onOpenChange(false)}
        className="w-full max-w-lg overflow-hidden rounded-xl border border-borda bg-cartao shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-borda px-3">
          <Search size={16} className="text-texto-secundario" />
          <Command.Input
            autoFocus
            placeholder="Buscar telas, contas, lançamentos, metas…"
            className="h-11 flex-1 bg-transparent text-sm text-texto-primario outline-none placeholder:text-texto-secundario"
          />
        </div>
        <Command.List className="max-h-96 overflow-y-auto p-2">
          <Command.Empty className="px-3 py-6 text-center text-sm text-texto-secundario">Nada encontrado.</Command.Empty>

          <Command.Group heading="Ir para" className={ESTILO_GRUPO}>
            {[...NAVEGACAO, { rota: "/temas", rotulo: "Temas", icone: Palette }].map((item) => (
              <Command.Item key={item.rota} value={`tela ${item.rotulo}`} onSelect={() => irPara(item.rota)} className={ESTILO_ITEM}>
                <span className="flex items-center gap-2">
                  <item.icone size={14} />
                  {item.rotulo}
                </span>
              </Command.Item>
            ))}
          </Command.Group>

          {contasVisiveis.length > 0 && (
            <Command.Group heading="Contas e cartões" className={ESTILO_GRUPO}>
              {contasVisiveis.map((conta) => (
                <Command.Item key={conta.id} value={`conta ${conta.nome} ${conta.instituicao ?? ""}`} onSelect={() => irPara(conta.tipo === "PASSIVO" ? "/cartoes" : "/contas-bancarias")} className={ESTILO_ITEM}>
                  <span className="flex items-center gap-2">
                    <IconeCoisa nome={conta.nome} tamanho={22} padrao={conta.tipo === "PASSIVO" ? { icone: CreditCard, cor: "#f43f5e" } : { icone: Landmark, cor: "#1677ff" }} />
                    {conta.nome}
                  </span>
                  <span className="tabular-nums text-xs opacity-80">{formatarCentavos(conta.saldo_atual_centavos)}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {abertos.length > 0 && (
            <Command.Group heading="Contas a pagar" className={ESTILO_GRUPO}>
              {abertos.map((a) => (
                <Command.Item key={a.id} value={`pagar ${a.descricao}`} onSelect={() => irPara("/lancamentos")} className={ESTILO_ITEM}>
                  <span className="flex items-center gap-2">
                    <IconeCoisa nome={a.descricao} tamanho={22} padrao={{ icone: CalendarClock, cor: "#f59e0b" }} />
                    {a.descricao}
                  </span>
                  <span className="text-xs opacity-80">
                    {formatarCentavos(a.valor_centavos)} · {formatarDataISOParaBR(a.vencimento).slice(0, 5)}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {dados.metas.length > 0 && (
            <Command.Group heading="Metas" className={ESTILO_GRUPO}>
              {dados.metas.map((m) => (
                <Command.Item key={m.id} value={`meta ${m.nome}`} onSelect={() => irPara("/metas")} className={ESTILO_ITEM}>
                  <span className="flex items-center gap-2">
                    <Target size={14} />
                    {m.nome}
                  </span>
                  <span className="text-xs opacity-80">{Math.min(100, Math.round((m.guardado_centavos / m.valor_alvo_centavos) * 100))}%</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {dados.documentos.length > 0 && (
            <Command.Group heading="Garantias e documentos" className={ESTILO_GRUPO}>
              {dados.documentos.filter((d) => !d.arquivado).map((d) => (
                <Command.Item key={d.id} value={`documento garantia ${d.titulo} ${d.loja ?? ""} ${d.numero ?? ""}`} onSelect={() => irPara("/documentos")} className={ESTILO_ITEM}>
                  <span className="flex items-center gap-2">
                    <FileText size={14} />
                    {d.titulo}
                  </span>
                  {d.vencimento && <span className="text-xs opacity-80">{formatarDataISOParaBR(d.vencimento)}</span>}
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {dados.radar.length > 0 && (
            <Command.Group heading="Radar de compras" className={ESTILO_GRUPO}>
              {dados.radar.map((i) => (
                <Command.Item key={i.id} value={`radar ${i.nome}`} onSelect={() => irPara("/radar")} className={ESTILO_ITEM}>
                  <span className="flex items-center gap-2">
                    <Radar size={14} />
                    {i.nome}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {dados.lancamentos.length > 0 && (
            <Command.Group heading="Lançamentos" className={ESTILO_GRUPO}>
              {dados.lancamentos.slice(0, 80).map((l) => (
                <Command.Item key={l.id} value={`lancamento ${l.descricao} ${l.data} ${l.id}`} onSelect={() => irPara("/lancamentos")} className={ESTILO_ITEM}>
                  <span className="flex min-w-0 items-center gap-2">
                    <IconeCoisa nome={l.descricao} tamanho={22} padrao={{ icone: Receipt, cor: "#71717a" }} />
                    <span className="truncate">{l.descricao}</span>
                  </span>
                  <span className="shrink-0 text-xs opacity-80">{formatarDataISOParaBR(l.data)}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}
        </Command.List>
      </Command>
    </div>
  );
}
