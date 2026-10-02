import { lazy, useEffect, useState } from "react";
import { HashRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { BloqueioTela } from "../components/layout/BloqueioTela";
import { executarBackupAutomatico } from "../services/backupAutomatico";
import { lerPreferencia } from "../services/armazenamento";
import { useSegurancaStore } from "../state/seguranca-store";
import { useThemeStore } from "../state/theme-store";

// Cada página é carregada só quando aberta (app abre mais rápido).
const DashboardPage = lazy(() => import("../features/dashboard/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const ContasBancariasPage = lazy(() => import("../features/contas/ContasBancariasPage").then((m) => ({ default: m.ContasBancariasPage })));
const CartoesPage = lazy(() => import("../features/contas/CartoesPage").then((m) => ({ default: m.CartoesPage })));
const LancamentosPage = lazy(() => import("../features/lancamentos/LancamentosPage").then((m) => ({ default: m.LancamentosPage })));
const OrcamentoPage = lazy(() => import("../features/orcamento/OrcamentoPage").then((m) => ({ default: m.OrcamentoPage })));
const MetasPage = lazy(() => import("../features/metas/MetasPage").then((m) => ({ default: m.MetasPage })));
const PatrimonioPage = lazy(() => import("../features/patrimonio/PatrimonioPage").then((m) => ({ default: m.PatrimonioPage })));
const SalarioPage = lazy(() => import("../features/salario/SalarioPage").then((m) => ({ default: m.SalarioPage })));
const ContabilidadePage = lazy(() => import("../features/contabilidade/ContabilidadePage").then((m) => ({ default: m.ContabilidadePage })));
const RelatoriosPage = lazy(() => import("../features/relatorios/RelatoriosPage").then((m) => ({ default: m.RelatoriosPage })));
const IaPage = lazy(() => import("../features/ia/IaPage").then((m) => ({ default: m.IaPage })));
const RadarPage = lazy(() => import("../features/radar/RadarPage").then((m) => ({ default: m.RadarPage })));
const BackupPage = lazy(() => import("../features/backup/BackupPage").then((m) => ({ default: m.BackupPage })));
const TemasPage = lazy(() => import("../features/temas/TemasPage").then((m) => ({ default: m.TemasPage })));
const ConfiguracoesPage = lazy(() => import("../features/configuracoes/ConfiguracoesPage").then((m) => ({ default: m.ConfiguracoesPage })));

function CarregandoPagina() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="h-7 w-56 animate-pulse rounded-lg bg-borda/50" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl bg-borda/40" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-xl bg-borda/30" />
    </div>
  );
}

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

  // Preferências de interface: tamanho do texto, animações reduzidas e tela inicial.
  useEffect(() => {
    if (!carregado) return;
    lerPreferencia<number>("ui_fonte").then((f) => {
      document.documentElement.style.fontSize = f && f >= 85 && f <= 125 ? `${f}%` : "";
    });
    lerPreferencia<boolean>("ui_sem_animacoes").then((v) => document.documentElement.classList.toggle("sem-animacoes", !!v));
    lerPreferencia<string>("pagina_inicial").then((rota) => {
      if (rota && rota !== "/" && (window.location.hash === "" || window.location.hash === "#/")) window.location.hash = `#${rota}`;
    });
  }, [carregado]);

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
          <Route element={<AppShell carregando={<CarregandoPagina />} />}>
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
