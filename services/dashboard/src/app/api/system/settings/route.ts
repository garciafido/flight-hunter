import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const settings = await (prisma as any).systemSettings.findUnique({
      where: { id: 'singleton' },
    });

    return NextResponse.json({
      emailsPaused: settings?.emailsPaused ?? false,
      webhookUrl: settings?.webhookUrl ?? null,
      webhookEnabled: settings?.webhookEnabled ?? false,
      slackWebhookUrl: settings?.slackWebhookUrl ?? null,
      discordWebhookUrl: settings?.discordWebhookUrl ?? null,
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();

    const data: Record<string, unknown> = {};

    if (typeof body.emailsPaused === 'boolean') {
      data.emailsPaused = body.emailsPaused;
    }
    if ('webhookUrl' in body) {
      data.webhookUrl = body.webhookUrl ?? null;
    }
    if (typeof body.webhookEnabled === 'boolean') {
      data.webhookEnabled = body.webhookEnabled;
    }
    if ('slackWebhookUrl' in body) {
      data.slackWebhookUrl = body.slackWebhookUrl ?? null;
    }
    if ('discordWebhookUrl' in body) {
      data.discordWebhookUrl = body.discordWebhookUrl ?? null;
    }

    const settings = await (prisma as any).systemSettings.upsert({
      where: { id: 'singleton' },
      create: {
        id: 'singleton',
        emailsPaused: false,
        webhookEnabled: false,
        ...data,
      },
      update: data,
    });

    return NextResponse.json({
      emailsPaused: settings.emailsPaused,
      webhookUrl: settings.webhookUrl ?? null,
      webhookEnabled: settings.webhookEnabled,
      slackWebhookUrl: settings.slackWebhookUrl ?? null,
      discordWebhookUrl: settings.discordWebhookUrl ?? null,
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
