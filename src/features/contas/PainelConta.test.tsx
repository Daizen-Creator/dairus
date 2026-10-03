import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { invoke } from "@tauri-apps/api/core";
import { PainelConta } from "./PainelConta";
import { CONTAS, conta } from "../../testes/dados";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
const invocar = vi.mocked(invoke);
const banco = conta({ id: "banco-x", nome: "Banco X", tipo: "ATIVO", subtipo: "BANCO" });

describe("painel da conta", () => {
  beforeEach(() => {
    invocar.mockReset();
    invocar.mockImplementation(async (c: string) => {
      if (c === "uso_da_conta") return { lancamentos: 4, saldo_inicial: 1, agendamentos: 0, subcategorias: 0, sistema: false };
      if (c === "excluir_conta") return 5;
      return { nome: "backup.db" };
    });
  });

  it("exclui com o histórico só depois de digitar EXCLUIR, fazendo backup antes", async () => {
    const onAlterado = vi.fn();
    const usuario = userEvent.setup();
    render(<PainelConta conta={banco} outras={[CONTAS[0]]} lancamentos={[]} dinheiro={(v) => String(v)} onAlterado={onAlterado} />);
    await usuario.click(screen.getByRole("button", { name: "Mais ações" }));
    await usuario.click(screen.getByRole("button", { name: /Excluir conta/ }));
    expect(await screen.findByText(/lançamento\(s\)/)).toBeInTheDocument();
    const botao = screen.getByRole("button", { name: "Excluir com o histórico" });
    expect(botao).toBeDisabled();
    await usuario.type(screen.getByLabelText("Confirmar exclusão"), "EXCLUIR");
    await usuario.click(botao);
    await waitFor(() => expect(invocar).toHaveBeenCalledWith("excluir_conta", { contaId: "banco-x", apagarHistorico: true }));
    expect(invocar).toHaveBeenCalledWith("criar_backup");
    expect(onAlterado).toHaveBeenCalled();
  });

  it("junta com outra conta", async () => {
    const usuario = userEvent.setup();
    render(<PainelConta conta={banco} outras={[CONTAS[0]]} lancamentos={[]} dinheiro={(v) => String(v)} onAlterado={vi.fn()} />);
    await usuario.click(screen.getByRole("button", { name: "Mais ações" }));
    expect(screen.getByRole("button", { name: "Juntar" })).toBeDisabled();
  });
});
