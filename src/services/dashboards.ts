// Layouts do painel inicial, guardados no banco da conta (tabela `dashboards`, ver
// src-tauri/src/dashboards.rs). O Rust valida posição, tamanho e configuração.

import { invoke } from "@tauri-apps/api/core";
import type { Painel } from "../features/dashboard/layoutWidgets";

export const dashboards = {
  listar: () => invoke<Painel[]>("listar_dashboards"),
  salvar: (dashboard: Painel) => invoke<Painel>("salvar_dashboard", { dashboard }),
  ativar: (id: string) => invoke<void>("ativar_dashboard", { id }),
  excluir: (id: string) => invoke<void>("excluir_dashboard", { id }),
};
