// Backend simulado do Tauri para testar a interface no navegador (sem Rust).
// Injetado antes do app carregar: responde os comandos com dados de exemplo.
(() => {
  const hoje = new Date().toISOString().slice(0, 10);
  const dia = (d) => new Date(Date.parse(hoje + "T12:00:00Z") + d * 86400000).toISOString().slice(0, 10);
  let seq = 1;
  const id = (p = "id") => `${p}-${seq++}`;
  const conta = (o) => ({ codigo: o.id, subtipo: null, categoria_pai_id: null, instituicao: null, saldo_inicial_centavos: 0, dia_fechamento_fatura: null, dia_vencimento_fatura: null, limite_centavos: null, sistema: false, ativa: true, saldo_atual_centavos: 0, ...o });
  const contas = [
    conta({ id: "ativo-dinheiro", codigo: "1.1.1", nome: "Dinheiro", tipo: "ATIVO", subtipo: "DINHEIRO", sistema: true }),
    conta({ id: "ativo-vale-alimentacao", codigo: "1.1.2", nome: "Vale-alimentação", tipo: "ATIVO", subtipo: "BENEFICIO", sistema: true }),
    conta({ id: "banco-nu", codigo: "1.1.10", nome: "Nubank Conta", tipo: "ATIVO", subtipo: "BANCO", instituicao: "Nubank" }),
    conta({ id: "banco-itau", codigo: "1.1.11", nome: "Itaú Corrente", tipo: "ATIVO", subtipo: "BANCO", instituicao: "Itaú" }),
    conta({ id: "ativo-investimentos", codigo: "1.INV", nome: "Investimentos", tipo: "ATIVO", subtipo: "INVESTIMENTO", sistema: true }),
    conta({ id: "ativo-a-receber", codigo: "1.REC", nome: "A receber", tipo: "ATIVO", sistema: true }),
    conta({ id: "cartao-nu", codigo: "2.1.1", nome: "Nubank Roxinho", tipo: "PASSIVO", subtipo: "CARTAO_CREDITO", dia_fechamento_fatura: 5, dia_vencimento_fatura: 12, limite_centavos: 500000 }),
    conta({ id: "cartao-inter", codigo: "2.1.2", nome: "Inter Gold", tipo: "PASSIVO", subtipo: "CARTAO_CREDITO", dia_fechamento_fatura: 20, dia_vencimento_fatura: 28, limite_centavos: 300000 }),
    conta({ id: "patrimonio-saldo-inicial", codigo: "3.1", nome: "Saldo inicial", tipo: "PATRIMONIO", sistema: true }),
    conta({ id: "receita-salario", codigo: "4.1", nome: "Salário", tipo: "RECEITA", sistema: true }),
    conta({ id: "receita-renda-extra", codigo: "4.2", nome: "Renda extra", tipo: "RECEITA", sistema: true }),
    conta({ id: "receita-investimentos", codigo: "4.INV", nome: "Rendimentos", tipo: "RECEITA", sistema: true }),
    conta({ id: "despesa-moradia", codigo: "5.1", nome: "Moradia", tipo: "DESPESA", sistema: true }),
    conta({ id: "despesa-alimentacao", codigo: "5.2", nome: "Alimentação", tipo: "DESPESA", sistema: true }),
    conta({ id: "despesa-transporte", codigo: "5.3", nome: "Transporte", tipo: "DESPESA", sistema: true }),
    conta({ id: "despesa-lazer", codigo: "5.4", nome: "Lazer", tipo: "DESPESA", sistema: true }),
    conta({ id: "despesa-saude", codigo: "5.5", nome: "Saúde", tipo: "DESPESA", sistema: true }),
    conta({ id: "despesa-outras", codigo: "5.9", nome: "Outras", tipo: "DESPESA", sistema: true }),
    conta({ id: "despesa-assinaturas", codigo: "5.10", nome: "Assinaturas", tipo: "DESPESA" }),
  ];
  const lancamentos = [];
  const lanc = (data, descricao, valor, debito, credito, extra = {}) => {
    const l = { id: id("l"), data, descricao, observacao: null, origem: "MANUAL", etiqueta: null, estornado_de: null, parcelas: null, corrige: null, partidas: [{ id: id("p"), conta_id: debito, tipo: "DEBITO", valor_centavos: valor }, { id: id("p"), conta_id: credito, tipo: "CREDITO", valor_centavos: valor }], ...extra };
    lancamentos.unshift(l);
    return l;
  };
  lanc(dia(-200), "Saldo inicial de Nubank Conta", 350000, "banco-nu", "patrimonio-saldo-inicial", { origem: "SALDO_INICIAL" });
  lanc(dia(-200), "Saldo inicial de Itaú", 120000, "banco-itau", "patrimonio-saldo-inicial", { origem: "SALDO_INICIAL" });
  for (let m = 5; m >= 0; m--) {
    const b = -m * 30;
    lanc(dia(b - 2), "Salário Empresa", 520000, "banco-nu", "receita-salario");
    lanc(dia(b - 1), "Aluguel", 180000, "despesa-moradia", "banco-itau", { etiqueta: "FIXO" });
    lanc(dia(b), "Netflix", 5590, "despesa-assinaturas", "cartao-nu", { etiqueta: "ASSINATURA" });
    lanc(dia(b), "Spotify", 2190, "despesa-assinaturas", "cartao-nu", { etiqueta: "ASSINATURA" });
    lanc(dia(b + 1), "Claude Pro", 11000, "despesa-assinaturas", "cartao-inter", { etiqueta: "ASSINATURA" });
    lanc(dia(b + 2), "Mercado Pão de Açúcar", 45000 + m * 1000, "despesa-alimentacao", "cartao-nu");
    lanc(dia(b + 3), "Uber Trip", 3200, "despesa-transporte", "cartao-nu");
    lanc(dia(b + 4), "iFood", 6800, "despesa-alimentacao", "cartao-inter");
    lanc(dia(b + 5), "Amazon Prime", 1990, "despesa-assinaturas", "cartao-nu", { etiqueta: "ASSINATURA" });
    lanc(dia(b + 6), "Farmácia Drogasil", 8900, "despesa-saude", "banco-nu");
    lanc(dia(b + 7), "Cinema", 7000, "despesa-lazer", "banco-nu");
  }
  lanc(dia(-10), "TV Samsung 55", 360000, "despesa-lazer", "cartao-nu", { parcelas: 10 });
  lanc(dia(-3), "Pagamento fatura Nubank", 90000, "cartao-nu", "banco-nu", { origem: "FATURA" });
  const devedora = (t) => t === "ATIVO" || t === "DESPESA";
  const comSaldo = () => contas.map((c) => {
    let s = 0;
    for (const l of lancamentos) for (const p of l.partidas) if (p.conta_id === c.id) s += (p.tipo === "DEBITO") === devedora(c.tipo) ? p.valor_centavos : -p.valor_centavos;
    return { ...c, saldo_atual_centavos: s };
  });
  const agendamentos = [
    { id: "ag1", descricao: "Conta de luz", valor_centavos: 18990, vencimento: dia(2), categoria_despesa_id: "despesa-moradia", etiqueta: "FIXO", lancamento_id: null, pago_em: null, recorrencia: "MENSAL", tipo: "PAGAR", automatico: false, conta_id: null, reajuste_anual: null, mes_reajuste: null, pessoa: null },
    { id: "ag2", descricao: "Internet Vivo", valor_centavos: 11990, vencimento: dia(-1), categoria_despesa_id: "despesa-moradia", etiqueta: "FIXO", lancamento_id: null, pago_em: null, recorrencia: "MENSAL", tipo: "PAGAR", automatico: false, conta_id: null, reajuste_anual: null, mes_reajuste: null, pessoa: null },
    { id: "ag3", descricao: "Freela site", valor_centavos: 150000, vencimento: dia(8), categoria_despesa_id: "receita-renda-extra", etiqueta: null, lancamento_id: null, pago_em: null, recorrencia: null, tipo: "RECEBER", automatico: false, conta_id: null, reajuste_anual: null, mes_reajuste: null, pessoa: "Cliente X" },
  ];
  const metas = [
    { id: "m1", nome: "Reserva de emergência", valor_alvo_centavos: 2000000, prazo: dia(300), guardado_centavos: 1650000, tipo: "RESERVA", prioridade: "ALTA", notas: null, conta_id: null },
    { id: "m2", nome: "Viagem Nordeste", valor_alvo_centavos: 600000, prazo: dia(120), guardado_centavos: 150000, tipo: "VIAGEM", prioridade: "MEDIA", notas: null, conta_id: null },
  ];
  const aportes = [{ meta_id: "m1", data: dia(-60), valor_centavos: 1500000 }, { meta_id: "m1", data: dia(-20), valor_centavos: 150000 }, { meta_id: "m2", data: dia(-15), valor_centavos: 150000 }];
  const db = {
    listar_contas: () => comSaldo(),
    listar_lancamentos: () => lancamentos,
    listar_agendamentos: () => agendamentos,
    obter_resumo_dashboard: (a) => {
      const cs = comSaldo();
      const soma = (t, f) => lancamentos.filter((l) => l.data >= a.dataInicio && l.data <= a.dataFim).reduce((s, l) => s + l.partidas.filter((p) => cs.find((c) => c.id === p.conta_id)?.tipo === t && p.tipo === f).reduce((x, p) => x + p.valor_centavos, 0), 0);
      const liq = cs.filter((c) => c.tipo === "ATIVO").reduce((s, c) => s + c.saldo_atual_centavos, 0);
      return { saldo_disponivel_centavos: liq, patrimonio_liquido_centavos: liq - cs.filter((c) => c.tipo === "PASSIVO").reduce((s, c) => s + c.saldo_atual_centavos, 0), receitas_mes_centavos: soma("RECEITA", "CREDITO"), despesas_mes_centavos: soma("DESPESA", "DEBITO") };
    },
    listar_metas: () => metas,
    listar_todos_aportes: () => aportes,
    listar_aportes_meta: (a) => aportes.filter((x) => x.meta_id === a.metaId),
    listar_orcamentos: () => [{ categoria_id: "despesa-alimentacao", limite_centavos: 80000, acumular: false, acumular_desde: null }, { categoria_id: "despesa-lazer", limite_centavos: 30000, acumular: false, acumular_desde: null }],
    listar_orcamentos_mes: () => [],
    listar_bens: () => [
      { id: "b1", nome: "Carro Onix 2020", tipo: "BEM", valor_centavos: 6500000, categoria: "VEICULO", notas: null, aquisicao_data: "2021-03-10", aquisicao_valor_centavos: 7200000, avaliacoes: [{ data: dia(-100), valor_centavos: 6500000 }, { data: "2021-03-10", valor_centavos: 7200000 }] },
      { id: "b2", nome: "Financiamento do carro", tipo: "DIVIDA", valor_centavos: 1800000, categoria: "FINANCIAMENTO", notas: null, aquisicao_data: null, aquisicao_valor_centavos: null, avaliacoes: [{ data: dia(-30), valor_centavos: 1800000 }] },
    ],
    listar_radar: () => [{ id: "r1", nome: "Fone Sony WH-1000XM5", preco_alvo_centavos: 150000, meta_id: null, precos: [{ id: "rp1", loja: "Amazon", preco_centavos: 189900, url: "https://amazon.com.br", data: dia(-20) }, { id: "rp2", loja: "Kabum", preco_centavos: 172900, url: null, data: dia(-5) }] }],
    listar_backups: () => [{ nome: "dairus-2026-10-01.db", caminho: "C:/x", tamanho_bytes: 524288, criado_em: dia(-2) + " 10:00:00" }],
    listar_ativos_invest: () => [{ id: "a1", codigo: "PETR4", nome: "Petrobras", classe: "ACAO", indexador: null, taxa: null, vencimento: null, objetivo: "Longo prazo", setor: "Petróleo", risco: "ALTO", moeda: "BRL", cotacao: 38.5, cotacao_em: dia(-1), alerta_acima: null, alerta_abaixo: null, ativo: true, notas: null, quantidade: 100, custo_centavos: 320000, preco_medio: 32, proventos_centavos: 15000, lucro_realizado_centavos: 0, primeira_compra: dia(-180) }, { id: "a2", codigo: "CDB Inter 110%", nome: null, classe: "CDB", indexador: "CDI", taxa: 110, vencimento: dia(200), objetivo: "Reserva", setor: null, risco: "BAIXO", moeda: "BRL", cotacao: null, cotacao_em: null, alerta_acima: null, alerta_abaixo: null, ativo: true, notas: null, quantidade: 1, custo_centavos: 500000, preco_medio: 5000, proventos_centavos: 0, lucro_realizado_centavos: 0, primeira_compra: dia(-150) }],
    listar_operacoes_invest: () => [{ id: "o1", ativo_id: "a1", tipo: "COMPRA", data: dia(-180), quantidade: 100, preco_unitario: 32, taxas_centavos: 0, valor_centavos: 320000, ir_retido_centavos: 0, custo_centavos: null, day_trade: false, conta_id: null, lancamento_id: null, notas: null }, { id: "o2", ativo_id: "a1", tipo: "DIVIDENDO", data: dia(-40), quantidade: 0, preco_unitario: 0, taxas_centavos: 0, valor_centavos: 15000, ir_retido_centavos: 0, custo_centavos: null, day_trade: false, conta_id: null, lancamento_id: null, notas: null }, { id: "o3", ativo_id: "a2", tipo: "COMPRA", data: dia(-150), quantidade: 1, preco_unitario: 5000, taxas_centavos: 0, valor_centavos: 500000, ir_retido_centavos: 0, custo_centavos: null, day_trade: false, conta_id: null, lancamento_id: null, notas: null }],
    listar_a_receber: () => [{ id: "ar1", pessoa: "Ana", descricao: "Pizza", valor_centavos: 4500, data: dia(-6), lancamento_id: null, recebido_em: null, recebimento_lancamento_id: null, perdoado: false }],
    listar_emprestimos: () => [],
    listar_faturas: () => [],
    listar_adicionais: () => [],
    listar_portadores: () => [],
    listar_reembolsos: () => [],
    listar_config_cartoes: () => [],
    listar_tags: () => [],
    listar_anexos: () => [],
    listar_regras: () => [],
    listar_indicadores: () => [],
    listar_auditoria: () => [],
    info_banco: () => ({ caminho: "C:/Users/teste/AppData/dairus.db", tamanho_bytes: 1048576, lancamentos: lancamentos.length, contas: contas.length, agendamentos: 3, metas: 2, bens: 2, migracoes: 13, versao_sqlite: "3.45" }),
    situacao_conta: () => ({ primeiro_acesso: false, lancamentos_legado: 0, criptografado: false }),
    criptografia_ativa: () => false,
    verificar_integridade: () => [],
    uso_da_conta: () => ({ lancamentos: 3, saldo_inicial: 1, agendamentos: 0, subcategorias: 0, sistema: false }),
    verificar_atualizacao: () => null,
    processar_agendamentos_automaticos: () => [],
    listar_pasta_importar: () => [],
    caminho_pasta_importar: () => "C:/Users/teste/Documents/Dairus/Importar",
    buscar_json_mercado: () => { throw new Error("sem internet no teste"); },
    pasta_de_logs: () => "C:/logs",
    ler_log: () => "",
    impressao_dados: () => "abc",
    "plugin:app|version": () => "0.2.0",
    "plugin:notification|is_permission_granted": () => true,
    "plugin:autostart|is_enabled": () => false,
  };
  const desconhecidos = new Set();
  window.__COMANDOS_DESCONHECIDOS__ = desconhecidos;
  let cb = 1;
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label: "main" }, currentWebview: { windowLabel: "main", label: "main" } },
    transformCallback: (f) => { const n = cb++; window[`_${n}`] = f; return n; },
    unregisterCallback: () => {},
    convertFileSrc: (p) => p,
    invoke: async (cmd, args) => {
      if (cmd in db) return db[cmd](args ?? {});
      if (cmd.startsWith("plugin:store")) throw new Error("store simulado indisponível (usa localStorage)");
      if (cmd.startsWith("plugin:")) return null;
      if (cmd.startsWith("listar_")) { desconhecidos.add(cmd); return []; }
      desconhecidos.add(cmd);
      return { id: id("novo"), partidas: [], nome: "ok" };
    },
  };
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
  const agora = Math.floor(Date.now() / 1000);
  localStorage.setItem("dairus-sessao", JSON.stringify({ access_token: "x.y.z", refresh_token: "r", token_type: "bearer", expires_in: 999999, expires_at: agora + 999999, user: { id: "00000000-0000-4000-8000-000000000001", email: "teste@dairus.app", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: { full_name: "Pessoa Teste" }, created_at: "2026-01-01" } }));
  localStorage.setItem("00000000-0000-4000-8000-000000000001:tutorial_visto", "true");
  if (!window.__SEM_CHAVE__) localStorage.setItem("00000000-0000-4000-8000-000000000001:gemini_chave", JSON.stringify("AIzaTESTE"));
})();
