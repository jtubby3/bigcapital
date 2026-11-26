import * as Yup from 'yup';

export const InvoiceCustomizeSchema = Yup.object().shape({
  templateName: Yup.string().trim().required('Template Name is required'),
  invoiceTitle: Yup.string()
    .trim()
    .max(120)
    .required('Document title is required'),
  companyAddressOverride: Yup.string().max(2000),
  alternateRowColors: Yup.boolean(),
  showTotalQuantity: Yup.boolean(),
  totalQuantityLabel: Yup.string().trim().max(120),
  oddRowColor: Yup.string().matches(/^#[0-9a-f]{6}$/i),
  evenRowColor: Yup.string().matches(/^#[0-9a-f]{6}$/i),
  logoWidth: Yup.number().min(80).max(350),
  footerImageWidth: Yup.number().min(64).max(400),
  footerImageAlign: Yup.string().oneOf(['left', 'center', 'right']),
  footerImageCaption: Yup.string().max(500),
  headerText: Yup.string().max(2000),
  footerText: Yup.string().max(4000),
  billedToLabel: Yup.string().max(120),
  shipToLabel: Yup.string().max(120),
  billToAddressFormat: Yup.string()
    .max(2000)
    .required('Bill To address format is required'),
  shipToAddressFormat: Yup.string()
    .max(2000)
    .required('Ship To address format is required'),
  fontFamily: Yup.string().oneOf([
    'Arial',
    'Georgia',
    'Courier New',
    'Times New Roman',
  ]),
  documentFontSize: Yup.number().min(10).max(32).required(),
  designVariant: Yup.string().oneOf(['reference', 'modern', 'minimal']),
  logoPosition: Yup.string().oneOf(['left', 'center', 'right']),
  pageMarginTop: Yup.number().nullable().min(0).max(2),
  pageMarginRight: Yup.number().nullable().min(0).max(2),
  pageMarginBottom: Yup.number().nullable().min(0).max(2),
  pageMarginLeft: Yup.number().nullable().min(0).max(2),
  defaultInvoiceMessage: Yup.string().max(4000),
  defaultPaymentInstructions: Yup.string().max(4000),
  emailSubject: Yup.string().max(300),
  emailMessage: Yup.string().max(4000),
  footerTextSize: Yup.number().min(8).max(32),
  footerTextAlign: Yup.string().oneOf(['left', 'center', 'right']),
  lineColumnWidths: Yup.object().shape(
    Object.fromEntries(
      ['item', 'description', 'quantity', 'rate', 'discount', 'total'].map(
        (k) => [k, Yup.number().min(5).max(80)],
      ),
    ),
  ),
  pageSize: Yup.string().oneOf(['a4', 'letter']),
  layoutMode: Yup.string().oneOf(['standard', 'designer', 'distribution']),
  sectionLayout: Yup.array()
    .max(9)
    .of(
      Yup.object().shape({
        id: Yup.string()
          .oneOf([
            'header',
            'companyAddress',
            'customerAddress',
            'shippingAddress',
            'items',
            'totals',
            'terms',
            'statement',
            'footer',
          ])
          .required(),
        column: Yup.number().integer().min(1).max(12).required(),
        row: Yup.number().integer().min(1).max(80).required(),
        width: Yup.number().integer().min(3).max(12).required(),
      }),
    ),
});
