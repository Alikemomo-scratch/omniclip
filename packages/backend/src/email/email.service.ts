import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { EMAIL_CONFIG } from './email.constants';

export interface SendEmailOptions {
  subject: string;
  html: string;
}

export interface SendResult {
  id: string;
}

@Injectable()
export class EmailService implements OnModuleInit {
  private resend!: Resend;
  private fromEmail!: string;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.resend = new Resend(this.config.getOrThrow(EMAIL_CONFIG.RESEND_API_KEY));
    this.fromEmail = this.config.getOrThrow(EMAIL_CONFIG.RESEND_FROM_EMAIL);
  }

  async sendDigestEmail(to: string, options: SendEmailOptions): Promise<SendResult> {
    const { data, error } = await this.resend.emails.send({
      from: this.fromEmail,
      to,
      subject: options.subject,
      html: options.html,
    });

    if (error) {
      throw new Error(error.message);
    }

    return { id: data!.id };
  }
}
