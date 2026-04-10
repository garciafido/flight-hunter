import nodemailer from 'nodemailer';

export interface EmailConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  to: string;
}

export interface EmailChannel {
  send(subject: string, html: string): Promise<void>;
}

export function createEmailChannel(config: EmailConfig): EmailChannel {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });

  return {
    async send(subject: string, html: string): Promise<void> {
      await transport.sendMail({
        from: config.from,
        to: config.to,
        subject,
        html,
      });
    },
  };
}
