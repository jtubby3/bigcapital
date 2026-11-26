import request = require('supertest');
import { app, AuthorizationHeader, orgainzationId } from './init-app-test';

describe('Attachments (e2e)', () => {
  it('/attachments/:id/presigned-url (GET)', async () => {
    const upload = await request(app.getHttpServer())
      .post('/attachments')
      .set('organization-id', orgainzationId)
      .set('Authorization', AuthorizationHeader)
      .attach('file', Buffer.from('attachment test content'), {
        filename: 'test.txt',
        contentType: 'text/plain',
      })
      .expect(200);

    const key = upload.body.data.key;
    expect(key).toEqual(expect.any(String));

    const response = await request(app.getHttpServer())
      .get(`/attachments/${encodeURIComponent(key)}/presigned-url`)
      .set('organization-id', orgainzationId)
      .set('Authorization', AuthorizationHeader)
      .expect(200);
    expect(response.body.presigned_url ?? response.body.presignedUrl).toMatch(
      /^https?:\/\//,
    );
  });
});
