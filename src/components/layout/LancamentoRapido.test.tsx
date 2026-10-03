import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { LancamentoRapido } from "./LancamentoRapido";
import { CONTAS } from "../../testes/dados";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const invocar = vi.mocked(invoke);

describe("Lançamento rápido", () => {
  beforeEach(() => {
    invocar.mockReset();
    invocar.mockImplementation(async (comando: string) => (comando === "listar_contas" ? CONTAS : { id: "novo" }));
  });

  it("abre com Ctrl+Shift+N, lança a despesa e fecha", async () => {
    const usuario = userEvent.setup();
    render(<LancamentoRapido />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await usuario.keyboard("{Control>}{Shift>}N{/Shift}{/Control}");
    expect(await screen.findByRole("dialog", { name: "Lançamento rápido" })).toBeInTheDocument();
    await waitFor(() => expect(invocar).toHaveBeenCalledWith("listar_contas"));

    await usuario.type(screen.getByLabelText("Descrição"), "Almoço");
    await usuario.type(screen.getByLabelText("Valor"), "32,50");
    await usuario.click(screen.getByRole("button", { name: "Lançar" }));

    await waitFor(() =>
      expect(invocar).toHaveBeenCalledWith("registrar_despesa", {
        input: expect.objectContaining({ descricao: "Almoço", valor_centavos: 3250, categoria_despesa_id: "despesa-alimentacao", conta_origem_id: "ativo-dinheiro" }),
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("não lança sem valor", async () => {
    const usuario = userEvent.setup();
    render(<LancamentoRapido />);
    await usuario.keyboard("{Control>}{Shift>}N{/Shift}{/Control}");
    await screen.findByRole("dialog");
    await usuario.type(screen.getByLabelText("Descrição"), "Sem valor");
    await usuario.click(screen.getByRole("button", { name: "Lançar" }));
    expect(invocar).not.toHaveBeenCalledWith("registrar_despesa", expect.anything());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("lança uma receita quando o tipo é trocado", async () => {
    const usuario = userEvent.setup();
    render(<LancamentoRapido />);
    await usuario.keyboard("{Control>}{Shift>}N{/Shift}{/Control}");
    await screen.findByRole("dialog");
    await usuario.click(screen.getByRole("button", { name: "Receita" }));
    await usuario.type(screen.getByLabelText("Descrição"), "Freela");
    await usuario.type(screen.getByLabelText("Valor"), "200");
    await usuario.click(screen.getByRole("button", { name: "Lançar" }));
    await waitFor(() =>
      expect(invocar).toHaveBeenCalledWith("registrar_recebimento", {
        input: expect.objectContaining({ descricao: "Freela", valor_centavos: 20000, conta_receita_id: "receita-salario", conta_destino_id: "ativo-dinheiro" }),
      }),
    );
  });
});
