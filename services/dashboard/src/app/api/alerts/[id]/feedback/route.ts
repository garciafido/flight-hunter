import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { value } = body;

    if (value !== 'positive' && value !== 'negative') {
      return NextResponse.json(
        { error: 'Invalid feedback value. Must be "positive" or "negative".' },
        { status: 400 },
      );
    }

    const alert = await prisma.alert.findUnique({ where: { id } });
    if (!alert) {
      return NextResponse.json({ error: 'Alert not found' }, { status: 404 });
    }

    const updated = await prisma.alert.update({
      where: { id },
      data: {
        feedback: value,
        feedbackAt: new Date(),
      },
    });

    return NextResponse.json({ id: updated.id, feedback: updated.feedback, feedbackAt: updated.feedbackAt });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
