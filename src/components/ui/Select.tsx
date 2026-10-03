import { Select as BaseSelect } from "@base-ui/react/select";

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onValueChange: (valor: string) => void;
  options: SelectOption[];
  "aria-label": string;
  disabled?: boolean;
  className?: string;
}

/** O Base UI trata o valor "" como "nada escolhido" e mostra "Selecione…" no lugar
 * de opções como "Todas as contas" ou "Nenhuma". Por dentro, "" vira este marcador. */
const VAZIO = "__vazio__";
const paraBase = (v: string) => (v === "" ? VAZIO : v);

/**
 * Select temático e acessível (Base UI). Existe porque o `<select>` nativo
 * do Windows ignora nossas cores de tema na lista de opções aberta — WebView2
 * segue o modo claro/escuro do sistema ali, não o CSS da página (ver seção
 * "Dark Mode & Theming" das Web Interface Guidelines).
 */
export function Select({ value, onValueChange, options, disabled, className, ...rest }: SelectProps) {
  const itens = options.map((o) => ({ ...o, value: paraBase(o.value) }));
  return (
    <BaseSelect.Root
      value={paraBase(value)}
      onValueChange={(v) => onValueChange(v === VAZIO ? "" : (v as string))}
      disabled={disabled}
      items={itens}
    >
      <BaseSelect.Trigger
        aria-label={rest["aria-label"]}
        className={`flex h-9 items-center justify-between gap-2 rounded-lg border border-borda bg-fundo px-3 text-sm text-texto-primario outline-none transition-colors focus-visible:border-primaria focus-visible:ring-2 focus-visible:ring-primaria/30 disabled:cursor-not-allowed disabled:opacity-60 ${className ?? ""}`}
      >
        <BaseSelect.Value placeholder="Selecione…" />
        <BaseSelect.Icon className="text-texto-secundario">▾</BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner sideOffset={4} className="z-50">
          <BaseSelect.Popup
            className="max-h-72 overflow-auto rounded-lg border border-borda bg-cartao py-1 text-sm shadow-lg outline-none transition-[transform,opacity] duration-150 ease-out
              data-[starting-style]:scale-95 data-[starting-style]:opacity-0
              data-[ending-style]:scale-95 data-[ending-style]:opacity-0"
            style={{ transformOrigin: "var(--transform-origin)" }}
          >
            {itens.map((opcao) => (
              <BaseSelect.Item
                key={opcao.value}
                value={opcao.value}
                className="flex cursor-pointer items-center justify-between px-3 py-1.5 text-texto-primario outline-none data-[highlighted]:bg-primaria data-[highlighted]:text-primaria-texto"
              >
                <BaseSelect.ItemText>{opcao.label}</BaseSelect.ItemText>
              </BaseSelect.Item>
            ))}
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}
