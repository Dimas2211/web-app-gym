// ─────────────────────────────────────────────────────────────────
// commerce/dte — numero-a-letras.ts
//
// Convierte un monto numérico en palabras para el campo totalLetras
// del JSON DTE MH El Salvador.
//
// Formato de salida: "{ENTERO EN PALABRAS} {centavos}/100 DOLARES"
// Ejemplo: 11.30 → "ONCE 30/100 DOLARES"
//
// Cobertura: 0 a 999,999.99 USD (rango típico de transacciones MVP).
// ─────────────────────────────────────────────────────────────────

const ONES: string[] = [
  "", "UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE",
  "DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISÉIS",
  "DIECISIETE", "DIECIOCHO", "DIECINUEVE",
];

const TENS: string[] = [
  "", "", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA",
  "SESENTA", "SETENTA", "OCHENTA", "NOVENTA",
];

const HUNDREDS: string[] = [
  "", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS",
  "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS",
];

function convertChunk(n: number): string {
  if (n === 0) return "";
  if (n === 100) return "CIEN";

  const h = Math.floor(n / 100);
  const remainder = n % 100;
  const t = Math.floor(remainder / 10);
  const o = remainder % 10;

  const parts: string[] = [];

  if (h > 0) parts.push(HUNDREDS[h]);

  if (remainder === 0) {
    // only hundreds
  } else if (remainder < 20) {
    parts.push(ONES[remainder]);
  } else {
    if (o === 0) {
      parts.push(TENS[t]);
    } else if (t === 2) {
      parts.push(`VEINTI${ONES[o]}`);
    } else {
      parts.push(`${TENS[t]} Y ${ONES[o]}`);
    }
  }

  return parts.join(" ");
}

function convertThousands(n: number): string {
  if (n === 0) return "CERO";

  const thousands = Math.floor(n / 1000);
  const remainder = n % 1000;

  const parts: string[] = [];

  if (thousands > 0) {
    if (thousands === 1) {
      parts.push("MIL");
    } else {
      parts.push(`${convertChunk(thousands)} MIL`);
    }
  }

  const chunkStr = convertChunk(remainder);
  if (chunkStr) parts.push(chunkStr);

  return parts.join(" ");
}

/**
 * Convierte un monto numérico en texto para el campo `totalLetras` del DTE MH.
 * Formato: "ENTERO EN PALABRAS {cc}/100 DOLARES"
 * Ejemplo: numeroALetras(11.30) → "ONCE 30/100 DOLARES"
 *
 * Límite práctico: 0 – 999,999.99. Montos mayores devuelven el valor numérico
 * como texto para no romper el build en casos excepcionales.
 */
export function numeroALetras(amount: number): string {
  if (!isFinite(amount) || amount < 0) {
    return `${amount.toFixed(2)} DOLARES`;
  }

  // Separar entero y centavos con redondeo correcto
  const rounded  = Math.round(amount * 100);
  const dollars  = Math.floor(rounded / 100);
  const cents    = rounded % 100;

  if (dollars > 999_999) {
    return `${amount.toFixed(2)} DOLARES`;
  }

  const words = dollars === 0 ? "CERO" : convertThousands(dollars);
  const centsStr = cents.toString().padStart(2, "0");

  return `${words} ${centsStr}/100 DOLARES`;
}
