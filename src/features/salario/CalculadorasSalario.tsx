import { useState } from "react";
import { BadgePercent, Briefcase, CalendarCheck, Clock, Landmark, PartyPopper, Plane, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "../../components/ui/Button";
import { CLASSE_INPUT, Secao } from "../../components/ui/Campos";
import { Select } from "../../components/ui/Select";
import { contabilidade } from "../../services/contabilidade";
import { centavosParaValorInput, dataAtualISO, formatarCentavos, formatarDataISOParaBR, valorInputParaCentavos } from "../../services/formato";
import { usePreferencia } from "../../state/usePreferencia";
import type { Conta } from "../../types/accounting";
import { decimoTerceiro, ferias, holerite, horasExtras, pacoteAnualClt, pacoteAnualPj } from "./salarioCalc";

interface Props {
  bruto: number;
  liquido: number;
  horasMes: number;
  diaPagamento: number;
  contasDestino: Conta[];
}

const Linha = ({ rotulo, valor, forte }: { rotulo: string; valor: string; forte?: boolean }) => (
  <div className="flex justify-between text-sm"><span className="text-texto-secundario">{rotulo}</span><span className={`tabular-nums ${forte ? "font-semibold text-texto-primario" : "text-texto-primario"}`}>{valor}</span></div>
);

/** Calculadoras de referência (holerite, 13º, férias, horas extras, CLT x PJ), aumentos, FGTS e salário automático. */
export function CalculadorasSalario({ bruto, liquido, horasMes, diaPagamento, contasDestino }: Props) {
  const [brutoTxt, setBrutoTxt] = useState(bruto ? centavosParaValorInput(bruto) : "");
  const [dep, setDep] = useState("0");
  const [meses13, setMeses13] = useState("12");
  const [diasFerias, setDiasFerias] = useState("30");
  const [vender, setVender] = useState(false);
  const [he, setHe] = useState({ horas: "10", adicional: "50" });
  const [pj, setPj] = useState({ fat: "", imposto: "6", custos: "300", beneficios: "" });
  const [aumentos, setAumentos] = usePreferencia<Array<{ data: string; liquido: number }>>("historico_salarios", []);
  const [novoAumento, setNovoAumento] = useState({ data: dataAtualISO(), valor: "" });
  const [fgts, setFgts] = usePreferencia<number>("saldo_fgts", 0);
  const [fgtsTxt, setFgtsTxt] = useState(fgts ? centavosParaValorInput(fgts) : "");
  const [contaAuto, setContaAuto] = useState(contasDestino[0]?.id ?? "");

  const b = valorInputParaCentavos(brutoTxt);
  const d = Number(dep) || 0;
  const h = b > 0 ? holerite(b, d) : null;
  const t13 = b > 0 ? decimoTerceiro(b, Number(meses13) || 0, d) : null;
  const fer = b > 0 ? ferias(b, Number(diasFerias) || 30, vender, d) : null;
  const extra = b > 0 ? horasExtras(b, horasMes || 220, Number(he.horas.replace(",", ".")) || 0, (Number(he.adicional) || 0) / 100) : 0;
  const clt = b > 0 ? pacoteAnualClt(b, valorInputParaCentavos(pj.beneficios)) : 0;
  const pjAnual = valorInputParaCentavos(pj.fat) > 0 ? pacoteAnualPj(valorInputParaCentavos(pj.fat), (Number(pj.imposto.replace(",", ".")) || 0) / 100, valorInputParaCentavos(pj.custos)) : 0;
  const ordenados = [...aumentos].sort((x, y) => x.data.localeCompare(y.data));
  const fgtsEm12 = fgts + (h?.fgts ?? 0) * 12 + Math.round(fgts * 0.03);

  async function salarioAutomatico() {
    if (!liquido || !contaAuto) return toast.error("Cadastre o salário líquido no perfil e escolha a conta.");
    const hoje = dataAtualISO();
    const dia = Math.min(28, Math.max(1, diaPagamento || 5));
    let venc = `${hoje.slice(0, 8)}${String(dia).padStart(2, "0")}`;
    if (venc < hoje) venc = new Date(Date.UTC(+hoje.slice(0, 4), +hoje.slice(5, 7), dia)).toISOString().slice(0, 10);
    try {
      await contabilidade.criarAgendamento({ descricao: "Salário", valor_centavos: liquido, vencimento: venc, categoria_despesa_id: "receita-salario", recorrencia: "MENSAL", tipo: "RECEBER", automatico: true, conta_id: contaAuto });
      toast.success(`Salário agendado: entra sozinho todo dia ${dia} (a partir de ${formatarDataISOParaBR(venc)}).`);
    } catch (e) {
      toast.error(String(e));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-borda bg-cartao p-3 text-sm">
        <span className="text-texto-secundario">Salário bruto</span>
        <input value={brutoTxt} onChange={(e) => setBrutoTxt(e.target.value)} inputMode="decimal" aria-label="Salário bruto para os cálculos" className={`${CLASSE_INPUT} w-32`} />
        <span className="text-texto-secundario">dependentes</span>
        <input value={dep} onChange={(e) => setDep(e.target.value)} inputMode="numeric" aria-label="Dependentes" className={`${CLASSE_INPUT} w-14`} />
        <span className="text-[11px] text-texto-secundario">Valores de referência (INSS 2025, IR com isenção até R$ 5 mil de 2026). Confira no seu holerite.</span>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Secao titulo={<><BadgePercent size={15} className="text-primaria" /> Holerite estimado</>}>
          {h ? (<><Linha rotulo="Bruto" valor={formatarCentavos(h.bruto)} /><Linha rotulo="INSS" valor={`− ${formatarCentavos(h.inss)}`} /><Linha rotulo="IR" valor={`− ${formatarCentavos(h.irrf)}`} /><Linha rotulo="Líquido" valor={formatarCentavos(h.liquido)} forte /><Linha rotulo="FGTS (empresa deposita)" valor={formatarCentavos(h.fgts)} />{liquido > 0 && Math.abs(liquido - h.liquido) > 5_000 && <p className="mt-1 text-[11px] text-alerta">Seu líquido no perfil ({formatarCentavos(liquido)}) é diferente: pode haver outros descontos (plano, VT, pensão).</p>}</>) : <p className="text-sm text-texto-secundario">Informe o bruto.</p>}
        </Secao>
        <Secao titulo={<><PartyPopper size={15} className="text-sucesso" /> 13º salário</>}>
          <label className="flex items-center gap-2 text-xs text-texto-secundario">Meses trabalhados no ano <input value={meses13} onChange={(e) => setMeses13(e.target.value)} inputMode="numeric" aria-label="Meses trabalhados" className={`${CLASSE_INPUT} w-14 py-1`} /></label>
          {t13 && (<div className="mt-2"><Linha rotulo="1ª parcela (até 30/11)" valor={formatarCentavos(t13.primeira)} /><Linha rotulo="2ª parcela (até 20/12)" valor={formatarCentavos(t13.segunda)} /><Linha rotulo="Total líquido" valor={formatarCentavos(t13.total)} forte /></div>)}
        </Secao>
        <Secao titulo={<><Plane size={15} className="text-secundaria" /> Férias</>}>
          <div className="flex flex-wrap items-center gap-2 text-xs text-texto-secundario">
            Dias <input value={diasFerias} onChange={(e) => setDiasFerias(e.target.value)} inputMode="numeric" aria-label="Dias de férias" className={`${CLASSE_INPUT} w-14 py-1`} />
            <label className="flex items-center gap-1"><input type="checkbox" checked={vender} onChange={() => setVender(!vender)} className="h-3.5 w-3.5 accent-[var(--cor-primaria)]" />vender 10 dias</label>
          </div>
          {fer && (<div className="mt-2"><Linha rotulo="Férias + 1/3" valor={formatarCentavos(fer.bruto)} /><Linha rotulo="Descontos" valor={`− ${formatarCentavos(fer.descontos)}`} />{fer.abono > 0 && <Linha rotulo="Abono (isento)" valor={formatarCentavos(fer.abono)} />}<Linha rotulo="Líquido" valor={formatarCentavos(fer.liquido)} forte /></div>)}
        </Secao>
        <Secao titulo={<><Clock size={15} className="text-alerta" /> Horas extras</>}>
          <div className="flex flex-wrap items-center gap-2 text-xs text-texto-secundario">
            <input value={he.horas} onChange={(e) => setHe({ ...he, horas: e.target.value })} inputMode="decimal" aria-label="Horas extras" className={`${CLASSE_INPUT} w-14 py-1`} /> horas com adicional de
            <Select aria-label="Adicional" value={he.adicional} onValueChange={(v) => setHe({ ...he, adicional: v })} options={[{ value: "50", label: "50%" }, { value: "100", label: "100% (domingo/feriado)" }]} className="w-40" />
          </div>
          <p className="mt-2 text-sm text-texto-primario">≈ <strong>{formatarCentavos(extra)}</strong> brutos (hora normal {formatarCentavos(Math.round(b / (horasMes || 220)))}).</p>
        </Secao>
        <Secao titulo={<><Briefcase size={15} className="text-destaque" /> CLT x PJ (por ano)</>}>
          <div className="grid grid-cols-2 gap-1.5 text-xs">
            <input value={pj.fat} onChange={(e) => setPj({ ...pj, fat: e.target.value })} inputMode="decimal" placeholder="PJ: faturamento/mês" aria-label="Faturamento PJ" className={`${CLASSE_INPUT} col-span-2 py-1`} />
            <label className="text-texto-secundario">Imposto %<input value={pj.imposto} onChange={(e) => setPj({ ...pj, imposto: e.target.value })} inputMode="decimal" className={`${CLASSE_INPUT} w-full py-1`} /></label>
            <label className="text-texto-secundario">Custos/mês<input value={pj.custos} onChange={(e) => setPj({ ...pj, custos: e.target.value })} inputMode="decimal" className={`${CLASSE_INPUT} w-full py-1`} /></label>
            <input value={pj.beneficios} onChange={(e) => setPj({ ...pj, beneficios: e.target.value })} inputMode="decimal" placeholder="CLT: benefícios/mês (VA, plano)" aria-label="Benefícios CLT" className={`${CLASSE_INPUT} col-span-2 py-1`} />
          </div>
          {b > 0 && <Linha rotulo="CLT (líquido + 13º + férias + FGTS + benefícios)" valor={formatarCentavos(clt)} />}
          {pjAnual > 0 && <Linha rotulo="PJ (líquido de impostos e custos)" valor={formatarCentavos(pjAnual)} />}
          {b > 0 && pjAnual > 0 && <p className={`mt-1 text-sm font-medium ${pjAnual > clt ? "text-sucesso" : "text-alerta"}`}>{pjAnual > clt ? `PJ rende ${formatarCentavos(pjAnual - clt)} a mais por ano` : `CLT rende ${formatarCentavos(clt - pjAnual)} a mais por ano`} (sem contar estabilidade e seguro-desemprego).</p>}
        </Secao>
        <Secao titulo={<><Landmark size={15} className="text-primaria" /> FGTS</>}>
          <div className="flex items-center gap-2"><input value={fgtsTxt} onChange={(e) => setFgtsTxt(e.target.value)} inputMode="decimal" placeholder="Saldo atual (app FGTS)" aria-label="Saldo do FGTS" className={`${CLASSE_INPUT} w-40 py-1`} /><Button tamanho="pequeno" variante="secundaria" onClick={() => { setFgts(valorInputParaCentavos(fgtsTxt)); toast.success("Saldo do FGTS salvo."); }}>Salvar</Button></div>
          {fgts > 0 && <p className="mt-2 text-sm text-texto-primario">Em 12 meses ≈ <strong>{formatarCentavos(fgtsEm12)}</strong> (depósitos de 8% + ~3% ao ano, estimativa).</p>}
        </Secao>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Secao titulo={<><TrendingUp size={15} className="text-sucesso" /> Histórico de aumentos</>}>
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" value={novoAumento.data} onChange={(e) => setNovoAumento({ ...novoAumento, data: e.target.value })} aria-label="Data do salário" className={`${CLASSE_INPUT} w-36 py-1`} />
            <input value={novoAumento.valor} onChange={(e) => setNovoAumento({ ...novoAumento, valor: e.target.value })} inputMode="decimal" placeholder="Líquido a partir daí" aria-label="Salário líquido" className={`${CLASSE_INPUT} w-36 py-1`} />
            <Button tamanho="pequeno" variante="secundaria" onClick={() => { const v = valorInputParaCentavos(novoAumento.valor); if (v <= 0) return; setAumentos([...aumentos, { data: novoAumento.data, liquido: v }]); setNovoAumento({ ...novoAumento, valor: "" }); }}>Adicionar</Button>
          </div>
          {ordenados.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs">
              {ordenados.map((a, k) => {
                const ant = ordenados[k - 1];
                const var_ = ant ? (a.liquido / ant.liquido - 1) * 100 : null;
                return <li key={`${a.data}-${k}`} className="flex justify-between"><span className="text-texto-secundario">{formatarDataISOParaBR(a.data)}</span><span className="tabular-nums">{formatarCentavos(a.liquido)}{var_ !== null && <span className={`ml-2 ${var_ >= 0 ? "text-sucesso" : "text-erro"}`}>{var_ >= 0 ? "+" : ""}{var_.toFixed(1)}%</span>}<button onClick={() => setAumentos(aumentos.filter((x) => x !== a))} className="ml-2 text-texto-secundario hover:text-erro" aria-label="Remover">×</button></span></li>;
              })}
            </ul>
          )}
          {ordenados.length > 1 && <p className="mt-2 text-xs text-texto-secundario">Crescimento total: {((ordenados[ordenados.length - 1].liquido / ordenados[0].liquido - 1) * 100).toFixed(1)}% desde {formatarDataISOParaBR(ordenados[0].data)}.</p>}
        </Secao>
        <Secao titulo={<><CalendarCheck size={15} className="text-primaria" /> Salário automático</>}>
          <p className="text-xs text-texto-secundario">Lança o salário líquido do perfil sozinho todo mês, no dia {diaPagamento || 5}. Dá para mudar o valor na Agenda quando tiver aumento.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Select aria-label="Conta do salário" value={contaAuto} onValueChange={setContaAuto} options={contasDestino.map((c) => ({ value: c.id, label: c.nome }))} className="w-44" />
            <Button tamanho="pequeno" onClick={salarioAutomatico} disabled={!liquido}>Agendar {liquido ? formatarCentavos(liquido) : ""}</Button>
          </div>
        </Secao>
      </div>
    </div>
  );
}
