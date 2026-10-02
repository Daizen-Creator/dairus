import { Suspense, type ReactNode } from "react";
import { Outlet } from "react-router-dom";
import { Toaster } from "sonner";
import { TitleBar } from "./TitleBar";
import { Sidebar } from "./Sidebar";

export function AppShell({ carregando }: { carregando?: ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      <div className="flex min-h-0 flex-1">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto bg-fundo">
          <div className="mx-auto max-w-[1600px] p-6">
            <Suspense fallback={carregando}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
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
