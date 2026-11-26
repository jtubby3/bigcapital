# Custom invoice templates

Open Sales and Invoices, open the gear menu and select Customize Templates, and choose an invoice template or create a new invoice branding template. Give the template a name before customizing its fields.

## Custom form styles settings

Open Preferences → Custom form styles to search, create, edit, duplicate, delete or choose the default invoice style. This update is limited to invoices. The existing invoice-entry screen and invoice-specific addresses are retained.

The General panel offers Classic, Modern green and Minimal presets. Layout provides four fonts (Arial, Georgia, Courier New and Times New Roman), sizes up to 24 points, independent page margins in inches, logo placement and logo width. The PDF uses the selected margins on every page, with a minimum of 0.25 inches for safe printing and 0.5-inch defaults. Tables keep padding on both outside edges, and long text wraps within the available width. The logo upload can be replaced without changing the bottom image.

The designer keeps controls on the left and a live preview on the right. Drag the divider between the panes to widen the invoice preview or the editing controls. The browser remembers your preferred width. Double-click the divider to reset; keyboard users can focus it and use Left/Right arrows (Shift for larger steps), Home/End, or Enter to reset. Both panes scroll independently, and the PDF preview fits the available pane width without changing the printed invoice size.

Click the header, line-item table, customer addresses, or footer area of the PDF preview to open that section's controls. The same controls can be reached through the panel tabs. Header options include editable business details, form title, labels and visibility for dates, terms, reference and shipping details. These business details belong to the style, rather than updating the company profile.

Columns controls support separate or combined product descriptions, headings, order, visibility, proportional widths and alternating row colors. Each column width has both a slider and a number field; moving either updates the other and the live invoice preview. Footer controls set the default note and payment instructions for new invoices, footer text, text size and alignment. Defaults prefill new invoices and can be edited per invoice; saving a style does not rewrite existing invoice notes or addresses.

Email controls set the default subject, message and PDF attachment option shown in Review and send. Variables such as `{Customer Name}` and `{Invoice Number}` are supported. The review step still requires an explicit Send action. Invoice email defaults do not replace reminder-email content.

The November 12 screen recording is the main behavior reference. It explicitly excludes building custom fields. Additional visual inspiration: [Adobe invoice templates](https://www.adobe.com/express/templates/invoice) and [Zoho invoice templates](https://www.zoho.com/invoice/templates/). The app's actual business data and totals remain authoritative.

## Jersey Distributors reference design

The **Jersey Distributors** template follows the supplied invoice: company details at upper left, replaceable logo at upper right, invoice title, Bill To and Ship To beside invoice metadata, separate description and quantity columns, and totals at the lower right. It is the default for new invoices; select it under Manage on an existing invoice.

In **General**, use Replace image to change the logo. In **Layout**, choose the distributor form or use **Use distributor reference design**, set the logo width, and enter template-specific company details. These details do not change the company profile. **Columns** provides alternating row colors and two color controls; striping spans the full row through quantity and amount.

In **Bottom image**, upload a payment QR image or another PNG/JPEG (up to 5 MB), set its width, alignment and optional caption, or turn it off. This image is independent of the logo, saves with the template and appears beneath invoice and packing-slip content. Supply your actual payment QR image when you want a usable payment destination.

## Customize a form

General controls set the logo and branding colors. Layout controls set the title, font, font size, paper size, and additional header and footer text. Columns controls change line item headings, visibility, and order. Content controls change the other labels and visible invoice fields. Invoice amounts and balances always come from the invoice.

New templates start with US Letter paper. Existing invoices without these settings keep the standard A4 layout until their template is edited or a different saved template is selected.

## Customize Bill To and Ship To

Open the Addresses tab to change the Bill To and Ship To headings, turn each block on or off, and edit each address format independently. The customer's Billing address and Shipping address fields prefill the invoice. You can edit both address blocks on an individual invoice without changing the customer record. Invoice-specific address text prints as entered; template token formats apply when an invoice uses the customer address directly. A missing shipping address is omitted from the printed invoice rather than replaced with the billing address.

Address formats accept ordinary text and tokens such as `{CONTACT_NAME}`, `{ADDRESS_1}`, `{ADDRESS_2}`, `{CITY}`, `{STATE}`, `{POSTAL_CODE}`, `{COUNTRY}`, `{PHONE}`, and `{EMAIL}`. Reorder or remove tokens to choose the address fields and line order. Empty lines are omitted. The preview uses sample addresses; actual invoices use the selected customer.

In Visual designer, choose Bill To address or Ship To address to move and resize that block independently. Existing saved layouts gain a Ship To section automatically without dropping the Bill To section.

## Design a layout

Open Visual designer and select Enable visual layout. Drag a section to another position, use the row, column, and width controls, or focus a section and press the arrow keys. Sections snap to a 12 column grid. Moving a section into another section moves the other section down to prevent overlap. Rows grow with their content, including long line item tables.

Reset positions restores the initial section layout. Use standard layout returns to the conventional form while retaining the saved designer positions.

To recreate an existing invoice, expand Match an existing invoice and select a PNG or JPEG smaller than 10 MB. Adjust the guide opacity, then position sections and change the form settings. The reference is temporary, stays in the browser, and is excluded from the saved template, printed invoice, and emailed PDF. This is a manual matching workflow, not automatic image or PDF conversion.

## Save and use a template

Save the template, then select it from the template control when creating or editing an invoice. The existing branding template list also supports marking a template as the default. PDF document previews, downloads, and existing invoice email attachments share the same renderer and saved settings.

## Create an invoice and packing slip

Open Sales → Invoices → New Invoice. Select a customer to prefill email and addresses. Edit Bill to and Ship to for this invoice, add shipping details and customer PO/reference, choose payment terms, and enter products, descriptions, quantities and rates. Net terms calculate the due date; entering a due date manually selects Custom terms. Fractional quantities are supported. Shipping charge is separate from Adjustment and is added after product taxes.

Payment instructions and Note to customer appear on the invoice. Internal notes and Internal memo are retained for your team and excluded from invoice PDFs, packing slips and customer payment links. Payer view previews the current unsaved invoice; Manage selects a saved design or opens template customization.

Save as Draft keeps an unposted invoice. Save and close finalizes it. Review and send finalizes the invoice and opens the existing email review drawer with the invoice-specific email recipient; sending still requires the Send action in that drawer. The local development app delivers test email to Mailpit at http://localhost:8025.

**Packing slip** opens a print/download preview after saving the invoice. It is also available in saved invoice details and the invoice row menu. Use **Open / print packing slip** to print or **Download packing slip** to save the PDF.

**Preview / print invoice** saves the invoice and opens its PDF in a preview window, with **Open / print invoice** to open the browser PDF viewer and print without downloading. The separate **Download invoice** action remains available in the preview, and the arrow beside Preview / print invoice opens the download options. Packing slips use the saved design, addresses and shipment details, showing product descriptions and quantities while hiding monetary columns, totals and terms. Payment instructions and Note to customer are included; Internal notes and Internal memo remain hidden. After first save, the form switches to editing that invoice so repeated downloads do not create duplicates.

## Verify before business use

Preview and download a representative invoice, including one with enough products to span multiple pages. Check the paper size, addresses, product columns, totals, and footer. Send a test invoice through your configured email transport to an address you control before sending business invoices.

## Developer checks

Build the shared PDF package before running its renderer tests:

```sh
pnpm --filter @bigcapital/pdf-templates build
node --test shared/pdf-templates/test/*.test.cjs
cd packages/server
pnpm exec jest src/modules/SaleInvoices/utils.spec.ts src/modules/PdfTemplate/utils/sanitizePdfTemplateAttributes.spec.ts --runInBand
```

The renderer tests cover legacy templates, custom text and typography, column settings, malformed layouts, collision handling, and long invoices. Server tests cover design attribute merging, actual invoice values, discount labels, and safe treatment of plain text and HTML addresses.
