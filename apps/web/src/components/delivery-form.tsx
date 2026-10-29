"use client";

import { useState } from "react";
import { prepareDeliveryAction } from "@/server/actions/procurement";
import { Field, inputClass } from "./ui";
import { FileUpload, type Uploaded } from "./file-upload";
import { TxAction } from "./wallet/tx-action";

/** Supplier delivery: a note plus optional encrypted files, hashed and anchored on chain. */
export function DeliveryForm({ rfqId, explorerBase }: { rfqId: string; explorerBase: string }) {
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<Uploaded[]>([]);
  return (
    <div className="space-y-4 rounded-xl border border-line bg-paper/60 p-4">
      <p className="text-sm font-semibold text-ink">Submit delivery evidence</p>
      <Field label="What did you deliver?" htmlFor="delivery-note" hint="Shared with the buyer. Its hash and your files' hashes are anchored on chain; the content stays private.">
        <textarea id="delivery-note" rows={4} className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} maxLength={5000} />
      </Field>
      <FileUpload purpose="delivery" rfqId={rfqId} onUploaded={(f) => setFiles((xs) => [...xs, f])} />
      {files.length > 0 && (
        <ul className="text-xs text-muted">
          {files.map((f) => (
            <li key={f.id}>
              {f.name} · <span className="hash">{f.sha256.slice(0, 12)}…</span>
            </li>
          ))}
        </ul>
      )}
      <TxAction
        prepare={() => prepareDeliveryAction(rfqId, { note, attachmentIds: files.map((f) => f.id) })}
        label="Anchor delivery on chain"
        variant="gold"
        explorerBase={explorerBase}
        disabled={note.trim().length < 10}
        confirmCopy="Anchors the hash of your note and files. This starts the buyer's review window."
      />
    </div>
  );
}
