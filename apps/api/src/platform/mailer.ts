import type { MailConfig } from '@wms/config';
import nodemailer, { type Transporter } from 'nodemailer';
import type { FastifyBaseLogger } from 'fastify';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  /** The outbox row id: the provider's idempotency reference, so a resend is recognisable. */
  reference: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/**
 * Used until a mail provider is chosen (spec open item 10). It records that a mail was due,
 * never its address, link or body: a log line must not become a way to read invitations.
 */
export class LogMailer implements Mailer {
  constructor(private readonly logger: FastifyBaseLogger) {}

  send(mail: Mail): Promise<void> {
    this.logger.info(
      { reference: mail.reference, subject: mail.subject },
      'mail queued (no provider configured)',
    );
    return Promise.resolve();
  }
}

export class SmtpMailer implements Mailer {
  private readonly transport: Transporter;

  constructor(
    url: string,
    private readonly from: string,
  ) {
    this.transport = nodemailer.createTransport(url);
  }

  async send(mail: Mail): Promise<void> {
    await this.transport.sendMail({
      from: this.from,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      messageId: `<${mail.reference}@netpoleon-wms>`,
    });
  }
}

export function createMailer(config: MailConfig, logger: FastifyBaseLogger): Mailer {
  return config.provider === 'smtp'
    ? new SmtpMailer(config.url, config.from)
    : new LogMailer(logger);
}
