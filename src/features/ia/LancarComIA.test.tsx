import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { LancarComIA } from "./LancarComIA";
import { CONTAS } from "../../testes/dados";
import { salvarPreferencia } from "../../services/armazenamento";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
const invocar = vi.mocked(invoke);

describe("lançar conversando (sem IA)", () => {
  beforeEach(() => {
    invocar.mockReset();
    invocar.mockImplementation(async (c: string) => {
      if (c === "listar_contas") return CONTAS;
      if (c === "listar_lancamentos") return [];
      if (c === "listar_regras") return [{ id: "r1", padrao: "mercado", categoria_id: "despesa-alimentacao" }, { id: "r2", padrao: "salario", categoria_id: "receita-salario" }];
      return { id: `novo-${c}`, partidas: [] };
    });
  });

  it("entende o texto, deixa revisar e grava despesa e receita com a etiqueta da viagem", async () => {
    await salvarPreferencia("modo_viagem", { ativo: true, nome: "Praia", inicio: "2000-01-01", fim: null, orcamento_centavos: null });
    const usuario = userEvent.setup();
    render(<LancarComIA temChave={false} />);
    await waitFor(() => expect(invocar).toHaveBeenCalledWith("listar_contas"));
    await usuario.type(screen.getByLabelText("Descreva os lançamentos"), "mercado 45,90 no dinheiro{enter}recebi 300 de salário no dinheiro");
    await usuario.click(screen.getByRole("button", { name: "Entender" }));
    expect(await screen.findAllByLabelText("Descrição")).toHaveLength(2);
    expect(screen.getByText(/Total: R\$\s?345,90/)).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Lançar 2" }));
    await waitFor(() => expect(invocar).toHaveBeenCalledWith("registrar_despesa", { input: expect.objectContaining({ conta_origem_id: "ativo-dinheiro", categoria_despesa_id: "despesa-alimentacao", valor_centavos: 4590, descricao: "Mercado" }) }));
    await waitFor(() => expect(invocar).toHaveBeenCalledWith("definir_tags", { lancamentoId: "novo-registrar_despesa", tags: ["viagem-praia"] }));
    await waitFor(() => expect(invocar).toHaveBeenCalledWith("registrar_recebimento", { input: expect.objectContaining({ conta_destino_id: "ativo-dinheiro", conta_receita_id: "receita-salario", valor_centavos: 30_000 }) }));
    await waitFor(() => expect(screen.queryAllByLabelText("Descrição")).toHaveLength(0));
  });
});
