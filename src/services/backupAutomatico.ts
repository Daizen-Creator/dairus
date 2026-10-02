import { lerPreferencia } from "./armazenamento";
import { extras } from "./extras";

const SETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;

/** Se o backup automático estiver ligado e o último tiver mais de 7 dias, faz um novo. */
export async function executarBackupAutomatico(): Promise<void> {
  if (!(await lerPreferencia<boolean>("backup_auto"))) return;
  const ultimo = (await extras.listarBackups()).find((b) => !b.nome.startsWith("antes-de-restaurar"));
  const quando = ultimo ? new Date(ultimo.criado_em.replace(" ", "T")).getTime() : 0;
  if (Date.now() - quando > SETE_DIAS_MS) await extras.criarBackup();
}
