import { BadRequestException, ConflictException } from '@nestjs/common';
import { SettingsStore } from '../Settings/SettingsStore';
import { CustomerTypesService } from './CustomerTypes.service';
import { CustomerTypesController } from './CustomerTypes.controller';
import { REQUIRED_PERMISSION_KEY } from '../Roles/RequirePermission.decorator';

function company(assigned: string[][] = []) {
  const rows: any[] = [];
  const repository: any = {
    all: async () => rows.map((row) => ({ ...row })),
    create: async (row) => rows.push({ ...row }),
    update: async (value, query) => {
      rows
        .filter((row) => row.key === query.key && row.group === query.group)
        .forEach((row) => Object.assign(row, value));
    },
  };
  const store = async () => {
    const settings = new SettingsStore(repository);
    await settings.load();
    return settings;
  };
  // Only replace the database boundary; exercise the real settings persistence.
  const customers: any = () => ({
    query: () => ({
      select: async () =>
        assigned.map((categories) => ({ customerProfile: { categories } })),
    }),
  });
  return { service: new CustomerTypesService(store, customers), assigned };
}

describe('customer types', () => {
  it('persists an unassigned type across requests without changing customer assignments', async () => {
    const { service, assigned } = company([['Restaurants']]);
    await service.create('  Temples & Churches  ');
    expect(await service.list()).toEqual(['Restaurants', 'Temples & Churches']);
    expect(assigned).toEqual([['Restaurants']]);
  });

  it('keeps company registries separate', async () => {
    const first = company();
    const second = company();
    await first.service.create('Restaurants');
    expect(await first.service.list()).toEqual(['Restaurants']);
    expect(await second.service.list()).toEqual([]);
  });

  it('merges assigned types and registry entries once, ignoring case and empty names', async () => {
    const { service, assigned } = company([
      ['Restaurants', '', '  Wholesale  '],
      ['restaurants'],
    ]);
    await service.create('Temples & Churches');
    assigned.push(['temples & churches']);
    expect(await service.list()).toEqual([
      'Restaurants',
      'Temples & Churches',
      'Wholesale',
    ]);
  });

  it.each(['', '   ', 'a'.repeat(101), null, 123])(
    'rejects invalid type names: %s',
    async (name) => {
      const { service } = company();
      await expect(service.create(name as any)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(await service.list()).toEqual([]);
    },
  );

  it('rejects duplicates of both registered and already assigned types', async () => {
    const { service } = company([['Restaurants']]);
    await expect(service.create(' restaurants ')).rejects.toBeInstanceOf(
      ConflictException,
    );
    await service.create('Wholesale');
    await expect(service.create('WHOLESALE')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(await service.list()).toEqual(['Restaurants', 'Wholesale']);
  });

  it('adds different type names concurrently without overwriting either entry', async () => {
    const { service } = company();
    await Promise.all([
      service.create('Restaurants'),
      service.create('Temples & Churches'),
    ]);
    expect(await service.list()).toEqual(['Restaurants', 'Temples & Churches']);
  });

  it('requires customer View to list types and customer Edit to add types', () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION_KEY,
        CustomerTypesController.prototype.list,
      ),
    ).toEqual({ ability: 'View', subject: 'Customer' });
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION_KEY,
        CustomerTypesController.prototype.create,
      ),
    ).toEqual({ ability: 'Edit', subject: 'Customer' });
  });
});
