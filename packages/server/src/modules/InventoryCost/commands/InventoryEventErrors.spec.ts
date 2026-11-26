import { Test } from '@nestjs/testing';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { events } from '@/common/events/events';
import { SaleInvoiceWriteInventoryTransactionsSubscriber } from '@/modules/SaleInvoices/subscribers/InvoiceWriteInventoryTransactions';
import { SaleReceiptInventoryTransactionsSubscriber } from '@/modules/SaleReceipts/inventory/SaleReceiptWriteInventoryTransactions';
import { BillWriteInventoryTransactionsSubscriber } from '@/modules/Bills/subscribers/BillWriteInventoryTransactionsSubscriber';
import { CreditNoteInventoryTransactionsSubscriber } from '@/modules/CreditNotes/subscribers/CreditNoteInventoryTransactionsSubscriber';
import { VendorCreditInventoryTransactionsSubscriber } from '@/modules/VendorCredit/subscribers/VendorCreditInventoryTransactionsSusbcriber';
import { WarehouseTransferInventoryTransactionsSubscriber } from '@/modules/WarehousesTransfers/susbcribers/WarehouseTransferInventoryTransactionsSubscriber';
import { InventoryAdjustmentInventoryTransactionsSubscriber } from '@/modules/InventoryAdjutments/inventory/InventoryAdjustmentInventoryTransactionsSubscriber';
import { LandedCostInventoryTransactionsSubscriber } from '@/modules/EE/BillLandedCosts/commands/LandedCostInventoryTransactions.subscriber';
import { billLandedCostEvents } from '@/modules/EE/BillLandedCosts/BillLandedCosts.events';

const posted = {
  id: 1,
  deliveredAt: '2026-01-01',
  openedAt: '2026-01-01',
  closedAt: '2026-01-01',
  isOpen: true,
  isPublished: true,
  isInitiated: true,
  isTransferred: true,
};

const cases: Array<[string, any, string, Record<string, unknown>]> = [
  [
    'invoice',
    SaleInvoiceWriteInventoryTransactionsSubscriber,
    events.saleInvoice.onCreated,
    { saleInvoice: posted },
  ],
  [
    'receipt',
    SaleReceiptInventoryTransactionsSubscriber,
    events.saleReceipt.onCreated,
    { saleReceipt: posted },
  ],
  [
    'bill',
    BillWriteInventoryTransactionsSubscriber,
    events.bill.onCreated,
    { bill: posted },
  ],
  [
    'credit note',
    CreditNoteInventoryTransactionsSubscriber,
    events.creditNote.onCreated,
    { creditNote: posted },
  ],
  [
    'vendor credit',
    VendorCreditInventoryTransactionsSubscriber,
    events.vendorCredit.onCreated,
    { vendorCredit: posted },
  ],
  [
    'warehouse transfer',
    WarehouseTransferInventoryTransactionsSubscriber,
    events.warehouseTransfer.onCreated,
    { warehouseTransfer: posted },
  ],
  [
    'stock adjustment',
    InventoryAdjustmentInventoryTransactionsSubscriber,
    events.inventoryAdjustment.onQuickCreated,
    { inventoryAdjustment: posted },
  ],
  [
    'landed cost',
    LandedCostInventoryTransactionsSubscriber,
    billLandedCostEvents.onCreated,
    { billLandedCost: posted, bill: posted },
  ],
];

describe('Inventory event validation errors', () => {
  it.each(cases)(
    'propagates %s inventory failures to the transaction caller',
    async (_name, subscriber, event, payload) => {
      const failure = new Error('Insufficient stock');
      const rejectWrite = jest.fn().mockRejectedValue(failure);
      const inventory = new Proxy({}, { get: () => rejectWrite });
      const moduleRef = await Test.createTestingModule({
        imports: [EventEmitterModule.forRoot()],
        providers: [
          { provide: subscriber, useFactory: () => new subscriber(inventory) },
        ],
      }).compile();
      const app = moduleRef.createNestApplication();
      app.useLogger(false);
      await app.init();
      try {
        await expect(
          app.get(EventEmitter2).emitAsync(event, { ...payload, trx: {} }),
        ).rejects.toBe(failure);
      } finally {
        await app.close();
      }
    },
  );
});
