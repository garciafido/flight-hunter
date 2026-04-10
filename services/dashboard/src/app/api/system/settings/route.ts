import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const settings = await (prisma as any).systemSettings.findUnique({
      where: { id: 'singleton' },
    });

    return NextResponse.json({
      emailsPaused: settings?.emailsPaused ?? false,
    });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const emailsPaused = Boolean(body.emailsPaused);

    const settings = await (prisma as any).systemSettings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', emailsPaused },
      update: { emailsPaused },
    });

    return NextResponse.json({ emailsPaused: settings.emailsPaused });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
