import { defaultInvoiceAddressFormat } from "./invoiceAddress";

export const invoiceSectionIds = [
  "header",
  "companyAddress",
  "customerAddress",
  "shippingAddress",
  "items",
  "totals",
  "terms",
  "statement",
  "footer",
] as const;

export type InvoiceSectionId = (typeof invoiceSectionIds)[number];
export type InvoiceColumnId =
  | "item"
  | "quantity"
  | "rate"
  | "discount"
  | "total";

export interface InvoiceSectionPosition {
  id: InvoiceSectionId;
  column: number;
  row: number;
  width: number;
}

export const defaultInvoiceLayout: InvoiceSectionPosition[] = [
  { id: "header", column: 1, row: 1, width: 12 },
  { id: "companyAddress", column: 1, row: 2, width: 4 },
  { id: "customerAddress", column: 5, row: 2, width: 4 },
  { id: "shippingAddress", column: 9, row: 2, width: 4 },
  { id: "items", column: 1, row: 3, width: 12 },
  { id: "totals", column: 7, row: 4, width: 6 },
  { id: "terms", column: 1, row: 5, width: 12 },
  { id: "statement", column: 1, row: 6, width: 12 },
  { id: "footer", column: 1, row: 7, width: 12 },
];

export const defaultInvoiceColumns: InvoiceColumnId[] = [
  "item",
  "quantity",
  "rate",
  "discount",
  "total",
];

export const invoiceCustomizationDefaults = {
  invoiceTitle: "Invoice",
  headerText: "",
  footerText: "",
  fontFamily: "Arial",
  documentFontSize: 12,
  pageSize: "a4" as "a4" | "letter",
  layoutMode: "standard" as "standard" | "designer" | "distribution",
  designVariant: "reference" as "reference" | "modern" | "minimal",
  logoPosition: "right" as "left" | "center" | "right",
  pageMarginTop: null as number | null,
  pageMarginRight: null as number | null,
  pageMarginBottom: null as number | null,
  pageMarginLeft: null as number | null,
  lineColumnWidths: {
    item: 15,
    description: 50,
    quantity: 10,
    rate: 10,
    discount: 8,
    total: 15,
  },
  lineDescriptionLabel: "DESCRIPTION",
  descriptionPlacement: "auto" as "auto" | "separate" | "under-item",
  showDocumentTitle: true,
  showPaymentTerms: true,
  showShippingDetails: true,
  showReferenceNo: true,
  showBusinessName: true,
  showBusinessAddress: true,
  showBusinessPhone: true,
  showBusinessEmail: true,
  showBusinessWebsite: true,
  defaultInvoiceMessage: "",
  defaultPaymentInstructions: "",
  footerTextAlign: "left" as "left" | "center" | "right",
  footerTextSize: 12,
  emailSubject: "",
  emailMessage: "",
  attachInvoicePdf: true,
  alternateRowColors: false,
  oddRowColor: "#ffffff",
  evenRowColor: "#eef2f5",
  logoWidth: 300,
  companyAddressOverride: "",
  footerImageKey: "",
  footerImageUri: "",
  showFooterImage: true,
  footerImageWidth: 140,
  footerImageAlign: "left" as "left" | "center" | "right",
  footerImageCaption: "",
  sectionLayout: defaultInvoiceLayout,
  lineColumns: defaultInvoiceColumns,
  lineQuantityLabel: "Qty",
  showLineItem: true,
  showLineQuantity: true,
  showTotalQuantity: false,
  totalQuantityLabel: "Total quantity",
  showLineRate: true,
  showLineTotal: true,
  showLineDescription: true,
  showLineDiscount: false,
  lineDiscountLabel: "Discount",
  showShippingAddress: true,
  shipToLabel: "Ship To",
  billToAddressFormat: defaultInvoiceAddressFormat,
  shipToAddressFormat: defaultInvoiceAddressFormat,
};

export type InvoiceCustomization = typeof invoiceCustomizationDefaults;

/** Defaults for newly created invoice styles; saved choices take precedence. */
export const newInvoiceTemplateDefaults = {
  showTotalQuantity: true,
  totalQuantityLabel: "Total Packages",
};

const integer = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.min(max, Math.round(value)))
    : fallback;

const overlaps = (a: InvoiceSectionPosition, b: InvoiceSectionPosition) =>
  a.row === b.row &&
  a.column < b.column + b.width &&
  b.column < a.column + a.width;

/** Normalize saved layouts, including older templates and malformed API input. */
export function normalizeInvoiceLayout(
  input?: unknown,
): InvoiceSectionPosition[] {
  return defaultInvoiceLayout.reduce<InvoiceSectionPosition[]>(
    (result, fallback) => {
      const candidate = Array.isArray(input)
        ? input.find((entry) => entry && entry.id === fallback.id)
        : undefined;
      const width = integer(candidate?.width, fallback.width, 3, 12);
      const position = {
        id: fallback.id,
        column: integer(candidate?.column, fallback.column, 1, 13 - width),
        row: integer(candidate?.row, fallback.row, 1, 64),
        width,
      };
      while (result.some((other) => overlaps(position, other))) position.row++;
      return [...result, position];
    },
    [],
  );
}

/** Keep the moved section at its target and move collisions to the next free row. */
export function moveInvoiceSection(
  input: InvoiceSectionPosition[],
  id: InvoiceSectionId,
  change: Partial<Pick<InvoiceSectionPosition, "column" | "row" | "width">>,
): InvoiceSectionPosition[] {
  const layout = normalizeInvoiceLayout(input);
  const current = layout.find((entry) => entry.id === id);
  if (!current) return layout;
  const width = integer(change.width, current.width, 3, 12);
  const moved = {
    ...current,
    width,
    column: integer(change.column, current.column, 1, 13 - width),
    row: integer(change.row, current.row, 1, 64),
  };
  const placed = [moved];
  for (const entry of layout
    .filter((entry) => entry.id !== id)
    .sort((a, b) => a.row - b.row)) {
    const position = { ...entry };
    while (placed.some((other) => overlaps(position, other))) position.row++;
    placed.push(position);
  }
  return invoiceSectionIds.map(
    (sectionId) => placed.find((entry) => entry.id === sectionId)!,
  );
}

export function normalizeInvoiceColumns(input?: unknown): InvoiceColumnId[] {
  const requested = Array.isArray(input) ? input : [];
  return Array.from(
    new Set([
      ...requested.filter((id): id is InvoiceColumnId =>
        defaultInvoiceColumns.includes(id),
      ),
      ...defaultInvoiceColumns,
    ]),
  );
}
