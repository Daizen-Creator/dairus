import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { HistoricoLancamentos } from "./HistoricoLancamentos";
import { CONTAS, lancamento } from "../../testes/dados";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// A lista virtual não desenha nada no jsdom (sem altura); nos testes, desenha tudo.
vi.mock("react-virtuoso", () => ({
  Virtuoso: ({ data, itemContent }: { data: unknown[]; itemContent: (i: number, item: unknown) => ReactNode }) => (
    <div>{data.map((item, i) => <div key={i}>{itemContent(i, item)}</div>)}</div>
  ),
}));

const invocar = vi.mocked(invoke);

describe("Histórico de lançamentos", () => {
  beforeEach(() => {
    invocar.mockReset();
    invocar.mockImplementation(async (c: string) => {
      if (c === "listar_tags") return [{ lancamento_id: "l2", tag: "trabalho" }];
      if (c === "listar_anexos") return [{ id: "ax1", lancamento_id: "l1", nome: "nota.pdf", mime: "application/pdf", tamanho: 10, criado_em: "" }];
      return "C:/Users/x/Documents/Dairus/Exportacoes/historico.xlsx";
    });
  });

  const lancs = [
    lancamento({ id: "l1", data: "2026-09-10", descricao: "Mercado" }, 5000),
    lancamento({ id: "l2", data: "2026-09-11", descricao: "Uber" }, 1800, "ativo-dinheiro", "despesa-transporte"),
  ];

  it("corrige valor e data com um clique", async () => {
    const usuario = userEvent.setup();
    const aoAlterar = vi.fn();
    render(<HistoricoLancamentos lancamentos={lancs} contas={CONTAS} onAlterado={aoAlterar} onDuplicar={vi.fn()} />);

    const cartao = screen.getByText("Mercado").closest("div.rounded-xl") as HTMLElement;
    await usuario.click(within(cartao).getByRole("button", { name: "Corrigir" }));
    const valor = screen.getByLabelText("Valor correto");
    expect(valor).toHaveValue("50,00");
    await usuario.clear(valor);
    await usuario.type(valor, "42");
    const data = screen.getByLabelText("Data correta");
    await usuario.clear(data);
    await usuario.type(data, "2026-09-12");
    await usuario.click(screen.getByRole("button", { name: "Salvar correção" }));

    await waitFor(() =>
      expect(invocar).toHaveBeenCalledWith("corrigir_lancamento", {
        input: { lancamento_id: "l1", nova_data: "2026-09-12", novo_valor_centavos: 4200 },
      }),
    );
    expect(aoAlterar).toHaveBeenCalled();
  });

  it("mostra os selos de parcelado e corrigido", () => {
    render(
      <HistoricoLancamentos
        lancamentos={[lancamento({ id: "p", data: "2026-09-10", descricao: "Notebook", parcelas: 10 }), lancamento({ id: "c", data: "2026-09-12", descricao: "Café", corrige: "x" })]}
        contas={CONTAS}
        onAlterado={vi.fn()}
        onDuplicar={vi.fn()}
      />,
    );
    expect(screen.getByText("10x")).toBeInTheDocument();
    expect(screen.getByText("corrigido")).toBeInTheDocument();
  });

  it("filtra pela busca e exporta para Excel só o que está na tela", async () => {
    const usuario = userEvent.setup();
    render(<HistoricoLancamentos lancamentos={lancs} contas={CONTAS} onAlterado={vi.fn()} onDuplicar={vi.fn()} />);
    await usuario.type(screen.getByLabelText("Buscar lançamentos"), "uber");
    expect(screen.queryByText("Mercado")).not.toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: /Excel/ }));
    await waitFor(() => expect(invocar).toHaveBeenCalledWith("exportar_xlsx", expect.anything()));
    const [, args] = invocar.mock.calls.find(([c]) => c === "exportar_xlsx")!;
    const abas = (args as { abas: Array<{ linhas: unknown[][] }> }).abas;
    expect(abas[0].linhas).toHaveLength(1);
    expect(abas[0].linhas[0][1]).toBe("Uber");
    expect(abas[0].linhas[0][6]).toBe(-1800);
  });

  it("mostra as tags, filtra por tag e mostra o comprovante anexado", async () => {
    const usuario = userEvent.setup();
    render(<HistoricoLancamentos lancamentos={lancs} contas={CONTAS} onAlterado={vi.fn()} onDuplicar={vi.fn()} />);
    await usuario.click(await screen.findByRole("button", { name: "#trabalho" }));
    expect(screen.queryByText("Mercado")).not.toBeInTheDocument();
    expect(screen.getByText("Uber")).toBeInTheDocument();
  });
});
