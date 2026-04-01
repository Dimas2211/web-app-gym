/**
 * Componente servidor que genera y renderiza un QR SVG inline.
 * No requiere "use client" porque usa la librería qrcode en Node.js.
 *
 * El contenido del QR es el qr_token (UUID estable), que puede usarse
 * en el futuro para control de acceso, asistencia rápida, etc.
 */
import QRCode from "qrcode";

interface QrCodeDisplayProps {
  /** Token estable a codificar — normalmente el campo qr_token del registro */
  token: string;
  /** Tamaño en píxeles (el SVG es escalable, pero establece el viewBox) */
  size?: number;
  /** Clase CSS adicional para el contenedor */
  className?: string;
}

export async function QrCodeDisplay({ token, size = 160, className = "" }: QrCodeDisplayProps) {
  let svg = "";
  try {
    svg = await QRCode.toString(token, {
      type: "svg",
      width: size,
      margin: 1,
      color: { dark: "#18181b", light: "#ffffff" },
    });
  } catch {
    return (
      <div
        className={`flex items-center justify-center bg-zinc-100 rounded text-xs text-zinc-400 ${className}`}
        style={{ width: size, height: size }}
      >
        QR no disponible
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{ width: size, height: size }}
      // Seguro: el SVG es generado internamente desde un UUID bajo nuestro control
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
