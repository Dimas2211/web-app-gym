// ─────────────────────────────────────────────────────────────────
// commerce/cash — cash-session-cut-print-view.tsx
//
// Vista imprimible del corte de sesión de caja.
// Solo se renderiza visualmente durante window.print().
// No llama backend, no modifica datos.
// ─────────────────────────────────────────────────────────────────

import type { CashSessionCutReport, CashCutStatus } from "../types/cash.types";

// ── Labels ────────────────────────────────────────────────────────

const CUT_STATUS_LABELS: Record<CashCutStatus, string> = {
  OPEN:             "Abierta",
  CLOSED_BALANCED:  "Cerrada cuadrada",
  CLOSED_OVER:      "Cerrada con sobrante",
  CLOSED_SHORT:     "Cerrada con faltante",
  CANCELLED:        "Cancelada",
};

const MOVEMENT_DIRECTION_LABEL: Record<string, string> = {
  IN:  "Entrada",
  OUT: "Salida",
};

// ── Helpers ───────────────────────────────────────────────────────

function formatCurrency(value: number | null | undefined): string {
  if (value == null || isNaN(value)) return "$0.00";
  return "$" + Number(value).toFixed(2);
}

function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-SV", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ── Props ─────────────────────────────────────────────────────────

interface CashSessionCutPrintViewProps {
  report: CashSessionCutReport;
}

// ── Componente ────────────────────────────────────────────────────

export function CashSessionCutPrintView({ report }: CashSessionCutPrintViewProps) {
  const diff     = report.difference_amount;
  const printedAt = new Date().toLocaleString("es-SV", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

  return (
    <div
      style={{
        fontFamily: "Arial, sans-serif",
        fontSize:   "12px",
        color:      "#000",
        background: "#fff",
        padding:    "24px 32px",
        maxWidth:   "720px",
        margin:     "0 auto",
        lineHeight: "1.5",
      }}
    >
      {/* ── A. Encabezado ────────────────────────────────────────── */}
      <div style={{ borderBottom: "2px solid #000", paddingBottom: "10px", marginBottom: "14px" }}>
        <h1 style={{ fontSize: "18px", fontWeight: "bold", margin: "0 0 4px 0" }}>
          Corte de caja
        </h1>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "4px" }}>
          <div>
            <span style={{ fontWeight: "bold" }}>Caja: </span>
            {report.cash_register_name} ({report.cash_register_code})
          </div>
          <div>
            <span style={{ fontWeight: "bold" }}>Estado: </span>
            {CUT_STATUS_LABELS[report.cut_status]}
          </div>
        </div>
        <div style={{ marginTop: "4px" }}>
          <span style={{ fontWeight: "bold" }}>Impreso: </span>
          {printedAt}
        </div>
        <div style={{ marginTop: "2px", fontSize: "11px", color: "#555" }}>
          Sesión ID: {report.session_id}
        </div>
      </div>

      {/* ── B. Datos de apertura/cierre ──────────────────────────── */}
      <SectionTitle>Apertura y cierre</SectionTitle>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "14px" }}>
        <tbody>
          <TwoColRow label="Usuario apertura" value={report.opened_by_name ?? "—"} />
          <TwoColRow label="Fecha apertura"   value={formatDate(report.opened_at)} />
          <TwoColRow label="Usuario cierre"   value={report.closed_by_name ?? "Pendiente"} />
          <TwoColRow label="Fecha cierre"     value={report.closed_at ? formatDate(report.closed_at) : "Pendiente"} />
          <TwoColRow label="Estado sesión"    value={report.status} />
        </tbody>
      </table>

      {/* ── C. Resumen de efectivo ───────────────────────────────── */}
      <SectionTitle>Resumen de efectivo</SectionTitle>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "14px" }}>
        <tbody>
          <TwoColRow label="Monto inicial"      value={formatCurrency(report.opening_amount)} />
          <TwoColRow label="Entradas manuales"  value={"+" + formatCurrency(report.manual_in_total)} />
          <TwoColRow label="Salidas manuales"   value={"-" + formatCurrency(report.manual_out_total)} />
          <TwoColRow label="Efectivo esperado"  value={formatCurrency(report.expected_cash_amount)} bold />
          <TwoColRow
            label="Efectivo declarado"
            value={report.declared_cash_amount != null ? formatCurrency(report.declared_cash_amount) : "Pendiente"}
            bold
          />
          <TwoColRow
            label="Diferencia"
            value={
              diff != null
                ? (diff >= 0 ? "+" : "") + formatCurrency(diff)
                : "Pendiente"
            }
            bold
          />
          <TwoColRow
            label="Resultado"
            value={CUT_STATUS_LABELS[report.cut_status]}
            bold
          />
        </tbody>
      </table>

      {/* ── D. Resumen de ventas ─────────────────────────────────── */}
      <SectionTitle>Ventas asociadas</SectionTitle>
      {report.sales_summary.sales_count > 0 ? (
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "14px" }}>
          <tbody>
            <TwoColRow label="Ventas confirmadas" value={String(report.sales_summary.sales_count)} />
            <TwoColRow label="Total ventas"       value={formatCurrency(report.sales_summary.total_amount)} />
            <TwoColRow label="Total pagado"       value={formatCurrency(report.sales_summary.paid_amount)} />
            <TwoColRow label="Total pendiente"    value={formatCurrency(report.sales_summary.unpaid_amount)} />
          </tbody>
        </table>
      ) : (
        <p style={{ color: "#666", marginBottom: "14px", fontStyle: "italic" }}>
          Ventas y pagos se integrarán completamente en una fase posterior.
        </p>
      )}

      {/* ── E. Resumen por método de pago ────────────────────────── */}
      <SectionTitle>Formas de pago</SectionTitle>
      {report.payments_summary.length > 0 ? (
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "14px", fontSize: "11px" }}>
          <thead>
            <tr style={{ background: "#f0f0f0" }}>
              <th style={thStyle}>Método</th>
              <th style={thStyle}>Código MH</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Transacciones</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {report.payments_summary.map((p, idx) => (
              <tr key={idx} style={{ borderBottom: "1px solid #ddd" }}>
                <td style={tdStyle}>{p.label}</td>
                <td style={tdStyle}>{p.mh_payment_form_code ?? "—"}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{p.count}</td>
                <td style={{ ...tdStyle, textAlign: "right", fontWeight: "bold" }}>
                  {formatCurrency(p.total_amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p style={{ color: "#666", marginBottom: "14px", fontStyle: "italic" }}>
          Sin pagos asociados a esta sesión.
        </p>
      )}

      {/* ── F. Movimientos manuales ──────────────────────────────── */}
      <SectionTitle>Movimientos manuales ({report.movements_count})</SectionTitle>
      {report.movements.length === 0 ? (
        <p style={{ color: "#666", marginBottom: "14px", fontStyle: "italic" }}>
          Sin movimientos manuales registrados.
        </p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "14px", fontSize: "10px" }}>
          <thead>
            <tr style={{ background: "#f0f0f0" }}>
              <th style={thStyle}>Fecha/Hora</th>
              <th style={thStyle}>Tipo</th>
              <th style={thStyle}>Dir.</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Monto</th>
              <th style={thStyle}>Motivo</th>
              <th style={thStyle}>Ref.</th>
              <th style={thStyle}>Usuario</th>
            </tr>
          </thead>
          <tbody>
            {report.movements.map((m) => (
              <tr key={m.id} style={{ borderBottom: "1px solid #eee" }}>
                <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{formatDate(m.performed_at)}</td>
                <td style={tdStyle}>{m.movement_type_label}</td>
                <td style={tdStyle}>{MOVEMENT_DIRECTION_LABEL[m.direction] ?? m.direction}</td>
                <td style={{ ...tdStyle, textAlign: "right", fontWeight: "bold" }}>
                  {m.direction === "IN" ? "+" : "-"}{formatCurrency(m.amount)}
                </td>
                <td style={tdStyle}>{m.reason ?? "—"}</td>
                <td style={tdStyle}>{m.reference ?? "—"}</td>
                <td style={tdStyle}>{m.performed_by_name ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ── G. Firmas ────────────────────────────────────────────── */}
      <SectionTitle>Firmas y confirmación</SectionTitle>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "32px", marginBottom: "24px" }}>
        <SignatureLine label="Cajero responsable" />
        <SignatureLine label="Supervisor / Gerencia" />
      </div>
      <div style={{ marginTop: "8px" }}>
        <p style={{ fontWeight: "bold", marginBottom: "4px" }}>Observaciones:</p>
        <div style={{ border: "1px solid #ccc", minHeight: "48px", padding: "6px" }} />
      </div>

      {/* Pie de página */}
      <div style={{ marginTop: "20px", borderTop: "1px solid #ccc", paddingTop: "8px", fontSize: "10px", color: "#888", textAlign: "center" }}>
        Documento generado desde el sistema de caja — {printedAt}
      </div>
    </div>
  );
}

// ── Helpers de layout ─────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontSize: "11px",
        fontWeight: "bold",
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        color: "#444",
        borderBottom: "1px solid #ccc",
        paddingBottom: "3px",
        marginBottom: "6px",
        marginTop: "2px",
      }}
    >
      {children}
    </h2>
  );
}

function TwoColRow({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <tr style={{ borderBottom: "1px solid #f0f0f0" }}>
      <td style={{ padding: "3px 8px 3px 0", color: "#555", width: "200px", verticalAlign: "top" }}>
        {label}
      </td>
      <td style={{ padding: "3px 0", fontWeight: bold ? "bold" : "normal", verticalAlign: "top" }}>
        {value}
      </td>
    </tr>
  );
}

function SignatureLine({ label }: { label: string }) {
  return (
    <div>
      <div style={{ borderBottom: "1px solid #000", height: "32px", marginBottom: "6px" }} />
      <p style={{ fontSize: "11px", color: "#555", margin: 0 }}>{label}</p>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "4px 6px",
  textAlign: "left",
  fontWeight: "bold",
  borderBottom: "1px solid #ccc",
};

const tdStyle: React.CSSProperties = {
  padding: "3px 6px",
  verticalAlign: "top",
};
