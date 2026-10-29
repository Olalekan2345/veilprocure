import { eq } from "drizzle-orm";
import { z } from "zod";
import { BID_DOMAIN, type NormalizedQuote } from "@veilprocure/shared";
import { orgIdsOf, requireActor } from "@/server/authz";
import { openJson } from "@/server/crypto";
import { db, tables, withActor } from "@/server/db";
import { AppError } from "@/server/errors";
import { jsonError } from "@/server/http";
import { revisionPayloadAad, revisionSaltAad } from "@/server/services/supplier";

const t = tables;

/**
 * A supplier's own commitment receipt: everything needed to recompute the on-chain hash
 * independently (including the private salt). Only the supplier organisation can download it.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireActor();
    const { id } = await ctx.params;
    if (!z.uuid().safeParse(id).success) throw new AppError("NOT_FOUND", "Receipt not found.");
    const supplierOrgs = orgIdsOf(actor, "supplier");
    const data = await withActor(db(), supplierOrgs, async (tx) => {
      const [rev] = await tx.select().from(t.quoteRevisions).where(eq(t.quoteRevisions.id, id)).limit(1);
      if (!rev || !supplierOrgs.includes(rev.supplierOrgId) || rev.status === "prepared" || rev.status === "failed") return null;
      const [rfq] = await tx.select().from(t.rfqs).where(eq(t.rfqs.id, rev.rfqId)).limit(1);
      const quote = await openJson<NormalizedQuote>(rev.payloadEnc, revisionPayloadAad(rev.id, rev.supplierOrgId));
      const { salt } = await openJson<{ salt: string }>(rev.saltEnc, revisionSaltAad(rev.id, rev.supplierOrgId));
      return {
        kind: "veilprocure-bid-commitment-receipt",
        warning: "Contains your private salt. Anyone holding this file can link your bid content to your on-chain commitment. Keep it confidential.",
        domain: BID_DOMAIN,
        network: rfq?.network,
        contractId: rfq?.contractId,
        rfqOnchainId: rfq?.onchainId?.toString(),
        supplierAccountId: rev.supplierAccountId,
        version: rev.version,
        quote,
        attachmentDigests: rev.attachmentDigests,
        saltHex: salt,
        commitment: rev.commitmentHex,
        commitTxHash: rev.commitTxHash,
        encoding:
          'sha256("VEILPROCURE/BID/v1" 0x00 lp(network) lp(contractId) u64le(rfqOnchainId) lp(supplierAccountId) u32le(version) lp(canonicalJson(quote)) u32le(n) sorted(attachmentDigests) salt), lp(x)=u32le(len)||utf8(x). Reference implementations: packages/shared/src/commitment.ts and scripts/vectors/bid_commitment_vector.py',
      };
    });
    if (!data) throw new AppError("NOT_FOUND", "Receipt not found.");
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="veilprocure-bid-v${data.version}-receipt.json"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}
