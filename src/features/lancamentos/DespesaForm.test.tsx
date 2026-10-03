import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { DespesaForm } from "./DespesaForm";
import { CONTAS, lancamento } from "../../testes/dados";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
const invocar = vi.mocked(invoke);

const origens = CONTAS.filter((c) => c.tipo === "ATIVO" || c.tipo === "PASSIVO");
const categorias = CONTAS.filter((c) => c.tipo === "DESPESA");

describe("formulário de despesa", () => {
  beforeEach(() => {
    invocar.mockReset();
    invocar.mockImplementation(async (c: string) => {
      if (c === "listar_regras") return [{ id: "r", padrao: "uber", categoria_id: "despesa-transporte" }];
      return { id: "novo-lanc", partidas: [] };
    });
  });

  it("sugere a categoria pela regra e grava tags", async () => {
    const usuario = userEvent.setup();
    render(<DespesaForm contasOrigem={origens} categoriasDespesa={categorias} onRegistrada={vi.fn()} />);
    await waitFor(() => expect(invocar).toHaveBeenCalledWith("listar_regras"));
    await usuario.type(screen.getByLabelText("Descrição"), "UBER *TRIP");
    await waitFor(() => expect(screen.getByLabelText("Categoria da despesa")).toHaveTextContent("Transporte"));
    expect(screen.getByText(/Regra: “uber” → Transporte/)).toBeInTheDocument();
    await usuario.type(screen.getByLabelText("Valor"), "23,50");
    await usuario.type(screen.getByLabelText("Tags"), "trabalho, viagem");
    await usuario.click(screen.getByRole("button", { name: "Registrar despesa" }));
    await waitFor(() => expect(invocar).toHaveBeenCalledWith("registrar_despesa", { input: expect.objectContaining({ categoria_despesa_id: "despesa-transporte", valor_centavos: 2350 }) }));
    await waitFor(() => expect(invocar).toHaveBeenCalledWith("definir_tags", { lancamentoId: "novo-lanc", tags: ["trabalho", "viagem"] }));
  });

  it("avisa possível duplicata e só registra depois de confirmar", async () => {
    const usuario = userEvent.setup();
    const hoje = new Date().toISOString().slice(0, 10);
    const existente = lancamento({ id: "x", data: hoje, descricao: "Padaria Bom Pão" }, 1200);
    render(<DespesaForm contasOrigem={origens} categoriasDespesa={categorias} onRegistrada={vi.fn()} lancamentos={[existente]} />);
    await usuario.type(screen.getByLabelText("Descrição"), "Padaria");
    await usuario.type(screen.getByLabelText("Valor"), "12");
    await usuario.click(screen.getByRole("button", { name: "Registrar despesa" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Parece repetido");
    expect(invocar).not.toHaveBeenCalledWith("registrar_despesa", expect.anything());
    await usuario.click(screen.getByRole("button", { name: "Registrar mesmo assim" }));
    await waitFor(() => expect(invocar).toHaveBeenCalledWith("registrar_despesa", expect.anything()));
  });

  it("divide uma despesa entre duas categorias num lançamento só", async () => {
    const usuario = userEvent.setup();
    render(<DespesaForm contasOrigem={origens} categoriasDespesa={categorias} onRegistrada={vi.fn()} />);
    await usuario.type(screen.getByLabelText("Descrição"), "Supermercado");
    await usuario.type(screen.getByLabelText("Valor"), "100");
    await usuario.click(screen.getByRole("button", { name: /Dividir entre categorias/ }));
    const v1 = screen.getByLabelText("Valor da categoria 1");
    await usuario.clear(v1);
    await usuario.type(v1, "70");
    await usuario.click(screen.getByRole("button", { name: "Completar na última" }));
    expect(screen.getByLabelText("Valor da categoria 2")).toHaveValue("30,00");
    await usuario.click(screen.getByRole("button", { name: "Registrar despesa" }));
    await waitFor(() =>
      expect(invocar).toHaveBeenCalledWith("criar_lancamento", {
        input: expect.objectContaining({
          partidas: [
            { conta_id: "despesa-alimentacao", tipo: "DEBITO", valor_centavos: 7000 },
            { conta_id: "despesa-transporte", tipo: "DEBITO", valor_centavos: 3000 },
            { conta_id: "ativo-dinheiro", tipo: "CREDITO", valor_centavos: 10000 },
          ],
        }),
      }),
    );
  });

  it("preenche a partir da notificação do banco", async () => {
    const usuario = userEvent.setup();
    render(<DespesaForm contasOrigem={origens} categoriasDespesa={categorias} onRegistrada={vi.fn()} />);
    await usuario.click(screen.getByRole("button", { name: /Colar notificação/ }));
    await usuario.type(screen.getByLabelText("Texto da notificação"), "Compra de R$ 45,90 APROVADA em IFOOD para o cartão com final 1234");
    await usuario.click(screen.getByRole("button", { name: "Preencher" }));
    expect(screen.getByLabelText("Descrição")).toHaveValue("IFOOD");
    expect(screen.getByLabelText("Valor")).toHaveValue("45,90");
    expect(screen.getByLabelText("Conta de origem")).toHaveTextContent("Nubank");
  });
});
