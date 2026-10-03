import { create } from "zustand";
import { lerPreferencia, salvarPreferencia } from "../services/armazenamento";

// Bloqueio local por PIN. É um bloqueio de tela do aplicativo: impede quem
// está na frente do computador de usar o Dairus, mas NÃO criptografa o
// arquivo do banco de dados. Só o hash (PBKDF2) do PIN é guardado.

const ITERACOES = 150_000;

const paraHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const deHex = (hex: string) => new Uint8Array(hex.match(/.{2}/g)!.map((h) => parseInt(h, 16)));

async function derivar(pin: string, saltHex: string): Promise<string> {
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: deHex(saltHex), iterations: ITERACOES },
    chave,
    256,
  );
  return paraHex(bits);
}

/** Erros seguidos livres; depois, espera que dobra a cada erro (1 min → 1 h). Igual ao limite da senha do banco. */
export const PIN_TENTATIVAS_LIVRES = 5;
export function esperaDoPin(falhas: number): number {
  if (falhas < PIN_TENTATIVAS_LIVRES) return 0;
  return Math.min(3600, 60 * 2 ** Math.min(10, falhas - PIN_TENTATIVAS_LIVRES));
}

/** Compara sem parar no primeiro caractere diferente. */
export function iguaisTempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

interface SegurancaState {
  carregado: boolean;
  pinAtivo: boolean;
  bloqueado: boolean;
  minutosInatividade: number;
  falhas: number;
  /** Momento (ms) até quando o PIN não é aceito. */
  bloqueadoAte: number;
  inicializar: () => Promise<void>;
  definirPin: (pin: string) => Promise<void>;
  removerPin: (pin: string) => Promise<boolean>;
  desbloquear: (pin: string) => Promise<boolean>;
  bloquear: () => void;
  definirMinutos: (minutos: number) => Promise<void>;
}

export const useSegurancaStore = create<SegurancaState>((set, get) => ({
  carregado: false,
  pinAtivo: false,
  bloqueado: false,
  minutosInatividade: 5,
  falhas: 0,
  bloqueadoAte: 0,

  async inicializar() {
    const hash = await lerPreferencia<string>("pin_hash");
    const minutos = (await lerPreferencia<number>("pin_minutos")) ?? 5;
    // Falhas gravadas: fechar e abrir o app não zera a contagem.
    const falhas = (await lerPreferencia<number>("pin_falhas")) ?? 0;
    const bloqueadoAte = (await lerPreferencia<number>("pin_bloqueado_ate")) ?? 0;
    set({ carregado: true, pinAtivo: !!hash, bloqueado: !!hash, minutosInatividade: minutos, falhas, bloqueadoAte });
  },

  async definirPin(pin) {
    const salt = paraHex(crypto.getRandomValues(new Uint8Array(16)).buffer);
    await salvarPreferencia("pin_salt", salt);
    await salvarPreferencia("pin_hash", await derivar(pin, salt));
    await salvarPreferencia("pin_falhas", 0);
    await salvarPreferencia("pin_bloqueado_ate", 0);
    set({ pinAtivo: true, bloqueado: false, falhas: 0, bloqueadoAte: 0 });
  },

  async removerPin(pin) {
    if (!(await get().desbloquear(pin))) return false;
    await salvarPreferencia("pin_hash", null);
    await salvarPreferencia("pin_salt", null);
    set({ pinAtivo: false, bloqueado: false });
    return true;
  },

  async desbloquear(pin) {
    const hash = await lerPreferencia<string>("pin_hash");
    const salt = await lerPreferencia<string>("pin_salt");
    if (!hash || !salt) return true;
    if (Date.now() < get().bloqueadoAte) return false;
    const ok = iguaisTempoConstante(await derivar(pin, salt), hash);
    const falhas = ok ? 0 : get().falhas + 1;
    const espera = esperaDoPin(falhas);
    const bloqueadoAte = espera ? Date.now() + espera * 1000 : 0;
    await salvarPreferencia("pin_falhas", falhas);
    await salvarPreferencia("pin_bloqueado_ate", bloqueadoAte);
    set(ok ? { bloqueado: false, falhas: 0, bloqueadoAte: 0 } : { falhas, bloqueadoAte });
    return ok;
  },

  bloquear() {
    if (get().pinAtivo) set({ bloqueado: true });
  },

  async definirMinutos(minutos) {
    await salvarPreferencia("pin_minutos", minutos);
    set({ minutosInatividade: minutos });
  },
}));
