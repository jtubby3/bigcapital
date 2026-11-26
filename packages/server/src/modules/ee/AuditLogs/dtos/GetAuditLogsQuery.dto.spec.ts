import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AuthorizationGuard } from '@/modules/Roles/Authorization.guard';
import { PermissionGuard } from '@/modules/Roles/Permission.guard';
import { AuditLogsController } from '../AuditLogs.controller';
import { GetAuditLogsService } from '../queries/GetAuditLogs.service';
import { GetAuditLogFilterOptionsService } from '../queries/GetAuditLogFilterOptions.service';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { GetAuditLogsQueryDto } from './GetAuditLogsQuery.dto';

describe('audit log subject ID query', () => {
  it('converts a positive integer query string', async () => {
    const dto = plainToInstance(GetAuditLogsQueryDto, { subjectId: '42' });

    expect((dto as any).subjectId).toBe(42);
    expect(await validate(dto)).toEqual([]);
  });

  it.each(['0', '-1', '1.5', 'invalid'])(
    'rejects subjectId %p',
    async (subjectId) => {
      const dto = plainToInstance(GetAuditLogsQueryDto, { subjectId });

      expect((await validate(dto)).map((error) => error.property)).toContain(
        'subjectId',
      );
    },
  );

  it('allows an omitted subject ID', async () => {
    const dto = plainToInstance(GetAuditLogsQueryDto, {});

    expect((dto as any).subjectId).toBeUndefined();
    expect(await validate(dto)).toEqual([]);
  });
});

// Exercise the controller used by AppModule -> EEModule -> AuditLogsModule.
describe('active audit controller OpenAPI query', () => {
  it('exports subjectId as an optional positive numeric query parameter', async () => {
    const module = await Test.createTestingModule({
      controllers: [AuditLogsController],
      providers: [
        { provide: GetAuditLogsService, useValue: {} },
        { provide: GetAuditLogFilterOptionsService, useValue: {} },
      ],
    })
      .overrideGuard(AuthorizationGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const app = module.createNestApplication();
    try {
      const document = SwaggerModule.createDocument(
        app,
        new DocumentBuilder().build(),
      );
      const parameter = document.paths['/audit-logs'].get.parameters.find(
        (parameter) => 'name' in parameter && parameter.name === 'subjectId',
      );
      expect(parameter).toMatchObject({
        name: 'subjectId',
        in: 'query',
        required: false,
        schema: { type: 'number', minimum: 1 },
      });
    } finally {
      await app.close();
    }
  });
});
