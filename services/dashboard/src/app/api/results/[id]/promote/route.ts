import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    const result = await prisma.flightResult.findUnique({
      where: { id },
    });

    if (!result) {
      return NextResponse.json({ error: 'Result not found' }, { status: 404 });
    }

    if (!(result as any).suspicious) {
      return NextResponse.json({ error: 'Result is not marked as suspicious' }, { status: 400 });
    }

    // Clear the suspicious flag
    const updated = await prisma.flightResult.update({
      where: { id },
      data: {
        suspicious: false,
        suspicionReason: null,
      } as any,
    });

    return NextResponse.json({ success: true, result: updated });
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
