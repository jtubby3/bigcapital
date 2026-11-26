import { InvoicePaperTemplateProps } from '../components/InvoicePaperTemplate';
import { PackingSlipPaperTemplate } from '../components/PackingSlipPaperTemplate';
import { renderSSR } from './render-ssr';

export const renderPackingSlipPaperTemplateHtml = (
  props: InvoicePaperTemplateProps,
) => renderSSR(<PackingSlipPaperTemplate {...props} />);
