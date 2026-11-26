import { GetPdfTemplateService } from './GetPdfTemplate.service';

describe('template image rendering', () => {
  const setup = (mime = 'image/png') => {
    const template = { id: 1, attributes: { companyLogoKey: 'tenant/logo', footerImageKey: 'tenant/qr', layoutMode: 'distribution' } };
    const query = { findById: () => ({ throwIfNotFound: async () => template }) };
    const attachment = { getAttachment: jest.fn(async () => ({ ContentType: mime, Body: { transformToByteArray: async () => Uint8Array.from([137,80,78,71]) } })) };
    const service = new GetPdfTemplateService((() => ({ query: () => query })) as never, { transform: (value) => value } as never, { getPresignedUrl: async (key) => `https://storage.test/${key}` } as never, attachment as never);
    return { service, attachment };
  };
  it('keeps editor image URLs but embeds logo and footer bytes for PDF rendering', async () => {
    const { service, attachment } = setup();
    const editor = await service.getPdfTemplate(1);
    expect(editor.companyLogoUri).toBe('https://storage.test/tenant/logo');
    expect(editor.attributes.footerImageUri).toBe('https://storage.test/tenant/qr');
    expect(attachment.getAttachment).not.toHaveBeenCalled();
    const printed = await service.getPdfTemplate(1, undefined, true);
    expect(printed.companyLogoUri).toBe('data:image/png;base64,iVBORw==');
    expect(printed.attributes.footerImageUri).toBe('data:image/png;base64,iVBORw==');
    expect(printed.attributes.layoutMode).toBe('distribution');
  });
  it('does not embed non-image attachments as logos or QR images', async () => {
    const { service } = setup('text/html');
    const printed = await service.getPdfTemplate(1, undefined, true);
    expect(printed.companyLogoUri).toBe('');
    expect(printed.attributes.footerImageUri).toBe('');
  });
});
