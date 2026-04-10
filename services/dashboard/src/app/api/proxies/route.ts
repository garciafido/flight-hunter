import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const proxies = await prisma.proxy.findMany({ orderBy: { label: 'asc' } });
    return NextResponse.json(proxies);
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const proxy = await prisma.proxy.create({ data: body });
    return NextResponse.json(proxy, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
