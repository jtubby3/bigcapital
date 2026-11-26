import { Module } from '@nestjs/common';
import { S3Client } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import s3Config from '@/common/config/s3';

export const S3_CLIENT = 'S3_CLIENT';
export const S3_SIGNING_CLIENT = 'S3_SIGNING_CLIENT';

const createS3Client = (
  config: ReturnType<typeof s3Config>,
  endpoint = config.endpoint,
) =>
  new S3Client({
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    endpoint,
    forcePathStyle: config.forcePathStyle,
  });

const services = [
  {
    provide: S3_CLIENT,
    inject: [ConfigService],
    useFactory: (configService: ConfigService) =>
      createS3Client(configService.get('s3')),
  },
  {
    provide: S3_SIGNING_CLIENT,
    inject: [ConfigService, S3_CLIENT],
    useFactory: (configService: ConfigService, s3Client: S3Client) => {
      const config = configService.get<ReturnType<typeof s3Config>>('s3');
      // Sign the browser-visible host without changing internal storage access.
      return config.publicEndpoint
        ? createS3Client(config, config.publicEndpoint)
        : s3Client;
    },
  },
];
@Module({
  providers: [...services],
  exports: [...services],
})
export class S3Module {}
