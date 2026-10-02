import { useEffect, useState } from "react";
import { HashRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { BloqueioTela } from "../components/layout/BloqueioTela";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { ContasBancariasPage } from "../features/contas/ContasBancariasPage";
import { CartoesPage } from "../features/contas/CartoesPage";
import { LancamentosPage } from "../features/lancamentos/LancamentosPage";
import { OrcamentoPage } from "../features/orcamento/OrcamentoPage";
import { MetasPage } from "../features/metas/MetasPage";
import { PatrimonioPage } from "../features/patrimonio/PatrimonioPage";
import { SalarioPage } from "../features/salario/SalarioPage";
import { ContabilidadePage } from "../features/contabilidade/ContabilidadePage";
import { RelatoriosPage } from "../features/relatorios/RelatoriosPage";
import { IaPage } from "../features/ia/IaPage";
import { RadarPage } from "../features/radar/RadarPage";
import { BackupPage } from "../features/backup/BackupPage";
import { TemasPage } from "../features/temas/TemasPage";
import { ConfiguracoesPage } from "../features/configuracoes/ConfiguracoesPage";
import { executarBackupAutomatico } from "../services/backupAutomatico";
import { useSegurancaStore } from "../state/seguranca-store";
import { useThemeStore } from "../state/theme-store";

export function App() {
  const inicializar = useThemeStore((s) => s.inicializar);
  const carregado = useThemeStore((s) => s.carregado);
  const inicializarSeguranca = useSegurancaStore((s) => s.inicializar);
  const segurancaCarregada = useSegurancaStore((s) => s.carregado);
  const [erroFatal, setErroFatal] = useState<string | null>(null);

  useEffect(() => {
    inicializar().catch((e) => setErroFatal(String(e)));
    inicializarSeguranca().catch((e) => setErroFatal(String(e)));
    executarBackupAutomatico().catch(() => {
      // Backup automático é conveniência: falha silenciosa; o status real aparece em Backup e Segurança.
    });
  }, [inicializar, inicializarSeguranca]);

  if (erroFatal) {
    return (
      <div className="flex h-full items-center justify-center bg-fundo p-6 text-center text-texto-primario">
        <p>Não foi possível iniciar o Dairus: {erroFatal}</p>
      </div>
    );
  }

  if (!carregado || !segurancaCarregada) {
    return <div className="flex h-full items-center justify-center bg-fundo" />;
  }

  return (
    <BloqueioTela>
      <HashRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="contas-bancarias" element={<ContasBancariasPage />} />
            <Route path="cartoes" element={<CartoesPage />} />
            <Route path="lancamentos" element={<LancamentosPage />} />
            <Route path="orcamento" element={<OrcamentoPage />} />
            <Route path="metas" element={<MetasPage />} />
            <Route path="patrimonio" element={<PatrimonioPage />} />
            <Route path="salario" element={<SalarioPage />} />
            <Route path="contabilidade" element={<ContabilidadePage />} />
            <Route path="relatorios" element={<RelatoriosPage />} />
            <Route path="ia" element={<IaPage />} />
            <Route path="radar" element={<RadarPage />} />
            <Route path="backup" element={<BackupPage />} />
            <Route path="temas" element={<TemasPage />} />
            <Route path="configuracoes" element={<ConfiguracoesPage />} />
          </Route>
        </Routes>
      </HashRouter>
    </BloqueioTela>
  );
}
