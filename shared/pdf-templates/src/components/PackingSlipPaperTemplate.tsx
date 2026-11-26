import {
  InvoicePaperTemplate,
  InvoicePaperTemplateProps,
} from './InvoicePaperTemplate';

/** A packing slip has product details and quantities, never invoice amounts. */
export function PackingSlipPaperTemplate(props: InvoicePaperTemplateProps) {
  return (
    <InvoicePaperTemplate
      {...props}
      invoiceTitle="Packing Slip"
      lineColumns={['item', 'quantity', 'rate', 'discount', 'total']}
      showLineItem
      showLineQuantity
      showLineDescription
      showLineRate={false}
      showLineDiscount={false}
      showLineTotal={false}
      showSubtotal={false}
      showDiscount={false}
      showAdjustment={false}
      showShippingCharge={false}
      showTaxes={false}
      showTotal={false}
      showPaymentMade={false}
      showDueAmount={false}
      showTermsConditions={false}
      showStatement={true}
      paymentInstructions={props.paymentInstructions}
    />
  );
}
