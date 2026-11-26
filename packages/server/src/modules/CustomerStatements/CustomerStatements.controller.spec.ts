import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { CustomerStatementsController } from './CustomerStatements.controller';
import { CustomerStatementsService } from './CustomerStatements.service';
import { CustomerStatementsReadGuard } from './CustomerStatementsPermission.guard';
import { AuthorizationGuard } from '@/modules/Roles/Authorization.guard';
import { PermissionGuard } from '@/modules/Roles/Permission.guard';
import { SerializeInterceptor } from '@/common/interceptors/serialize.interceptor';
import { ValidationPipe } from '@/common/pipes/ClassValidation.pipe';
import { validateStatementDraft } from './statementSnapshot';

const body = {
  statement_type: 'balance-forward',
  statement_date: '2026-01-31',
  from_date: '2026-01-01',
  to_date: '2026-01-31',
  include_payment_links: false,
  recipients: [{ customer_id: 1, email: '' }],
};

describe('customer statement HTTP boundary', () => {
  let app: INestApplication;
  let canEdit = true;
  let canReport = true;
  let canView = true;
  const statements = {
    preview: jest.fn((input) => {
      validateStatementDraft(input);
      return [];
    }),
    save: jest.fn((input) => {
      validateStatementDraft(input);
      return [];
    }),
    recipients: jest.fn(() => []),
    list: jest.fn(() => []),
    previewPdf: jest.fn(() => Buffer.from('%PDF-1.4\n')),
    savedPdf: jest.fn(() => Buffer.from('%PDF-1.4\n')),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [CustomerStatementsController],
      providers: [
        { provide: CustomerStatementsService, useValue: statements },
        CustomerStatementsReadGuard,
        PermissionGuard,
      ],
    })
      .overrideGuard(AuthorizationGuard)
      .useValue({
        canActivate(context) {
          context.switchToHttp().getRequest().ability = {
            can(action: string) {
              return action === 'Edit'
                ? canEdit
                : action === 'View'
                  ? canView
                  : canReport;
            },
          };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.useGlobalInterceptors(new SerializeInterceptor());
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
  });
  beforeEach(() => {
    canEdit = canReport = canView = true;
    jest.clearAllMocks();
  });
  afterAll(() => app.close());

  it('accepts snake-case nested recipients after the actual interceptor and DTO pipe', async () => {
    await request(app.getHttpServer())
      .post('/customer-statements/preview')
      .send(body)
      .expect(200);
    const parsed = validateStatementDraft(statements.preview.mock.calls[0][0]);
    expect(parsed.recipients).toEqual([{ customerId: 1, email: '' }]);
    await request(app.getHttpServer())
      .post('/customer-statements')
      .send(body)
      .expect(201);
  });
  it('rejects invalid dates through the HTTP boundary', async () => {
    await request(app.getHttpServer())
      .post('/customer-statements/preview')
      .send({ ...body, to_date: '2026-02-30' })
      .expect(400);
  });
  it('permits read-only preview but blocks saving without Customer.Edit', async () => {
    canEdit = false;
    await request(app.getHttpServer())
      .post('/customer-statements/preview')
      .send(body)
      .expect(200);
    await request(app.getHttpServer())
      .post('/customer-statements')
      .send(body)
      .expect(403);
    await request(app.getHttpServer())
      .post('/customer-statements/1/send')
      .expect(403);
    expect(statements.save).not.toHaveBeenCalled();
  });
  it('requires report permission even on save/send handlers with edit permission', async () => {
    canReport = false;
    await request(app.getHttpServer())
      .get('/customer-statements/recipients')
      .expect(403);
    await request(app.getHttpServer())
      .post('/customer-statements')
      .send(body)
      .expect(403);
    await request(app.getHttpServer())
      .post('/customer-statements/1/send')
      .expect(403);
  });
  it('requires customer view permission for history and PDF', async () => {
    canView = false;
    await request(app.getHttpServer())
      .get('/customer-statements?customer_id=1')
      .expect(403);
    await request(app.getHttpServer())
      .get('/customer-statements/1/pdf')
      .expect(403);
    await request(app.getHttpServer())
      .post('/customer-statements/preview/pdf')
      .send(body)
      .expect(403);
  });
  it('normalizes query keys and deduplicates ids, rejecting invalid selection', async () => {
    await request(app.getHttpServer())
      .get('/customer-statements/recipients?customer_ids=1,1,2')
      .expect(200);
    expect(statements.recipients).toHaveBeenCalledWith([1, 2]);
    await request(app.getHttpServer())
      .get('/customer-statements?customer_id=2')
      .expect(200);
    expect(statements.list).toHaveBeenCalledWith(2);
    await request(app.getHttpServer())
      .get('/customer-statements/recipients?customer_ids=1,bad')
      .expect(400);
  });
  it('returns unmodified PDF bytes with a PDF content type', async () => {
    const response = await request(app.getHttpServer())
      .post('/customer-statements/preview/pdf')
      .send(body)
      .expect(200)
      .expect('Content-Type', /application\/pdf/);
    expect(response.body).toEqual(Buffer.from('%PDF-1.4\n'));
  });
});
