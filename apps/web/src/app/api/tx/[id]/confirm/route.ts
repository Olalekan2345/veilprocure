import { NextResponse } from "next/server";
import { z } from "zod";
import { requireActor } from "@/server/authz";
import { confirmIntent } from "@/server/chain/confirm";
import { AppError } from "@/server/errors";
import { assertSameOrigin, jsonError } from "@/server/http";
import { rateLimit } from "@/server/ratelimit";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(req);
    const actor = await requireActor();
    await rateLimit(`tx-confirm:${actor.id}`, 120, 600);
    const { id } = await ctx.params;
    const body = z.object({ txHash: z.string().min(40).max(64) }).safeParse(await req.json().catch(() => null));
    if (!z.uuid().safeParse(id).success || !body.success) throw new AppError("INVALID_INPUT", "Invalid request.");
    const result = await confirmIntent(actor, id, body.data.txHash);
    return NextResponse.json({ ok: true, data: result });
  } catch (err) {
    return jsonError(err);
  }
}
