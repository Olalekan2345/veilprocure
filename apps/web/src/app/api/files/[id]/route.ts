import { eq } from "drizzle-orm";
import { requireActor, orgIdsOf } from "@/server/authz";
import { openJson, verifyDownload } from "@/server/crypto";
import { db, tables, withActor } from "@/server/db";
import { jsonError } from "@/server/http";
import { audit } from "@/server/audit";
import { blobAad, filenameAad } from "@/server/services/supplier";
import { getDecrypted } from "@/server/storage";
import { AppError } from "@/server/errors";

const t = tables;

/**
 * Authorised download. Requires (1) a valid short-lived signed token minted for this user and
 * (2) row-level-security visibility of the attachment in the caller's organisations at request
 * time. Always served as an attachment with nosniff and a sandboxing CSP — never rendered.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireActor();
    const { id } = await ctx.params;
    const token = new URL(req.url).searchParams.get("t") ?? "";
    if (!verifyDownload(id, actor.id, token)) throw new AppError("FORBIDDEN", "This download link expired. Reload the page for a fresh one.");
    const row = await withActor(db(), orgIdsOf(actor), async (tx) => {
      const [a] = await tx.select().from(t.privateAttachments).where(eq(t.privateAttachments.id, id)).limit(1);
      return a ?? null;
    });
    if (!row || row.deletedAt) throw new AppError("NOT_FOUND", "File not found.");
    const data = await getDecrypted(row.storageKey, blobAad(row.storageKey, row.ownerOrgId));
    const { name } = await openJson<{ name: string }>(row.filenameEnc, filenameAad(row.id, row.ownerOrgId));
    await audit(db(), { actorKind: "user", actorUserId: actor.id, orgId: row.ownerOrgId, rfqId: row.rfqId, action: "attachment.downloaded", targetType: "attachment", targetId: row.id });
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${name.replace(/"/g, "")}"`,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; default-src 'none'",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}
