import * as moment from 'moment';
import { defaultTo, omit, isEmpty } from 'lodash';
import { Injectable, BadRequestException } from '@nestjs/common';
import { Customer } from '../models/Customer';
import { CustomerProfileDto } from '../dtos/CustomerProfile.dto';
import { Inject } from '@nestjs/common';
import { TenantModelProxy } from '@/modules/System/models/TenantBaseModel';
import { TenancyContext } from '@/modules/Tenancy/TenancyContext.service';
import { ICustomerEditDTO, ICustomerNewDTO } from '../types/Customers.types';
import { ContactService } from '@/modules/Contacts/types/Contacts.types';

@Injectable()
export class CreateEditCustomerDTO {
  /**
   * @param {TenancyContext} tenancyContext - Tenancy context service.
   */
  constructor(
    private readonly tenancyContext: TenancyContext,
    @Inject(Customer.name)
    private readonly customers: TenantModelProxy<typeof Customer>,
  ) {}

  private async validateProfile(dto: { customerProfile?: CustomerProfileDto }) {
    const keys = dto.customerProfile?.attachmentKeys;
    if (keys?.length) {
      const docs = await this.customers()
        .knex()('documents')
        .whereIn('key', keys)
        .select('key');
      if (new Set(keys).size !== docs.length)
        throw new BadRequestException('Invalid attachment');
    }
  }

  /**
   * Transformes the create/edit DTO.
   * @param {ICustomerNewDTO | ICustomerEditDTO} customerDTO
   * @returns
   */
  private transformCommonDTO = (
    customerDTO: ICustomerNewDTO | ICustomerEditDTO,
  ) => {
    const { code, ...rest } = customerDTO;

    return {
      ...omit(rest, ['customerType']),
      contactType: customerDTO.customerType,
      // Blank codes are stored as NULL to avoid `CONTACTS_CODE_UNIQUE` collisions.
      ...(typeof code === 'string'
        ? { code: code.trim() ? code.trim() : null }
        : {}),
    };
  };

  /**
   * Transformes the create DTO.
   * @param {ICustomerNewDTO} customerDTO
   * @returns {Promise<Partial<Customer>>}
   */
  public transformCreateDTO = async (customerDTO: ICustomerNewDTO) => {
    await this.validateProfile(
      customerDTO as { customerProfile?: CustomerProfileDto },
    );
    const commonDTO = this.transformCommonDTO(customerDTO);

    // Retrieves the tenant metadata.
    const tenantMeta = await this.tenancyContext.getTenant(true);

    return {
      ...commonDTO,
      currencyCode:
        customerDTO.currencyCode || tenantMeta?.metadata?.baseCurrency,
      active: defaultTo(customerDTO.active, true),
      contactService: ContactService.Customer,
      ...(!isEmpty(customerDTO.openingBalanceAt)
        ? {
            openingBalanceAt: moment(
              customerDTO?.openingBalanceAt,
            ).toMySqlDateTime(),
          }
        : {}),
      openingBalanceExchangeRate: defaultTo(
        customerDTO.openingBalanceExchangeRate,
        1,
      ),
    };
  };

  /**
   * Transformes the edit DTO.
   * @param   {ICustomerEditDTO} customerDTO
   * @returns
   */
  public transformEditDTO = async (customerDTO: ICustomerEditDTO) => {
    await this.validateProfile(
      customerDTO as { customerProfile?: CustomerProfileDto },
    );
    const commonDTO = this.transformCommonDTO(customerDTO);

    return {
      ...commonDTO,
    };
  };
}
