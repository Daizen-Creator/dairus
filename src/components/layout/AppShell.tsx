import { Suspense, type ReactNode } from "react";
import { Outlet } from "react-router-dom";
import { Toaster } from "sonner";
import { TitleBar } from "./TitleBar";
import { MenuSuperior, Sidebar } from "./Sidebar";
import { FundoApp } from "./FundoApp";
import { IntegracaoSistema } from "./IntegracaoSistema";
import { LancamentoRapido } from "./LancamentoRapido";
import { AvisoSincronizacao } from "./AvisoSincronizacao";
import { AvisoAtualizacao } from "./AvisoAtualizacao";
import { FaixaViagem } from "./FaixaViagem";
import { FaixaOffline } from "./FaixaOffline";
import { Tutorial } from "../../features/ajuda/Tutorial";

export function AppShell({ carregando }: { carregando?: ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      <FundoApp />
      <TitleBar />
      <AvisoSincronizacao />
      <AvisoAtualizacao />
      <FaixaOffline />
      <FaixaViagem />
      <MenuSuperior />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto bg-fundo">
          <div className="mx-auto max-w-[1600px] p-3 sm:p-4 lg:p-6">
            <Suspense fallback={carregando}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
      <IntegracaoSistema />
      <LancamentoRapido />
      <Tutorial />
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "var(--cor-cartao)",
            color: "var(--cor-texto-primario)",
            border: "1px solid var(--cor-borda)",
          },
        }}
      />
    </div>
  );
}
