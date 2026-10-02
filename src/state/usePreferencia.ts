import { useCallback, useEffect, useState } from "react";
import { lerPreferencia, salvarPreferencia } from "../services/armazenamento";

/** Estado persistido em preferencias.json (ou localStorage fora do Tauri). */
export function usePreferencia<T>(chave: string, padrao: T): [T, (valor: T) => void] {
  const [valor, setValor] = useState<T>(padrao);

  useEffect(() => {
    let vivo = true;
    lerPreferencia<T>(chave).then((v) => {
      if (vivo && v !== null) setValor(v);
    });
    return () => {
      vivo = false;
    };
  }, [chave]);

  const definir = useCallback(
    (novo: T) => {
      setValor(novo);
      salvarPreferencia(chave, novo).catch(() => {});
    },
    [chave],
  );

  return [valor, definir];
}
