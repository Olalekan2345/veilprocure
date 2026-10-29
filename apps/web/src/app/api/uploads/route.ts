import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireActor, requireMembership } from "@/server/authz";
import { sealJson } from "@/server/crypto";
import { db, tables, withActor } from "@/server/db";
import { AppError } from "@/server/errors";
import { assertSameOrigin, jsonError } from "@/server/http";
import { rateLimit } from "@/server/ratelimit";
import { audit } from "@/server/audit";
import { currentAward } from "@/server/services/award";
import { blobAad, filenameAad, loadSupplierContext } from "@/server/services/supplier";
import { MAX_UPLOAD_BYTES, putEncrypted, safeFilename } from "@/server/storage";

const t = tables;

/**
 * Encrypted upload for quote attachments (before commit) and delivery evidence (after award).
 * Content type is sniffed server-side; files are never rendered inline (see /api/files).
 */
export async function POST(req: Request) {
  try {
    assertSameOrigin(req);
    const actor = await requireActor();
    await rateLimit(`upload:${actor.id}`, 40, 3600);
    const len = Number(req.headers.get("content-length") ?? 0);
    if (len > MAX_UPLOAD_BYTES + 64 * 1024) throw new AppError("UPLOAD_REJECTED", "Files are limited to 10 MB.");
    const form = await req.formData();
    const purpose = z.enum(["quote", "delivery"]).parse(form.get("purpose"));
    const rfqId = z.uuid().parse(form.get("rfqId"));
    const file = form.get("file");
    if (!(file instanceof File)) throw new AppError("INVALID_INPUT", "Choose a file to upload.");
    const data = Buffer.from(await file.arrayBuffer());

    let ownerOrgId: string;
    let quoteId: string | null = null;
    if (purpose === "quote") {
      const ctx = await loadSupplierContext(actor, rfqId);
      requireMembership(actor, ctx.supplierOrgId, "quote:edit");
      if (ctx.rfq.status !== "open" || !ctx.rfq.deadlineAt || ctx.rfq.deadlineAt.getTime() <= Date.now()) throw new AppError("PRECONDITION_FAILED", "Bidding is closed.");
      if (!ctx.quote) throw new AppError("PRECONDITION_FAILED", "Save your quote draft before attaching files.");
      ownerOrgId = ctx.supplierOrgId;
      quoteId = ctx.quote.id;
    } else {
      const award = await currentAward(rfqId);
      if (!award || award.status !== "accepted") throw new AppError("PRECONDITION_FAILED", "Delivery files can be added once the award is accepted.");
      requireMembership(actor, award.supplierOrgId, "delivery:submit");
      ownerOrgId = award.supplierOrgId;
    }

    const stored = await putEncrypted(data, (key) => blobAad(key, ownerOrgId));
    const id = crypto.randomUUID();
    await withActor(db(), [ownerOrgId], async (tx) => {
      if (quoteId) {
        const dup = await tx
          .select({ id: t.privateAttachments.id })
          .from(t.privateAttachments)
          .where(and(eq(t.privateAttachments.quoteId, quoteId), eq(t.privateAttachments.sha256, stored.sha256)));
        if (dup.length) throw new AppError("CONFLICT", "This file is already attached.");
      }
      await tx.insert(t.privateAttachments).values({
        id,
        ownerOrgId,
        rfqId,
        quoteId,
        kind: purpose,
        filenameEnc: await sealJson({ name: safeFilename(file.name) }, filenameAad(id, ownerOrgId)),
        contentType: stored.contentType,
        sizeBytes: stored.sizeBytes,
        sha256: stored.sha256,
        storageKey: stored.storageKey,
        encMeta: stored.encMeta,
        createdBy: actor.id,
      });
      await audit(tx, { actorKind: "user", actorUserId: actor.id, orgId: ownerOrgId, rfqId, action: `attachment.uploaded`, targetType: "attachment", targetId: id, metadata: { purpose, sizeBytes: stored.sizeBytes, contentType: stored.contentType } });
    });
    return NextResponse.json({ ok: true, data: { id, sha256: stored.sha256, sizeBytes: stored.sizeBytes, contentType: stored.contentType } });
  } catch (err) {
    return jsonError(err);
  }
}
