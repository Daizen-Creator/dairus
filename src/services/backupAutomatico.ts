import { lerPreferencia } from "./armazenamento";
import { extras } from "./extras";

const DIA_MS = 24 * 60 * 60 * 1000;
const INTERVALO_DIAS: Record<string, number> = { DIARIO: 1, SEMANAL: 7, MENSAL: 30 };

/** Se o backup automático estiver ligado e o último estiver vencido, faz um novo e aplica a retenção. */
export async function executarBackupAutomatico(): Promise<void> {
  if (!(await lerPreferencia<boolean>("backup_auto"))) return;
  const frequencia = (await lerPreferencia<string>("backup_frequencia")) ?? "SEMANAL";
  const manter = (await lerPreferencia<number>("backup_retencao")) ?? 10;
  const ultimo = (await extras.listarBackups()).find((b) => b.nome.startsWith("dairus-"));
  const quando = ultimo ? new Date(ultimo.criado_em.replace(" ", "T")).getTime() : 0;
  if (Date.now() - quando > (INTERVALO_DIAS[frequencia] ?? 7) * DIA_MS) {
    const info = await extras.criarBackup();
    await extras.aplicarRetencao(manter);
    if (await lerPreferencia<boolean>("backup_nuvem_auto")) {
      const { enviarBackupParaNuvem } = await import("./nuvem");
      try {
        await enviarBackupParaNuvem(info.nome);
        // Limpa também os backups antigos da nuvem, com a mesma retenção dos locais.
        const { aplicarRetencaoNaNuvem } = await import("./sincronizacao");
        await aplicarRetencaoNaNuvem(manter);
      } catch {
        // sem internet: o backup local já foi feito; a nuvem fica para a próxima
      }
    }
  }
}
