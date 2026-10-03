import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { FormAtivo, FormOperacao } from "./Formularios";
import { CONTAS } from "../../testes/dados";
import type { AtivoInvest } from "../../types/investimentos";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const invocar = vi.mocked(invoke);

const petr: AtivoInvest = {
  id: "petr", codigo: "PETR4", nome: null, classe: "ACAO", indexador: null, taxa: null, vencimento: null, objetivo: null, setor: null,
  risco: null, moeda: "BRL", cotacao: null, cotacao_em: null, alerta_acima: null, alerta_abaixo: null, ativo: true, notas: null,
  quantidade: 10, custo_centavos: 30_000, preco_medio: 30, proventos_centavos: 0, lucro_realizado_centavos: 0, primeira_compra: "2026-01-01",
};

describe("formulários de investimentos", () => {
  beforeEach(() => {
    invocar.mockReset();
    invocar.mockResolvedValue("novo-id");
  });

  it("cadastra um ativo com o código em maiúsculas pelo motor", async () => {
    const usuario = userEvent.setup();
    const aoSalvar = vi.fn();
    render(<FormAtivo onSalvo={aoSalvar} onCancelar={vi.fn()} />);
    await usuario.type(screen.getByLabelText("Código do ativo"), "itub4");
    await usuario.type(screen.getByLabelText("Alerta de alta"), "40,50");
    await usuario.click(screen.getByRole("button", { name: "Cadastrar ativo" }));
    await waitFor(() => expect(invocar).toHaveBeenCalledWith("salvar_ativo_invest", { input: expect.objectContaining({ codigo: "itub4", classe: "ACAO", alerta_acima: 40.5 }) }));
    expect(aoSalvar).toHaveBeenCalledWith("novo-id");
  });

  it("registra uma compra lançando na conta e mostra o total", async () => {
    const usuario = userEvent.setup();
    const aoRegistrar = vi.fn();
    render(<FormOperacao ativos={[petr]} contas={CONTAS} onRegistrada={aoRegistrar} />);
    expect(screen.getByText(/preço médio R\$\s?30,00/)).toBeInTheDocument();
    await usuario.type(screen.getByLabelText("Quantidade"), "5");
    await usuario.type(screen.getByLabelText("Preço unitário"), "32,10");
    expect(screen.getByText(/Total: R\$\s?160,50/)).toBeInTheDocument();
    await usuario.type(screen.getByLabelText("Taxas"), "1,20");
    await usuario.click(screen.getByRole("button", { name: "Registrar operação" }));
    await waitFor(() =>
      expect(invocar).toHaveBeenCalledWith("registrar_operacao_invest", {
        input: expect.objectContaining({ ativo_id: "petr", tipo: "COMPRA", quantidade: 5, preco_unitario: 32.1, taxas_centavos: 120, conta_id: "ativo-dinheiro" }),
      }),
    );
    expect(aoRegistrar).toHaveBeenCalled();
  });
});
