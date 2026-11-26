import { pickBy } from 'lodash';
import type { InvoiceAddress } from '@bigcapital/pdf-templates';
import { InvoicePdfTemplateAttributes } from './SaleInvoice.types';
import { SaleInvoiceResponseDto } from './dtos/SaleInvoiceResponse.dto';
import { contactAddressTextFormat } from '@/utils/address-text-format';

export const mergePdfTemplateWithDefaultAttributes = (
  brandingTemplate?: Record<string, any>,
  defaultAttributes: Record<string, any> = {},
) => {
  const brandingAttributes = pickBy(
    brandingTemplate,
    (val, key) => val !== null && Object.keys(defaultAttributes).includes(key),
  );
  return {
    ...defaultAttributes,
    ...brandingAttributes,
  };
};

export const transformInvoiceToPdfTemplate = (
  invoice: SaleInvoiceResponseDto,
  discountLabel = 'Discount',
): Partial<InvoicePdfTemplateAttributes> => {
  return {
    dueDate: invoice.dueDateFormatted,
    dateIssue: invoice.invoiceDateFormatted,
    invoiceNumber: invoice.invoiceNo,

    total: invoice.totalFormatted,
    subtotal: invoice.subtotalFormatted,
    paymentMade: invoice.paymentAmountFormatted,
    dueAmount: invoice.dueAmountFormatted,

    termsConditions: invoice.termsConditions,
    statement: invoice.invoiceMessage,

    lines: invoice.entries.map((entry) => ({
      item: entry.item.name,
      description: entry.description,
      rate: entry.rateFormatted,
      quantity: entry.quantityFormatted,
      quantityValue: entry.quantity,
      total: entry.totalFormatted,
      discount: entry.discountFormatted,
    })),
    taxes: invoice.taxes.map((tax) => ({
      label: tax.name,
      amount: tax.taxRateAmountFormatted,
    })),
    discount: invoice.discountAmountFormatted,
    discountLabel: invoice.discountPercentageFormatted
      ? `${discountLabel} [${invoice.discountPercentageFormatted}]`
      : discountLabel,
    customerAddress: contactAddressTextFormat(invoice.customer),
    billingAddressText: invoice.billingAddressText,
    shippingAddressText: invoice.shippingAddressText,
    shippingMethod: invoice.shippingMethod,
    shippingDate: invoice.shippingDateFormatted,
    trackingNo: invoice.trackingNo,
    referenceNo: invoice.referenceNo,
    paymentInstructions: invoice.paymentInstructions,
    paymentTerms:
      invoice.paymentTermsDays == null
        ? ''
        : invoice.paymentTermsDays === 0
          ? 'Due on receipt'
          : `Net ${invoice.paymentTermsDays}`,
    shippingCharge:
      Number(invoice.shippingCharge) > 0 ? invoice.shippingChargeFormatted : '',
    adjustment:
      Number(invoice.adjustment) !== 0 ? invoice.adjustmentFormatted : '',

    billingAddress: invoiceCustomerAddress(invoice.customer, 'billing'),
    shippingAddress: customerShippingAddress(invoice.customer),
  };
};

const invoiceCustomerAddress = (
  customer: SaleInvoiceResponseDto['customer'],
  kind: 'billing' | 'shipping',
): InvoiceAddress => ({
  displayName: customer.displayName,
  address1: customer[`${kind}Address1`],
  address2: customer[`${kind}Address2`],
  city: customer[`${kind}AddressCity`],
  state: customer[`${kind}AddressState`],
  postalCode: customer[`${kind}AddressPostcode`],
  country: customer[`${kind}AddressCountry`],
  phone: customer[`${kind}AddressPhone`],
  email:
    customer[`${kind}AddressEmail`] ||
    (kind === 'billing' ? customer.email : undefined),
});

const customerShippingAddress = (
  customer: SaleInvoiceResponseDto['customer'],
): InvoiceAddress | null => {
  const address = invoiceCustomerAddress(customer, 'shipping');
  return [
    address.address1,
    address.address2,
    address.city,
    address.state,
    address.postalCode,
    address.country,
  ].some((value) => value?.trim())
    ? address
    : null;
};
