import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Secao } from "../../components/ui/Campos";
import { Select } from "../../components/ui/Select";
import { Skeleton } from "../../components/ui/Skeleton";
import { contabilidade } from "../../services/contabilidade";
import { dataAtualISO, formatarCentavos, formatarDataISOParaBR } from "../../services/formato";
import { balancete, razaoDaConta, resultadoPorTipo } from "../../services/relatorios";
import { calcularPeriodo, SeletorPeriodo, type Periodo } from "../dashboard/SeletorPeriodo";
import type { Conta, Lancamento } from "../../types/accounting";

type Aba = "balancete" | "balanco" | "dre" | "diario" | "razao";

const ABAS: Array<{ id: Aba; rotulo: string }> = [
  { id: "balancete", rotulo: "Balancete" },
  { id: "balanco", rotulo: "Balanço patrimonial" },
  { id: "dre", rotulo: "Receitas e despesas" },
  { id: "diario", rotulo: "Livro diário" },
  { id: "razao", rotulo: "Razão" },
];

const TIPO_ROTULO: Record<string, string> = {
  ATIVO: "Ativo",
  PASSIVO: "Passivo",
  PATRIMONIO: "Patrimônio",
  RECEITA: "Receita",
  DESPESA: "Despesa",
};

function Linha({ rotulo, valor, forte, cor }: { rotulo: string; valor: number; forte?: boolean; cor?: string }) {
  return (
    <div className={`flex justify-between py-1.5 text-sm ${forte ? "border-t border-borda font-semibold" : ""}`}>
      <span className="text-texto-primario">{rotulo}</span>
      <span className="tabular-nums" style={{ color: cor ?? "var(--cor-texto-primario)" }}>
        {formatarCentavos(valor)}
      </span>
    </div>
  );
}

export function ContabilidadePage() {
  const [aba, setAba] = useState<Aba>("balancete");
  const [contas, setContas] = useState<Conta[]>([]);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const hoje = dataAtualISO();
  const [periodo, setPeriodo] = useState<Periodo>(() => calcularPeriodo("este-mes", hoje));
  const [contaRazaoId, setContaRazaoId] = useState("");

  useEffect(() => {
    Promise.all([contabilidade.listarContas(), contabilidade.listarLancamentos(5000)])
      .then(([c, l]) => {
        setContas(c);
        setLancamentos(l);
      })
      .catch((e) => toast.error(String(e)))
      .finally(() => setCarregando(false));
  }, []);

  if (carregando) return <Skeleton className="h-72 w-full" />;

  const nomeConta = new Map(contas.map((c) => [c.id, c.nome]));
  const contasPostaveis = contas.filter((c) => c.subtipo !== "CATEGORIA" && c.ativa);

  const linhasBalancete = balancete(lancamentos, contas, periodo.fim);
  const totalDebitos = linhasBalancete.reduce((s, l) => s + l.debitos, 0);
  const totalCreditos = linhasBalancete.reduce((s, l) => s + l.creditos, 0);

  const saldoDeTipo = (tipo: string) =>
    contasPostaveis.filter((c) => c.tipo === tipo && c.saldo_atual_centavos !== 0);
  const ativos = saldoDeTipo("ATIVO");
  const passivos = saldoDeTipo("PASSIVO");
  const patrimonios = saldoDeTipo("PATRIMONIO");
  const soma = (l: Conta[]) => l.reduce((s, c) => s + c.saldo_atual_centavos, 0);
  const receitasTotal = soma(contas.filter((c) => c.tipo === "RECEITA" && c.subtipo !== "CATEGORIA"));
  const despesasTotal = soma(contas.filter((c) => c.tipo === "DESPESA" && c.subtipo !== "CATEGORIA"));
  const resultadoAcumulado = receitasTotal - despesasTotal;
  const totalAtivo = soma(ativos);
  const totalPassivoMaisPL = soma(passivos) + soma(patrimonios) + resultadoAcumulado;

  const receitas = resultadoPorTipo(lancamentos, contas, "RECEITA", periodo.inicio, periodo.fim);
  const despesas = resultadoPorTipo(lancamentos, contas, "DESPESA", periodo.inicio, periodo.fim);
  const totalReceitas = receitas.reduce((s, r) => s + r.valor, 0);
  const totalDespesas = despesas.reduce((s, r) => s + r.valor, 0);

  const diario = lancamentos
    .filter((l) => l.data >= periodo.inicio && l.data <= periodo.fim)
    .sort((a, b) => a.data.localeCompare(b.data));

  const contaRazao = contasPostaveis.find((c) => c.id === (contaRazaoId || contasPostaveis[0]?.id));
  const razao = contaRazao ? razaoDaConta(lancamentos, contaRazao, periodo.inicio, periodo.fim) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-texto-primario">Contabilidade</h1>
          <p className="text-sm text-texto-secundario">Relatórios do razão de partidas dobradas, calculados dos seus lançamentos.</p>
        </div>
        {aba !== "balanco" && <SeletorPeriodo periodo={periodo} hoje={hoje} onChange={setPeriodo} />}
      </div>

      <div className="flex flex-wrap gap-2">
        {ABAS.map((a) => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
              aba === a.id
                ? "bg-gradient-to-r from-primaria to-destaque text-primaria-texto shadow-[0_4px_16px_-6px_var(--cor-primaria)]"
                : "text-texto-secundario hover:bg-borda/40"
            }`}
          >
            {a.rotulo}
          </button>
        ))}
      </div>

      {aba === "balancete" && (
        <Secao titulo={`Balancete de verificação até ${formatarDataISOParaBR(periodo.fim)}`}>
          {linhasBalancete.length === 0 ? (
            <p className="text-sm text-texto-secundario">Nenhum lançamento até esta data.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-borda text-left text-xs text-texto-secundario">
                    <th className="py-2 pr-3">Código</th>
                    <th className="pr-3">Conta</th>
                    <th className="pr-3">Tipo</th>
                    <th className="pr-3 text-right">Débitos</th>
                    <th className="pr-3 text-right">Créditos</th>
                    <th className="text-right">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {linhasBalancete.map((l) => (
                    <tr key={l.conta.id} className="border-b border-borda/60">
                      <td className="py-2 pr-3 text-texto-secundario">{l.conta.codigo}</td>
                      <td className="pr-3 text-texto-primario">{l.conta.nome}</td>
                      <td className="pr-3 text-texto-secundario">{TIPO_ROTULO[l.conta.tipo]}</td>
                      <td className="pr-3 text-right tabular-nums">{formatarCentavos(l.debitos)}</td>
                      <td className="pr-3 text-right tabular-nums">{formatarCentavos(l.creditos)}</td>
                      <td className="text-right tabular-nums">{formatarCentavos(l.saldo)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-semibold">
                    <td colSpan={3} className="py-2 text-texto-primario">Totais</td>
                    <td className="pr-3 text-right tabular-nums">{formatarCentavos(totalDebitos)}</td>
                    <td className="pr-3 text-right tabular-nums">{formatarCentavos(totalCreditos)}</td>
                    <td
                      className="text-right text-xs"
                      style={{ color: totalDebitos === totalCreditos ? "var(--cor-sucesso)" : "#ff2d55" }}
                    >
                      {totalDebitos === totalCreditos ? "Débitos = Créditos ✓" : "Divergência!"}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Secao>
      )}

      {aba === "balanco" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Secao titulo="Ativo">
            {ativos.map((c) => (
              <Linha key={c.id} rotulo={c.nome} valor={c.saldo_atual_centavos} />
            ))}
            {ativos.length === 0 && <p className="text-sm text-texto-secundario">Sem saldos.</p>}
            <Linha rotulo="Total do ativo" valor={totalAtivo} forte />
          </Secao>
          <Secao titulo="Passivo e patrimônio líquido">
            {passivos.map((c) => (
              <Linha key={c.id} rotulo={c.nome} valor={c.saldo_atual_centavos} />
            ))}
            {patrimonios.map((c) => (
              <Linha key={c.id} rotulo={c.nome} valor={c.saldo_atual_centavos} />
            ))}
            <Linha rotulo="Resultado acumulado (receitas − despesas)" valor={resultadoAcumulado} cor={resultadoAcumulado < 0 ? "#ff2d55" : "var(--cor-sucesso)"} />
            <Linha rotulo="Total do passivo + patrimônio" valor={totalPassivoMaisPL} forte />
            <p className="mt-2 text-xs" style={{ color: totalAtivo === totalPassivoMaisPL ? "var(--cor-sucesso)" : "#ff2d55" }}>
              {totalAtivo === totalPassivoMaisPL ? "Ativo = Passivo + Patrimônio ✓" : "O balanço não fecha — verifique os lançamentos."}
            </p>
          </Secao>
        </div>
      )}

      {aba === "dre" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Secao titulo="Receitas">
            {receitas.map((r) => (
              <Linha key={r.conta.id} rotulo={r.conta.nome} valor={r.valor} />
            ))}
            {receitas.length === 0 && <p className="text-sm text-texto-secundario">Sem receitas no período.</p>}
            <Linha rotulo="Total de receitas" valor={totalReceitas} forte cor="var(--cor-sucesso)" />
          </Secao>
          <Secao titulo="Despesas">
            {despesas.map((r) => (
              <Linha key={r.conta.id} rotulo={r.conta.nome} valor={r.valor} />
            ))}
            {despesas.length === 0 && <p className="text-sm text-texto-secundario">Sem despesas no período.</p>}
            <Linha rotulo="Total de despesas" valor={totalDespesas} forte cor="#ff2d55" />
          </Secao>
          <div className="lg:col-span-2">
            <Secao titulo="Resultado do período">
              <Linha
                rotulo={totalReceitas - totalDespesas >= 0 ? "Superávit" : "Déficit"}
                valor={totalReceitas - totalDespesas}
                forte
                cor={totalReceitas - totalDespesas >= 0 ? "var(--cor-sucesso)" : "#ff2d55"}
              />
            </Secao>
          </div>
        </div>
      )}

      {aba === "diario" && (
        <Secao titulo={`Livro diário (${diario.length} lançamento(s))`}>
          {diario.length === 0 ? (
            <p className="text-sm text-texto-secundario">Nenhum lançamento no período.</p>
          ) : (
            <ul className="space-y-3">
              {diario.map((l) => (
                <li key={l.id} className="rounded-lg border border-borda px-3 py-2.5 text-sm">
                  <p className="flex justify-between font-medium text-texto-primario">
                    <span>{l.descricao}</span>
                    <span className="text-xs font-normal text-texto-secundario">{formatarDataISOParaBR(l.data)}</span>
                  </p>
                  <ul className="mt-1.5 space-y-0.5 text-xs">
                    {l.partidas.map((p) => (
                      <li key={p.id} className={`flex justify-between ${p.tipo === "CREDITO" ? "pl-6" : ""}`}>
                        <span className="text-texto-secundario">
                          {p.tipo === "DEBITO" ? "D" : "C"} · {nomeConta.get(p.conta_id) ?? p.conta_id}
                        </span>
                        <span className="tabular-nums text-texto-primario">{formatarCentavos(p.valor_centavos)}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </Secao>
      )}

      {aba === "razao" && (
        <Secao
          titulo="Livro razão"
          acao={
            <Select
              aria-label="Conta"
              value={contaRazao?.id ?? ""}
              onValueChange={setContaRazaoId}
              options={contasPostaveis.map((c) => ({ value: c.id, label: `${c.codigo} · ${c.nome}` }))}
              className="min-w-64"
            />
          }
        >
          {razao && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-borda text-left text-xs text-texto-secundario">
                    <th className="py-2 pr-3">Data</th>
                    <th className="pr-3">Histórico</th>
                    <th className="pr-3 text-right">Débito</th>
                    <th className="pr-3 text-right">Crédito</th>
                    <th className="text-right">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-borda/60 text-texto-secundario">
                    <td className="py-2 pr-3" colSpan={4}>Saldo anterior ao período</td>
                    <td className="text-right tabular-nums">{formatarCentavos(razao.saldoAnterior)}</td>
                  </tr>
                  {razao.linhas.map((l) => (
                    <tr key={l.lancamento.id} className="border-b border-borda/60">
                      <td className="py-2 pr-3 text-texto-secundario">{formatarDataISOParaBR(l.lancamento.data)}</td>
                      <td className="pr-3 text-texto-primario">{l.lancamento.descricao}</td>
                      <td className="pr-3 text-right tabular-nums">{l.debito ? formatarCentavos(l.debito) : ""}</td>
                      <td className="pr-3 text-right tabular-nums">{l.credito ? formatarCentavos(l.credito) : ""}</td>
                      <td className="text-right tabular-nums">{formatarCentavos(l.saldo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {razao.linhas.length === 0 && <p className="mt-3 text-sm text-texto-secundario">Sem movimento nesta conta no período.</p>}
            </div>
          )}
        </Secao>
      )}
    </div>
  );
}
