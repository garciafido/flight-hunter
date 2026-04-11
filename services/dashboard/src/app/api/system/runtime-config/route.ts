import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { DEFAULT_RUNTIME_CONFIG, type RuntimeConfig } from '@flight-hunter/shared';

// Validation schema for the editable runtime config blob.
const BaggagePolicySchema = z.object({
  carryOnUSD: z.number().min(0).max(500),
  checkedBagUSD: z.number().min(0).max(500),
  note: z.string().optional(),
});

const RuntimeConfigSchema = z.object({
  baggagePolicies: z.record(z.string(), BaggagePolicySchema).optional(),
  argTaxes: z
    .object({
      pais: z.number().min(0).max(2),
      rg5232: z.number().min(0).max(2),
    })
    .optional(),
  notifierDedupTtlMs: z.number().int().min(60_000).max(7 * 24 * 60 * 60 * 1000).optional(),
  notifierCooldownMs: z.number().int().min(0).max(7 * 24 * 60 * 60 * 1000).optional(),
  scraperMaxDatesPerPair: z.number().int().min(1).max(60).optional(),
  maxWaypoints: z.number().int().min(1).max(8).optional(),
});

/**
 * GET /api/system/runtime-config
 * Returns:
 *   - current: the active config (defaults merged with DB overrides)
 *   - defaults: the bundled defaults (so the UI can show "diff" + reset)
 *   - override: the raw blob currently in DB (or null if no overrides)
 */
export async function GET() {
  try {
    const row = await (prisma as any).systemSettings.findUnique({
      where: { id: 'singleton' },
    });
    const override = (row?.runtimeConfig ?? null) as Partial<RuntimeConfig> | null;
    const current: RuntimeConfig = {
      baggagePolicies: override?.baggagePolicies ?? DEFAULT_RUNTIME_CONFIG.baggagePolicies,
      argTaxes: override?.argTaxes ?? DEFAULT_RUNTIME_CONFIG.argTaxes,
      notifierDedupTtlMs: override?.notifierDedupTtlMs ?? DEFAULT_RUNTIME_CONFIG.notifierDedupTtlMs,
      notifierCooldownMs: override?.notifierCooldownMs ?? DEFAULT_RUNTIME_CONFIG.notifierCooldownMs,
      scraperMaxDatesPerPair: override?.scraperMaxDatesPerPair ?? DEFAULT_RUNTIME_CONFIG.scraperMaxDatesPerPair,
      maxWaypoints: override?.maxWaypoints ?? DEFAULT_RUNTIME_CONFIG.maxWaypoints,
    };
    return NextResponse.json({
      current,
      defaults: DEFAULT_RUNTIME_CONFIG,
      override,
    });
  } catch (err) {
    console.error('GET /api/system/runtime-config error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PUT /api/system/runtime-config
 * Body: a partial RuntimeConfig blob. Replaces the entire override row.
 * Send the full intended state (not a delta). To clear all overrides, send {}.
 */
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const parsed = RuntimeConfigSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid runtime config', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const blob = parsed.data;
    await (prisma as any).systemSettings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', runtimeConfig: blob },
      update: { runtimeConfig: blob },
    });
    return NextResponse.json({ ok: true, override: blob });
  } catch (err) {
    console.error('PUT /api/system/runtime-config error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/system/runtime-config
 * Clears all overrides — services revert to bundled defaults on next poll.
 */
export async function DELETE() {
  try {
    await (prisma as any).systemSettings.upsert({
      where: { id: 'singleton' },
      create: { id: 'singleton', runtimeConfig: null },
      update: { runtimeConfig: null },
    });
    return NextResponse.json({ ok: true, defaults: DEFAULT_RUNTIME_CONFIG });
  } catch (err) {
    console.error('DELETE /api/system/runtime-config error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
