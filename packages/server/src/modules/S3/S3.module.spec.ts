import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import s3Config from '@/common/config/s3';
import { GetAttachmentPresignedUrl } from '../Attachments/GetAttachmentPresignedUrl';
import { DocumentModel } from '../Attachments/models/Document.model';
import { GetWorkspacesService } from '../ee/Workspaces/queries/GetWorkspaces.service';
import { WorkspacesFinancialsService } from '../ee/Workspaces/queries/WorkspacesFinancials.service';
import { SystemUser } from '../System/models/SystemUser';
import { UserTenant } from '../System/models/UserTenant.model';
import { TransformerInjectable } from '../Transformer/TransformerInjectable.service';
import { S3_CLIENT, S3Module } from './S3.module';

// Password hashing is unrelated to presigning or mocked workspace records.
jest.mock('bcrypt', () => ({}));

describe('browser S3 URLs', () => {
  let moduleRef: TestingModule;
  const signingToken = 'S3_SIGNING_CLIENT';
  const publicEndpoint = 'http://192.168.1.48:8002';
  const internalEndpoint = 'http://minio:9000';
  const key = 'org-1/invoice.pdf';

  async function configure(endpoint?: string) {
    const membership = {
      tenant: {
        organizationId: 'org-1',
        metadata: { logoKey: key },
      },
    };
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          ignoreEnvVars: true,
          load: [
            () => ({
              s3: {
                region: 'us-east-1',
                accessKeyId: 'test-access-key',
                secretAccessKey: 'test-secret-key',
                endpoint: internalEndpoint,
                publicEndpoint: endpoint,
                bucket: 'staging-uploads',
                forcePathStyle: true,
              },
            }),
          ],
        }),
        S3Module,
      ],
      providers: [
        GetAttachmentPresignedUrl,
        GetWorkspacesService,
        {
          provide: DocumentModel.name,
          useValue: () => ({
            query: () => ({
              findOne: () => ({
                throwIfNotFound: async () => ({ originName: 'Invoice.pdf' }),
              }),
            }),
          }),
        },
        {
          provide: UserTenant.name,
          useValue: {
            query: () => ({
              where: () => ({
                withGraphFetched: async () => [membership],
              }),
            }),
          },
        },
        {
          provide: SystemUser.name,
          useValue: {
            query: () => ({
              select: () => ({
                where: () => ({ first: async () => ({ defaultTenantId: 1 }) }),
              }),
            }),
          },
        },
        {
          provide: TransformerInjectable,
          useValue: {
            transform: async (_memberships, _transformer, options) =>
              options.logoUris,
          },
        },
        {
          provide: WorkspacesFinancialsService,
          useValue: { getTotals: jest.fn() },
        },
      ],
    }).compile();
  }

  afterEach(async () => {
    if (!moduleRef) return;
    moduleRef.get<S3Client>(S3_CLIENT).destroy();
    await moduleRef.close();
    moduleRef = undefined;
  });

  it('loads the optional public endpoint from the environment', () => {
    const env = jest.replaceProperty(process, 'env', {
      S3_ENDPOINT: internalEndpoint,
      S3_PUBLIC_ENDPOINT: publicEndpoint,
    });
    try {
      expect(s3Config()).toMatchObject({
        endpoint: internalEndpoint,
        publicEndpoint,
      });
    } finally {
      env.restore();
    }
  });

  it('signs against the public host and port without changing storage or making network requests', async () => {
    await configure(publicEndpoint);
    const storage = moduleRef.get<S3Client>(S3_CLIENT);
    const signing = moduleRef.get<S3Client>(signingToken);
    const storageRequest = jest
      .spyOn(storage.config.requestHandler, 'handle')
      .mockRejectedValue(
        new Error('Network access is forbidden in presigning tests'),
      );
    const signingRequest = jest
      .spyOn(signing.config.requestHandler, 'handle')
      .mockRejectedValue(
        new Error('Network access is forbidden in presigning tests'),
      );
    try {
      const command = new GetObjectCommand({
        Bucket: 'staging-uploads',
        Key: key,
      });
      const browserUrl = new URL(
        await getSignedUrl(signing, command, { expiresIn: 300 }),
      );
      const storageUrl = new URL(
        await getSignedUrl(storage, command, { expiresIn: 300 }),
      );
      expect(browserUrl.origin).toBe(publicEndpoint);
      expect(browserUrl.pathname).toBe('/staging-uploads/org-1/invoice.pdf');
      expect(browserUrl.searchParams.get('X-Amz-Algorithm')).toBe(
        'AWS4-HMAC-SHA256',
      );
      expect(browserUrl.searchParams.get('X-Amz-Signature')).toMatch(
        /^[a-f0-9]{64}$/,
      );
      expect(browserUrl.searchParams.get('X-Amz-Expires')).toBe('300');
      expect(storageUrl.origin).toBe(internalEndpoint);
      expect(storageRequest).not.toHaveBeenCalled();
      expect(signingRequest).not.toHaveBeenCalled();
    } finally {
      signing.destroy();
    }
  });

  it.each([undefined, ''])(
    'reuses the existing storage client when the public endpoint is %p',
    async (endpoint) => {
      await configure(endpoint);
      const storage = moduleRef.get<S3Client>(S3_CLIENT);
      const signing = moduleRef.get<S3Client>(signingToken);
      expect(signing).toBe(storage);
      const url = new URL(
        await getSignedUrl(
          signing,
          new GetObjectCommand({ Bucket: 'staging-uploads', Key: key }),
        ),
      );
      expect(url.origin).toBe(internalEndpoint);
      expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[a-f0-9]{64}$/);
    },
  );

  it('uses the public signer for attachment downloads and keeps the original filename', async () => {
    await configure(publicEndpoint);
    const service = moduleRef.get(GetAttachmentPresignedUrl);
    const url = new URL(await service.getPresignedUrl(key));
    expect(url.origin).toBe(publicEndpoint);
    expect(url.searchParams.get('response-content-disposition')).toBe(
      'attachment; filename="Invoice.pdf"',
    );
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[a-f0-9]{64}$/);
  });

  it('uses the public signer for workspace logos', async () => {
    await configure(publicEndpoint);
    const service = moduleRef.get(GetWorkspacesService);
    const logos = await service.getWorkspaces(1);
    const url = new URL(logos['org-1']);
    expect(url.origin).toBe(publicEndpoint);
    expect(url.pathname).toBe('/staging-uploads/org-1/invoice.pdf');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[a-f0-9]{64}$/);
  });
});
