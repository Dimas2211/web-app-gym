import Image from "next/image";
import { cn } from "@/lib/utils/cn";

/**
 * Branding global Zolvi (SHARED-PILOT-4B.2).
 * Asset oficial: public/branding/zolvi-mark.svg (proporción 919×1192).
 * Branding del producto, no por organización ni por dominio.
 */
export const ZOLVI_BRAND = {
  name: "Zolvi",
  tagline: "Plataforma de gestión",
  footer: "Zolvi · Plataforma multiindustria",
  markSrc: "/branding/zolvi-mark.svg",
} as const;

const MARK_WIDTH = 919;
const MARK_HEIGHT = 1192;

type MarkProps = {
  /** Altura en px; el ancho se deriva de la proporción del logo. */
  size?: number;
  className?: string;
  priority?: boolean;
};

export function ZolviMark({ size = 32, className, priority }: MarkProps) {
  return (
    <Image
      src={ZOLVI_BRAND.markSrc}
      alt={ZOLVI_BRAND.name}
      width={Math.round((size * MARK_WIDTH) / MARK_HEIGHT)}
      height={size}
      priority={priority}
      unoptimized
      className={cn("shrink-0 select-none", className)}
    />
  );
}

type LogoProps = {
  /** "onDark" para topbars navy: el isotipo va sobre una tesela blanca. */
  tone?: "onLight" | "onDark";
  className?: string;
};

/** Isotipo + wordmark para topbars y cabeceras compactas. */
export function ZolviLogo({ tone = "onLight", className }: LogoProps) {
  const onDark = tone === "onDark";
  return (
    <span className={cn("flex shrink-0 items-center gap-2", className)}>
      <span
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-lg",
          onDark ? "bg-white shadow-sm" : "bg-brand-blue-soft"
        )}
      >
        <ZolviMark size={22} />
      </span>
      <span
        className={cn(
          "text-lg font-bold tracking-tight",
          onDark ? "text-white" : "text-brand-navy"
        )}
      >
        {ZOLVI_BRAND.name}
      </span>
    </span>
  );
}
