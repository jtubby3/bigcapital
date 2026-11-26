import { Test } from '@nestjs/testing';
import { TransactionsByCustomersPdf } from './TransactionsByCustomersPdf';
import { TransactionsByCustomersTableInjectable } from './TransactionsByCustomersTableInjectable';
import { TableSheetPdf } from '../../common/TableSheetPdf';

describe('TransactionsByCustomersPdf', () => {
  it.each([undefined, true, false])(
    'renders the report table and forwards showInRed=%s',
    async (showInRed) => {
      const table = {
        columns: [{ key: 'customer', label: 'Customer' }],
        rows: [{ cells: [{ key: 'customer', value: 'Acme Ltd' }] }],
      };
      const meta = {
        organizationName: 'BC Test Org',
        sheetName: 'Transactions By Customers',
        formattedDateRange: 'From 2026-01-01 | To 2026-12-31',
      };
      const tableInjectable = {
        table: jest.fn().mockResolvedValue({ table, meta }),
      };
      const pdfBuffer = Buffer.from('%PDF-1.4 customers');
      const tableSheetPdf = {
        convertToPdf: jest.fn().mockResolvedValue(pdfBuffer),
      };

      const moduleRef = await Test.createTestingModule({
        providers: [
          TransactionsByCustomersPdf,
          {
            provide: TransactionsByCustomersTableInjectable,
            useValue: tableInjectable,
          },
          { provide: TableSheetPdf, useValue: tableSheetPdf },
        ],
      }).compile();
      const query = {
        fromDate: '2026-01-01',
        toDate: '2026-12-31',
        numberFormat: { showInRed },
      } as any;

      const result = await moduleRef.get(TransactionsByCustomersPdf).pdf(query);

      expect(result).toBe(pdfBuffer);
      expect(tableInjectable.table).toHaveBeenCalledWith(query);
      expect(tableSheetPdf.convertToPdf).toHaveBeenCalledWith(
        table,
        'BC Test Org',
        'Transactions By Customers',
        'From 2026-01-01 | To 2026-12-31',
        undefined,
        showInRed,
      );
    },
  );
});
