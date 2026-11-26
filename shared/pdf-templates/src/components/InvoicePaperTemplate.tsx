import React from "react";
import { formatTotalQuantity } from "./invoiceQuantity";
import type { HTMLAttributes, ReactNode } from "react";
import {
  InvoiceAddress,
  formatInvoiceAddress,
  defaultInvoiceAddressFormat,
} from "./invoiceAddress";
import {
  InvoiceCustomization,
  InvoiceSectionId,
  normalizeInvoiceColumns,
  normalizeInvoiceLayout,
  invoiceCustomizationDefaults,
} from "./invoiceCustomization";
import { isEmpty } from "lodash";
import {
  PaperTemplate,
  PaperTemplateProps,
  PaperTemplateTotalBorder,
} from "./PaperTemplate";
import { Box } from "../lib/layout/Box";
import { Text } from "../lib/text/Text";
import { Stack } from "../lib/layout/Stack";
import { Group } from "../lib/layout/Group";
import {
  DefaultPdfTemplateTerms,
  DefaultPdfTemplateItemDescription,
  DefaultPdfTemplateStatement,
  DefaultPdfTemplateItemName,
  DefaultPdfTemplateAddressBilledTo,
  DefaultPdfTemplateAddressBilledFrom,
} from "./_constants";

interface InvoiceLine {
  item?: string;
  description?: string;
  quantity?: string;
  quantityValue?: number;
  rate?: string;
  total?: string;
  discount?: string;
}

interface InvoiceTaxLine {
  label: string;
  amount: string;
}

export interface InvoicePaperTemplateProps
  extends Omit<PaperTemplateProps, "fontFamily">,
    Partial<InvoiceCustomization> {
  sectionAttributes?: (id: InvoiceSectionId) => HTMLAttributes<HTMLDivElement>;
  primaryColor?: string;
  secondaryColor?: string;

  // Company
  showCompanyLogo?: boolean;
  companyLogoUri?: string;

  // Invoice number
  showInvoiceNumber?: boolean;
  invoiceNumber?: string;
  invoiceNumberLabel?: string;

  // Date of issue
  showDateIssue?: boolean;
  dateIssue?: string;
  dateIssueLabel?: string;

  // Due date
  showDueDate?: boolean;
  dueDate?: string;
  dueDateLabel?: string;

  companyName?: string;
  bigtitle?: string;

  // Address
  showCustomerAddress?: boolean;
  customerAddress?: string;
  billingAddress?: InvoiceAddress;
  shippingAddress?: InvoiceAddress | null;
  billingAddressText?: string | null;
  shippingAddressText?: string | null;
  shippingMethod?: string | null;
  shippingDate?: string | null;
  trackingNo?: string | null;
  referenceNo?: string | null;
  paymentInstructions?: string | null;
  paymentTerms?: string;
  shippingCharge?: string;
  showShippingCharge?: boolean;

  showCompanyAddress?: boolean;
  companyAddress?: string;

  billedToLabel?: string;

  // Entries
  lineItemLabel?: string;
  lineQuantityLabel?: string;
  lineRateLabel?: string;
  lineTotalLabel?: string;

  // # Line Discount
  lineDiscountLabel?: string;
  showLineDiscount?: boolean;

  // Total
  showTotal?: boolean;
  totalLabel?: string;
  total?: string;

  // Discount
  showDiscount?: boolean;
  discountLabel?: string;
  discount?: string;

  // Adjustment
  showAdjustment?: boolean;
  adjustmentLabel?: string;
  adjustment?: string;

  // Subtotal
  showSubtotal?: boolean;
  subtotalLabel?: string;
  subtotal?: string;

  // Payment made
  showPaymentMade?: boolean;
  paymentMadeLabel?: string;
  paymentMade?: string;

  showTaxes?: boolean;

  // Due Amount
  showDueAmount?: boolean;
  dueAmountLabel?: string;
  dueAmount?: string;

  // Footer
  termsConditionsLabel?: string;
  showTermsConditions?: boolean;
  termsConditions?: string;

  // Statement
  statementLabel?: string;
  showStatement?: boolean;
  statement?: string;

  lines?: Array<InvoiceLine>;
  taxes?: Array<InvoiceTaxLine>;
}

export function InvoicePaperTemplate({
  invoiceTitle = "Invoice",
  headerText = "",
  footerText = "",
  fontFamily = "Arial",
  documentFontSize = 12,
  pageSize = "a4",
  layoutMode = "standard",
  designVariant = "reference",
  logoPosition = "right",
  pageMarginTop,
  pageMarginRight,
  pageMarginBottom,
  pageMarginLeft,
  lineColumnWidths = invoiceCustomizationDefaults.lineColumnWidths,
  lineDescriptionLabel = "DESCRIPTION",
  descriptionPlacement = "auto",
  showDocumentTitle = true,
  showPaymentTerms = true,
  showShippingDetails = true,
  showReferenceNo = true,
  showBusinessName = true,
  showBusinessAddress = true,
  showBusinessPhone = true,
  showBusinessEmail = true,
  showBusinessWebsite = true,
  defaultInvoiceMessage: _defaultInvoiceMessage,
  defaultPaymentInstructions: _defaultPaymentInstructions,
  emailSubject: _emailSubject,
  emailMessage: _emailMessage,
  attachInvoicePdf: _attachInvoicePdf,
  footerTextAlign = "left",
  footerTextSize = 12,
  alternateRowColors = false,
  oddRowColor = "#ffffff",
  evenRowColor = "#eef2f5",
  logoWidth = 300,
  companyAddressOverride = "",
  footerImageKey: _footerImageKey,
  footerImageUri = "",
  showFooterImage = true,
  footerImageWidth = 140,
  footerImageAlign = "left",
  footerImageCaption = "",
  sectionLayout,
  lineColumns,
  showLineItem = true,
  showLineQuantity = true,
  showTotalQuantity = false,
  totalQuantityLabel = invoiceCustomizationDefaults.totalQuantityLabel,
  showLineRate = true,
  showLineTotal = true,
  showLineDescription = true,
  sectionAttributes,
  // # Colors
  primaryColor,
  secondaryColor,

  showCompanyLogo = true,
  companyLogoUri = "",

  // # Due date
  dueDate = "September 3, 2024",
  dueDateLabel = "Date due",
  showDueDate = true,

  // # Issue date.
  dateIssue = "September 3, 2024",
  dateIssueLabel = "Date of issue",
  showDateIssue = true,

  // Invoice #,
  invoiceNumberLabel = "Invoice number",
  invoiceNumber = "346D3D40-0001",
  showInvoiceNumber = true,

  // Address
  showCustomerAddress = true,
  customerAddress = DefaultPdfTemplateAddressBilledTo,
  billingAddress,
  shippingAddress = null,
  billingAddressText,
  shippingAddressText,
  shippingMethod,
  shippingDate,
  trackingNo,
  referenceNo,
  paymentInstructions,
  paymentTerms,
  shippingCharge = "",
  showShippingCharge = true,
  showShippingAddress = true,
  shipToLabel = "Ship To",
  billToAddressFormat = defaultInvoiceAddressFormat,
  shipToAddressFormat = defaultInvoiceAddressFormat,

  showCompanyAddress = true,
  companyAddress = DefaultPdfTemplateAddressBilledFrom,

  billedToLabel = "Billed To",

  // Entries
  lineItemLabel = "Item",
  lineQuantityLabel = "Qty",
  lineRateLabel = "Rate",
  lineTotalLabel = "Total",

  totalLabel = "Total",
  subtotalLabel = "Subtotal",
  discountLabel = "Discount",
  adjustmentLabel = "Adjustment",
  paymentMadeLabel = "Payment Made",
  dueAmountLabel = "Balance Due",

  // # Line Discount
  lineDiscountLabel = "Discount",
  showLineDiscount = false,

  // Totals
  showTotal = true,
  total = "$662.75",

  showSubtotal = true,
  showDiscount = true,
  showTaxes = true,
  showPaymentMade = true,
  showDueAmount = true,
  showAdjustment = true,

  subtotal = "630.00",
  discount = "0.00",
  adjustment = "",
  paymentMade = "100.00",
  dueAmount = "$562.75",

  // Footer paragraphs.
  termsConditionsLabel = "Terms & Conditions",
  showTermsConditions = true,
  termsConditions = DefaultPdfTemplateTerms,

  lines = [
    {
      item: DefaultPdfTemplateItemName,
      description: DefaultPdfTemplateItemDescription,
      rate: "1",
      quantity: "1000",
      total: "$1000.00",
    },
  ],
  taxes = [
    { label: "Sample Tax1 (4.70%)", amount: "11.75" },
    { label: "Sample Tax2 (7.00%)", amount: "21.74" },
  ],

  // # Statement
  statementLabel = "Statement",
  showStatement = true,
  statement = DefaultPdfTemplateStatement,
  ...props
}: InvoicePaperTemplateProps) {
  const font = ["Arial", "Georgia", "Courier New", "Times New Roman"].includes(
    fontFamily,
  )
    ? fontFamily
    : "Arial";
  const fontSize = Math.max(10, Math.min(32, Number(documentFontSize) || 12));
  const letter = pageSize === "letter";
  const separateDescription =
    descriptionPlacement === "separate" ||
    (descriptionPlacement === "auto" && layoutMode === "distribution");
  const margin = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value)
      ? Math.max(0.25, Math.min(2, value))
      : 0.5;
  const margins = [
    pageMarginTop,
    pageMarginRight,
    pageMarginBottom,
    pageMarginLeft,
  ].map(margin);
  const brandColor = /^#[0-9a-f]{6}$/i.test(primaryColor || "")
    ? primaryColor
    : "#366534";
  referenceNo = showReferenceNo ? referenceNo : undefined;
  shippingMethod = showShippingDetails ? shippingMethod : undefined;
  shippingDate = showShippingDetails ? shippingDate : undefined;
  trackingNo = showShippingDetails ? trackingNo : undefined;
  paymentTerms = showPaymentTerms ? paymentTerms : undefined;
  const rawCompanyLines = (
    companyAddressOverride ||
    companyAddress.replace(/<br\s*\/?\s*>/gi, "\n").replace(/<[^>]+>/g, "")
  )
    .split("\n")
    .filter(Boolean);
  const companyLines = rawCompanyLines.filter((line, index) =>
    index === 0
      ? showBusinessName
      : /@/.test(line)
        ? showBusinessEmail
        : /^(https?:\/\/|www\.)/i.test(line)
          ? showBusinessWebsite
          : /^\+?[\d\s().-]{7,}$/.test(line)
            ? showBusinessPhone
            : showBusinessAddress,
  );
  const distributionDate = (value: string) => {
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value || "");
    if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`;
    const text = /^(\d{1,2}) ([A-Za-z]{3}) (\d{4})$/.exec(value || "");
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    if (text && months.includes(text[2]))
      return `${String(months.indexOf(text[2]) + 1).padStart(2, "0")}/${text[1].padStart(2, "0")}/${text[3]}`;
    return value;
  };
  const distributionTotals = [
    ...(showSubtotal ? [{ label: subtotalLabel, amount: subtotal }] : []),
    ...(showDiscount && !isEmpty(discount)
      ? [{ label: discountLabel, amount: discount }]
      : []),
    ...(showAdjustment && !isEmpty(adjustment)
      ? [{ label: adjustmentLabel, amount: adjustment }]
      : []),
    ...(showTaxes ? taxes : []),
    ...(showShippingCharge && shippingCharge
      ? [{ label: "SHIPPING", amount: shippingCharge }]
      : []),
    ...(showTotal ? [{ label: totalLabel, amount: total }] : []),
    ...(showPaymentMade
      ? [{ label: paymentMadeLabel, amount: paymentMade }]
      : []),
    ...(showDueAmount
      ? [{ label: dueAmountLabel, amount: dueAmount, balance: true }]
      : []),
  ];
  const definitions = {
    item: {
      label: lineItemLabel,
      visible: showLineItem,
      accessor: (data: InvoiceLine) => (
        <Stack spacing={2}>
          <div
            style={
              layoutMode === "distribution" ? { fontWeight: 600 } : undefined
            }
          >
            {data.item}
          </div>
          {showLineDescription && !separateDescription && (
            <Text color="#5f6b7c" fontSize={fontSize}>
              {data.description}
            </Text>
          )}
        </Stack>
      ),
    },
    quantity: {
      label: lineQuantityLabel,
      accessor: "quantity",
      align: "right" as const,
      visible: showLineQuantity,
    },
    rate: {
      label: lineRateLabel,
      accessor: "rate",
      align: "right" as const,
      visible: showLineRate,
    },
    discount: {
      label: lineDiscountLabel,
      accessor: "discount",
      align: "right" as const,
      visible: showLineDiscount,
    },
    total: {
      label: lineTotalLabel,
      accessor: "total",
      align: "right" as const,
      visible: showLineTotal,
    },
  };
  const selectedColumns = normalizeInvoiceColumns(lineColumns)
    .flatMap((id) => [
      { id, ...definitions[id] },
      ...(id === "item" && separateDescription && showLineDescription
        ? [
            {
              id: "description" as const,
              label: lineDescriptionLabel,
              accessor: "description",
              visible: true,
            },
          ]
        : []),
    ])
    .filter((column) => column.visible !== false);
  const columnWeight = (id: string) => {
    const candidate = Number(
      lineColumnWidths?.[id as keyof typeof lineColumnWidths],
    );
    const own = Number.isFinite(candidate)
      ? Math.max(5, Math.min(80, candidate))
      : 15;
    return id === "item" && !separateDescription
      ? own + Number(lineColumnWidths?.description || 50)
      : own;
  };
  const allWeights = selectedColumns.reduce(
    (sum, column) => sum + columnWeight(column.id),
    0,
  );
  const tableColumns = selectedColumns.map((column) => ({
    ...column,
    thStyle: { width: `${(columnWeight(column.id) / allWeights) * 100}%` },
  }));
  const quantityColumnIndex = selectedColumns.findIndex(
    (column) => column.id === "quantity",
  );
  const totalQuantityFormatted = formatTotalQuantity(
    lines.map((line) => line.quantityValue ?? line.quantity),
  );
  const quantityTotalLabel =
    (typeof totalQuantityLabel === "string" && totalQuantityLabel.trim()) ||
    invoiceCustomizationDefaults.totalQuantityLabel;
  const quantityTotalCellStyle = {
    borderTop: "1px solid #a7b0b8",
    padding: "12px",
    fontWeight: 700,
  } as const;
  const quantityTotalRow =
    showTotalQuantity && quantityColumnIndex >= 0 ? (
      <tr data-quantity-total>
        {quantityColumnIndex > 0 && (
          <td
            colSpan={quantityColumnIndex}
            style={{ ...quantityTotalCellStyle, textAlign: "right" }}
          >
            {quantityTotalLabel}
          </td>
        )}
        <td style={{ ...quantityTotalCellStyle, textAlign: "right" }}>
          {quantityColumnIndex === 0 && (
            <div style={{ fontSize: "0.85em", marginBottom: 4 }}>
              {quantityTotalLabel}
            </div>
          )}
          <span data-total-quantity-value>{totalQuantityFormatted}</span>
        </td>
        {quantityColumnIndex < selectedColumns.length - 1 && (
          <td
            colSpan={selectedColumns.length - quantityColumnIndex - 1}
            style={quantityTotalCellStyle}
          />
        )}
      </tr>
    ) : undefined;
  const sections: Record<InvoiceSectionId, ReactNode> = {
    header: (
      <Group
        align="start"
        spacing={10}
        flexDirection={
          logoPosition === "center"
            ? "column"
            : logoPosition === "left"
              ? "row-reverse"
              : "row"
        }
      >
        <Stack flex={1} minWidth={0}>
          {showDocumentTitle && <PaperTemplate.BigTitle title={invoiceTitle} />}

          {headerText && (
            <div style={{ whiteSpace: "pre-wrap" }}>{headerText}</div>
          )}
          <PaperTemplate.TermsList>
            {paymentTerms && (
              <PaperTemplate.TermsItem label="Terms">
                {paymentTerms}
              </PaperTemplate.TermsItem>
            )}
            {referenceNo && (
              <PaperTemplate.TermsItem label="Customer PO / reference">
                {referenceNo}
              </PaperTemplate.TermsItem>
            )}
            {shippingMethod && (
              <PaperTemplate.TermsItem label="Ship via">
                {shippingMethod}
              </PaperTemplate.TermsItem>
            )}
            {shippingDate && (
              <PaperTemplate.TermsItem label="Shipping date">
                {shippingDate}
              </PaperTemplate.TermsItem>
            )}
            {trackingNo && (
              <PaperTemplate.TermsItem label="Tracking no.">
                {trackingNo}
              </PaperTemplate.TermsItem>
            )}
            {showInvoiceNumber && (
              <PaperTemplate.TermsItem label={invoiceNumberLabel}>
                {invoiceNumber}
              </PaperTemplate.TermsItem>
            )}
            {showDateIssue && (
              <PaperTemplate.TermsItem label={dateIssueLabel}>
                {dateIssue}
              </PaperTemplate.TermsItem>
            )}
            {showDueDate && (
              <PaperTemplate.TermsItem label={dueDateLabel}>
                {dueDate}
              </PaperTemplate.TermsItem>
            )}
          </PaperTemplate.TermsList>
        </Stack>

        {companyLogoUri && showCompanyLogo && (
          <img
            src={companyLogoUri}
            alt="Company logo"
            style={{
              width: Math.max(80, Math.min(350, Number(logoWidth) || 300)),
              maxWidth: "48%",
              maxHeight: 130,
              objectFit: "contain",
            }}
          />
        )}
      </Group>
    ),
    companyAddress: showCompanyAddress ? (
      <PaperTemplate.Address>
        <Box dangerouslySetInnerHTML={{ __html: companyAddress }} />
      </PaperTemplate.Address>
    ) : null,
    customerAddress:
      showCustomerAddress &&
      (billingAddressText == null || billingAddressText.trim()) ? (
        <PaperTemplate.Address>
          <strong>{billedToLabel}</strong>
          {billingAddressText != null ? (
            <div style={{ whiteSpace: "pre-line" }}>{billingAddressText}</div>
          ) : (
            <Box
              dangerouslySetInnerHTML={{
                __html: billingAddress
                  ? formatInvoiceAddress(billingAddress, billToAddressFormat)
                  : customerAddress,
              }}
            />
          )}
        </PaperTemplate.Address>
      ) : null,
    shippingAddress:
      showShippingAddress &&
      (shippingAddressText != null
        ? shippingAddressText.trim()
        : shippingAddress) ? (
        <PaperTemplate.Address>
          <strong>{shipToLabel}</strong>
          {shippingAddressText != null ? (
            <div style={{ whiteSpace: "pre-line" }}>{shippingAddressText}</div>
          ) : (
            <Box
              dangerouslySetInnerHTML={{
                __html: formatInvoiceAddress(
                  shippingAddress!,
                  shipToAddressFormat,
                ),
              }}
            />
          )}
        </PaperTemplate.Address>
      ) : null,
    items: (
      <PaperTemplate.Table
        columns={tableColumns}
        fixedLayout
        headerBackground={
          layoutMode === "distribution"
            ? designVariant === "modern"
              ? brandColor
              : designVariant === "minimal"
                ? "#f1f3f5"
                : "#d0d0d0"
            : undefined
        }
        headerTextColor={
          layoutMode === "distribution" && designVariant === "modern"
            ? "#ffffff"
            : undefined
        }
        data={lines}
        footer={quantityTotalRow}
        alternateRowColors={alternateRowColors}
        oddRowColor={oddRowColor}
        evenRowColor={evenRowColor}
        compact={layoutMode === "distribution"}
      />
    ),
    totals: (
      <PaperTemplate.Totals>
        {showSubtotal && (
          <PaperTemplate.TotalLine
            label={subtotalLabel}
            amount={subtotal}
            border={PaperTemplateTotalBorder.Gray}
          />
        )}
        {showDiscount && !isEmpty(discount) && (
          <PaperTemplate.TotalLine label={discountLabel} amount={discount} />
        )}
        {showAdjustment && !isEmpty(adjustment) && (
          <PaperTemplate.TotalLine
            label={adjustmentLabel}
            amount={adjustment}
          />
        )}
        {showTaxes && (
          <>
            {taxes.map((tax, index) => (
              <PaperTemplate.TotalLine
                key={index}
                label={tax.label}
                amount={tax.amount}
              />
            ))}
          </>
        )}
        {showShippingCharge && shippingCharge && (
          <PaperTemplate.TotalLine label="Shipping" amount={shippingCharge} />
        )}
        {showTotal && (
          <PaperTemplate.TotalLine
            label={totalLabel}
            amount={total}
            border={PaperTemplateTotalBorder.Dark}
            style={{ fontWeight: 500 }}
          />
        )}
        {showPaymentMade && (
          <PaperTemplate.TotalLine
            label={paymentMadeLabel}
            amount={paymentMade}
          />
        )}
        {showDueAmount && (
          <PaperTemplate.TotalLine
            label={dueAmountLabel}
            amount={dueAmount}
            border={PaperTemplateTotalBorder.Dark}
            style={{ fontWeight: 500 }}
          />
        )}
      </PaperTemplate.Totals>
    ),
    terms:
      paymentInstructions || (showTermsConditions && termsConditions) ? (
        <>
          {paymentInstructions && (
            <PaperTemplate.Statement label="Payment instructions">
              {paymentInstructions}
            </PaperTemplate.Statement>
          )}
          {showTermsConditions && termsConditions && (
            <PaperTemplate.Statement label={termsConditionsLabel}>
              {termsConditions}
            </PaperTemplate.Statement>
          )}
        </>
      ) : null,
    statement:
      showStatement && statement ? (
        <PaperTemplate.Statement label={statementLabel}>
          {statement}
        </PaperTemplate.Statement>
      ) : null,
    footer:
      footerText || (showFooterImage && footerImageUri) ? (
        <div style={{ breakInside: "avoid", textAlign: footerImageAlign }}>
          {footerText && (
            <div
              style={{
                whiteSpace: "pre-wrap",
                textAlign: footerTextAlign,
                fontSize: Math.max(
                  8,
                  Math.min(32, Number(footerTextSize) || 12),
                ),
              }}
            >
              {footerText}
            </div>
          )}
          {showFooterImage && footerImageUri && (
            <figure data-invoice-footer-image style={{ margin: "20px 0 0" }}>
              <img
                src={footerImageUri}
                alt="Payment QR code or footer image"
                style={{
                  display: "inline-block",
                  width: Math.max(
                    64,
                    Math.min(400, Number(footerImageWidth) || 140),
                  ),
                  maxWidth: "100%",
                  height: "auto",
                  maxHeight: 400,
                  objectFit: "contain",
                }}
              />
              {footerImageCaption && (
                <figcaption style={{ marginTop: 6, whiteSpace: "pre-line" }}>
                  {footerImageCaption}
                </figcaption>
              )}
            </figure>
          )}
        </div>
      ) : null,
  };
  return (
    <PaperTemplate
      data-invoice-document
      data-invoice-design={layoutMode}
      primaryColor={primaryColor}
      secondaryColor={secondaryColor}
      {...props}
      style={{
        ...props.style,
        fontFamily: font,
        fontSize,
        boxSizing: "border-box",
        overflowWrap: "anywhere",
        height: "auto",
        minHeight: letter ? 1056 : 1123,
        width: letter ? 816 : 794,
        padding: margins.map((value) => `${value * 96}px`).join(" "),
        ...(layoutMode === "distribution"
          ? {
              boxShadow: "none",
              lineHeight: 1.4,
              borderTop:
                designVariant === "modern"
                  ? `6px solid ${brandColor}`
                  : undefined,
            }
          : {}),
      }}
    >
      <style>{`
        @page { size: ${letter ? "letter" : "A4"}; margin: ${margins.map((value) => `${value}in`).join(" ")}; }
        [data-invoice-document] *, [data-invoice-document] *::before, [data-invoice-document] *::after { box-sizing: border-box; }
        [data-invoice-document] img { max-width: 100%; }
        [data-invoice-section] { min-width: 0; overflow-wrap: anywhere; }
        [data-invoice-document] td { font-variant-numeric: tabular-nums; }
        [data-invoice-section=totals] div { max-width: 100%; min-width: 0; }
        [data-invoice-document] h1 { font-family: inherit; }
        @media print {
          body { margin: 0; }
          [data-invoice-document] { min-height: 0 !important; padding: 0 !important; }
          [data-invoice-section=companyAddress],
          [data-invoice-section=customerAddress],
          [data-invoice-section=shippingAddress] { break-inside: avoid; }
          tr { break-inside: avoid; }
          thead { display: table-header-group; }
        }
      `}</style>
      {layoutMode === "distribution" ? (
        <div data-distribution-invoice>
          <div
            data-invoice-section="header"
            {...sectionAttributes?.("header")}
            style={{
              display: "flex",
              flexDirection:
                logoPosition === "center"
                  ? "column"
                  : logoPosition === "left"
                    ? "row-reverse"
                    : "row",
              alignItems: logoPosition === "center" ? "center" : "start",
              justifyContent: "space-between",
              gap: 24,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              {showCompanyAddress && (
                <div style={{ whiteSpace: "pre-line" }}>
                  {companyLines.map((line, index) => (
                    <div
                      key={index}
                      style={
                        rawCompanyLines[0] === line
                          ? { fontWeight: 700 }
                          : undefined
                      }
                    >
                      {line}
                    </div>
                  ))}
                </div>
              )}
              {headerText && (
                <div style={{ whiteSpace: "pre-line" }}>{headerText}</div>
              )}
            </div>
            {showCompanyLogo && companyLogoUri && (
              <img
                data-invoice-logo
                src={companyLogoUri}
                alt="Company logo"
                style={{
                  width: Math.max(80, Math.min(350, Number(logoWidth) || 300)),
                  maxWidth: "48%",
                  maxHeight: 130,
                  objectFit: "contain",
                  order: logoPosition === "center" ? -1 : undefined,
                  objectPosition: "right top",
                }}
              />
            )}
          </div>
          {showDocumentTitle && (
            <h1
              {...sectionAttributes?.("header")}
              style={{
                margin: "12px 0 18px",
                fontSize: 30,
                fontWeight: 400,
                color: designVariant === "modern" ? brandColor : "#111",
              }}
            >
              {invoiceTitle}
            </h1>
          )}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 22,
              paddingBottom: 28,
              borderBottom: "1px solid #111",
            }}
          >
            <div
              data-invoice-section="customerAddress"
              {...sectionAttributes?.("customerAddress")}
            >
              {sections.customerAddress}
            </div>
            <div
              data-invoice-section="shippingAddress"
              {...sectionAttributes?.("shippingAddress")}
            >
              {sections.shippingAddress}
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 1fr)",
                columnGap: 8,
                alignContent: "start",
              }}
            >
              {[
                [showInvoiceNumber, invoiceNumberLabel, invoiceNumber],
                [showDateIssue, dateIssueLabel, distributionDate(dateIssue)],
                [showDueDate, dueDateLabel, distributionDate(dueDate)],
                [Boolean(paymentTerms), "TERMS", paymentTerms],
              ].map(([visible, label, value], i) =>
                visible ? (
                  <React.Fragment key={i}>
                    <strong style={{ textAlign: "right" }}>{label}</strong>
                    <span>{value}</span>
                  </React.Fragment>
                ) : null,
              )}
            </div>
          </div>
          {(referenceNo || shippingMethod || shippingDate || trackingNo) && (
            <div
              style={{
                display: "flex",
                gap: 20,
                flexWrap: "wrap",
                marginTop: 12,
              }}
            >
              {[
                ["Customer PO", referenceNo],
                ["Ship via", shippingMethod],
                ["Ship date", shippingDate],
                ["Tracking no.", trackingNo],
              ].map(([label, value]) =>
                value ? (
                  <span key={label}>
                    <strong>{label}: </strong>
                    {value}
                  </span>
                ) : null,
              )}
            </div>
          )}
          <div
            data-invoice-section="items"
            {...sectionAttributes?.("items")}
            style={{ marginTop: 54 }}
          >
            {sections.items}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 28,
              borderTop: "1px dashed #bbb",
              marginTop: 22,
              paddingTop: 12,
            }}
          >
            <div
              data-invoice-section="statement"
              {...sectionAttributes?.("statement")}
              style={{ whiteSpace: "pre-line" }}
            >
              {sections.statement}
              {sections.terms}
            </div>
            <div
              data-distribution-totals
              data-invoice-section="totals"
              {...sectionAttributes?.("totals")}
              style={{ padding: "0 12px", breakInside: "avoid" }}
            >
              {distributionTotals.map((row, index) => (
                <div
                  key={index}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 16,
                    padding: "4px 0",
                    alignItems: "baseline",
                  }}
                >
                  <span style={{ flex: "1 1 50%", minWidth: 0 }}>
                    {row.label}
                  </span>
                  <span
                    style={{
                      textAlign: "right",
                      flex: "0 1 50%",
                      minWidth: 0,
                      ...("balance" in row
                        ? { fontSize: 22, fontWeight: 700 }
                        : {}),
                    }}
                  >
                    {"balance" in row
                      ? row.amount
                      : row.amount?.replace(/^\$/, "")}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div
            data-invoice-section="footer"
            {...sectionAttributes?.("footer")}
            style={{ marginTop: 24 }}
          >
            {sections.footer}
          </div>
          <style>{`[data-distribution-invoice] table { print-color-adjust: exact; -webkit-print-color-adjust: exact; } [data-distribution-invoice] thead th { border: 0; }`}</style>
        </div>
      ) : layoutMode === "designer" ? (
        <div
          data-invoice-layout
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
            gridAutoRows: "minmax(40px, auto)",
            gap: 16,
            alignItems: "start",
          }}
        >
          {normalizeInvoiceLayout(sectionLayout).map(
            ({ id, column, row, width }) => {
              const attributes = sectionAttributes?.(id);
              return sections[id] || sectionAttributes ? (
                <div
                  key={id}
                  data-invoice-section={id}
                  {...attributes}
                  style={{
                    gridColumn: `${column} / span ${width}`,
                    gridRow: row,
                    ...attributes?.style,
                  }}
                >
                  {sections[id] ||
                    (sectionAttributes && (
                      <span style={{ color: "#999" }}>
                        {id === "footer" ? "Footer text" : id}
                      </span>
                    ))}
                </div>
              ) : null;
            },
          )}
        </div>
      ) : (
        <Stack spacing={24}>
          {sections.header}
          <PaperTemplate.AddressesGroup>
            {sections.companyAddress}
            {sections.customerAddress}
            {sections.shippingAddress}
          </PaperTemplate.AddressesGroup>
          <Stack spacing={0}>
            {sections.items}
            {sections.totals}
          </Stack>
          <Stack spacing={0}>
            {sections.terms}
            {sections.statement}
            {sections.footer}
          </Stack>
        </Stack>
      )}
    </PaperTemplate>
  );
}
