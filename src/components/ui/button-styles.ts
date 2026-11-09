import { cn } from "@/lib/utils/cn";

/**
 * Estilos de botón compartidos (sistema de diseño getzolvi.com).
 * Usar en componentes nuevos o al tocar una pantalla, en lugar de repetir
 * cadenas de clases. Solo presentación.
 *
 * - primary: acción principal de la pantalla (navy).
 * - accent: acción destacada de marca (rosa); como máximo una por pantalla.
 * - outline / ghost: acciones secundarias.
 * - danger: acciones destructivas.
 */
export type ButtonVariant = "primary" | "accent" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50";

const SIZES: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-5 py-2.5 text-sm",
};

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-dark text-white hover:bg-zinc-800",
  accent: "bg-primary text-white hover:bg-primary-dark shadow-sm shadow-primary/25",
  outline: "border border-dark/20 text-dark hover:border-primary/40 hover:bg-primary/10 hover:text-primary-dark",
  ghost: "text-dark hover:bg-dark/5",
  danger: "bg-red-600 text-white hover:bg-red-700",
};

export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className?: string,
): string {
  return cn(BASE, SIZES[size], VARIANTS[variant], className);
}
