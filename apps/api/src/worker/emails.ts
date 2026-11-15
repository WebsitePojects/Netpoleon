import type { OutboxMessage } from '../platform/outbox.js';
import type { Email } from './mailer.js';

/** Plain-text emails for each queued topic. Kept short: a link and what it does. */
export function renderEmail(message: OutboxMessage): Email {
  switch (message.topic) {
    case 'email.invite':
      return {
        to: message.payload.to,
        subject: 'You are invited to Netpoleon WMS',
        text: [
          `Hello ${message.payload.fullName},`,
          '',
          `${message.payload.invitedBy ?? 'An administrator'} has given you access to Netpoleon WMS.`,
          'Open this link to choose your password. It works once and expires in 72 hours:',
          '',
          message.payload.link,
          '',
          'If you did not expect this, ignore this email.',
        ].join('\n'),
      };
    case 'email.password_reset':
      return {
        to: message.payload.to,
        subject: 'Reset your Netpoleon WMS password',
        text: [
          `Hello ${message.payload.fullName},`,
          '',
          'Open this link to choose a new password. It works once and expires in one hour:',
          '',
          message.payload.link,
          '',
          'If you did not ask for this, ignore this email. Your password has not changed.',
        ].join('\n'),
      };
  }
}
