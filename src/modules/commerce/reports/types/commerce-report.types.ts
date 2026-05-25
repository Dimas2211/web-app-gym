// ─────────────────────────────────────────────────────────────────
// commerce/reports — commerce-report.types.ts
// ─────────────────────────────────────────────────────────────────

export interface CommerceReportSummary {
  total_sales:      number;
  total_purchases:  number;
  estimated_margin: number;
  sales_count:      number;
  purchases_count:  number;
  avg_ticket:       number;
  top_product_name: string | null;
  top_service_name: string | null;
}

export interface PeriodDataPoint {
  date:  string; // YYYY-MM-DD
  total: number;
}

export interface TopItemData {
  name:     string;
  total:    number;
  quantity: number;
}

export interface ServiceDistributionItem {
  name:       string;
  total:      number;
  percentage: number;
}

export interface ProductVsServiceData {
  products_total: number;
  services_total: number;
}

export interface SupplierPurchaseData {
  supplier_name: string;
  total:         number;
  count:         number;
}

export interface CommerceDashboardData {
  summary:                CommerceReportSummary;
  sales_by_period:        PeriodDataPoint[];
  purchases_by_period:    PeriodDataPoint[];
  top_products_by_amount: TopItemData[];
  top_products_by_qty:    TopItemData[];
  top_services_by_amount: TopItemData[];
  top_services_by_qty:    TopItemData[];
  service_distribution:   ServiceDistributionItem[];
  product_vs_service:     ProductVsServiceData;
  purchases_by_supplier:  SupplierPurchaseData[];
}

// ── Tabular report row types ──────────────────────────────────────

export interface SalesLineReportRow {
  id:              string;
  sale_code:       string;
  sale_date:       string;        // YYYY-MM-DD
  customer_name:   string | null;
  product_code:    string;
  product_name:    string;
  product_type:    string;        // PRODUCT | SERVICE
  category_name:   string | null;
  line_name:       string | null;
  quantity:        number;
  unit_price:      number;
  line_subtotal:   number;
  tax_amount:      number;
  line_total:      number;
  cost_estimate:   number | null; // Product.cost_price × quantity
  margin_estimate: number | null; // line_total − cost_estimate
  location_id:     string;
}

export interface PurchasesLineReportRow {
  id:            string;
  purchase_code: string;
  purchase_date: string;
  supplier_name: string;
  product_code:  string;
  product_name:  string;
  category_name: string | null;
  line_name:     string | null;
  quantity:      number;
  unit_cost:     number;
  line_subtotal: number;
  tax_amount:    number;
  line_total:    number;
  location_id:   string;
}

export interface ProductSummaryRow {
  product_id:          string;
  product_code:        string;
  product_name:        string;
  product_type:        string;
  category_name:       string | null;
  line_name:           string | null;
  qty_sold:            number;
  amount_sold:         number;
  qty_purchased:       number;
  amount_purchased:    number;
  cost_avg:            number | null;
  margin_estimate:     number | null;
  last_sale_date:      string | null;
  last_purchase_date:  string | null;
}

export interface CustomerSummaryRow {
  customer_id:      string | null;
  customer_name:    string;
  sale_count:       number;
  total_amount:     number;
  avg_ticket:       number;
  last_sale_date:   string | null;
  top_product_name: string | null;
}

export interface SupplierSummaryRow {
  supplier_id:        string;
  supplier_name:      string;
  purchase_count:     number;
  total_amount:       number;
  top_product_name:   string | null;
  last_purchase_date: string | null;
}

export interface TabularReportMeta {
  total_rows: number;
  date_from:  string;
  date_to:    string;
}

export interface TabularFilters {
  date_from:     string;
  date_to:       string;
  customer_id?:  string;
  supplier_id?:  string;
  product_id?:   string;
  product_type?: string;
  limit?:        number;
}
