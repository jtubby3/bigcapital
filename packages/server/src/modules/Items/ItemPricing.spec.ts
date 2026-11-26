import { EditItemService } from './EditItem.service';
import { CreateItemService } from './CreateItem.service';
import { CommandItemDto } from './dtos/Item.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

const initial = {
  id: 1,
  name: 'Existing description',
  type: 'inventory',
  costPrice: 10,
  sellPrice: 12,
  markupPercentage: 20,
  autoIncreaseSellPrice: true,
  sellable: true,
  purchasable: true,
  reorderPoint: null,
};
function harness(enabled = true) {
  let saved: any = { ...initial };
  const query: any = {
    findById: () => query,
    forUpdate: () => query,
    throwIfNotFound: async () => ({ ...saved }),
    patchAndFetchById: async (_id: number, patch: any) =>
      (saved = { ...saved, ...patch }),
    insertAndFetch: async (patch: any) => (saved = { ...patch, id: 1 }),
  };
  const model: any = () => ({ query: () => query });
  const validators: any = new Proxy({}, { get: () => async () => {} });
  const uow: any = { withTransaction: async (fn: any) => fn({}) };
  const events: any = { emitAsync: async () => {} };
  const settings: any = async () => ({ get: () => enabled });
  const service: any = new (EditItemService as any)(
    events,
    uow,
    validators,
    model,
    settings,
    { record: async () => {} },
  );
  const create: any = new CreateItemService(events, uow, validators, model);
  return { service, create, saved: () => saved };
}
describe('saved item automatic pricing', () => {
  it('applies the saved 20% target on a higher cost inside an item edit', async () => {
    const h = harness();
    await h.service.editItem(1, { ...initial, costPrice: 14 });
    expect(h.saved()).toMatchObject({
      costPrice: 14,
      sellPrice: 16.8,
      markupPercentage: 20,
    });
  });
  it('master off still saves cost and the individual preference but holds selling price', async () => {
    const h = harness(false);
    await h.service.editItem(1, { ...initial, costPrice: 14 });
    expect(h.saved()).toMatchObject({
      costPrice: 14,
      sellPrice: 12,
      autoIncreaseSellPrice: true,
      markupPercentage: 20,
    });
  });
  it('persists a target derived from the initial new item price', async () => {
    const h = harness();
    const { markupPercentage, autoIncreaseSellPrice, ...input } = initial;
    await h.create.createItem(input);
    expect(h.saved()).toMatchObject({
      autoIncreaseSellPrice: true,
      markupPercentage: 20,
    });
  });
  it('retains the saved target through decreases and a later increase', async () => {
    const h = harness();
    await h.service.editItem(1, { ...initial, costPrice: 8 });
    await h.service.editItem(1, { ...h.saved(), costPrice: 14 });
    expect(h.saved()).toMatchObject({ sellPrice: 16.8, markupPercentage: 20 });
  });
});
describe('automatic pricing input validation', () => {
  it.each([
    { autoIncreaseSellPrice: 'false' },
    { markupPercentage: -101 },
    { markupPercentage: Infinity },
  ])('rejects invalid pricing input %p', async (fields) => {
    const dto = plainToInstance(CommandItemDto, {
      name: 'Test',
      type: 'service',
      ...fields,
    });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });
});
