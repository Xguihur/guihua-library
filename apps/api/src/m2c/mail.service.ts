import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import { serviceUnavailableError } from '../common/api-exception';

/** Mature SMTP transport with a bounded timeout; never self-implements SMTP. */
@Injectable()
export class MailService {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.config.get<string>('SMTP_HOST'));
  }

  /**
   * Sends the fixed verification page link. The raw token only ever appears in
   * the URL fragment of the delivered message, never in an API response or log.
   */
  async sendVerification(email: string, token: string, mode: 'add' | 'verify'): Promise<void> {
    if (!this.isConfigured()) throw serviceUnavailableError();

    const timeout = this.config.get<number>('MAIL_TIMEOUT_MS') ?? 5000;
    const transport = nodemailer.createTransport({
      host: this.config.getOrThrow<string>('SMTP_HOST'),
      port: this.config.get<number>('SMTP_PORT') ?? 1025,
      // secure=true is implicit TLS (normally port 465). requireTLS forces
      // STARTTLS on a plaintext-port connection (normally 587). Both default
      // to false so the loopback-only Mailpit dev/test capture still works.
      secure: this.config.get<boolean>('SMTP_SECURE') ?? false,
      requireTLS: this.config.get<boolean>('SMTP_REQUIRE_TLS') ?? false,
      ...(this.config.get<string>('SMTP_USER')
        ? {
            auth: {
              user: this.config.getOrThrow<string>('SMTP_USER'),
              pass: this.config.getOrThrow<string>('SMTP_PASS'),
            },
          }
        : {}),
      connectionTimeout: timeout,
      greetingTimeout: timeout,
      socketTimeout: timeout,
    });

    const page = mode === 'add' ? '/verify-email?mode=add' : '/verify-email?mode=verify';
    const link = `${this.config.getOrThrow<string>('WEB_BASE_URL')}${page}#${token}`;
    const subject = mode === 'add' ? '确认邮箱并添加密码登录' : '确认邮箱归属';
    const text = `请在本站打开以下链接完成验证：\n${link}\n若非本人操作请忽略此邮件。`;
    const html = `<p>请在本站完成邮箱验证：</p><p><a href="${link}">${subject}</a></p><p>若非本人操作请忽略此邮件。</p>`;

    try {
      await transport.sendMail({
        from: this.config.getOrThrow<string>('SMTP_FROM'),
        to: email,
        subject,
        text,
        html,
      });
    } catch {
      // Send failure must never leave a usable challenge and must not be
      // reported as a successful send; the caller deletes the challenge.
      throw serviceUnavailableError();
    } finally {
      transport.close();
    }
  }
}
