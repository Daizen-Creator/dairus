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

interface SegurancaState {
  carregado: boolean;
  pinAtivo: boolean;
  bloqueado: boolean;
  minutosInatividade: number;
  falhas: number;
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

  async inicializar() {
    const hash = await lerPreferencia<string>("pin_hash");
    const minutos = (await lerPreferencia<number>("pin_minutos")) ?? 5;
    set({ carregado: true, pinAtivo: !!hash, bloqueado: !!hash, minutosInatividade: minutos });
  },

  async definirPin(pin) {
    const salt = paraHex(crypto.getRandomValues(new Uint8Array(16)).buffer);
    await salvarPreferencia("pin_salt", salt);
    await salvarPreferencia("pin_hash", await derivar(pin, salt));
    set({ pinAtivo: true, bloqueado: false, falhas: 0 });
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
    const ok = (await derivar(pin, salt)) === hash;
    set(ok ? { bloqueado: false, falhas: 0 } : { falhas: get().falhas + 1 });
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
