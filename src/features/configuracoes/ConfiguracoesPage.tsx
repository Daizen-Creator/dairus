import { Link } from "react-router-dom";

const PENDENTES = [
  "Faturas de cartão, parcelamentos e pagamento de fatura",
  "Importação de extratos OFX/CSV e conciliação bancária",
  "Exportação de relatórios em Excel (.xlsx) e PDF (hoje: CSV)",
  "Criptografia do banco de dados e dos backups",
  "Login com Google e sincronização em nuvem",
  "Busca automática de preços no Radar de Compras (hoje: preços informados por você)",
  "Catálogo completo de 102 temas (hoje: 18 temas reais em 9 categorias)",
];

export function ConfiguracoesPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-texto-primario">Configurações</h1>

      <section className="rounded-xl border border-borda bg-cartao p-4">
        <h2 className="text-sm font-semibold text-texto-primario">Preferências regionais</h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-texto-secundario">Moeda</dt>
            <dd className="text-texto-primario">Real (R$)</dd>
          </div>
          <div>
            <dt className="text-texto-secundario">Formato de data</dt>
            <dd className="text-texto-primario">DD/MM/AAAA</dd>
          </div>
          <div>
            <dt className="text-texto-secundario">Fuso horário</dt>
            <dd className="text-texto-primario">America/Sao_Paulo</dd>
          </div>
        </dl>
      </section>

      <section className="rounded-xl border border-borda bg-cartao p-4">
        <h2 className="text-sm font-semibold text-texto-primario">Atalhos</h2>
        <ul className="mt-2 space-y-1 text-sm">
          <li><Link to="/temas" className="text-primaria hover:underline">Temas e aparência</Link></li>
          <li><Link to="/backup" className="text-primaria hover:underline">Backup e PIN de bloqueio</Link></li>
          <li><Link to="/ia" className="text-primaria hover:underline">Chave do Google Gemini</Link></li>
        </ul>
      </section>

      <section className="rounded-xl border border-borda bg-cartao p-4">
        <h2 className="text-sm font-semibold text-texto-primario">Sobre o Dairus</h2>
        <p className="mt-2 text-sm text-texto-secundario">
          Versão 0.1.0. Motor contábil de partidas dobradas rodando localmente em SQLite, sem necessidade de internet
          (só o assistente de IA usa a internet, e apenas quando você pergunta).
        </p>
      </section>

      <section className="rounded-xl border border-dashed border-borda bg-superficie p-4">
        <h2 className="text-sm font-semibold text-texto-primario">Ainda não implementado</h2>
        <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-texto-secundario">
          {PENDENTES.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
