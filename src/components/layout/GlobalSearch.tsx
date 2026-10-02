import { useEffect, useState } from "react";
import { Command } from "cmdk";
import { useNavigate } from "react-router-dom";
import { Landmark, CreditCard, Receipt, Search } from "lucide-react";
import { IconeCoisa } from "../ui/IconeCoisa";
import { contabilidade } from "../../services/contabilidade";
import { formatarCentavos } from "../../services/formato";
import type { Conta, Lancamento } from "../../types/accounting";

interface GlobalSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Busca global (Ctrl+K). Procura em contas/cartões e lançamentos já
 * carregados do banco — nada de resultados inventados. */
export function GlobalSearch({ open, onOpenChange }: GlobalSearchProps) {
  const [contas, setContas] = useState<Conta[]>([]);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [carregado, setCarregado] = useState(false);
  const navegar = useNavigate();

  useEffect(() => {
    if (open && !carregado) {
      Promise.all([contabilidade.listarContas(), contabilidade.listarLancamentos(200)]).then(
        ([c, l]) => {
          setContas(c);
          setLancamentos(l);
          setCarregado(true);
        },
      );
    }
  }, [open, carregado]);

  function irPara(rota: string) {
    navegar(rota);
    onOpenChange(false);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-24"
      onClick={() => onOpenChange(false)}
    >
      <Command
        shouldFilter={true}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg overflow-hidden rounded-xl border border-borda bg-cartao shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b border-borda px-3">
          <Search size={16} className="text-texto-secundario" />
          <Command.Input
            autoFocus
            placeholder="Buscar contas, cartões, lançamentos…"
            className="h-11 flex-1 bg-transparent text-sm text-texto-primario outline-none placeholder:text-texto-secundario"
          />
        </div>
        <Command.List className="max-h-80 overflow-y-auto p-2">
          <Command.Empty className="px-3 py-6 text-center text-sm text-texto-secundario">
            Nada encontrado.
          </Command.Empty>

          {contas.filter((c) => c.subtipo !== "CATEGORIA").length > 0 && (
            <Command.Group heading="Contas e cartões" className="px-2 py-1 text-xs text-texto-secundario">
              {contas
                .filter((c) => c.subtipo !== "CATEGORIA")
                .map((conta) => (
                  <Command.Item
                    key={conta.id}
                    value={conta.nome}
                    onSelect={() => irPara(conta.tipo === "PASSIVO" ? "/cartoes" : "/contas-bancarias")}
                    className="flex cursor-pointer items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm text-texto-primario data-[selected=true]:bg-primaria data-[selected=true]:text-primaria-texto"
                  >
                    <span className="flex items-center gap-2">
                      <IconeCoisa
                        nome={conta.nome}
                        tamanho={22}
                        padrao={conta.tipo === "PASSIVO" ? { icone: CreditCard, cor: "#f43f5e" } : { icone: Landmark, cor: "#1677ff" }}
                      />
                      {conta.nome}
                    </span>
                    <span className="tabular-nums text-xs opacity-80">
                      {formatarCentavos(conta.saldo_atual_centavos)}
                    </span>
                  </Command.Item>
                ))}
            </Command.Group>
          )}

          {lancamentos.length > 0 && (
            <Command.Group heading="Lançamentos" className="px-2 py-1 text-xs text-texto-secundario">
              {lancamentos.slice(0, 50).map((l) => (
                <Command.Item
                  key={l.id}
                  value={l.descricao}
                  onSelect={() => irPara("/lancamentos")}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-texto-primario data-[selected=true]:bg-primaria data-[selected=true]:text-primaria-texto"
                >
                  <IconeCoisa nome={l.descricao} tamanho={22} padrao={{ icone: Receipt, cor: "#71717a" }} />
                  {l.descricao}
                </Command.Item>
              ))}
            </Command.Group>
          )}
        </Command.List>
      </Command>
    </div>
  );
}
