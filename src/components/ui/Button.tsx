import { type ButtonHTMLAttributes, forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { clsx } from "clsx";

const estilosBotao = cva(
  // Feedback de pressão (emil-design-eng): scale sutil no :active, com
  // ease-out curto — confirma pro usuário que o clique foi "ouvido".
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-[background-color,color,transform,box-shadow,filter] duration-150 [transition-timing-function:var(--ease-out)] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100",
  {
    variants: {
      variante: {
        primaria:
          "bg-gradient-to-r from-primaria to-destaque text-primaria-texto shadow-[0_0_0_0_transparent] hover:shadow-[0_4px_18px_-4px_var(--cor-primaria)] hover:brightness-[1.08]",
        secundaria: "border border-borda bg-superficie text-texto-primario hover:bg-borda/40",
        perigo: "bg-erro text-white hover:opacity-90",
        fantasma: "text-texto-secundario hover:bg-borda/40 hover:text-texto-primario",
      },
      tamanho: {
        padrao: "h-9 px-4",
        pequeno: "h-8 px-3 text-xs",
      },
    },
    defaultVariants: {
      variante: "primaria",
      tamanho: "padrao",
    },
  },
);

interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof estilosBotao> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variante, tamanho, ...props }, ref) => (
    <button ref={ref} className={clsx(estilosBotao({ variante, tamanho }), className)} {...props} />
  ),
);
Button.displayName = "Button";
