"use client";

import { Paperclip } from "lucide-react";
import { useId, useState } from "react";

export interface Uploaded {
  id: string;
  name: string;
  sha256: string;
  sizeBytes: number;
}

/** Encrypted upload to /api/uploads. Type and size are re-validated server-side. */
export function FileUpload({ purpose, rfqId, onUploaded }: { purpose: "quote" | "delivery"; rfqId: string; onUploaded: (f: Uploaded) => void }) {
  const id = useId();
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  async function upload(file: File) {
    if (file.size > 10 * 1024 * 1024) return setState({ busy: false, error: "Files are limited to 10 MB." });
    setState({ busy: true, error: null });
    const form = new FormData();
    form.set("purpose", purpose);
    form.set("rfqId", rfqId);
    form.set("file", file);
    try {
      const res = await fetch("/api/uploads", { method: "POST", body: form });
      const body = (await res.json()) as { ok: true; data: { id: string; sha256: string; sizeBytes: number } } | { ok: false; error: { message: string } };
      if (!body.ok) return setState({ busy: false, error: body.error.message });
      onUploaded({ id: body.data.id, sha256: body.data.sha256, sizeBytes: body.data.sizeBytes, name: file.name });
      setState({ busy: false, error: null });
    } catch {
      setState({ busy: false, error: "Upload failed — check your connection and try again." });
    }
  }
  return (
    <div>
      <label htmlFor={id} className="inline-flex cursor-pointer items-center gap-2 rounded-[10px] border border-dashed border-line-strong px-3 py-2 text-sm text-ink-3 hover:bg-sunken has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-verify/30">
        <Paperclip className="size-4" aria-hidden />
        {state.busy ? "Encrypting & uploading…" : "Attach a file (PDF, PNG, JPEG or text, max 10 MB)"}
        <input
          id={id}
          type="file"
          className="sr-only"
          accept=".pdf,.png,.jpg,.jpeg,.txt,.md,.csv,application/pdf,image/png,image/jpeg,text/plain"
          disabled={state.busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void upload(f);
          }}
        />
      </label>
      {state.error && (
        <p role="alert" className="mt-1 text-xs font-medium text-bad">
          {state.error}
        </p>
      )}
    </div>
  );
}
