import type { FastifyBaseLogger } from 'fastify';

export interface Email {
  to: string;
  subject: string;
  text: string;
}

/**
 * Sends one email. `idempotencyKey` is the outbox row id: delivery is at least once, so a real
 * provider must be given it to drop a repeat (foundation spec section 15).
 */
export interface Mailer {
  send(email: Email, idempotencyKey: string): Promise<void>;
}

export class MailerUnavailableError extends Error {
  constructor() {
    super('No email provider is configured.');
    this.name = 'MailerUnavailableError';
  }
}

/**
 * The provider until one is chosen (foundation spec, open item 10). In development it writes
 * the email, link included, to the log so the flow can be followed. In production it refuses:
 * a single-use link in a log file is a credential in a log file, so the outbox row is retried
 * and then parked as failed, where an administrator can see that mail is not going out.
 */
export class LogMailer implements Mailer {
  constructor(
    private readonly logger: FastifyBaseLogger,
    private readonly production: boolean,
  ) {}

  send(email: Email, idempotencyKey: string): Promise<void> {
    if (this.production) return Promise.reject(new MailerUnavailableError());
    this.logger.info(
      { outboxId: idempotencyKey, to: email.to, subject: email.subject, body: email.text },
      'email (development log mailer)',
    );
    return Promise.resolve();
  }
}
