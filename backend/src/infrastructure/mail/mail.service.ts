import { Inject, Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { APP_CONFIG, type AppConfig } from '../../config/app-config';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;
  private readonly from: string;
  private readonly enabled: boolean;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.enabled = config.mail.enabled;
    this.from = config.mail.from;
    this.transporter = config.mail.enabled
      ? createTransport({
          host: config.mail.smtp.host,
          port: config.mail.smtp.port,
          secure: config.mail.smtp.secure,
          auth: config.mail.smtp.user
            ? { user: config.mail.smtp.user, pass: config.mail.smtp.password }
            : undefined,
        })
      : null;
  }

  async send(message: MailMessage): Promise<void> {
    if (!this.enabled || !this.transporter) {
      this.logger.warn(`[mail:disabled] to=${message.to} subject=${message.subject}`);
      return;
    }

    await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }

  sendVerificationEmail(to: string, token: string): Promise<void> {
    const link = `${this.frontendUrl(this.toFrontendPath(`/verify-email?token=${token}`))}`;

    return this.send({
      to,
      subject: 'Verify your SentiRental account',
      text: `Confirm your email address: ${link}\nThis link expires in 24 hours.`,
      html: `<p>Confirm your email address:</p><p><a href="${link}">${link}</a></p><p>This link expires in 24 hours.</p>`,
    });
  }

  sendPasswordResetEmail(to: string, token: string): Promise<void> {
    const link = this.frontendUrl(this.toFrontendPath(`/reset-password?token=${token}`));

    return this.send({
      to,
      subject: 'Reset your SentiRental password',
      text: `Reset your password: ${link}\nThis link expires in 60 minutes.`,
      html: `<p>Reset your password:</p><p><a href="${link}">${link}</a></p><p>This link expires in 60 minutes.</p>`,
    });
  }

  sendManagerAssignedEmail(to: string, propertyName: string): Promise<void> {
    return this.send({
      to,
      subject: `You were assigned to ${propertyName}`,
      text: `You now manage ${propertyName} on SentiRental.`,
    });
  }

  private frontendUrl(path: string): string {
    const base = process.env.FRONTEND_URL ?? 'http://localhost:3001';
    return `${base.replace(/\/$/, '')}${path}`;
  }

  private toFrontendPath(path: string): string {
    return path.startsWith('/') ? path : `/${path}`;
  }
}
