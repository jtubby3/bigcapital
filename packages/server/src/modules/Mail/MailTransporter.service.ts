import { isStagingEnvironment } from '@/common/config/deployment-environment';
import { Transporter } from 'nodemailer';
import { Mail } from './Mail';
import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { MAIL_TRANSPORTER_PROVIDER } from './Mail.constants';

@Injectable()
export class MailTransporter {
  constructor(
    @Inject(MAIL_TRANSPORTER_PROVIDER)
    private readonly transporter: Transporter,
  ) {}

  async send(mail: Mail) {
    if (isStagingEnvironment())
      throw new ForbiddenException(
        'External email delivery is disabled in staging.',
      );
    return this.transporter.sendMail(mail.mailOptions);
  }
}
