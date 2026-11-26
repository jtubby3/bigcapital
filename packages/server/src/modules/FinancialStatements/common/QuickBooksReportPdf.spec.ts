import { BalanceSheetPdfInjectable } from '../modules/BalanceSheet/BalanceSheetPdfInjectable';
import { ProfitLossTablePdfInjectable } from '../modules/ProfitLossSheet/ProfitLossTablePdfInjectable';
import { TableSheetPdf } from './TableSheetPdf';

describe('selected financial report PDFs', () => {
  it.each([
    ['Balance Sheet', BalanceSheetPdfInjectable, 'cash', 'Cash'],
    ['Profit and Loss', ProfitLossTablePdfInjectable, 'accrual', 'Accrual'],
  ] as const)(
    'shows the normalized accounting basis for %s',
    async (title, ReportPdf, basis, label) => {
      let html: string;
      const pdf = new TableSheetPdf({
        convertHtmlContent: async (content: string) => {
          html = content;
          return Buffer.from('%PDF');
        },
      } as any);
      const source = {
        table: async () => ({
          table: { columns: [{ key: 'name', label: 'Account' }], rows: [] },
          meta: {
            organizationName: 'Acme Inc.',
            formattedDateRange: 'November 2026',
          },
          query: { basis },
        }),
      };

      await new ReportPdf(source as any, pdf).pdf({ numberFormat: {} } as any);

      expect(html).toContain(title);
      expect(html).toContain(`November 2026 · ${label} basis`);
    },
  );
});
