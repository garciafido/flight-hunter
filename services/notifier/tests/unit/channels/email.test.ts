import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createEmailChannel } from '../../../src/channels/email.js';

const mockSendMail = vi.fn();

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: mockSendMail,
    })),
  },
}));

describe('EmailChannel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const config = {
    host: 'smtp.example.com',
    port: 587,
    user: 'user@example.com',
    pass: 'secret',
    from: 'noreply@example.com',
    to: 'alerts@example.com',
  };

  it('creates a transport with provided config', async () => {
    const nodemailer = await import('nodemailer');
    createEmailChannel(config);
    expect(nodemailer.default.createTransport).toHaveBeenCalledWith({
      host: 'smtp.example.com',
      port: 587,
      auth: { user: 'user@example.com', pass: 'secret' },
    });
  });

  it('sends email with correct parameters', async () => {
    mockSendMail.mockResolvedValue({ messageId: 'test-id' });
    const channel = createEmailChannel(config);
    await channel.send('Test Subject', '<h1>Hello</h1>');

    expect(mockSendMail).toHaveBeenCalledWith({
      from: 'noreply@example.com',
      to: 'alerts@example.com',
      subject: 'Test Subject',
      html: '<h1>Hello</h1>',
    });
  });

  it('propagates errors from sendMail', async () => {
    mockSendMail.mockRejectedValue(new Error('SMTP connection failed'));
    const channel = createEmailChannel(config);
    await expect(channel.send('Subject', '<p>Body</p>')).rejects.toThrow('SMTP connection failed');
  });
});
