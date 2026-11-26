# Planned accounting features

Updated November 12, 2026. This Bigcapital customization is for a paper goods distribution business in the United States, using QuickBooks Online workflows as a reference.

## Current priority

Custom invoice templates, the invoice-entry workflow, and packing-slip printing are the active implementation scope. Include saved templates, configurable branding and fields, column visibility and ordering, fonts, US Letter and A4 paper, header and footer text, independently customizable Bill To and Ship To address blocks, a visual section designer, and a reference image to help recreate an existing invoice. Use the selected template for invoice previews, downloads, printing, and existing invoice email attachments.

The visual designer uses a 12 column grid with adjustable section widths and rows that grow with their contents. Matching an existing invoice is a manual design workflow; an image is a temporary guide, rather than an automatically imported template.

## Invoice workflow and packing slips

The QuickBooks recording is the workflow reference; retain Bigcapital styling. The invoice form includes customer email, independent invoice-specific billing and shipping addresses, shipping method/date/tracking, PO/reference, payment terms, live payer preview, shipping charge, payment instructions, customer notes, and private internal notes/memo. Review and send opens the existing email review drawer. Print or download saves first and offers invoice PDF or packing slip. Packing slips show products, descriptions, quantities, payment instructions and customer notes with prices, totals and internal notes hidden. The supplied invoice PDF guides the Jersey Distributors design, with a replaceable top-right logo, configurable alternating row colors, and an independent optional footer image for payment QR codes. Partial delivery tracking and delivery before invoicing remain outside this scope.

## Invoice designer scope from the latest recording

Keep this update focused on invoices. Add a central Custom form styles settings page, design presets, font sizes through 24 points, logo placement and replacement, page margins, clickable header/table/footer sections, column labels and widths, default customer messages, email defaults and optional footer payment images. A custom-field builder was explicitly excluded. Estimates, sales receipts, sales orders and purchase orders are outside this update.

## Deferred features

- **Customer statements:** Balance forward, open item, and transaction statements, with PDF download, printing, and email delivery.
- **Detailed customer page:** A full accounting overview with outstanding and overdue balances, invoices, payments, credits, transaction history, contact and address information, and document actions.
- **Reports and custom reports:** Keep standard reports and add a builder for new reports with selectable fields and calculations, filters, columns, sorting, grouping, and saved report definitions. The initial report examples and required datasets still need to be specified.
- **Further email features:** The invoice-specific recipient and existing review/send path are included now. Any additional email automation remains future work.
- **Transaction statements:** Included in the customer statement requirement above, rather than treated as a second independent feature.

## Decisions to preserve

- Intended for the owner's business and internal users.
- Build features and validate with sample data first. QuickBooks data migration and ongoing synchronization are separate future work.
- Additional business specific features have not yet been supplied.
- The supplied QuickBooks recording guides invoice creation and packing-slip printing. An exact printed invoice design can still be customized separately.
