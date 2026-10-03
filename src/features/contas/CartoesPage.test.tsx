import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { CartoesPage, comprasDoCartao } from "./CartoesPage";
import { conta, CONTAS, lancamento } from "../../testes/dados";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));

const invocar = vi.mocked(invoke);
const cartao = conta({ id: "cartao-nu", nome: "Nubank", tipo: "PASSIVO", subtipo: "CARTAO_CREDITO", dia_fechamento_fatura: 5, dia_vencimento_fatura: 12, limite_centavos: 500_000, saldo_atual_centavos: 300_000 });

describe("Cartões", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 2, 12));
    invocar.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("abre a compra parcelada em parcelas mensais", () => {
    const compra = lancamento({ id: "n", data: "2026-09-20", descricao: "Notebook", parcelas: 10 }, 300_000, "cartao-nu", "despesa-alimentacao");
    const compras = comprasDoCartao(cartao, [compra], new Map(CONTAS.map((c) => [c.id, c])));
    expect(compras).toHaveLength(10);
    expect(compras.every((x) => x.valor === 30_000)).toBe(true);
    expect(compras.map((x) => x.data).sort()[1]).toBe("2026-10-20");
  });

  it("mostra só a parcela do mês na fatura e o resto como parcelas futuras", async () => {
    const compra = lancamento({ id: "n", data: "2026-09-20", descricao: "Notebook", parcelas: 10 }, 300_000, "cartao-nu", "despesa-alimentacao");
    invocar.mockImplementation(async (c: string) => (c === "listar_contas" ? [...CONTAS.filter((x) => x.id !== "cartao-nu"), cartao] : c === "listar_lancamentos" ? [compra] : null));
    render(<CartoesPage />);
    // Fatura atual (06/09 a 05/10): só a 1ª parcela de 20/09 = R$ 300,00. Faltam 9 = R$ 2.700,00.
    expect(await screen.findByText(/Parcelas das próximas faturas/)).toHaveTextContent("2.700,00");
    expect(screen.getByText("Fatura atual (aberta)").nextElementSibling).toHaveTextContent("300,00");
  });

  it("registra uma compra parcelada pelo formulário", async () => {
    vi.useRealTimers();
    const usuario = userEvent.setup();
    invocar.mockImplementation(async (c: string) => (c === "listar_contas" ? [...CONTAS.filter((x) => x.id !== "cartao-nu"), cartao] : c === "listar_lancamentos" ? [] : { id: "novo" }));
    render(<CartoesPage />);
    await usuario.click(await screen.findByRole("button", { name: /Nova compra/ }));
    await usuario.type(screen.getByLabelText("Descrição da compra"), "Geladeira");
    await usuario.type(screen.getByLabelText("Valor da compra"), "1200");
    const parcelas = screen.getByLabelText("Número de parcelas");
    await usuario.clear(parcelas);
    await usuario.type(parcelas, "6");
    expect(screen.getByText(/6x de R\$\s?200,00/)).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Registrar compra" }));
    await waitFor(() =>
      expect(invocar).toHaveBeenCalledWith("registrar_despesa", { input: expect.objectContaining({ conta_origem_id: "cartao-nu", valor_centavos: 120_000, parcelas: 6 }) }),
    );
  });
});
