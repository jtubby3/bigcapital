import moment from 'moment';
import intl from 'react-intl-universal';
import * as Yup from 'yup';
import { DATATYPES_LENGTH } from '@/constants/dataTypes';
import { TaxType } from '@/interfaces/TaxRates';
import { isBlank } from '@/utils';

const getSchema = () =>
  Yup.object().shape({
    customerId: Yup.string().label(intl.get('customer_name_')).required(),
    invoiceDate: Yup.date().required().label(intl.get('invoice_date_')),
    dueDate: Yup.date()
      .min(Yup.ref('invoiceDate'), ({ path, min }) =>
        intl.get('invoice.validation.due_date', {
          path,
          min: moment(min).format('YYYY/MM/DD'),
        }),
      )
      .required()
      .label(intl.get('due_date_')),
    invoiceNo: Yup.string()
      .max(DATATYPES_LENGTH.STRING)
      .label(intl.get('invoice_no_')),
    referenceNo: Yup.string().max(DATATYPES_LENGTH.STRING),
    delivered: Yup.boolean(),
    billingAddressText: Yup.string().nullable().max(4000),
    shippingAddressText: Yup.string().nullable().max(4000),
    recipientEmail: Yup.string().email('Enter a valid customer email').max(254),
    shippingMethod: Yup.string().max(255),
    shippingDate: Yup.date()
      .nullable()
      .transform((value, original) => (original === '' ? null : value)),
    trackingNo: Yup.string().max(255),
    paymentTermsDays: Yup.string(),
    paymentInstructions: Yup.string().max(4000),
    internalNotes: Yup.string().max(4000),
    statementMemo: Yup.string().max(4000),
    shippingCharge: Yup.number()
      .transform((value, original) => (original === '' ? 0 : value))
      .min(0)
      .max(1000000000),
    fromEstimateId: Yup.string(),
    invoiceMessage: Yup.string()
      .trim()
      .max(DATATYPES_LENGTH.TEXT)
      .label(intl.get('note')),
    termsConditions: Yup.string()
      .trim()
      .max(DATATYPES_LENGTH.TEXT)
      .label(intl.get('note')),
    exchangeRate: Yup.number(),
    inclusiveExclusiveTax: Yup.string().oneOf([
      TaxType.Inclusive,
      TaxType.Exclusive,
    ]),
    branchId: Yup.string(),
    warehouseId: Yup.string(),
    entries: Yup.array().of(
      Yup.object().shape({
        quantity: Yup.number()
          .nullable()
          .max(DATATYPES_LENGTH.INT_10)
          .when(['rate'], {
            is: (rate) => rate,
            then: Yup.number().required(),
          }),
        rate: Yup.number().nullable().max(DATATYPES_LENGTH.INT_10),
        itemId: Yup.number()
          .nullable()
          .when(['quantity', 'rate'], {
            is: (quantity, rate) => !isBlank(quantity) && !isBlank(rate),
            then: Yup.number().required(),
          }),
        discount: Yup.number().nullable().min(0).max(100),
        description: Yup.string().nullable().max(DATATYPES_LENGTH.TEXT),
      }),
    ),
  });

export const getCreateInvoiceFormSchema = getSchema;
export const getEditInvoiceFormSchema = getSchema;
