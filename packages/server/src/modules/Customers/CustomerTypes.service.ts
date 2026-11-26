import { createHash } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { SETTINGS_PROVIDER } from '../Settings/Settings.types';
import { SettingsStore } from '../Settings/SettingsStore';
import { Customer } from './models/Customer';
import { TenantModelProxy } from '../System/models/TenantBaseModel';

const TYPE_GROUP = 'customer-types';

@Injectable()
export class CustomerTypesService {
  constructor(
    @Inject(SETTINGS_PROVIDER)
    private readonly settingsStore: () => Promise<SettingsStore>,
    @Inject(Customer.name)
    private readonly customers: TenantModelProxy<typeof Customer>,
  ) {}

  async list(): Promise<string[]> {
    const [store, customers] = await Promise.all([
      this.settingsStore(),
      this.customers().query().select('customerProfile'),
    ]);
    const names = [
      ...store
        .all()
        .filter((entry) => entry.group === TYPE_GROUP)
        .map((entry) => entry.value),
      ...customers.flatMap(
        (customer) => customer.customerProfile?.categories || [],
      ),
    ];
    const unique = new Map<string, string>();
    for (const value of names) {
      if (typeof value !== 'string' || !value.trim()) continue;
      const name = value.trim();
      if (!unique.has(name.toLowerCase())) unique.set(name.toLowerCase(), name);
    }
    return [...unique.values()].sort((a, b) => a.localeCompare(b));
  }

  async create(value: string): Promise<string[]> {
    if (
      typeof value !== 'string' ||
      !value.trim() ||
      value.trim().length > 100
    ) {
      throw new BadRequestException(
        'Enter a customer type between 1 and 100 characters.',
      );
    }
    const name = value.trim();
    const existing = await this.list();
    if (existing.some((entry) => entry.toLowerCase() === name.toLowerCase())) {
      throw new ConflictException('This customer type already exists.');
    }
    const store = await this.settingsStore();
    // Separate settings entries prevent concurrent additions from overwriting other types.
    store.set({
      group: TYPE_GROUP,
      key: createHash('sha256').update(name.toLowerCase()).digest('hex'),
      value: name,
    });
    await store.save();
    return this.list();
  }
}
