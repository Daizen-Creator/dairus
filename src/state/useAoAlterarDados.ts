import { useEffect, useRef } from "react";

export const EVENTO_DADOS_ALTERADOS = "dairus:dados-alterados";

/** Avisa as telas abertas que os dados mudaram fora delas (ex.: lançamento rápido). */
export function avisarDadosAlterados(): void {
  window.dispatchEvent(new CustomEvent(EVENTO_DADOS_ALTERADOS));
}

/** Roda `aoAlterar` quando outro lugar do app avisar que os dados mudaram. */
export function useAoAlterarDados(aoAlterar: () => void): void {
  const ref = useRef(aoAlterar);
  ref.current = aoAlterar;
  useEffect(() => {
    const ouvir = () => ref.current();
    window.addEventListener(EVENTO_DADOS_ALTERADOS, ouvir);
    return () => window.removeEventListener(EVENTO_DADOS_ALTERADOS, ouvir);
  }, []);
}
