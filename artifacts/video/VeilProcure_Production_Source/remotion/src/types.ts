/** Focus rectangle in source pixels (1920×1080 capture); the window zooms so this fills it. */
export interface Move {
  t: number; // seconds into the segment
  x: number;
  y: number;
  w: number; // height follows 16:9
}

export interface Callout {
  t0: number;
  t1: number;
  x: number; // source pixels
  y: number;
  w: number;
  h: number;
  text?: string;
  place?: "above" | "below" | "right" | "inside"; // where the tag goes; never over the text it points at
}

export interface FootageSeg {
  type: "footage";
  cam: "buyer" | "supplierA" | "supplierB";
  src: number; // seconds into the camera's video
  rate?: number;
  moves?: Move[];
  role?: { kind: "Buyer" | "Supplier"; name: string };
  callouts?: Callout[];
  chip?: { t0: number; t1: number; text: string };
  edgeFade?: boolean;
}

export interface RpcTx {
  step: string;
  method: string;
  signer: string;
  receiver: string;
  depositNear: string | null;
  status: string;
  block: number;
  at: string;
  txHash: string;
  explorer: string;
}

export type Segment = { id: string; start: number; dur: number; fadeIn?: number } & (
  | FootageSeg
  | { type: "hook" }
  | { type: "diagram" }
  | { type: "rpc"; title: string; note: string; txs: RpcTx[]; balance?: { account: string; before: string; after: string; delta: string } }
  | { type: "outro" }
);

export interface Timeline {
  durationSec: number;
  segments: Segment[];
  captions: { start: number; end: number; text: string }[];
  testnet: { start: number; end: number }[];
  footageMeta: Record<string, { file: string; seconds: number }>;
}
